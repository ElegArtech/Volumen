import {
  createScript,
  deleteFolder,
  renameFolder,
  reorderScript,
  scriptsInFolder,
  type Folder,
  type Script,
} from '../store';
import { navigate } from '../router';
import { ScriptCard } from './ScriptCard';

export function FolderView({ folder, scripts }: { folder: Folder; scripts: Script[] }) {
  const list = scriptsInFolder(folder.id, scripts);

  const newScript = () => navigate(`/edit/${createScript(folder.id).id}`);

  const remove = () => {
    const msg = list.length
      ? `Supprimer le dossier « ${folder.name} » ? Ses ${list.length} script(s) seront conservés hors dossier.`
      : `Supprimer le dossier « ${folder.name} » ?`;
    if (!confirm(msg)) return;
    deleteFolder(folder.id);
    navigate('/');
  };

  return (
    <main className="page">
      <div className="toolbar">
        <button className="btn ghost" onClick={() => navigate('/')}>
          ← Scripts
        </button>
        <span className="spacer" />
        <button className="btn danger ghost" onClick={remove}>
          Supprimer le dossier
        </button>
        {list.length > 0 && (
          <button className="btn" onClick={() => navigate(`/play/${list[0].id}`)}>
            ▶ Tout lancer
          </button>
        )}
        <button className="btn primary" onClick={newScript}>
          + Script
        </button>
      </div>

      <input
        className="title-input"
        placeholder="Nom du dossier"
        value={folder.name}
        onChange={(e) => renameFolder(folder.id, e.target.value)}
      />

      {list.length === 0 ? (
        <div className="empty">
          <p>Dossier vide.</p>
          <button className="btn primary" onClick={newScript}>
            Ajouter un script
          </button>
        </div>
      ) : (
        <ul className="cards">
          {list.map((s, i) => (
            <ScriptCard
              key={s.id}
              script={s}
              index={i + 1}
              actions={
                <div className="card-order">
                  <button onClick={() => reorderScript(s.id, -1)} disabled={i === 0} aria-label="Monter">
                    ▲
                  </button>
                  <button
                    onClick={() => reorderScript(s.id, 1)}
                    disabled={i === list.length - 1}
                    aria-label="Descendre"
                  >
                    ▼
                  </button>
                </div>
              }
            />
          ))}
        </ul>
      )}
    </main>
  );
}
