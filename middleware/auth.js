'use strict';

const { getUsers } = require('../lib/data');

// Re-validate the session against the current user record on every request so that
// deleting or demoting a user takes effect immediately instead of persisting until
// their 30-day cookie expires. Refreshes req.session.isAdmin from the stored record.
function loadSessionUser(req) {
  if (!req.session.userId) return null;
  const user = getUsers().find(u => u.id === req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return null;
  }
  if (req.session.isAdmin !== user.isAdmin) req.session.isAdmin = user.isAdmin;
  return user;
}

function requireAuth(req, res, next) {
  if (!loadSessionUser(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireAdmin(req, res, next) {
  const user = loadSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  next();
}

function validUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_-]{2,32}$/.test(username);
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

module.exports = { requireAuth, requireAdmin, validUsername, validPassword };
