'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { DATA_DIR, getNotes } = require('../lib/data');

const router = express.Router();

// Whitelist of allowed image types mapped to a fixed, safe extension. The stored
// extension is derived from the (verified) mimetype, never from the client-supplied
// originalname, so an attacker can't smuggle an executable .html/.svg onto disk.
// SVG is deliberately excluded because it can carry inline scripts.
const MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(DATA_DIR, 'attachments', req.session.userId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = MIME_EXT[file.mimetype] || '';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!MIME_EXT[file.mimetype]) return cb(new Error('Unsupported image type'));
    cb(null, true);
  },
});

// Cap attachments per user to bound disk usage. Checked before multer writes the file.
const MAX_ATTACHMENTS_PER_USER = 5000;

function enforceAttachmentQuota(req, res, next) {
  const dir = path.join(DATA_DIR, 'attachments', req.session.userId);
  let count = 0;
  try { count = fs.readdirSync(dir).length; } catch { count = 0; }
  if (count >= MAX_ATTACHMENTS_PER_USER) {
    return res.status(403).json({ error: 'Attachment limit reached' });
  }
  next();
}

router.post('/', requireAuth, enforceAttachmentQuota, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/api/attachments/${req.session.userId}/${req.file.filename}`;
  res.json({ url });
});

// Returns true if the given attachment is referenced by any public note owned by
// its uploader, so images embedded in public notes remain viewable by other users.
function isReferencedByPublicNote(userId, file) {
  const needle = `/${userId}/${file}`;
  return getNotes().some(n =>
    n.userId === userId && n.visibility === 'public' &&
    typeof n.content === 'string' && n.content.includes(needle)
  );
}

// Authenticated download. Users may read their own attachments (admins any), plus any
// attachment embedded in a public note. The resolved path is confirmed to stay inside
// the owner's attachment directory to defeat path traversal via ../ in the filename.
// Exported so the legacy /uploads/:userId/:file path can reuse it.
function downloadHandler(req, res) {
  const { userId, file } = req.params;
  const isOwner = userId === req.session.userId || req.session.isAdmin;
  if (!isOwner && !isReferencedByPublicNote(userId, file)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const baseDir = path.join(DATA_DIR, 'attachments', userId);
  const resolved = path.resolve(baseDir, file);
  if (resolved !== path.join(baseDir, path.basename(file)) || !resolved.startsWith(baseDir + path.sep)) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Not found' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(resolved);
}

router.get('/:userId/:file', requireAuth, downloadHandler);

router.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

module.exports = router;
module.exports.downloadHandler = downloadHandler;
