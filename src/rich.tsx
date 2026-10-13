// Mise en forme Markdown légère : **gras**, *italique*, # titre, - puces, [indication scénique],
// et `---` sur une ligne seule pour séparer les slides.
import type { ReactNode } from 'react';

const SEPARATOR = /^\s*---\s*$/;

export function splitSlides(content: string): string[] {
  const slides = content
    .split(/^\s*---\s*$/m)
    .map((s) => s.replace(/^\n+|\s+$/g, ''))
    .filter((s) => s.trim() !== '');
  return slides.length ? slides : [''];
}

// ***gras italique***, **gras** / __gras__, *italique* / _italique_, [indication].
// Les « _ » ne comptent qu'en début/fin de mot (pas dans « nom_de_fichier »).
const INLINE =
  /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|(?<!\w)__[^_]+__(?!\w)|\*[^*\s](?:[^*]*[^*\s])?\*|(?<!\w)_[^_\s](?:[^_]*[^_\s])?_(?!\w)|\[[^\]]+\])/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (/^\*\*\*.+\*\*\*$/.test(part)) {
      return (
        <strong key={i}>
          <em>{part.slice(3, -3)}</em>
        </strong>
      );
    }
    if (/^(\*\*|__).+\1$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^([*_]).+\1$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith('[') && part.endsWith(']')) {
      return (
        <span key={i} className="cue">
          {part}
        </span>
      );
    }
    return part;
  });
}

export function RichText({ text, separators = false }: { text: string; separators?: boolean }) {
  const out: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    out.push(
      <ul key={`ul${out.length}`}>
        {bullets.map((b, i) => (
          <li key={i}>{inline(b)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flushBullets();
    const key = `l${out.length}`;
    if (SEPARATOR.test(line)) {
      if (separators) out.push(<hr key={key} className="sep" />);
      continue;
    }
    const heading = line.match(/^#{1,3}\s+(.*)$/);
    if (heading) out.push(<div key={key} className="h">{inline(heading[1])}</div>);
    else if (line.trim() === '') out.push(<div key={key} className="gap" />);
    else out.push(<div key={key} className="line">{inline(line)}</div>);
  }
  flushBullets();
  return <>{out}</>;
}
