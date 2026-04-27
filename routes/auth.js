const express = require('express');
const router  = express.Router();
const { getDB } = require('../db');

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const db   = getDB();
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username.toLowerCase().trim(), password);

  if (!user) return res.status(401).json({ error: 'Invalid username or password' });

  req.session.userId = user.id;
  const { password: _, ...safeUser } = user;
  res.json({ success: true, user: safeUser });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });

  const db   = getDB();
  const user = db.prepare('SELECT id, name, username, role, avatar_color, job_title, created_at FROM users WHERE id = ?').get(req.session.userId);

  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json(user);
});

router.post('/change-password', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });

  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both fields required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const db   = getDB();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);

  if (user.password !== current_password) return res.status(401).json({ error: 'Current password is incorrect' });

  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(new_password, req.session.userId);
  res.json({ success: true });
});

// Admin-only: reset any user's password
router.post('/reset-password', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });

  const db      = getDB();
  const me      = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (me.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { user_id, new_password } = req.body;
  if (!user_id || !new_password) return res.status(400).json({ error: 'user_id and new_password required' });
  if (new_password.length < 6)   return res.status(400).json({ error: 'Password must be at least 6 characters' });

  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(new_password, user_id);
  res.json({ success: true });
});

module.exports = router;
