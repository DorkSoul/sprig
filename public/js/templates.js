import { apiFetch, enc } from './utils.js';

const Templates = (() => {
  let _templates = [];

  async function loadAndRender() {
    const res = await apiFetch('/api/templates');
    if (!res) return;
    _templates = await res.json();
    render();
  }

  function render() {
    const list = document.getElementById('templates-list');
    if (!list) return;

    if (_templates.length === 0) {
      list.innerHTML = '<p class="empty-hint">No templates yet.</p>';
      return;
    }

    list.innerHTML = _templates.map(t => `
      <div class="template-item">
        <span class="template-name">${enc(t.name)}</span>
        <div class="template-actions">
          <button class="template-use-btn secondary-btn" data-id="${enc(t.id)}">Use</button>
          <button class="template-delete-btn danger-btn" data-id="${enc(t.id)}">Delete</button>
        </div>
      </div>`).join('');

    list.querySelectorAll('.template-use-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = _templates.find(t => t.id === btn.dataset.id);
        if (!t) return;
        const titleEl = document.getElementById('editor-title');
        const bodyEl = document.getElementById('editor-body');
        if (titleEl) titleEl.value = t.title || '';
        if (bodyEl) bodyEl.innerHTML = t.content || '';
        const modal = document.getElementById('templates-modal');
        if (modal) modal.classList.add('hidden');
        window._editor?.updateTagsPreview(bodyEl, document.getElementById('editor-tags-preview'));
      });
    });

    list.querySelectorAll('.template-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this template?')) return;
        const res = await apiFetch(`/api/templates/${btn.dataset.id}`, { method: 'DELETE' });
        if (res?.ok) await loadAndRender();
      });
    });
  }

  async function saveFromEditor(name) {
    const titleEl = document.getElementById('editor-title');
    const bodyEl = document.getElementById('editor-body');
    const title = titleEl?.value.trim() || '';
    const content = bodyEl?.innerHTML || '';
    const res = await apiFetch('/api/templates', {
      method: 'POST',
      body: { name, title, content },
    });
    if (res?.ok) await loadAndRender();
  }

  return { loadAndRender, saveFromEditor };
})();

export default Templates;
