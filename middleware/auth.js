'use strict';

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.session.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  next();
}

function validUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_-]{2,32}$/.test(username);
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

module.exports = { requireAuth, requireAdmin, validUsername, validPassword };
