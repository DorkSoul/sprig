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

// Lightweight transient notification. Creates a container on first use.
export function toast(message, type = 'error') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

export async function apiFetch(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      credentials: 'same-origin',
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    // Network failure (offline, server down). Surface it instead of throwing an
    // unhandled rejection, and return null so callers treat it as a failed request.
    toast('Network error — check your connection.');
    return null;
  }
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
  return tags.map(t => `<span class="tag-chip" data-tag="${enc(t)}">#${enc(t)}</span>`).join('');
}

export function syncDueDateDisplay(inputId, btnId, clearId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  const clear = document.getElementById(clearId);
  if (!input || !btn || !clear) return;
  const val = input.value;
  if (val) {
    const [y, m, d] = val.split('-').map(Number);
    const label = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    btn.textContent = 'Due: ' + label;
    clear.classList.remove('hidden');
  } else {
    btn.textContent = 'Due date';
    clear.classList.add('hidden');
  }
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

    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s\-:|]+\|/.test(lines[i + 1])) {
      const parseRow = r => r.split('|').slice(1, -1).map(c => c.trim());
      const headers = parseRow(line);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(parseRow(lines[i])); i++; }
      const thead = `<thead><tr>${headers.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      out.push(`<table>${thead}${tbody}</table>`);
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

// Neutralize dangerous URL schemes (javascript:/vbscript:/data:) in imported
// markdown links/images, which are inserted into the editor via innerHTML.
function safeUrl(url) {
  const normalized = url.replace(/[\x00-\x20]+/g, '').toLowerCase();
  if (/^(javascript|vbscript|data):/.test(normalized)) return '';
  return url.replace(/"/g, '&quot;');
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
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => `<img src="${safeUrl(src)}" alt="${alt}">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, txt, href) => `<a href="${safeUrl(href)}" target="_blank" rel="noopener">${txt}</a>`);
}
