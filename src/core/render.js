// Small, safe renderers (escape first, then format). Unit tested.

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const OPEN = '\u0001';
const CLOSE = '\u0002';

/** Vault copy whose values are wrapped in markers, so restored values can be highlighted after escaping. */
export function markedVault(vault) {
  return new Map([...vault].map(([k, v]) => [k, OPEN + v + CLOSE]));
}

/** Minimal markdown: headings, bullets, numbered lists, bold, italics, paragraphs. */
export function miniMarkdown(src) {
  const lines = esc(src).split(/\r?\n/);
  let html = '';
  let list = null;
  const inline = (t) =>
    t
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(new RegExp(OPEN + '([^' + CLOSE + ']*)' + CLOSE, 'g'), '<mark class="restored">$1</mark>');
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; }
      html += `<li>${inline(m[1])}</li>`;
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; }
      html += `<li>${inline(m[1])}</li>`;
    } else if ((m = line.match(/^#{1,4}\s+(.*)$/))) {
      close();
      html += `<h4>${inline(m[1])}</h4>`;
    } else if (!line.trim()) {
      close();
    } else {
      close();
      html += `<p>${inline(line)}</p>`;
    }
  }
  close();
  return html;
}

/**
 * Render source text with masked spans as clickable highlights.
 * Every plain segment carries data-o (its offset in the source) so a user selection
 * can be mapped back to exact character positions.
 */
export function renderReview(text, spans, labelOf) {
  const sorted = [...spans].map((s, i) => ({ ...s, i })).sort((a, b) => a.start - b.start);
  let html = '';
  let pos = 0;
  for (const s of sorted) {
    if (s.start > pos) html += `<span data-o="${pos}">${esc(text.slice(pos, s.start))}</span>`;
    const cls = s.enabled === false ? 'hl off' : 'hl';
    html += `<mark class="${cls} t-${s.type}" data-i="${s.i}" data-o="${s.start}" title="${esc(labelOf(s))} · ${s.enabled === false ? 'will be sent' : 'hidden'} · tap to toggle" tabindex="0">${esc(text.slice(s.start, s.end))}</mark>`;
    pos = s.end;
  }
  if (pos < text.length) html += `<span data-o="${pos}">${esc(text.slice(pos))}</span>`;
  return html;
}
