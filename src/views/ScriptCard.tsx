import type { ReactNode } from 'react';
import type { Script } from '../store';
import { navigate } from '../router';

export function formatDate(ts: number) {
  return new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function excerpt(s: Script) {
  return s.content
    .replace(/^\s*---\s*$/gm, ' ')
    .replace(/[#*[\]]|(?<!\w)_+|_+(?!\w)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

export function ScriptCard(props: { script: Script; index?: number; tag?: string; actions?: ReactNode }) {
  const { script: s, index, tag, actions } = props;
  return (
    <li className="card">
      {index !== undefined && <span className="card-index">{index}</span>}
      <button className="card-main" onClick={() => navigate(`/edit/${s.id}`)}>
        <div className="card-head">
          <span className="card-title">{s.title || 'Sans titre'}</span>
          <span className={`badge ${s.mode}`}>{s.mode === 'slides' ? 'Slides' : 'Défilement'}</span>
          {tag && <span className="badge folder">📁 {tag}</span>}
        </div>
        <p className="card-excerpt">{excerpt(s) || <em>Vide</em>}</p>
        <span className="card-date">{formatDate(s.updatedAt)}</span>
      </button>
      {actions}
      <button className="card-play" onClick={() => navigate(`/play/${s.id}`)} aria-label="Lancer le prompteur">
        ▶
      </button>
    </li>
  );
}
