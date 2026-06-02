import Auth from './auth.js';
import Editor from './editor.js';
import Feed from './feed.js';
import NoteView from './note-view.js';
import Sidebar from './sidebar.js';
import Graph from './graph.js';
import UserMenu from './user-menu.js';
import Admin from './admin.js';
import { apiFetch, extractTagsFromHTML } from './utils.js';

window._auth = Auth;
window._editor = Editor;
window._feed = Feed;
window._noteView = NoteView;
window._sidebar = Sidebar;
window._graph = Graph;
window._admin = Admin;
window._reloadFolders = () => Admin.loadFolders();

Auth.init(async userData => {
  window._currentUser = userData;
  UserMenu.init(userData);

  await Feed.load();
  Feed.render(document.getElementById('note-feed'), window._notes);
  Sidebar.renderTags();
  await Sidebar.renderFolders(userData);
  populateFolderSelects(userData);

  initInlineEditor();
  initSearch();
  initLayoutToggle();
});

window._populateFolderSelects = populateFolderSelects;
function populateFolderSelects(userData) {
  const folders = window._folders || [];
  const allowed = (!userData || userData.isAdmin || !Array.isArray(userData.folderAccess))
    ? folders
    : folders.filter(f => userData.folderAccess.includes(f.id));

  const selects = ['editor-folder', 'edit-folder'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value;
    const noFolderOpt = (userData && !userData.isAdmin && Array.isArray(userData.folderAccess) && userData.folderAccess.length > 0)
      ? '' : '<option value="">No folder</option>';
    sel.innerHTML = noFolderOpt + allowed.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    if (current) sel.value = current;
    if (allowed.length > 0) sel.classList.remove('hidden');
    else sel.classList.add('hidden');
  });
}

function initInlineEditor() {
  const toolbarEl = document.getElementById('editor-toolbar');
  const bodyEl = document.getElementById('editor-body');
  const tagsPreview = document.getElementById('editor-tags-preview');
  const titleEl = document.getElementById('editor-title');
  const saveBtn = document.getElementById('editor-save-btn');
  const publicEl = document.getElementById('editor-public');

  Editor.initToolbar(toolbarEl, bodyEl, tagsPreview);
  Editor.initImport(bodyEl, tagsPreview);
  Editor.loadDraft('sprig-draft', bodyEl, titleEl);

  bodyEl.addEventListener('input', () => {
    Editor.saveDraft('sprig-draft', bodyEl, titleEl);
    Editor.updateTagsPreview(bodyEl, tagsPreview);
  });

  titleEl.addEventListener('input', () => Editor.saveDraft('sprig-draft', bodyEl, titleEl));

  saveBtn.addEventListener('click', async () => {
    const content = Editor.getContent(bodyEl);
    if (!content.trim() && !titleEl.value.trim()) return;

    const tags = extractTagsFromHTML(content);
    const folderEl = document.getElementById('editor-folder');
    const res = await apiFetch('/api/notes', {
      method: 'POST',
      body: {
        title: titleEl.value.trim(),
        content,
        tags,
        folderId: folderEl?.value || null,
        visibility: publicEl.checked ? 'public' : 'private',
      },
    });

    if (res?.ok) {
      Editor.clearContent(bodyEl);
      Editor.clearDraft('sprig-draft');
      tagsPreview.innerHTML = '';
      titleEl.value = '';
      publicEl.checked = false;
      await Feed.refresh();
    }
  });

  bodyEl.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      saveBtn.click();
    }
  });
}

function initLayoutToggle() {
  const btn = document.getElementById('layout-toggle');
  const views = ['feed-view', 'public-view', 'search-view'].map(id => document.getElementById(id));
  const KEY = 'sprig_feed_layout';

  function apply(masonry) {
    views.forEach(el => el?.classList.toggle('masonry', masonry));
    btn.innerHTML = masonry ? '&#8801;' : '&#8862;';
    btn.title = masonry ? 'List layout' : 'Masonry layout';
    btn.classList.toggle('layout-active', masonry);
  }

  apply(localStorage.getItem(KEY) === 'masonry');

  btn.addEventListener('click', () => {
    const masonry = !document.getElementById('feed-view').classList.contains('masonry');
    apply(masonry);
    localStorage.setItem(KEY, masonry ? 'masonry' : 'list');
  });
}

function initSearch() {
  const input = document.getElementById('search-input');
  let debounce;

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();

    if (!q) {
      Sidebar.showView('feed');
      return;
    }

    debounce = setTimeout(async () => {
      Sidebar.showView('search');
      await Feed.renderSearch(q);
    }, 300);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      input.value = '';
      Sidebar.showView('feed');
    }
  });
}
