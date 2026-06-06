import { formatDate, enc, apiFetch, extractTagsFromHTML, renderTagChips } from './utils.js';

const Feed = (() => {
  let _notes = [];
  let _activeTag = null;
  let _currentView = 'feed';
  let _sortKey = 'updated_desc';

  function setNotes(notes) { _notes = notes; }
  function getNotes() { return _notes; }

  async function load() {
    const res = await apiFetch('/api/notes');
    if (!res) return;
    _notes = await res.json();
    window._notes = _notes;
    return _notes;
  }

  async function loadPublic() {
    const res = await apiFetch('/api/notes/public');
    if (!res) return [];
    return res.json();
  }

  function setSort(key) {
    _sortKey = key;
  }

  function sortNotes(notes) {
    const arr = [...notes];
    if (_sortKey === 'updated_asc') return arr.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    if (_sortKey === 'created_desc') return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (_sortKey === 'title_asc') return arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    return arr.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  function render(container, notes, opts = {}) {
    const pinned = notes.filter(n => n.pinned);
    const rest = notes.filter(n => !n.pinned);
    const sorted = [...sortNotes(pinned), ...sortNotes(rest)];

    if (sorted.length === 0) {
      container.innerHTML = '<div class="empty-state">No notes yet.</div>';
      return;
    }

    container.innerHTML = sorted.map(n => renderCard(n, opts)).join('');

    container.querySelectorAll('.note-card').forEach(card => {
      const id = card.dataset.id;
      card.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        window._noteView?.open(id);
      });
    });

    container.querySelectorAll('.pin-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = btn.closest('.note-card').dataset.id;
        const note = _notes.find(n => n.id === id);
        if (!note) return;
        const res = await apiFetch(`/api/notes/${id}`, { method: 'PUT', body: { pinned: !note.pinned } });
        if (!res?.ok) return;
        note.pinned = !note.pinned;
        btn.classList.toggle('active', note.pinned);
        btn.title = note.pinned ? 'Unpin' : 'Pin';
        await refresh();
      });
    });

    container.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = btn.closest('.note-card').dataset.id;
        window._noteView?.openEdit(id);
      });
    });

    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = btn.closest('.note-card').dataset.id;
        if (!confirm('Delete this note?')) return;
        const res = await apiFetch(`/api/notes/${id}`, { method: 'DELETE' });
        if (res?.ok) await refresh();
      });
    });
  }

  function getDueBadge(dueDate) {
    if (!dueDate) return '';
    const today = new Date().toISOString().slice(0, 10);
    const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    let status;
    if (dueDate < today) status = 'overdue';
    else if (dueDate === today) status = 'today';
    else if (dueDate <= sevenDays) status = 'soon';
    else status = 'later';
    const [y, m, d] = dueDate.split('-');
    const formatted = new Date(Number(y), Number(m) - 1, Number(d))
      .toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `<span class="due-badge due-${status}">Due ${formatted}</span>`;
  }

  function renderCard(note, opts = {}) {
    const previewContent = note.content.replace(/(\s*<(?:p|div|br)[^>]*>)?\s*(<span class="tag-inline">#[a-zA-Z0-9_-]+<\/span>\s*)+(<\/(?:p|div)>)?\s*$/gi, '');
    const tags = renderTagChips(note.tags || []);
    const pinClass = note.pinned ? ' pinned' : '';
    const publicBadge = note.visibility === 'public' ? '<span class="public-badge">public</span>' : '';
    const titleHtml = note.title ? `<div class="note-card-title">${enc(note.title)}</div>` : '';
    const dueBadge = getDueBadge(note.dueDate);
    const actionsHtml = opts.readonly ? '' : `
      <div class="note-card-actions">
        <button class="pin-btn${note.pinned ? ' active' : ''}" title="${note.pinned ? 'Unpin' : 'Pin'}">&#9670;</button>
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
      </div>`;

    return `
      <div class="note-card${pinClass}" data-id="${note.id}">
        ${actionsHtml}
        ${titleHtml}
        <div class="note-card-preview note-body">${previewContent || '<em>Empty note</em>'}</div>
        <div class="preview-resize-handle" title="Drag to resize preview"></div>
        <div class="note-card-footer">
          <div class="note-tags">${tags}${publicBadge}${dueBadge}</div>
          <span class="note-meta">${formatDate(note.updatedAt || note.createdAt)}</span>
        </div>
      </div>`;
  }

  async function refresh() {
    await load();
    const container = document.getElementById('note-feed');
    let filtered = _notes;
    if (_activeTag) filtered = _notes.filter(n => n.tags?.includes(_activeTag));
    render(container, filtered);
    window._sidebar?.renderTags();
  }

  function filterByTag(tag) {
    _activeTag = tag;
    const container = document.getElementById('note-feed');
    const filtered = tag ? _notes.filter(n => n.tags?.includes(tag)) : _notes;
    render(container, filtered);
  }

  function clearTagFilter() {
    _activeTag = null;
    render(document.getElementById('note-feed'), _notes);
  }

async function renderPublic() {
    const notes = await loadPublic();
    render(document.getElementById('public-feed'), notes, { readonly: true });
  }

  async function renderSearch(q) {
    const res = await apiFetch(`/api/notes/search?q=${encodeURIComponent(q)}`);
    if (!res) return;
    const notes = await res.json();
    render(document.getElementById('search-feed'), notes, { readonly: false });
  }

  return { load, render, refresh, renderCard, filterByTag, clearTagFilter, renderPublic, renderSearch, setNotes, getNotes, setSort };
})();

export default Feed;
