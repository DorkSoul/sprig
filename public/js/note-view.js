import { formatDate, enc, apiFetch, extractTagsFromHTML, renderTagChips } from './utils.js';

const NoteView = (() => {
  function open(id) {
    const note = (window._notes || []).find(n => n.id === id);
    if (!note) return;

    document.getElementById('modal-title').textContent = note.title || '';
    document.getElementById('modal-content').innerHTML = note.content;
    document.getElementById('modal-tags').innerHTML = renderTagChips(note.tags || []);
    document.getElementById('modal-meta').textContent =
      `Created ${formatDate(note.createdAt)}  ·  Updated ${formatDate(note.updatedAt)}`;

    document.getElementById('modal-edit-btn').onclick = () => { closeModal(); openEdit(id); };
    document.getElementById('modal-export-html-btn').onclick = () => exportNote(note, 'html');
    document.getElementById('modal-export-text-btn').onclick = () => exportNote(note, 'text');
    document.getElementById('modal-delete-btn').onclick = async () => {
      if (!confirm('Delete this note?')) return;
      const res = await apiFetch(`/api/notes/${id}`, { method: 'DELETE' });
      if (res?.ok) { closeModal(); await window._feed?.refresh(); }
    };

    document.getElementById('modal-content').querySelectorAll('a.note-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        const linkId = a.getAttribute('href').replace('#', '');
        closeModal();
        setTimeout(() => open(linkId), 50);
      });
    });

    loadBacklinks(id);
    document.getElementById('note-modal').classList.remove('hidden');
  }

  async function loadBacklinks(id) {
    const res = await apiFetch(`/api/notes/${id}/backlinks`);
    const section = document.getElementById('backlinks-section');
    const list = document.getElementById('backlinks-list');
    if (!res) { section.classList.add('hidden'); return; }
    const backlinks = await res.json();
    if (backlinks.length === 0) { section.classList.add('hidden'); return; }

    section.classList.remove('hidden');
    list.innerHTML = backlinks.map(n =>
      `<li><button data-id="${n.id}">${enc(n.title || '(untitled)')}</button></li>`
    ).join('');
    list.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => { closeModal(); setTimeout(() => open(btn.dataset.id), 50); });
    });
  }

  function closeModal() {
    document.getElementById('note-modal').classList.add('hidden');
  }

  function exportNote(note, format) {
    const slug = (note.title || note.id).replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 60);
    let blob, filename;

    if (format === 'html') {
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${note.title || 'Note'}</title><style>body{font-family:sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6}pre{background:#f4f4f4;padding:12px;border-radius:4px;overflow-x:auto}code{background:#f4f4f4;padding:2px 4px;border-radius:3px}blockquote{border-left:3px solid #ccc;padding-left:12px;color:#555}img{max-width:100%}</style></head><body>${note.title ? `<h1>${note.title}</h1>` : ''}${note.content}</body></html>`;
      blob = new Blob([html], { type: 'text/html' });
      filename = `${slug}.html`;
    } else {
      const text = (note.title ? note.title + '\n\n' : '') +
        note.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      blob = new Blob([text], { type: 'text/plain' });
      filename = `${slug}.txt`;
    }

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openEdit(id) {
    const note = (window._notes || []).find(n => n.id === id);
    if (!note) return;

    const titleEl = document.getElementById('edit-title');
    const bodyEl = document.getElementById('edit-editor-body');
    const tagsPreview = document.getElementById('edit-tags-preview');
    const publicEl = document.getElementById('edit-public');

    titleEl.value = note.title || '';
    bodyEl.innerHTML = note.content;
    publicEl.checked = note.visibility === 'public';

    const tags = extractTagsFromHTML(note.content);
    tagsPreview.innerHTML = renderTagChips(tags);

    const toolbarEl = document.getElementById('edit-editor-toolbar');
    if (!toolbarEl.dataset.initialized) {
      toolbarEl.innerHTML = buildToolbarHTML();
      window._editor?.initToolbar(toolbarEl, bodyEl, tagsPreview);
      toolbarEl.dataset.initialized = '1';
    } else {
      window._editor?.initToolbar(toolbarEl, bodyEl, tagsPreview);
    }

    document.getElementById('edit-save-btn').onclick = async () => {
      const content = window._editor?.getContent(bodyEl) || bodyEl.innerHTML;
      const inlineTags = extractTagsFromHTML(content);
      const body = {
        title: titleEl.value.trim(),
        content,
        tags: inlineTags,
        visibility: publicEl.checked ? 'public' : 'private',
      };
      const res = await apiFetch(`/api/notes/${id}`, { method: 'PUT', body });
      if (res?.ok) {
        const updated = await res.json();
        const idx = (window._notes || []).findIndex(n => n.id === id);
        if (idx !== -1) window._notes[idx] = updated;
        closeEditModal();
        await window._feed?.refresh();
      }
    };

    document.getElementById('edit-modal').classList.remove('hidden');
  }

  function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
    window._editor?.hideLinkAutocomplete();
  }

  function buildToolbarHTML() {
    return `
      <button data-cmd="bold" title="Bold"><strong>B</strong></button>
      <button data-cmd="italic" title="Italic"><em>I</em></button>
      <button data-cmd="underline" title="Underline"><u>U</u></button>
      <button data-cmd="strikethrough" title="Strikethrough"><s>S</s></button>
      <span class="toolbar-sep"></span>
      <button data-cmd="h1">H1</button>
      <button data-cmd="h2">H2</button>
      <button data-cmd="h3">H3</button>
      <span class="toolbar-sep"></span>
      <button data-cmd="ul">&#8226;&#8212;</button>
      <button data-cmd="ol">1&#8212;</button>
      <button data-cmd="blockquote">&#10078;</button>
      <span class="toolbar-sep"></span>
      <button data-cmd="code">\`</button>
      <button data-cmd="codeblock">\`\`\`</button>
      <button data-cmd="link">&#128279;</button>
      <button data-cmd="hr">&#8213;</button>
      <button data-cmd="image">&#128444;</button>`;
  }

  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('edit-modal-close').addEventListener('click', closeEditModal);

  document.getElementById('note-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById('edit-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeEditModal();
  });

  return { open, openEdit, closeModal, closeEditModal };
})();

export default NoteView;
