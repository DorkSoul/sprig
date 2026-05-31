import { formatDate, enc, apiFetch } from './utils.js';

const Admin = (() => {
  async function open() {
    await loadUsers();
    document.getElementById('admin-modal').classList.remove('hidden');
  }

  function close() {
    document.getElementById('admin-modal').classList.add('hidden');
  }

  async function loadUsers() {
    const res = await apiFetch('/api/admin/users');
    if (!res) return;
    const users = await res.json();
    const tbody = document.getElementById('admin-users-tbody');
    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${enc(u.username)}</td>
        <td>${u.isAdmin ? '<span class="admin-badge">admin</span>' : ''}</td>
        <td>${formatDate(u.createdAt)}</td>
        <td>
          <div class="admin-table-actions">
            <button class="reset-pw-btn" data-id="${u.id}" data-name="${enc(u.username)}">Reset PW</button>
            <button class="delete-user-btn danger-btn" data-id="${u.id}">Delete</button>
          </div>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('.reset-pw-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pw = prompt(`New password for ${btn.dataset.name}:`);
        if (!pw) return;
        const res = await apiFetch(`/api/admin/users/${btn.dataset.id}`, { method: 'PUT', body: { password: pw } });
        if (!res?.ok) {
          const d = await res?.json();
          alert(d?.error || 'Failed');
        }
      });
    });

    tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this user and all their notes?')) return;
        const res = await apiFetch(`/api/admin/users/${btn.dataset.id}`, { method: 'DELETE' });
        if (res?.ok) await loadUsers();
        else {
          const d = await res?.json();
          alert(d?.error || 'Failed');
        }
      });
    });
  }

  document.getElementById('admin-modal-close').addEventListener('click', close);
  document.getElementById('admin-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) close();
  });

  document.getElementById('admin-create-user-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('new-user-username').value.trim();
    const password = document.getElementById('new-user-password').value;
    const isAdmin = document.getElementById('new-user-admin').checked;
    const errEl = document.getElementById('admin-user-error');

    const res = await apiFetch('/api/admin/users', { method: 'POST', body: { username, password, isAdmin } });
    if (!res) return;
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error;
      errEl.classList.remove('hidden');
      return;
    }
    errEl.classList.add('hidden');
    document.getElementById('new-user-username').value = '';
    document.getElementById('new-user-password').value = '';
    document.getElementById('new-user-admin').checked = false;
    await loadUsers();
  });

  return { open, close };
})();

export default Admin;
