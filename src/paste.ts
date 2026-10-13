// Collage : les applis qui affichent du Markdown rendu (aperçu, Notion, Google Docs, pages web…)
// ne mettent dans le presse-papier texte que le texte nu, sans ** ni #. On reconstruit alors le
// Markdown à partir de la version HTML du presse-papier.

// Le texte brut contient-il déjà de la syntaxe Markdown ? (copie depuis un éditeur source)
const HAS_MARKDOWN = /(^|\n)\s*(#{1,6}\s|[-*+]\s|---\s*(\n|$))|\*\*\S|\S\*\*|(^|\s)[*_]\S[^\n]*\S[*_](\s|$)/;
const FORMATTED = /<(b|strong|i|em|h[1-6]|li|hr)[\s>]|font-weight:\s*(bold|[6-9]00)|font-style:\s*italic/i;

/** Renvoie le texte à coller, ou null pour laisser le collage natif. */
export function markdownFromClipboard(data: DataTransfer): string | null {
  const html = data.getData('text/html');
  const plain = data.getData('text/plain');
  if (!html || HAS_MARKDOWN.test(plain) || !FORMATTED.test(html)) return null;
  const md = htmlToMarkdown(html);
  return md.trim() ? md : null;
}

/** Entoure de marqueurs en laissant les espaces à l'extérieur : « **mot** » et pas « ** mot** ». */
function wrap(inner: string, marker: string) {
  const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  return m[2] ? `${m[1]}${marker}${m[2]}${marker}${m[3]}` : inner;
}

function styleOf(el: HTMLElement) {
  const weight = el.style.fontWeight;
  return {
    bold: weight === 'bold' || Number(weight) >= 600,
    notBold: weight === 'normal' || (weight !== '' && Number(weight) > 0 && Number(weight) < 600),
    italic: el.style.fontStyle === 'italic',
  };
}

function walk(node: Node, ctx: { bold: boolean; italic: boolean; listIndex?: number }): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\s+/g, ' ');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (['script', 'style', 'meta', 'head', 'title'].includes(tag)) return '';

  const st = styleOf(el);
  // Google Docs enveloppe tout dans <b style="font-weight:normal"> : ce n'est pas du gras.
  const isBold = !ctx.bold && !st.notBold && (tag === 'b' || tag === 'strong' || st.bold);
  const isItalic = !ctx.italic && (tag === 'i' || tag === 'em' || st.italic);
  const childCtx = { bold: ctx.bold || isBold, italic: ctx.italic || isItalic };

  if (tag === 'ol' || tag === 'ul') {
    let n = 0;
    const items = [...el.childNodes].map((c) =>
      walk(c, { ...childCtx, listIndex: tag === 'ol' ? ++n : undefined }),
    );
    return `\n${items.join('')}\n`;
  }

  let inner = [...el.childNodes].map((c) => walk(c, childCtx)).join('');
  if (isItalic) inner = wrap(inner, '*');
  if (isBold) inner = wrap(inner, '**');

  switch (tag) {
    case 'br':
      return '\n';
    case 'hr':
      return '\n\n---\n\n';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return `\n\n${'#'.repeat(Math.min(3, Number(tag[1])))} ${inner.replace(/\*\*/g, '').trim()}\n\n`;
    case 'li':
      return `\n${ctx.listIndex ? `${ctx.listIndex}.` : '-'} ${inner.trim()}`;
    case 'p':
    case 'blockquote':
      return `\n\n${inner.trim()}\n\n`;
    case 'div':
    case 'section':
    case 'article':
    case 'tr':
      return `\n${inner}\n`;
    default:
      return inner;
  }
}

export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return walk(doc.body, { bold: false, italic: false })
    .split('\n')
    .map((l) => l.replace(/\s+$/, '').replace(/^ +(?![-\d])/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
