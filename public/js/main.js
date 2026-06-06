import Auth from './auth.js';
import Editor from './editor.js';
import Feed from './feed.js';
import NoteView from './note-view.js';
import Sidebar from './sidebar.js';
import Graph from './graph.js';
import UserMenu from './user-menu.js';
import Admin from './admin.js';
import Folders from './folders.js';
import Searches from './searches.js';
import Calendar from './calendar.js';
import Templates from './templates.js';
import { apiFetch, extractTagsFromHTML } from './utils.js';

window._auth = Auth;
window._editor = Editor;
window._feed = Feed;
window._noteView = NoteView;
window._sidebar = Sidebar;
window._graph = Graph;
window._admin = Admin;

Calendar.init();

Auth.init(async userData => {
  UserMenu.init(userData);

  await Feed.load();
  Feed.render(document.getElementById('note-feed'), window._notes);
  Sidebar.renderTags();

  await Folders.loadAndRender();
  await Searches.loadAndRender();
  await Templates.loadAndRender();

  initInlineEditor();
  initSearch();
  initLayoutToggle();
  initSort();
  initSaveSearch();
  initTemplatesModal();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});

function initInlineEditor() {
  const toolbarEl = document.getElementById('editor-toolbar');
  const bodyEl = document.getElementById('editor-body');
  const tagsPreview = document.getElementById('editor-tags-preview');
  const titleEl = document.getElementById('editor-title');
  const saveBtn = document.getElementById('editor-save-btn');
  const publicEl = document.getElementById('editor-public');
  const folderEl = document.getElementById('editor-folder');
  const dueDateEl = document.getElementById('editor-due-date');

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
        folderId: folderEl?.value || null,
        dueDate: dueDateEl?.value || null,
      },
    });

    if (res?.ok) {
      Editor.clearContent(bodyEl);
      Editor.clearDraft('sprig-draft');
      tagsPreview.innerHTML = '';
      titleEl.value = '';
      publicEl.checked = false;
      if (folderEl) folderEl.value = '';
      if (dueDateEl) dueDateEl.value = '';
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

function initSort() {
  const sel = document.getElementById('feed-sort');
  if (!sel) return;
  const KEY = 'sprig_sort';
  const saved = localStorage.getItem(KEY);
  if (saved) { sel.value = saved; Feed.setSort(saved); }

  sel.addEventListener('change', () => {
    Feed.setSort(sel.value);
    localStorage.setItem(KEY, sel.value);
    Feed.refresh();
  });
}

function initSaveSearch() {
  const btn = document.getElementById('save-search-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const q = document.getElementById('search-input')?.value.trim() || '';
    const name = prompt('Save search as:');
    if (name && name.trim()) Searches.saveSearch(name.trim(), q, []);
  });
}

function initTemplatesModal() {
  const openBtn = document.getElementById('editor-template-btn');
  const modal = document.getElementById('templates-modal');
  const closeBtn = document.getElementById('templates-modal-close');
  const saveBtn = document.getElementById('save-as-template-btn');

  if (!modal) return;

  openBtn?.addEventListener('click', async () => {
    await Templates.loadAndRender();
    modal.classList.remove('hidden');
  });

  closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));

  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  saveBtn?.addEventListener('click', async () => {
    const name = prompt('Template name:');
    if (name && name.trim()) {
      await Templates.saveFromEditor(name.trim());
    }
  });
}
