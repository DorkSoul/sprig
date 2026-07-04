import { formatDate, enc, apiFetch, renderTagChips, toast } from './utils.js';

const Feed = (() => {
  let _notes = [];
  let _activeTag = null;
  let _currentView = 'feed';
  let _sortKey = 'updated_desc';

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
    const upd = n => n.updatedAt || n.createdAt || '';
    const cre = n => n.createdAt || n.updatedAt || '';
    if (_sortKey === 'updated_asc') return arr.sort((a, b) => upd(a).localeCompare(upd(b)));
    if (_sortKey === 'created_desc') return arr.sort((a, b) => cre(b).localeCompare(cre(a)));
    if (_sortKey === 'title_asc') return arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    return arr.sort((a, b) => upd(b).localeCompare(upd(a)));
  }

  // Apply the active tag and/or folder scope. Both filters compose (intersection) so
  // that refreshing after a pin/delete preserves whichever scope the user set, instead
  // of silently reverting to the full list.
  function applyFilters(notes) {
    let filtered = notes;
    const activeFolder = window._folders?.getActiveFolder?.();
    if (activeFolder) filtered = filtered.filter(n => n.folderId === activeFolder);
    if (_activeTag) filtered = filtered.filter(n => n.tags?.includes(_activeTag));
    return filtered;
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

    container.querySelectorAll('.tag-chip').forEach(chip => {
      chip.addEventListener('click', e => {
        e.stopPropagation();
        window._sidebar?.selectTag(chip.dataset.tag);
      });
    });

    container.querySelectorAll('.note-card').forEach(card => {
      const id = card.dataset.id;
      card.addEventListener('click', e => {
        if (e.target.closest('button, .preview-resize-handle, .tag-chip')) return;
        const inRect = el => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        };
        if (inRect(card.querySelector('.note-card-preview')) || inRect(card.querySelector('.note-card-title'))) {
          window._noteView?.open(id);
        }
      });
    });

    container.querySelectorAll('.pin-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = btn.closest('.note-card').dataset.id;
        const note = _notes.find(n => n.id === id);
        if (!note) return;
        const res = await apiFetch(`/api/notes/${id}`, { method: 'PUT', body: { pinned: !note.pinned } });
        if (!res) return;
        if (!res.ok) { toast('Could not update pin.'); return; }
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
        if (!res) return;
        if (!res.ok) { toast('Could not delete note.'); return; }
        await refresh();
      });
    });
  }

  // Local YYYY-MM-DD; dueDate is a timezone-agnostic calendar date the user picked,
  // so "today" must be computed in local time (not UTC) to avoid off-by-one near midnight.
  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function getDueBadge(dueDate) {
    if (!dueDate) return '';
    const today = localDateKey(new Date());
    const sevenDays = localDateKey(new Date(Date.now() + 7 * 86400000));
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
      <div class="note-card${pinClass}" data-id="${enc(note.id)}">
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
    render(container, applyFilters(_notes));
    window._sidebar?.renderTags();
  }

  // Render the current notes through the active tag+folder filters. Single entry point
  // so every filter change (tag, folder, refresh, re-login) shows the same set.
  function renderActive() {
    render(document.getElementById('note-feed'), applyFilters(_notes));
  }

  function filterByTag(tag) {
    _activeTag = tag;
    renderActive();
  }

  function clearTagFilter() {
    _activeTag = null;
    renderActive();
  }

async function renderPublic() {
    const notes = await loadPublic();
    render(document.getElementById('public-feed'), notes, { readonly: true });
  }

  let _searchSeq = 0;
  async function renderSearch(q) {
    const seq = ++_searchSeq;
    const res = await apiFetch(`/api/notes/search?q=${encodeURIComponent(q)}`);
    if (!res) return;
    const notes = await res.json();
    // Ignore a response that a newer search has already superseded.
    if (seq !== _searchSeq) return;
    render(document.getElementById('search-feed'), notes, { readonly: false });
  }

  return { load, render, renderActive, refresh, renderCard, filterByTag, clearTagFilter, renderPublic, renderSearch, setSort };
})();

export default Feed;
