'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getSearches, setSearches } = require('../lib/data');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Cap saved searches per user to bound disk usage.
const MAX_SEARCHES_PER_USER = 500;

router.get('/', (req, res) => {
  const searches = getSearches().filter(s => s.userId === req.session.userId);
  res.json(searches);
});

router.post('/', (req, res) => {
  const { name, query, tags } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }
  const searches = getSearches();
  const mine = searches.filter(s => s.userId === req.session.userId);
  if (mine.length >= MAX_SEARCHES_PER_USER) {
    return res.status(403).json({ error: 'Saved-search limit reached' });
  }
  const trimmedName = name.trim().slice(0, 100);
  if (mine.some(s => s.name.toLowerCase() === trimmedName.toLowerCase())) {
    return res.status(400).json({ error: 'A saved search with that name already exists' });
  }
  const search = {
    id: uuidv4(),
    userId: req.session.userId,
    name: trimmedName,
    query: typeof query === 'string' ? query.trim() : '',
    tags: Array.isArray(tags) ? tags.map(String).slice(0, 50) : [],
    createdAt: new Date().toISOString(),
  };
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
