'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getUsers, setUsers, getNotes, setNotes } = require('../lib/data');
const { requireAdmin, validUsername, validPassword } = require('../middleware/auth');

const router = express.Router();

router.use(requireAdmin);

router.get('/users', (req, res) => {
  const users = getUsers().map(({ passwordHash, ...u }) => u);
  res.json(users);
});

router.post('/users', (req, res) => {
  const { username, password, isAdmin } = req.body;
  if (!validUsername(username)) return res.status(400).json({ error: 'Invalid username' });
  if (!validPassword(password)) return res.status(400).json({ error: 'Password must be 8–128 characters' });

  const users = getUsers();
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Username taken' });
  }

  const hash = bcrypt.hashSync(password, 12);
  const user = {
    id: uuidv4(),
    username,
    passwordHash: hash,
    isAdmin: isAdmin === true,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  setUsers(users);
  const { passwordHash, ...safe } = user;
  res.json(safe);
});

router.put('/users/:id', (req, res) => {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const { password, isAdmin, username } = req.body;
  if (username !== undefined) {
    if (!validUsername(username)) return res.status(400).json({ error: 'Invalid username' });
    if (users.find(u => u.username === username && u.id !== req.params.id)) {
      return res.status(400).json({ error: 'Username taken' });
    }
    users[idx].username = username;
  }
  if (password !== undefined) {
    if (!validPassword(password)) return res.status(400).json({ error: 'Password must be 8–128 characters' });
    users[idx].passwordHash = bcrypt.hashSync(password, 12);
  }
  if (isAdmin !== undefined) {
    const adminCount = users.filter(u => u.isAdmin).length;
    if (!isAdmin && adminCount <= 1 && users[idx].isAdmin) {
      return res.status(400).json({ error: 'Cannot remove the last admin' });
    }
    users[idx].isAdmin = isAdmin === true;
  }

  setUsers(users);
  const { passwordHash, ...safe } = users[idx];
  res.json(safe);
});

router.delete('/users/:id', (req, res) => {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (users[idx].id === req.session.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const adminCount = users.filter(u => u.isAdmin).length;
  if (users[idx].isAdmin && adminCount <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last admin' });
  }

  users.splice(idx, 1);
  setUsers(users);

  const notes = getNotes().filter(n => n.userId !== req.params.id);
  setNotes(notes);

  res.json({ ok: true });
});

module.exports = router;
