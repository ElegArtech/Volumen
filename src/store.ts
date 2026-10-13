// Stockage local des scripts et dossiers + synchronisation temps réel avec le serveur.
// Chaque appareil garde une copie complète (fonctionne hors ligne) ; les conflits
// se règlent en last-write-wins sur `updatedAt`.

export type Mode = 'scroll' | 'slides';

export type Script = {
  id: string;
  title: string;
  mode: Mode;
  content: string;
  folderId?: string | null;
  position?: number;
  updatedAt: number;
  deleted?: boolean;
};

export type Folder = {
  id: string;
  name: string;
  updatedAt: number;
  deleted?: boolean;
};

export type SyncStatus = 'connecting' | 'online' | 'offline';

export type StoreSnapshot = {
  scripts: Script[];
  folders: Folder[];
  status: SyncStatus;
  pendingCount: number;
};

type Kind = 'script' | 'folder';
type Doc = Script | Folder;

const ENDPOINT: Record<Kind, string> = { script: '/api/scripts/', folder: '/api/folders/' };
const LS_SCRIPTS = 'tp.scripts.v1';
const LS_FOLDERS = 'tp.folders.v1';
const LS_PENDING = 'tp.pending.v2';
const LS_PENDING_V1 = 'tp.pending.v1';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const docs: { script: Record<string, Script>; folder: Record<string, Folder> } = {
  script: load(LS_SCRIPTS, {}),
  folder: load(LS_FOLDERS, {}),
};
// Clés « kind:id ». Les anciennes entrées v1 ne contenaient que des ids de scripts.
const pending = new Set<string>([
  ...load<string[]>(LS_PENDING, []),
  ...load<string[]>(LS_PENDING_V1, []).map((id) => `script:${id}`),
]);
let status: SyncStatus = 'connecting';
const listeners = new Set<() => void>();
let snapshot = buildSnapshot();

function buildSnapshot(): StoreSnapshot {
  return {
    scripts: Object.values(docs.script)
      .filter((s) => !s.deleted)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    folders: Object.values(docs.folder).filter((f) => !f.deleted),
    status,
    pendingCount: pending.size,
  };
}

function persist() {
  try {
    localStorage.setItem(LS_SCRIPTS, JSON.stringify(docs.script));
    localStorage.setItem(LS_FOLDERS, JSON.stringify(docs.folder));
    localStorage.setItem(LS_PENDING, JSON.stringify([...pending]));
    localStorage.removeItem(LS_PENDING_V1);
  } catch {
    // Quota ou stockage indisponible : on garde l'état en mémoire.
  }
}

function emit() {
  snapshot = buildSnapshot();
  for (const l of listeners) l();
}

function setStatus(next: SyncStatus) {
  if (status === next) return;
  status = next;
  emit();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot() {
  return snapshot;
}

export function getScript(id: string): Script | undefined {
  const s = docs.script[id];
  return s && !s.deleted ? s : undefined;
}

export function getFolder(id: string): Folder | undefined {
  const f = docs.folder[id];
  return f && !f.deleted ? f : undefined;
}

/** Dossier réel d'un script (null si à la racine ou si son dossier a été supprimé). */
export function folderOf(script: Script): Folder | undefined {
  return script.folderId ? getFolder(script.folderId) : undefined;
}

/** Scripts d'un dossier, dans l'ordre de tournage. */
export function scriptsInFolder(folderId: string, scripts = snapshot.scripts): Script[] {
  return scripts
    .filter((s) => s.folderId === folderId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.updatedAt - b.updatedAt);
}

/** Applique une version distante si elle est plus récente. Renvoie true si l'état a changé. */
function merge(kind: Kind, remote: Doc): boolean {
  const local = docs[kind][remote.id];
  if (local && local.updatedAt >= remote.updatedAt) return false;
  (docs[kind] as Record<string, Doc>)[remote.id] = remote;
  pending.delete(`${kind}:${remote.id}`);
  return true;
}

function write<K extends Kind>(kind: K, doc: (typeof docs)[K][string]) {
  docs[kind] = { ...docs[kind], [doc.id]: doc };
  pending.add(`${kind}:${doc.id}`);
  persist();
  emit();
  scheduleFlush();
}

function nextUpdatedAt(prev?: Doc) {
  return Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1);
}

// crypto.randomUUID n'existe qu'en contexte sécurisé (https / localhost).
function uid() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
}

function nextPosition(folderId: string | null) {
  if (!folderId) return 0;
  const list = scriptsInFolder(folderId);
  return list.length ? (list[list.length - 1].position ?? 0) + 1 : 1;
}

// --- Scripts ---
export function createScript(folderId: string | null = null, mode: Mode = 'scroll'): Script {
  const script: Script = {
    id: uid(),
    title: '',
    mode,
    content: '',
    folderId,
    position: nextPosition(folderId),
    updatedAt: Date.now(),
  };
  write('script', script);
  return script;
}

export function updateScript(id: string, patch: Partial<Omit<Script, 'id' | 'updatedAt'>>) {
  const prev = docs.script[id];
  if (!prev) return;
  write('script', { ...prev, ...patch, updatedAt: nextUpdatedAt(prev) });
}

export function moveScriptToFolder(id: string, folderId: string | null) {
  updateScript(id, { folderId, position: nextPosition(folderId) });
}

/** Échange un script avec son voisin dans l'ordre du dossier. */
export function reorderScript(id: string, direction: -1 | 1) {
  const script = getScript(id);
  if (!script?.folderId) return;
  const list = scriptsInFolder(script.folderId);
  const i = list.findIndex((s) => s.id === id);
  const other = list[i + direction];
  if (!other) return;
  // Renumérote proprement pour éviter les égalités de position.
  list.forEach((s, n) => {
    const pos = n === i ? i + direction : n === i + direction ? i : n;
    if (s.position !== pos) updateScript(s.id, { position: pos });
  });
}

export function deleteScript(id: string) {
  // Pierre tombale : les autres appareils apprennent la suppression.
  updateScript(id, { deleted: true, content: '' });
}

// --- Dossiers ---
export function createFolder(name: string): Folder {
  const folder: Folder = { id: uid(), name, updatedAt: Date.now() };
  write('folder', folder);
  return folder;
}

export function renameFolder(id: string, name: string) {
  const prev = docs.folder[id];
  if (!prev) return;
  write('folder', { ...prev, name, updatedAt: nextUpdatedAt(prev) });
}

/** Supprime le dossier ; ses scripts reviennent à la racine. */
export function deleteFolder(id: string) {
  for (const s of scriptsInFolder(id)) updateScript(s.id, { folderId: null });
  const prev = docs.folder[id];
  if (prev) write('folder', { ...prev, deleted: true, updatedAt: nextUpdatedAt(prev) });
}

// --- Envoi des modifications locales ---
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushing = false;

function scheduleFlush(delay = 400) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, delay);
}

async function flush() {
  if (flushing) return scheduleFlush(500);
  if (pending.size === 0) return;
  flushing = true;
  try {
    // Les dossiers d'abord, pour qu'un script n'arrive jamais avant son dossier.
    const keys = [...pending].sort((a, b) => Number(b.startsWith('folder:')) - Number(a.startsWith('folder:')));
    for (const key of keys) {
      const [kind, id] = key.split(':') as [Kind, string];
      const sent = docs[kind]?.[id];
      if (!sent || !ENDPOINT[kind]) {
        pending.delete(key);
        continue;
      }
      const res = await fetch(ENDPOINT[kind] + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sent),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const stored = (await res.json()) as Doc;
      // Si l'utilisateur a retapé pendant l'envoi, la version locale reste en attente.
      if (docs[kind][id]?.updatedAt === sent.updatedAt) pending.delete(key);
      merge(kind, stored);
    }
  } catch {
    setStatus('offline');
    scheduleFlush(5000);
  } finally {
    flushing = false;
    persist();
    emit();
  }
}

// --- Réception temps réel ---
let source: EventSource | undefined;

async function pull() {
  try {
    const res = await fetch('/api/sync', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { scripts: Script[]; folders: Folder[] };
    let changed = false;
    for (const f of data.folders) changed = merge('folder', f) || changed;
    for (const s of data.scripts) changed = merge('script', s) || changed;
    if (changed) persist();
    emit();
    flush();
  } catch {
    setStatus('offline');
  }
}

function connect() {
  source?.close();
  setStatus('connecting');
  source = new EventSource('/api/events');
  source.onopen = () => {
    setStatus('online');
    pull();
  };
  source.onerror = () => setStatus(source?.readyState === EventSource.OPEN ? 'online' : 'offline');
  for (const kind of ['script', 'folder'] as const) {
    source.addEventListener(kind, (e) => {
      if (merge(kind, JSON.parse((e as MessageEvent<string>).data) as Doc)) {
        persist();
        emit();
      }
    });
  }
}

export function startSync() {
  connect();
  // Au réveil du téléphone, la connexion SSE peut être morte : on la relance.
  const revive = () => {
    if (document.visibilityState !== 'visible') return;
    if (!source || source.readyState === EventSource.CLOSED) connect();
    else pull();
  };
  document.addEventListener('visibilitychange', revive);
  window.addEventListener('online', revive);
}
