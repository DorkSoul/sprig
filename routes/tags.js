'use strict';

const express = require('express');
const { getNotes } = require('../lib/data');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const notes = getNotes().filter(n => n.userId === req.session.userId);
  const counts = {};
  for (const note of notes) {
    for (const tag of (note.tags || [])) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  const tags = Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  res.json(tags);
});

module.exports = router;
