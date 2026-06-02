'use strict';

const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');
const { ensureDataDir, getSessionSecret, SESSIONS_DIR, DATA_DIR } = require('./lib/data');

ensureDataDir();

const app = express();
const PORT = process.env.PORT || 7341;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  store: new FileStore({ path: SESSIONS_DIR, ttl: 86400 * 30, reapInterval: 3600 }),
  secret: getSessionSecret(),
  resave: true,
  rolling: true,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 86400 * 30 },
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(DATA_DIR, 'attachments')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/tags', require('./routes/tags'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/folders', require('./routes/folders'));
app.use('/api/attachments', require('./routes/attachments'));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Sprig running on :${PORT}`));
