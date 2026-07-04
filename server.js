'use strict';

const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');
const { ensureDataDir, getSessionSecret, SESSIONS_DIR } = require('./lib/data');
const { requireAuth } = require('./middleware/auth');
const { downloadHandler } = require('./routes/attachments');

ensureDataDir();

const app = express();
const PORT = process.env.PORT || 7341;
const SECURE_COOKIES = process.env.NODE_ENV === 'production' || process.env.SECURE_COOKIES === '1';

// Only trust proxy headers (X-Forwarded-For/Proto) when explicitly told to via
// TRUST_PROXY=1 — i.e. when actually deployed behind a reverse proxy. Enabling it
// unconditionally would let a direct client spoof req.ip via X-Forwarded-For and
// bypass the login rate limiter. Set TRUST_PROXY=1 alongside a TLS-terminating proxy.
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

// Security headers. The Content-Security-Policy is defense-in-depth behind the
// (best-effort) HTML sanitizer: scripts may only load from our own origin (all
// assets are vendored locally, no CDN), inline scripts are forbidden, and framing
// is denied. 'unsafe-inline' is required for style-src only because the editor sets
// inline style attributes (image width/height, layout vars).
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false, limit: '8mb' }));

app.use(session({
  store: new FileStore({ path: SESSIONS_DIR, ttl: 86400 * 30, reapInterval: 3600 }),
  secret: getSessionSecret(),
  resave: false,
  rolling: true,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES, maxAge: 1000 * 86400 * 30 },
}));

app.use(express.static(path.join(__dirname, 'public')));

// Legacy attachment URL used by note content saved before the authed route existed.
app.get('/uploads/:userId/:file', requireAuth, downloadHandler);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/tags', require('./routes/tags'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/attachments', require('./routes/attachments'));
app.use('/api/folders', require('./routes/folders'));
app.use('/api/searches', require('./routes/searches'));
app.use('/api/templates', require('./routes/templates'));

// Unknown API routes should 404 as JSON rather than silently returning the SPA shell.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Terminal error handler: keeps unhandled route/body-parse errors from crashing or
// hanging the request. Must be last and take four args to be recognized by Express.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`Sprig running on :${PORT}`));
