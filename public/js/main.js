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

Auth.init(async userData => {
  UserMenu.init(userData);

  await Feed.load();
  Feed.render(document.getElementById('note-feed'), window._notes);
  Sidebar.renderTags();

  initInlineEditor();
  initSearch();
});

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
    const res = await apiFetch('/api/notes', {
      method: 'POST',
      body: {
        title: titleEl.value.trim(),
        content,
        tags,
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
