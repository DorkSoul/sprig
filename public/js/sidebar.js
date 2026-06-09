import { apiFetch } from './utils.js';

const Sidebar = (() => {
  let _activeTag = null;

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

  function clearActiveTag() {
    _activeTag = null;
  }

  function showView(view) {
    const views = ['feed-view', 'public-view', 'graph-view', 'search-view', 'calendar-view'];
    views.forEach(v => {
      const el = document.getElementById(v);
      if (el) el.classList.add('hidden');
    });
    const target = document.getElementById(`${view}-view`);
    if (target) target.classList.remove('hidden');

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
      if (view === 'calendar') window._calendar?.render();
      if (view === 'feed') {
        _activeTag = null;
        window._feed?.clearTagFilter();
      }
    });
  });

  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });

  function selectTag(tag) {
    _activeTag = tag;
    renderTags();
    window._feed?.filterByTag(tag);
    showView('feed');
  }

  return { renderTags, clearActiveTag, showView, selectTag };
})();

export default Sidebar;
