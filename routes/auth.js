'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getUsers, setUsers } = require('../lib/data');
const { requireAuth, validUsername, validPassword } = require('../middleware/auth');

const router = express.Router();

// In-memory brute-force throttle: after MAX_ATTEMPTS failures from an IP within
// WINDOW_MS, further login attempts are rejected until the window elapses. Resets
// on a successful login. State is per-process (fine for a single-node self-host).
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

function attemptKey(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function isRateLimited(key) {
  const rec = loginAttempts.get(key);
  if (!rec) return false;
  if (Date.now() - rec.first > WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

function recordFailure(key) {
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || now - rec.first > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, first: now });
  } else {
    rec.count += 1;
  }
}

// Rotate the session ID before storing auth data to prevent session fixation.
function establishSession(req, user, cb) {
  req.session.regenerate((err) => {
    if (err) return cb(err);
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = user.isAdmin;
    req.session.save(cb);
  });
}

router.get('/status', (req, res) => {
  const users = getUsers();
  if (users.length === 0) return res.json({ state: 'setup' });
  if (!req.session.userId) return res.json({ state: 'login' });
  res.json({
    state: 'ok',
    userId: req.session.userId,
    username: req.session.username,
    isAdmin: req.session.isAdmin,
  });
});

router.post('/setup', (req, res) => {
  const users = getUsers();
  if (users.length > 0) return res.status(400).json({ error: 'Setup already complete' });

  const { username, password } = req.body;
  if (!validUsername(username)) return res.status(400).json({ error: 'Invalid username' });
  if (!validPassword(password)) return res.status(400).json({ error: 'Password must be 8–128 characters' });

  const hash = bcrypt.hashSync(password, 12);
  const user = { id: uuidv4(), username, passwordHash: hash, isAdmin: true, createdAt: new Date().toISOString() };
  setUsers([user]);

  establishSession(req, user, (err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json({ ok: true });
  });
});

router.post('/login', (req, res) => {
  const key = attemptKey(req);
  if (isRateLimited(key)) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === String(username).toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    recordFailure(key);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  loginAttempts.delete(key);
  establishSession(req, user, (err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json({ ok: true, isAdmin: user.isAdmin });
  });
});

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    userId: req.session.userId,
    username: req.session.username,
    isAdmin: req.session.isAdmin,
  });
});

module.exports = router;
