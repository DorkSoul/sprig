'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getFolders, setFolders, getNotes, setNotes } = require('../lib/data');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.json(getFolders());
});

router.post('/', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Folder name required' });
  }
  const folders = getFolders();
  const folder = {
    id: uuidv4(),
    name: name.trim().slice(0, 100),
    createdAt: new Date().toISOString(),
  };
  folders.push(folder);
  setFolders(folders);
  res.json(folder);
});

router.delete('/:id', requireAdmin, (req, res) => {
  const folders = getFolders();
  const idx = folders.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  folders.splice(idx, 1);
  setFolders(folders);
  const notes = getNotes();
  let changed = false;
  notes.forEach(n => { if (n.folderId === req.params.id) { n.folderId = null; changed = true; } });
  if (changed) setNotes(notes);
  res.json({ ok: true });
});

module.exports = router;
