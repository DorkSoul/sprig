import { apiFetch, enc } from './utils.js';

const Folders = (() => {
  let _folders = [];
  let _activeFolder = null;

  async function load() {
    const res = await apiFetch('/api/folders');
    if (!res) return;
    _folders = await res.json();
    return _folders;
  }

  function getFolders() { return _folders; }

  async function loadAndRender() {
    await load();
    render();
  }

  function render() {
    const list = document.getElementById('folder-list');
    if (!list) return;

    const folderSelectEls = document.querySelectorAll('.folder-select');
    folderSelectEls.forEach(sel => {
      const current = sel.value;
      sel.innerHTML = '<option value="">No folder</option>' +
        _folders.map(f => `<option value="${enc(f.id)}">${enc(f.name)}</option>`).join('');
      sel.value = current;
    });

    list.innerHTML = _folders.map(f => `
      <li>
        <button class="folder-btn${_activeFolder === f.id ? ' active' : ''}" data-id="${enc(f.id)}">
          <span>&#128193; ${enc(f.name)}</span>
        </button>
        <button class="folder-delete-btn" data-id="${enc(f.id)}" title="Delete folder">&times;</button>
      </li>`).join('');

    list.querySelectorAll('.folder-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (_activeFolder === id) {
          _activeFolder = null;
          window._feed?.clearTagFilter();
        } else {
          _activeFolder = id;
          filterByFolder();
        }
        render();
        window._sidebar?.showView('feed');
      });
    });

    list.querySelectorAll('.folder-delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Delete this folder?')) return;
        const res = await apiFetch(`/api/folders/${btn.dataset.id}`, { method: 'DELETE' });
        if (res?.ok) {
          if (_activeFolder === btn.dataset.id) {
            _activeFolder = null;
            window._feed?.clearTagFilter();
          }
          await loadAndRender();
          await window._feed?.refresh();
        }
      });
    });
  }

  function filterByFolder() {
    // _activeFolder is already set by the caller; render through Feed's combined
    // tag+folder filter so the view matches what a later refresh will show.
    window._feed?.renderActive();
  }

  async function createFolder(name) {
    const res = await apiFetch('/api/folders', { method: 'POST', body: { name } });
    if (!res?.ok) return null;
    const folder = await res.json();
    await loadAndRender();
    return folder;
  }

  function getActiveFolder() { return _activeFolder; }

  document.getElementById('new-folder-btn')?.addEventListener('click', async () => {
    const name = prompt('Folder name:');
    if (name && name.trim()) await createFolder(name.trim());
  });

  return { load, loadAndRender, render, getFolders, createFolder, getActiveFolder };
})();

export default Folders;
