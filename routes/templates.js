'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getTemplates, setTemplates } = require('../lib/data');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const templates = getTemplates().filter(t => t.userId === req.session.userId);
  res.json(templates);
});

router.post('/', (req, res) => {
  const { name, title, content } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }
  const template = {
    id: uuidv4(),
    userId: req.session.userId,
    name: name.trim().slice(0, 100),
    title: typeof title === 'string' ? title.trim().slice(0, 200) : '',
    content: typeof content === 'string' ? content : '',
    createdAt: new Date().toISOString(),
  };
  const templates = getTemplates();
  templates.push(template);
  setTemplates(templates);
  res.json(template);
});

router.delete('/:id', (req, res) => {
  const templates = getTemplates();
  const idx = templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (templates[idx].userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });
  templates.splice(idx, 1);
  setTemplates(templates);
  res.json({ ok: true });
});

module.exports = router;
