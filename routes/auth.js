'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getUsers, setUsers } = require('../lib/data');
const { requireAuth, validUsername, validPassword } = require('../middleware/auth');

const router = express.Router();

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

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.isAdmin = true;
  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  const users = getUsers();
  const user = users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.isAdmin = user.isAdmin;
  res.json({ ok: true, isAdmin: user.isAdmin });
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
