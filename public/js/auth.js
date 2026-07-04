import { apiFetch } from './utils.js';

const Auth = (() => {
  let _onReady = null;

  async function init(onReady) {
    _onReady = onReady;
    let data;
    try {
      const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
      data = await res.json();
    } catch {
      showStartupError();
      return;
    }

    if (data.state === 'setup') {
      showSetup();
    } else if (data.state === 'login') {
      showLogin();
    } else {
      hideOverlay(data);
    }
  }

  function showStartupError() {
    const overlay = document.getElementById('auth-overlay');
    overlay.classList.remove('hidden');
    document.getElementById('setup-form')?.classList.add('hidden');
    document.getElementById('login-form')?.classList.add('hidden');
    let err = document.getElementById('startup-error');
    if (!err) {
      err = document.createElement('div');
      err.id = 'startup-error';
      err.className = 'auth-error';
      overlay.querySelector('.auth-card')?.appendChild(err);
    }
    err.textContent = 'Could not reach the server. Check your connection and reload.';
    err.classList.remove('hidden');
  }

  function showSetup() {
    document.getElementById('auth-overlay').classList.remove('hidden');
    document.getElementById('setup-form').classList.remove('hidden');
    document.getElementById('login-form').classList.add('hidden');
  }

  function showLogin() {
    document.getElementById('auth-overlay').classList.remove('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('setup-form').classList.add('hidden');
  }

  function hideOverlay(userData) {
    document.getElementById('auth-overlay').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    if (_onReady) _onReady(userData);
  }

  function handle401() {
    document.getElementById('app').classList.add('hidden');
    showLogin();
  }

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  }

  document.querySelectorAll('.pw-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  document.getElementById('setup-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('setup-username').value.trim();
    const password = document.getElementById('setup-password').value;
    const confirm = document.getElementById('setup-password-confirm').value;
    const errEl = document.getElementById('setup-error');

    if (password !== confirm) {
      errEl.textContent = 'Passwords do not match.';
      errEl.classList.remove('hidden');
      return;
    }

    const res = await apiFetch('/api/auth/setup', { method: 'POST', body: { username, password } });
    if (!res) return;
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error;
      errEl.classList.remove('hidden');
      return;
    }
    errEl.classList.add('hidden');

    const me = await (await fetch('/api/auth/me', { credentials: 'same-origin' })).json();
    hideOverlay(me);
  });

  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');

    const res = await apiFetch('/api/auth/login', { method: 'POST', body: { username, password } });
    if (!res) return;
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error;
      errEl.classList.remove('hidden');
      return;
    }
    errEl.classList.add('hidden');

    const me = await (await fetch('/api/auth/me', { credentials: 'same-origin' })).json();
    hideOverlay(me);
  });

  return { init, logout, handle401 };
})();

export default Auth;
