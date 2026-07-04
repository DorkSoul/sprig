const UserMenu = (() => {
  const btn = document.getElementById('user-menu-btn');
  const dropdown = document.getElementById('user-menu-dropdown');
  let _userData = null;
  let _bound = false;

  function init(userData) {
    // init() may run again after a re-login; refresh the display each time but bind
    // the action listeners only once so they don't stack and fire multiply.
    _userData = userData;
    const initial = (userData.username || '?')[0].toUpperCase();
    btn.textContent = initial;
    document.getElementById('user-menu-name').textContent = userData.username;

    const adminBtn = document.getElementById('admin-panel-btn');
    adminBtn.classList.toggle('hidden', !userData.isAdmin);

    if (_bound) return;
    _bound = true;

    adminBtn.addEventListener('click', () => {
      close();
      window._admin?.open();
    });

    document.getElementById('export-all-btn').addEventListener('click', () => {
      close();
      const notes = (window._notes || []).filter(n => n.userId === _userData?.userId);
      const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sprig-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      window._auth?.logout();
    });
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', () => dropdown.classList.add('hidden'));

  function close() { dropdown.classList.add('hidden'); }

  return { init };
})();

export default UserMenu;
