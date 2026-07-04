'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getFolders, setFolders, getNotes, setNotes } = require('../lib/data');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Cap folders per user to bound disk usage.
const MAX_FOLDERS_PER_USER = 500;

router.get('/', (req, res) => {
  const folders = getFolders().filter(f => f.userId === req.session.userId);
  res.json(folders);
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }
  const folders = getFolders();
  const mine = folders.filter(f => f.userId === req.session.userId);
  if (mine.length >= MAX_FOLDERS_PER_USER) {
    return res.status(403).json({ error: 'Folder limit reached' });
  }
  const trimmedName = name.trim().slice(0, 100);
  if (mine.some(f => f.name.toLowerCase() === trimmedName.toLowerCase())) {
    return res.status(400).json({ error: 'A folder with that name already exists' });
  }
  const folder = {
    id: uuidv4(),
    userId: req.session.userId,
    name: trimmedName,
    createdAt: new Date().toISOString(),
  };
  folders.push(folder);
  setFolders(folders);
  res.json(folder);
});

router.put('/:id', (req, res) => {
  const folders = getFolders();
  const idx = folders.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (folders[idx].userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });

  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }
  const trimmedName = name.trim().slice(0, 100);
  if (folders.some(f => f.userId === req.session.userId && f.id !== req.params.id &&
      f.name.toLowerCase() === trimmedName.toLowerCase())) {
    return res.status(400).json({ error: 'A folder with that name already exists' });
  }
  folders[idx].name = trimmedName;
  setFolders(folders);
  res.json(folders[idx]);
});

router.delete('/:id', (req, res) => {
  const folders = getFolders();
  const idx = folders.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (folders[idx].userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });

  folders.splice(idx, 1);
  setFolders(folders);

  const notes = getNotes();
  let changed = false;
  notes.forEach(n => {
    if (n.folderId === req.params.id) { n.folderId = null; changed = true; }
  });
  if (changed) setNotes(notes);

  res.json({ ok: true });
});

module.exports = router;
