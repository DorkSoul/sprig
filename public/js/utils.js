export function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function enc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    window._auth?.handle401();
    return null;
  }
  return res;
}

export function extractTagsFromHTML(html) {
  // Split on block boundaries and <br> to get individual lines, then check
  // if the last non-empty line is composed entirely of #tag tokens.
  const lines = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|li|h[1-6]|blockquote|pre|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (!lines.length) return [];
  const last = lines[lines.length - 1];
  if (!/^(#[a-zA-Z0-9_-]+\s*)+$/.test(last)) return [];
  const matches = last.match(/#[a-zA-Z0-9_-]+/g) || [];
  return [...new Set(matches.map(t => t.slice(1).toLowerCase()))];
}

export function renderTagChips(tags) {
  return tags.map(t => `<span class="tag-chip">#${enc(t)}</span>`).join('');
}

export function parseMarkdown(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      out.push(`<pre><code>${esc(codeLines.join('\n'))}</code></pre>`);
      i++;
      continue;
    }

    const hMatch = line.match(/^(#{1,3}) (.+)/);
    if (hMatch) {
      out.push(`<h${hMatch[1].length}>${inline(hMatch[2])}</h${hMatch[1].length}>`);
      i++; continue;
    }

    if (/^[-*]{3,}$/.test(line.trim())) { out.push('<hr>'); i++; continue; }

    if (line.startsWith('> ')) {
      const bqLines = [];
      while (i < lines.length && lines[i].startsWith('> ')) { bqLines.push(lines[i].slice(2)); i++; }
      out.push(`<blockquote>${parseMarkdown(bqLines.join('\n'))}</blockquote>`);
      continue;
    }

    if (/^[-*+] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+] /.test(lines[i])) { items.push(`<li>${inline(lines[i].slice(2))}</li>`); i++; }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(`<li>${inline(lines[i].replace(/^\d+\. /, ''))}</li>`); i++; }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^[#>]/.test(lines[i]) && !/^[-*+] /.test(lines[i]) && !/^\d+\. /.test(lines[i]) && !lines[i].startsWith('```')) {
      paraLines.push(lines[i]); i++;
    }
    if (paraLines.length) out.push(`<p>${inline(paraLines.join(' '))}</p>`);
  }

  return out.join('\n');
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
