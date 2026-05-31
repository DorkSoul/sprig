'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getNotes, setNotes } = require('../lib/data');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_TAGS = new Set([
  'p','br','strong','em','u','s','h1','h2','h3',
  'ul','ol','li','blockquote','code','pre','a','hr','span',
]);

const ALLOWED_ATTRS = {
  a: ['href'],
  span: ['class'],
  code: ['class'],
  pre: ['class'],
};

function sanitizeHTML(html) {
  if (typeof html !== 'string') return '';

  // Strip script/style/iframe blocks entirely including content
  html = html.replace(/<(script|style|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Process tags
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tag, attrs) => {
    const lower = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) return '';

    const isClosing = match.startsWith('</');
    if (isClosing) return `</${lower}>`;

    const selfClosing = ['br', 'hr'].includes(lower);
    const allowed = ALLOWED_ATTRS[lower] || [];
    let cleaned = '';

    for (const attr of allowed) {
      const re = new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*?)"|'([^']*?)'|([^\\s>]+))`, 'i');
      const m = attrs.match(re);
      if (m) {
        const val = (m[1] ?? m[2] ?? m[3]).trim();
        if (attr === 'href' && /^javascript:/i.test(val)) continue;
        cleaned += ` ${attr}="${val.replace(/"/g, '&quot;')}"`;
      }
    }

    return selfClosing ? `<${lower}${cleaned}>` : `<${lower}${cleaned}>`;
  });

  return html;
}

function stripHTML(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

router.use(requireAuth);

router.get('/', (req, res) => {
  const notes = getNotes().filter(n =>
    n.userId === req.session.userId || n.visibility === 'public'
  );
  res.json(notes);
});

router.get('/public', (req, res) => {
  const notes = getNotes().filter(n => n.visibility === 'public');
  res.json(notes);
});

router.get('/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json([]);

  const notes = getNotes().filter(n => n.userId === req.session.userId);
  const results = notes.filter(n => {
    const text = (stripHTML(n.content || '') + ' ' + (n.title || '')).toLowerCase();
    return text.includes(q);
  });
  res.json(results);
});

router.get('/:id', (req, res) => {
  const notes = getNotes();
  const note = notes.find(n => n.id === req.params.id);
  if (!note) return res.status(404).json({ error: 'Not found' });
  if (note.userId !== req.session.userId && note.visibility !== 'public') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(note);
});

router.post('/', (req, res) => {
  const { title, content, tags, pinned, visibility } = req.body;
  const note = {
    id: uuidv4(),
    userId: req.session.userId,
    title: typeof title === 'string' ? title.trim().slice(0, 200) : '',
    content: sanitizeHTML(content || ''),
    tags: Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [],
    links: [],
    pinned: pinned === true,
    visibility: visibility === 'public' ? 'public' : 'private',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  note.links = extractLinks(note.content);

  const notes = getNotes();
  notes.push(note);
  setNotes(notes);
  res.json(note);
});

router.put('/:id', (req, res) => {
  const notes = getNotes();
  const idx = notes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (notes[idx].userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });

  const { title, content, tags, pinned, visibility } = req.body;
  const note = notes[idx];

  if (title !== undefined) note.title = String(title).trim().slice(0, 200);
  if (content !== undefined) {
    note.content = sanitizeHTML(content);
    note.links = extractLinks(note.content);
  }
  if (Array.isArray(tags)) note.tags = tags.map(t => String(t).trim()).filter(Boolean);
  if (pinned !== undefined) note.pinned = pinned === true;
  if (visibility !== undefined) note.visibility = visibility === 'public' ? 'public' : 'private';
  note.updatedAt = new Date().toISOString();

  setNotes(notes);
  res.json(note);
});

router.delete('/:id', (req, res) => {
  const notes = getNotes();
  const idx = notes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (notes[idx].userId !== req.session.userId && !req.session.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  notes.splice(idx, 1);
  setNotes(notes);
  res.json({ ok: true });
});

router.get('/:id/backlinks', (req, res) => {
  const id = req.params.id;
  const notes = getNotes().filter(n =>
    (n.userId === req.session.userId || n.visibility === 'public') &&
    Array.isArray(n.links) && n.links.includes(id)
  );
  res.json(notes);
});

function extractLinks(html) {
  const links = [];
  const re = /<a[^>]+href="#([a-f0-9-]{36})"[^>]*class="note-link"/g;
  let m;
  while ((m = re.exec(html)) !== null) links.push(m[1]);
  return [...new Set(links)];
}

module.exports = router;
