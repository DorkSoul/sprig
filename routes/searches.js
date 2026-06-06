'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getSearches, setSearches } = require('../lib/data');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const searches = getSearches().filter(s => s.userId === req.session.userId);
  res.json(searches);
});

router.post('/', (req, res) => {
  const { name, query, tags } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }
  const search = {
    id: uuidv4(),
    userId: req.session.userId,
    name: name.trim().slice(0, 100),
    query: typeof query === 'string' ? query.trim() : '',
    tags: Array.isArray(tags) ? tags.map(String) : [],
    createdAt: new Date().toISOString(),
  };
  const searches = getSearches();
  searches.push(search);
  setSearches(searches);
  res.json(search);
});

router.delete('/:id', (req, res) => {
  const searches = getSearches();
  const idx = searches.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (searches[idx].userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });
  searches.splice(idx, 1);
  setSearches(searches);
  res.json({ ok: true });
});

module.exports = router;
