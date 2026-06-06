import { apiFetch, enc } from './utils.js';

const Searches = (() => {
  let _searches = [];

  async function loadAndRender() {
    const res = await apiFetch('/api/searches');
    if (!res) return;
    _searches = await res.json();
    render();
  }

  function render() {
    const list = document.getElementById('smart-folder-list');
    if (!list) return;

    if (_searches.length === 0) {
      list.innerHTML = '<li class="empty-hint">No saved searches</li>';
      return;
    }

    list.innerHTML = _searches.map(s => `
      <li>
        <button class="smart-folder-btn" data-query="${enc(s.query)}" data-id="${enc(s.id)}">
          &#128269; ${enc(s.name)}
        </button>
        <button class="smart-folder-delete" data-id="${enc(s.id)}" title="Delete">&times;</button>
      </li>`).join('');

    list.querySelectorAll('.smart-folder-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.query;
        const input = document.getElementById('search-input');
        if (input) {
          input.value = q;
          input.dispatchEvent(new Event('input'));
        }
      });
    });

    list.querySelectorAll('.smart-folder-delete').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const res = await apiFetch(`/api/searches/${btn.dataset.id}`, { method: 'DELETE' });
        if (res?.ok) await loadAndRender();
      });
    });
  }

  async function saveSearch(name, query, tags) {
    const res = await apiFetch('/api/searches', {
      method: 'POST',
      body: { name, query, tags },
    });
    if (res?.ok) await loadAndRender();
  }

  return { loadAndRender, saveSearch };
})();

export default Searches;
