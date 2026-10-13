// Serveur de synchro du téléprompteur : API REST + flux SSE temps réel + fichiers statiques.
// Aucune dépendance : node:http et node:sqlite (Node 24+). Lancé directement en TypeScript.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

type Mode = 'scroll' | 'slides';
type Script = {
  id: string;
  title: string;
  mode: Mode;
  content: string;
  folderId: string | null;
  position: number;
  updatedAt: number;
  deleted: boolean;
};
type Folder = {
  id: string;
  name: string;
  updatedAt: number;
  deleted: boolean;
};
type Row = Record<string, unknown>;

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8787);
// Par défaut on n'écoute qu'en local : l'accès distant passe par `tailscale serve`.
const HOST = process.env.HOST ?? '127.0.0.1';
const dataDir = resolve(process.env.DATA_DIR ?? join(root, 'data'));
const distDir = join(root, 'dist');
const MAX_BODY = 2 * 1024 * 1024;
const ID = /^[\w-]{1,64}$/;

mkdirSync(dataDir, { recursive: true });
const dbFile = join(dataDir, 'volumen.db');
// Base créée avant le renommage en Volumen : on la reprend telle quelle.
const legacyDb = join(dataDir, 'teleprompteur.db');
if (!existsSync(dbFile) && existsSync(legacyDb)) {
  for (const ext of ['', '-wal', '-shm']) if (existsSync(legacyDb + ext)) renameSync(legacyDb + ext, dbFile + ext);
}
const db = new DatabaseSync(dbFile);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS scripts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'scroll',
    content TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );
`);
// Migration v2 : dossiers et ordre des scripts dans un dossier.
const scriptColumns = (db.prepare('PRAGMA table_info(scripts)').all() as Row[]).map((c) => c.name);
if (!scriptColumns.includes('folder_id')) db.exec('ALTER TABLE scripts ADD COLUMN folder_id TEXT');
if (!scriptColumns.includes('position')) db.exec('ALTER TABLE scripts ADD COLUMN position REAL NOT NULL DEFAULT 0');

const sql = {
  allScripts: db.prepare('SELECT * FROM scripts ORDER BY updated_at DESC'),
  oneScript: db.prepare('SELECT * FROM scripts WHERE id = ?'),
  allFolders: db.prepare('SELECT * FROM folders ORDER BY updated_at DESC'),
  oneFolder: db.prepare('SELECT * FROM folders WHERE id = ?'),
  // Last-write-wins : une écriture plus ancienne que la version stockée est ignorée.
  upsertScript: db.prepare(`
    INSERT INTO scripts (id, title, mode, content, folder_id, position, updated_at, deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      mode = excluded.mode,
      content = excluded.content,
      folder_id = excluded.folder_id,
      position = excluded.position,
      updated_at = excluded.updated_at,
      deleted = excluded.deleted
    WHERE excluded.updated_at > scripts.updated_at
  `),
  upsertFolder: db.prepare(`
    INSERT INTO folders (id, name, updated_at, deleted)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      updated_at = excluded.updated_at,
      deleted = excluded.deleted
    WHERE excluded.updated_at > folders.updated_at
  `),
};

function rowToScript(row: Row): Script {
  return {
    id: String(row.id),
    title: String(row.title),
    mode: row.mode === 'slides' ? 'slides' : 'scroll',
    content: String(row.content),
    folderId: typeof row.folder_id === 'string' ? row.folder_id : null,
    position: Number(row.position ?? 0),
    updatedAt: Number(row.updated_at),
    deleted: Number(row.deleted) === 1,
  };
}

function rowToFolder(row: Row): Folder {
  return {
    id: String(row.id),
    name: String(row.name),
    updatedAt: Number(row.updated_at),
    deleted: Number(row.deleted) === 1,
  };
}

const validTimestamp = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseScript(id: string, body: unknown): Script | null {
  if (!ID.test(id) || typeof body !== 'object' || body === null) return null;
  const b = body as Row;
  if (typeof b.title !== 'string' || typeof b.content !== 'string' || !validTimestamp(b.updatedAt)) return null;
  // Un client d'avant les dossiers n'envoie ni folderId ni position : on garde les valeurs stockées.
  const existing = sql.oneScript.get(id) as Row | undefined;
  const folderId =
    b.folderId === undefined
      ? existing
        ? rowToScript(existing).folderId
        : null
      : typeof b.folderId === 'string' && ID.test(b.folderId)
        ? b.folderId
        : null;
  const position = validTimestamp(b.position) ? b.position : existing ? rowToScript(existing).position : 0;
  return {
    id,
    title: b.title.slice(0, 500),
    mode: b.mode === 'slides' ? 'slides' : 'scroll',
    content: b.content,
    folderId,
    position,
    updatedAt: Math.floor(b.updatedAt),
    deleted: b.deleted === true,
  };
}

function parseFolder(id: string, body: unknown): Folder | null {
  if (!ID.test(id) || typeof body !== 'object' || body === null) return null;
  const b = body as Row;
  if (typeof b.name !== 'string' || !validTimestamp(b.updatedAt)) return null;
  return { id, name: b.name.slice(0, 200), updatedAt: Math.floor(b.updatedAt), deleted: b.deleted === true };
}

// --- Temps réel (Server-Sent Events) ---
const clients = new Set<ServerResponse>();

function broadcast(event: 'script' | 'folder', data: Script | Folder) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}

setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 25_000).unref();

// --- HTTP ---
function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('payload too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
  let file = resolve(distDir, '.' + decodeURIComponent(pathname));
  if (file !== distDir && !file.startsWith(distDir + sep)) {
    res.writeHead(403).end();
    return;
  }
  let stat = statSync(file, { throwIfNoEntry: false });
  if (!stat || stat.isDirectory()) {
    // Fallback SPA
    file = join(distDir, 'index.html');
    stat = statSync(file, { throwIfNoEntry: false });
    if (!stat) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Build introuvable : lance `npm run build` (ou `npm run dev` en développement).');
      return;
    }
  }
  const immutable = pathname.startsWith('/assets/');
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const { pathname } = url;

  try {
    if (pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 3000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (pathname === '/api/sync' && req.method === 'GET') {
      return sendJson(res, 200, {
        scripts: sql.allScripts.all().map((r) => rowToScript(r as Row)),
        folders: sql.allFolders.all().map((r) => rowToFolder(r as Row)),
      });
    }

    // Conservé pour les clients d'avant les dossiers (PWA encore en cache).
    if (pathname === '/api/scripts' && req.method === 'GET') {
      return sendJson(res, 200, sql.allScripts.all().map((r) => rowToScript(r as Row)));
    }

    const scriptMatch = pathname.match(/^\/api\/scripts\/([^/]+)$/);
    if (scriptMatch && req.method === 'PUT') {
      const s = parseScript(scriptMatch[1], await readJson(req));
      if (!s) return sendJson(res, 400, { error: 'script invalide' });
      const result = sql.upsertScript.run(
        s.id,
        s.title,
        s.mode,
        s.content,
        s.folderId,
        s.position,
        s.updatedAt,
        s.deleted ? 1 : 0,
      );
      const stored = rowToScript(sql.oneScript.get(s.id) as Row);
      if (result.changes > 0) broadcast('script', stored);
      return sendJson(res, 200, stored);
    }

    const folderMatch = pathname.match(/^\/api\/folders\/([^/]+)$/);
    if (folderMatch && req.method === 'PUT') {
      const f = parseFolder(folderMatch[1], await readJson(req));
      if (!f) return sendJson(res, 400, { error: 'dossier invalide' });
      const result = sql.upsertFolder.run(f.id, f.name, f.updatedAt, f.deleted ? 1 : 0);
      const stored = rowToFolder(sql.oneFolder.get(f.id) as Row);
      if (result.changes > 0) broadcast('folder', stored);
      return sendJson(res, 200, stored);
    }

    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'introuvable' });

    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname);
    res.writeHead(405).end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'erreur serveur' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Volumen prêt sur http://${HOST}:${PORT} (données : ${dataDir})`);
});
