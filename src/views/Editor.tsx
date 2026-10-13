import {
  deleteScript,
  folderOf,
  getSnapshot,
  moveScriptToFolder,
  updateScript,
  type Mode,
  type Script,
} from '../store';
import { splitSlides } from '../rich';
import { markdownFromClipboard } from '../paste';
import { navigate } from '../router';

const WORDS_PER_MINUTE = 150;

export function Editor({ script }: { script: Script }) {
  const words = script.content.split(/\s+/).filter((w) => w && w !== '---').length;
  const minutes = words / WORDS_PER_MINUTE;
  const slideCount = splitSlides(script.content).length;

  const setMode = (mode: Mode) => updateScript(script.id, { mode });
  const folder = folderOf(script);
  const folders = [...getSnapshot().folders].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const back = folder ? `/folder/${folder.id}` : '/';

  const remove = () => {
    if (!confirm(`Supprimer « ${script.title || 'Sans titre'} » sur tous les appareils ?`)) return;
    deleteScript(script.id);
    navigate(back);
  };

  return (
    <main className="page editor">
      <div className="toolbar">
        <button className="btn ghost" onClick={() => navigate(back)}>
          ← {folder ? folder.name || 'Dossier' : 'Scripts'}
        </button>
        <div className="segmented" role="group" aria-label="Mode">
          <button className={script.mode === 'scroll' ? 'on' : ''} onClick={() => setMode('scroll')}>
            Défilement
          </button>
          <button className={script.mode === 'slides' ? 'on' : ''} onClick={() => setMode('slides')}>
            Slides
          </button>
        </div>
        <select
          className="select"
          value={folder?.id ?? ''}
          onChange={(e) => moveScriptToFolder(script.id, e.target.value || null)}
          aria-label="Dossier"
        >
          <option value="">📁 Hors dossier</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              📁 {f.name || 'Sans nom'}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button className="btn danger ghost" onClick={remove}>
          Supprimer
        </button>
        <button className="btn primary" onClick={() => navigate(`/play/${script.id}`)}>
          ▶ Lancer
        </button>
      </div>

      <input
        className="title-input"
        placeholder="Titre du script"
        value={script.title}
        onChange={(e) => updateScript(script.id, { title: e.target.value })}
        autoFocus={!script.title}
      />

      <textarea
        className="content-input"
        placeholder={
          script.mode === 'slides'
            ? 'Première slide…\n- une idée\n- une autre idée\n---\nDeuxième slide…'
            : 'Colle ou écris ton texte ici…'
        }
        value={script.content}
        onChange={(e) => updateScript(script.id, { content: e.target.value })}
        onPaste={(e) => {
          const md = markdownFromClipboard(e.clipboardData);
          if (md === null) return;
          e.preventDefault();
          // insertText garde l'annulation (Ctrl+Z) ; repli manuel si le navigateur refuse.
          if (!document.execCommand('insertText', false, md)) {
            const el = e.currentTarget;
            const { selectionStart: a, selectionEnd: b, value } = el;
            updateScript(script.id, { content: value.slice(0, a) + md + value.slice(b) });
          }
        }}
        spellCheck
      />

      <footer className="editor-foot">
        <span>
          {words} mots · ~{minutes < 1 ? `${Math.round(minutes * 60)} s` : `${minutes.toFixed(1)} min`}
          {script.mode === 'slides' && ` · ${slideCount} slide${slideCount > 1 ? 's' : ''}`}
        </span>
        <span className="hint">
          <code>---</code> seul sur une ligne = nouvelle slide · <code>**gras**</code> · <code>*italique*</code> ·{' '}
          <code>- puce</code> ·{' '}
          <code># titre</code> · <code>[indication]</code>
        </span>
      </footer>
    </main>
  );
}
