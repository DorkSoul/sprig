'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getNotes, setNotes, getVersions, setVersions, getFolders, deleteNoteAttachments } = require('../lib/data');
const { requireAuth } = require('../middleware/auth');
const { sanitizeHTML } = require('../lib/sanitize');

const router = express.Router();

// Cap total notes per user to bound disk usage on a shared instance.
const MAX_NOTES_PER_USER = 10000;

function processTagsInContent(html) {
  html = html.replace(/<span class="tag-inline">(#[a-zA-Z0-9_-]+)<\/span>/g, '$1');

  // Walk forward through all block/line boundaries (<br>, </p>, </li>, etc.)
  // tracking the last boundary that has non-empty text after it.
  const boundaryRe = /<br\s*\/?>|<\/(?:p|li|h[1-6]|blockquote|pre|div)>/gi;
  let splitPos = 0;
  let m;
  while ((m = boundaryRe.exec(html)) !== null) {
    const after = m.index + m[0].length;
    const textAfter = html.slice(after).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (textAfter) splitPos = after;
  }

  const suffix = html.slice(splitPos);
  const suffixText = suffix.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

  if (!suffixText || !/^(#[a-zA-Z0-9_-]+\s*)+$/.test(suffixText)) return html;

  const taggedSuffix = suffix.replace(/#([a-zA-Z0-9_-]+)/g,
    '<span class="tag-inline">#$1</span>');
  return html.slice(0, splitPos) + taggedSuffix;
}

function stripHTML(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

router.use(requireAuth);

// Strip owner-identifying/internal fields from a note before exposing it to users
// other than the owner (public feed).
function publicNoteView(n) {
  const { userId, folderId, ...safe } = n;
  return safe;
}

router.get('/', (req, res) => {
  // The personal feed is the user's OWN notes only. Other users' public notes live
  // in the dedicated public view; pulling them in here polluted the feed with notes
  // the user can't edit. Cross-note navigation to a public note is handled on demand
  // by GET /:id (which allows public notes).
  let notes = getNotes().filter(n => n.userId === req.session.userId);
  if (req.query.folderId) {
    const fid = req.query.folderId;
    notes = notes.filter(n => n.folderId === fid);
  }
  res.json(notes);
});

router.get('/public', (req, res) => {
  const notes = getNotes().filter(n => n.visibility === 'public').map(publicNoteView);
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
  const isOwner = note.userId === req.session.userId;
  if (!isOwner && note.visibility !== 'public') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // Non-owners viewing a public note don't get the author's id / folder.
  res.json(isOwner ? note : publicNoteView(note));
});

// Keep tag lists bounded: at most 50 tags, each capped at 64 chars, no blanks.
function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map(t => String(t).trim().slice(0, 64)).filter(Boolean).slice(0, 50);
}

// A folder reference is only accepted if it exists and belongs to the requesting user.
function resolveFolderId(folderId, userId) {
  if (typeof folderId !== 'string' || !folderId) return null;
  const folder = getFolders().find(f => f.id === folderId && f.userId === userId);
  return folder ? folderId : null;
}

router.post('/', (req, res) => {
  const existing = getNotes();
  if (existing.filter(n => n.userId === req.session.userId).length >= MAX_NOTES_PER_USER) {
    return res.status(403).json({ error: 'Note limit reached' });
  }
  const { title, content, tags, pinned, visibility, folderId, dueDate } = req.body;
  const note = {
    id: uuidv4(),
    userId: req.session.userId,
    title: typeof title === 'string' ? title.trim().slice(0, 200) : '',
    content: processTagsInContent(sanitizeHTML(content || '')),
    tags: normalizeTags(tags),
    links: [],
    pinned: pinned === true,
    visibility: visibility === 'public' ? 'public' : 'private',
    folderId: resolveFolderId(folderId, req.session.userId),
    dueDate: (typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) ? dueDate : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  note.links = extractLinks(note.content);

  existing.push(note);
  setNotes(existing);
  res.json(note);
});

router.put('/:id', (req, res) => {
  const notes = getNotes();
  const idx = notes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (notes[idx].userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });

  const { title, content, tags, pinned, visibility, folderId, dueDate } = req.body;
  const note = notes[idx];

  if (content !== undefined && content !== note.content) {
    const versions = getVersions();
    versions.unshift({
      id: uuidv4(),
      noteId: note.id,
      userId: note.userId,
      title: note.title,
      content: note.content,
      savedAt: new Date().toISOString(),
    });
    const noteVersions = versions.filter(v => v.noteId === note.id).slice(0, 20);
    const otherVersions = versions.filter(v => v.noteId !== note.id);
    setVersions([...noteVersions, ...otherVersions]);
  }

  if (title !== undefined) note.title = String(title).trim().slice(0, 200);
  if (content !== undefined) {
    note.content = processTagsInContent(sanitizeHTML(content));
    note.links = extractLinks(note.content);
  }
  if (Array.isArray(tags)) note.tags = normalizeTags(tags);
  if (pinned !== undefined) note.pinned = pinned === true;
  if (visibility !== undefined) note.visibility = visibility === 'public' ? 'public' : 'private';
  if (folderId !== undefined) note.folderId = resolveFolderId(folderId, note.userId);
  if (dueDate !== undefined) {
    note.dueDate = (typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) ? dueDate : null;
  }
  note.updatedAt = new Date().toISOString();

  setNotes(notes);
  res.json(note);
});

router.get('/:id/versions', requireAuth, (req, res) => {
  const notes = getNotes();
  const note = notes.find(n => n.id === req.params.id);
  if (!note) return res.status(404).json({ error: 'Not found' });
  if (note.userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });
  const versions = getVersions()
    .filter(v => v.noteId === req.params.id)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  res.json(versions);
});

router.post('/:id/versions/:vid/restore', requireAuth, (req, res) => {
  const notes = getNotes();
  const idx = notes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (notes[idx].userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });

  const version = getVersions().find(v => v.id === req.params.vid && v.noteId === req.params.id);
  if (!version) return res.status(404).json({ error: 'Version not found' });

  const note = notes[idx];
  const versions = getVersions();
  versions.unshift({
    id: uuidv4(),
    noteId: note.id,
    userId: note.userId,
    title: note.title,
    content: note.content,
    savedAt: new Date().toISOString(),
  });
  const noteVersions = versions.filter(v => v.noteId === note.id).slice(0, 20);
  const otherVersions = versions.filter(v => v.noteId !== note.id);
  setVersions([...noteVersions, ...otherVersions]);

  note.title = version.title;
  note.content = version.content;
  note.links = extractLinks(note.content);
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
  const [removed] = notes.splice(idx, 1);
  setNotes(notes);

  // Cascade: drop this note's version history and delete its attachment files so
  // they don't accumulate as orphans.
  const versions = getVersions().filter(v => v.noteId !== removed.id);
  setVersions(versions);
  deleteNoteAttachments(removed);

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

// Collect note-link targets. Matches each anchor then checks its attributes
// independently so it works regardless of whether href or class appears first.
function extractLinks(html) {
  const links = [];
  const re = /<a\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    if (!/class\s*=\s*["'][^"']*\bnote-link\b/i.test(attrs)) continue;
    const href = attrs.match(/href\s*=\s*["']#([a-f0-9-]{36})["']/i);
    if (href) links.push(href[1]);
  }
  return [...new Set(links)];
}

module.exports = router;
