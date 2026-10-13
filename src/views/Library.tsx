import { useMemo, useState } from 'react';
import { createFolder, createScript, getFolder, type Folder, type Script } from '../store';
import { navigate } from '../router';
import { ScriptCard, formatDate } from './ScriptCard';

export function Library({ scripts, folders }: { scripts: Script[]; folders: Folder[] }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const searchResults = useMemo(
    () => (q ? scripts.filter((s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)) : []),
    [scripts, q],
  );

  // Dossiers triés par dernière activité (dossier ou l'un de ses scripts).
  const folderRows = useMemo(() => {
    return folders
      .map((f) => {
        const inside = scripts.filter((s) => s.folderId === f.id);
        const lastActivity = Math.max(f.updatedAt, ...inside.map((s) => s.updatedAt));
        return { folder: f, count: inside.length, lastActivity };
      })
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }, [folders, scripts]);

  // Les scripts dont le dossier n'existe plus reviennent à la racine.
  const rootScripts = scripts.filter((s) => !s.folderId || !getFolder(s.folderId));

  const newScript = () => navigate(`/edit/${createScript().id}`);
  const newFolder = () => {
    const name = prompt('Nom du dossier', '');
    if (name?.trim()) navigate(`/folder/${createFolder(name.trim()).id}`);
  };

  return (
    <main className="page">
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Rechercher dans tous les scripts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" onClick={newFolder}>
          + Dossier
        </button>
        <button className="btn primary" onClick={newScript}>
          + Script
        </button>
      </div>

      {q ? (
        searchResults.length === 0 ? (
          <div className="empty">
            <p>Aucun résultat.</p>
          </div>
        ) : (
          <ul className="cards">
            {searchResults.map((s) => (
              <ScriptCard key={s.id} script={s} tag={s.folderId ? getFolder(s.folderId)?.name : undefined} />
            ))}
          </ul>
        )
      ) : scripts.length === 0 && folders.length === 0 ? (
        <div className="empty">
          <p>Aucun script pour l'instant.</p>
          <button className="btn primary" onClick={newScript}>
            Écrire mon premier script
          </button>
        </div>
      ) : (
        <>
          {folderRows.length > 0 && (
            <section className="section">
              <h2 className="section-title">Dossiers</h2>
              <ul className="folders">
                {folderRows.map(({ folder, count, lastActivity }) => (
                  <li key={folder.id}>
                    <button className="folder-card" onClick={() => navigate(`/folder/${folder.id}`)}>
                      <span className="folder-icon">📁</span>
                      <span className="folder-name">{folder.name || 'Sans nom'}</span>
                      <span className="folder-meta">
                        {count} script{count > 1 ? 's' : ''} · {formatDate(lastActivity)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {rootScripts.length > 0 && (
            <section className="section">
              {folderRows.length > 0 && <h2 className="section-title">Scripts hors dossier</h2>}
              <ul className="cards">
                {rootScripts.map((s) => (
                  <ScriptCard key={s.id} script={s} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
