import { apiFetch, enc } from './utils.js';

const Sidebar = (() => {
  let _activeTag = null;
  let _activeFolder = null;

  async function renderTags() {
    const res = await apiFetch('/api/tags');
    if (!res) return;
    const tags = await res.json();
    const list = document.getElementById('tag-list');

    if (tags.length === 0) { list.innerHTML = ''; return; }

    list.innerHTML = tags.map(t => `
      <li>
        <button class="tag-btn${_activeTag === t.name ? ' active' : ''}" data-tag="${t.name}">
          <span>#${t.name}</span>
          <span class="tag-count">${t.count}</span>
        </button>
      </li>`).join('');

    list.querySelectorAll('.tag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        if (_activeTag === tag) {
          _activeTag = null;
          window._feed?.clearTagFilter();
        } else {
          _activeTag = tag;
          window._feed?.filterByTag(tag);
        }
        renderTags();
        showView('feed');
      });
    });
  }

  async function renderFolders(currentUser) {
    const section = document.getElementById('folders-section');
    const list = document.getElementById('folder-list');
    const res = await apiFetch('/api/folders');
    if (!res) { section.classList.add('hidden'); return; }
    const folders = await res.json();
    window._folders = folders;

    const allowed = (!currentUser || currentUser.isAdmin || !Array.isArray(currentUser.folderAccess))
      ? folders
      : folders.filter(f => currentUser.folderAccess.includes(f.id));

    if (allowed.length === 0) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    list.innerHTML = allowed.map(f => `
      <li>
        <button class="folder-btn${_activeFolder === f.id ? ' active' : ''}" data-id="${f.id}">
          <span>&#128193; ${enc(f.name)}</span>
        </button>
      </li>`).join('');

    list.querySelectorAll('.folder-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (_activeFolder === id) {
          _activeFolder = null;
          window._feed?.clearFolderFilter();
        } else {
          _activeFolder = id;
          window._feed?.filterByFolder(id);
        }
        renderFolders(currentUser);
        showView('feed');
      });
    });
  }

  function clearActiveTag() {
    _activeTag = null;
  }

  function clearActiveFolder() {
    _activeFolder = null;
  }

  function showView(view) {
    const views = ['feed-view', 'public-view', 'graph-view', 'search-view'];
    views.forEach(v => document.getElementById(v).classList.add('hidden'));
    document.getElementById(`${view}-view`).classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
  }

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      showView(view);
      if (view === 'public') window._feed?.renderPublic();
      if (view === 'graph') window._graph?.render();
      if (view === 'feed') {
        _activeTag = null;
        _activeFolder = null;
        window._feed?.clearTagFilter();
        window._feed?.clearFolderFilter();
      }
    });
  });

  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });

  return { renderTags, renderFolders, clearActiveTag, clearActiveFolder, showView };
})();

export default Sidebar;
