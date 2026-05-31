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
  const text = html.replace(/<[^>]+>/g, ' ');
  const matches = text.match(/#([a-zA-Z0-9_-]+)/g) || [];
  return [...new Set(matches.map(t => t.slice(1).toLowerCase()))];
}

export function renderTagChips(tags) {
  return tags.map(t => `<span class="tag-chip">#${enc(t)}</span>`).join('');
}
