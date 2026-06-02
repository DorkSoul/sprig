import { formatDate, enc, apiFetch } from './utils.js';

const Admin = (() => {
  let _folders = [];
  let _folderAccessUserId = null;

  async function open() {
    await Promise.all([loadUsers(), loadFolders()]);
    document.getElementById('admin-modal').classList.remove('hidden');
  }

  function close() {
    document.getElementById('admin-modal').classList.add('hidden');
  }

  async function loadFolders() {
    const res = await apiFetch('/api/folders');
    if (!res) return;
    _folders = await res.json();
    window._folders = _folders;
    renderAdminFolderList();
    renderCreateUserFolders();
    window._sidebar?.renderFolders(window._currentUser);
    window._populateFolderSelects?.(window._currentUser);
  }

  function renderAdminFolderList() {
    const list = document.getElementById('admin-folder-list');
    if (!list) return;
    if (_folders.length === 0) { list.innerHTML = '<li class="folder-empty">No folders yet.</li>'; return; }
    list.innerHTML = _folders.map(f => `
      <li class="admin-folder-item">
        <span>&#128193; ${enc(f.name)}</span>
        <button class="delete-folder-btn" data-id="${f.id}" data-name="${enc(f.name)}">Delete</button>
      </li>`).join('');
    list.querySelectorAll('.delete-folder-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Delete folder "${btn.dataset.name}"? Notes in it will be moved to root.`)) return;
        const res = await apiFetch(`/api/folders/${btn.dataset.id}`, { method: 'DELETE' });
        if (res?.ok) await loadFolders();
      });
    });
  }

  async function loadUsers() {
    const res = await apiFetch('/api/admin/users');
    if (!res) return;
    const users = await res.json();
    const tbody = document.getElementById('admin-users-tbody');
    tbody.innerHTML = users.map(u => {
      const accessLabel = u.isAdmin || u.folderAccess === null
        ? 'All'
        : (u.folderAccess?.length
          ? u.folderAccess.map(id => _folders.find(f => f.id === id)?.name || id).join(', ')
          : 'None');
      return `
      <tr>
        <td>${enc(u.username)}</td>
        <td>${u.isAdmin ? '<span class="admin-badge">admin</span>' : ''}</td>
        <td class="folder-access-cell" title="${accessLabel}">${accessLabel}</td>
        <td>${formatDate(u.createdAt)}</td>
        <td>
          <div class="admin-table-actions">
            ${!u.isAdmin ? `<button class="set-folders-btn" data-id="${u.id}" data-name="${enc(u.username)}" data-access='${JSON.stringify(u.folderAccess)}'>Folders</button>` : ''}
            <button class="reset-pw-btn" data-id="${u.id}" data-name="${enc(u.username)}">Reset PW</button>
            <button class="delete-user-btn danger-btn" data-id="${u.id}">Delete</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.set-folders-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _folderAccessUserId = btn.dataset.id;
        const currentAccess = JSON.parse(btn.dataset.access);
        showFolderAccessPanel(btn.dataset.name, currentAccess);
      });
    });

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

  function showFolderAccessPanel(username, currentAccess) {
    const panel = document.getElementById('admin-folder-access-panel');
    document.getElementById('folder-access-username').textContent = username;

    const allCheckbox = document.getElementById('folder-access-all');
    const listEl = document.getElementById('folder-access-list');

    const isAll = currentAccess === null;
    allCheckbox.checked = isAll;

    listEl.innerHTML = _folders.map(f => {
      const checked = isAll || (Array.isArray(currentAccess) && currentAccess.includes(f.id));
      return `<label class="folder-access-item">
        <input type="checkbox" class="folder-cb" data-id="${f.id}" ${checked ? 'checked' : ''}> ${enc(f.name)}
      </label>`;
    }).join('');

    listEl.style.opacity = isAll ? '0.4' : '1';
    listEl.querySelectorAll('.folder-cb').forEach(cb => { cb.disabled = isAll; });

    allCheckbox.onchange = () => {
      const all = allCheckbox.checked;
      listEl.style.opacity = all ? '0.4' : '1';
      listEl.querySelectorAll('.folder-cb').forEach(cb => { cb.disabled = all; });
    };

    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.getElementById('folder-access-save-btn').addEventListener('click', async () => {
    if (!_folderAccessUserId) return;
    const allChecked = document.getElementById('folder-access-all').checked;
    const folderAccess = allChecked
      ? null
      : Array.from(document.querySelectorAll('#folder-access-list .folder-cb:checked')).map(cb => cb.dataset.id);

    const res = await apiFetch(`/api/admin/users/${_folderAccessUserId}`, {
      method: 'PUT',
      body: { folderAccess },
    });
    if (res?.ok) {
      document.getElementById('admin-folder-access-panel').classList.add('hidden');
      _folderAccessUserId = null;
      await loadUsers();
    }
  });

  document.getElementById('admin-create-folder-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('new-folder-name').value.trim();
    const errEl = document.getElementById('admin-folder-error');
    const res = await apiFetch('/api/folders', { method: 'POST', body: { name } });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error;
      errEl.classList.remove('hidden');
      return;
    }
    errEl.classList.add('hidden');
    document.getElementById('new-folder-name').value = '';
    await loadFolders();
  });

  document.getElementById('admin-modal-close').addEventListener('click', close);
  document.getElementById('admin-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) close();
  });

  document.getElementById('admin-create-user-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('new-user-username').value.trim();
    const password = document.getElementById('new-user-password').value;
    const confirm = document.getElementById('new-user-password-confirm').value;
    const isAdmin = document.getElementById('new-user-admin').checked;
    const errEl = document.getElementById('admin-user-error');

    if (password !== confirm) {
      errEl.textContent = 'Passwords do not match.';
      errEl.classList.remove('hidden');
      return;
    }

    const folderAccess = document.getElementById('new-user-folder-all').checked
      ? null
      : Array.from(document.querySelectorAll('#new-user-folder-list .folder-cb:checked')).map(cb => cb.dataset.id);

    const res = await apiFetch('/api/admin/users', { method: 'POST', body: { username, password, isAdmin, folderAccess } });
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
    document.getElementById('new-user-password-confirm').value = '';
    document.getElementById('new-user-admin').checked = false;
    document.getElementById('new-user-folder-all').checked = true;
    renderCreateUserFolders();
    await loadUsers();
  });

  function renderCreateUserFolders() {
    const allEl = document.getElementById('new-user-folder-all');
    const listEl = document.getElementById('new-user-folder-list');
    if (!allEl || !listEl) return;
    const isAll = allEl.checked;
    listEl.innerHTML = _folders.map(f =>
      `<label class="folder-access-item">
        <input type="checkbox" class="folder-cb" data-id="${f.id}" ${isAll ? 'checked' : ''}> ${enc(f.name)}
      </label>`
    ).join('');
    listEl.style.opacity = isAll ? '0.4' : '1';
    listEl.querySelectorAll('.folder-cb').forEach(cb => { cb.disabled = isAll; });
    allEl.onchange = () => {
      const all = allEl.checked;
      listEl.style.opacity = all ? '0.4' : '1';
      listEl.querySelectorAll('.folder-cb').forEach(cb => { cb.disabled = all; cb.checked = all; });
    };
  }

  return { open, close, loadFolders };
})();

export default Admin;
