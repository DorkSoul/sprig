'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SECRET_FILE = path.join(DATA_DIR, 'session_secret');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const FOLDERS_FILE = path.join(DATA_DIR, 'folders.json');
const SEARCHES_FILE = path.join(DATA_DIR, 'searches.json');
const VERSIONS_FILE = path.join(DATA_DIR, 'versions.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  if (!fs.existsSync(NOTES_FILE)) fs.writeFileSync(NOTES_FILE, '[]');
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
  if (!fs.existsSync(FOLDERS_FILE)) fs.writeFileSync(FOLDERS_FILE, '[]');
  if (!fs.existsSync(SEARCHES_FILE)) fs.writeFileSync(SEARCHES_FILE, '[]');
  if (!fs.existsSync(VERSIONS_FILE)) fs.writeFileSync(VERSIONS_FILE, '[]');
  if (!fs.existsSync(TEMPLATES_FILE)) fs.writeFileSync(TEMPLATES_FILE, '[]');
}

function getSessionSecret() {
  if (!fs.existsSync(SECRET_FILE)) {
    const secret = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(SECRET_FILE, secret);
    return secret;
  }
  return fs.readFileSync(SECRET_FILE, 'utf8').trim();
}

function readJSON(file) {
  // A corrupt/half-written file must not take the whole app down. Fall back to a
  // .bak snapshot if present, otherwise an empty list, and log for visibility.
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`readJSON: failed to parse ${file}: ${err.message}`);
    try {
      return JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'));
    } catch {
      return [];
    }
  }
}

function writeJSON(file, data) {
  // Write atomically: serialize to a temp file, rotate the last good copy to .bak via
  // rename (metadata-only, no full-file copy), then rename the temp over the target so
  // a crash mid-write can't truncate the dataset. If a crash lands between the two
  // renames, the target is briefly absent and readJSON recovers from .bak.
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  try {
    if (fs.existsSync(file)) fs.renameSync(file, `${file}.bak`);
  } catch { /* best-effort backup */ }
  fs.renameSync(tmp, file);
}

function getNotes() { return readJSON(NOTES_FILE); }
function setNotes(notes) { writeJSON(NOTES_FILE, notes); }

// Users are read fail-CLOSED: a missing file means a genuine fresh install (empty),
// but an unparseable file must NOT be treated as "no users" — that would reopen the
// first-run setup flow and allow account takeover. Try the .bak, otherwise throw.
function getUsers() {
  let raw;
  try {
    raw = fs.readFileSync(USERS_FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`getUsers: failed to parse ${USERS_FILE}: ${err.message}`);
    try {
      return JSON.parse(fs.readFileSync(`${USERS_FILE}.bak`, 'utf8'));
    } catch {
      throw new Error('users.json is corrupt and no valid backup exists');
    }
  }
}
function setUsers(users) { writeJSON(USERS_FILE, users); }
function getFolders() { return readJSON(FOLDERS_FILE); }
function setFolders(folders) { writeJSON(FOLDERS_FILE, folders); }
function getSearches() { return readJSON(SEARCHES_FILE); }
function setSearches(searches) { writeJSON(SEARCHES_FILE, searches); }
function getVersions() { return readJSON(VERSIONS_FILE); }
function setVersions(versions) { writeJSON(VERSIONS_FILE, versions); }
function getTemplates() { return readJSON(TEMPLATES_FILE); }
function setTemplates(templates) { writeJSON(TEMPLATES_FILE, templates); }

// --- Attachment file cleanup helpers ---

// Parse attachment URLs (/api/attachments/<userId>/<file> or legacy /uploads/...)
// out of note HTML and return the { userId, file } pairs.
function extractAttachmentRefs(html) {
  if (typeof html !== 'string') return [];
  const refs = [];
  const re = /\/(?:api\/attachments|uploads)\/([a-f0-9-]{36})\/([A-Za-z0-9._-]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) refs.push({ userId: m[1], file: m[2] });
  return refs;
}

// Delete a single attachment file, guarding against path traversal by confirming the
// resolved path stays inside the given user's attachment directory.
function deleteAttachmentFile(userId, file) {
  const baseDir = path.join(DATA_DIR, 'attachments', userId);
  const resolved = path.resolve(baseDir, file);
  if (resolved !== path.join(baseDir, path.basename(file))) return;
  try { fs.unlinkSync(resolved); } catch { /* already gone */ }
}

// Remove every attachment referenced by a note's content (scoped to that note's owner).
function deleteNoteAttachments(note) {
  for (const ref of extractAttachmentRefs(note.content)) {
    if (ref.userId === note.userId) deleteAttachmentFile(ref.userId, ref.file);
  }
}

// Remove a user's entire attachment directory.
function deleteUserAttachments(userId) {
  const dir = path.join(DATA_DIR, 'attachments', userId);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

module.exports = {
  ensureDataDir,
  getSessionSecret,
  getNotes,
  setNotes,
  getUsers,
  setUsers,
  getFolders,
  setFolders,
  getSearches,
  setSearches,
  getVersions,
  setVersions,
  getTemplates,
  setTemplates,
  deleteNoteAttachments,
  deleteUserAttachments,
  SESSIONS_DIR,
  DATA_DIR,
};
