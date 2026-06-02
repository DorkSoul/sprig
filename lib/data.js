'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const FOLDERS_FILE = path.join(DATA_DIR, 'folders.json');
const SECRET_FILE = path.join(DATA_DIR, 'session_secret');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  if (!fs.existsSync(NOTES_FILE)) fs.writeFileSync(NOTES_FILE, '[]');
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
  if (!fs.existsSync(FOLDERS_FILE)) fs.writeFileSync(FOLDERS_FILE, '[]');
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
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getNotes() { return readJSON(NOTES_FILE); }
function setNotes(notes) { writeJSON(NOTES_FILE, notes); }
function getUsers() { return readJSON(USERS_FILE); }
function setUsers(users) { writeJSON(USERS_FILE, users); }
function getFolders() { return readJSON(FOLDERS_FILE); }
function setFolders(folders) { writeJSON(FOLDERS_FILE, folders); }

module.exports = {
  ensureDataDir,
  getSessionSecret,
  getNotes,
  setNotes,
  getUsers,
  setUsers,
  getFolders,
  setFolders,
  SESSIONS_DIR,
  DATA_DIR,
};
