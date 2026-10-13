import { useSyncExternalStore } from 'react';
import { getFolder, getScript, getSnapshot, subscribe } from './store';
import { navigate, useRoute } from './router';
import { Library } from './views/Library';
import { Editor } from './views/Editor';
import { Prompter } from './views/Prompter';
import { FolderView } from './views/FolderView';

const STATUS_LABEL = { online: 'Synchronisé', connecting: 'Connexion…', offline: 'Hors ligne' } as const;

function SyncBadge({ status, pendingCount }: { status: keyof typeof STATUS_LABEL; pendingCount: number }) {
  const label = status === 'online' && pendingCount > 0 ? 'Envoi…' : STATUS_LABEL[status];
  return (
    <span className={`sync ${status}`} title={pendingCount ? `${pendingCount} modification(s) en attente` : undefined}>
      <i />
      {label}
    </span>
  );
}

export function App() {
  const { scripts, folders, status, pendingCount } = useSyncExternalStore(subscribe, getSnapshot);
  const path = useRoute();
  const [, view, id] = path.split('/');
  const script = id && view !== 'folder' ? getScript(id) : undefined;
  const folder = id && view === 'folder' ? getFolder(id) : undefined;

  // key : on repart de zéro (défilement, slide) en passant d'un bloc à l'autre.
  if (view === 'play' && script) return <Prompter key={script.id} script={script} />;

  return (
    <div className="app">
      <header className="appbar">
        <button className="brand" onClick={() => navigate('/')}>
          Volumen
        </button>
        <SyncBadge status={status} pendingCount={pendingCount} />
      </header>
      {((view === 'edit' || view === 'play') && !script) || (view === 'folder' && !folder) ? (
        <main className="page empty">
          <p>{status === 'online' ? 'Introuvable (supprimé ?).' : 'Chargement…'}</p>
          <button className="btn" onClick={() => navigate('/')}>
            Retour aux scripts
          </button>
        </main>
      ) : view === 'edit' && script ? (
        <Editor script={script} />
      ) : view === 'folder' && folder ? (
        <FolderView folder={folder} scripts={scripts} />
      ) : (
        <Library scripts={scripts} folders={folders} />
      )}
    </div>
  );
}
