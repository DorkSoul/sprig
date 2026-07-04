'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getTemplates, setTemplates } = require('../lib/data');
const { requireAuth } = require('../middleware/auth');
const { sanitizeHTML } = require('../lib/sanitize');

const router = express.Router();
router.use(requireAuth);

// Cap templates per user to bound disk usage.
const MAX_TEMPLATES_PER_USER = 500;

router.get('/', (req, res) => {
  const templates = getTemplates().filter(t => t.userId === req.session.userId);
  res.json(templates);
});

router.post('/', (req, res) => {
  const { name, title, content } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }
  const templates = getTemplates();
  const mine = templates.filter(t => t.userId === req.session.userId);
  if (mine.length >= MAX_TEMPLATES_PER_USER) {
    return res.status(403).json({ error: 'Template limit reached' });
  }
  const trimmedName = name.trim().slice(0, 100);
  if (mine.some(t => t.name.toLowerCase() === trimmedName.toLowerCase())) {
    return res.status(400).json({ error: 'A template with that name already exists' });
  }
  const template = {
    id: uuidv4(),
    userId: req.session.userId,
    name: trimmedName,
    title: typeof title === 'string' ? title.trim().slice(0, 200) : '',
    // Sanitize on store: template content is inserted into the editor via innerHTML.
    content: sanitizeHTML(typeof content === 'string' ? content : ''),
    createdAt: new Date().toISOString(),
  };
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
