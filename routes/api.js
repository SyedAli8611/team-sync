const express = require('express');
const router  = express.Router();
const { getDB } = require('../db');

function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// ── USERS ─────────────────────────────────────────────────────────────────────
router.get('/users', auth, (req, res) => {
  const db = getDB();
  const users = db.prepare('SELECT id, name, username, role, avatar_color, job_title FROM users ORDER BY name').all();
  res.json(users);
});

router.get('/users/:id', auth, (req, res) => {
  const db   = getDB();
  const user = db.prepare('SELECT id, name, username, role, avatar_color, job_title FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

router.get('/users/:id/tasks', auth, (req, res) => {
  const db    = getDB();
  const tasks = db.prepare(`
    SELECT t.*, u.name AS assignee_name, u.avatar_color, p.name AS project_name, p.color AS project_color
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.assignee_id = ?
    ORDER BY t.updated_at DESC
  `).all(req.params.id);
  res.json(tasks);
});

// ── PROJECTS ──────────────────────────────────────────────────────────────────
router.get('/projects', auth, (req, res) => {
  const db   = getDB();
  const rows = db.prepare(`
    SELECT p.*, u.name AS creator_name,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count
    FROM projects p
    LEFT JOIN users u ON p.created_by = u.id
    ORDER BY p.created_at DESC
  `).all();
  res.json(rows);
});

router.post('/projects', auth, (req, res) => {
  const { name, description, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const db  = getDB();
  const key = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) + Date.now().toString().slice(-3);
  const col = color || '#6366F1';

  try {
    const info = db.prepare(
      'INSERT INTO projects (name, description, color, key, created_by) VALUES (?, ?, ?, ?, ?)'
    ).run(name, description || '', col, key, req.session.userId);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
    req.io.emit('project:created', project);
    res.status(201).json(project);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── TASKS ─────────────────────────────────────────────────────────────────────
const TASK_SELECT = `
  SELECT t.*,
    u.name AS assignee_name, u.avatar_color, u.username AS assignee_username,
    c.name AS creator_name,
    p.name AS project_name, p.color AS project_color, p.key AS project_key
  FROM tasks t
  LEFT JOIN users u ON t.assignee_id = u.id
  LEFT JOIN users c ON t.created_by = c.id
  LEFT JOIN projects p ON t.project_id = p.id
`;

router.get('/tasks', auth, (req, res) => {
  const db = getDB();
  const { project_id, assignee_id, status, priority } = req.query;

  let sql    = TASK_SELECT + ' WHERE 1=1';
  const args = [];

  if (project_id)  { sql += ' AND t.project_id = ?';  args.push(project_id); }
  if (assignee_id) { sql += ' AND t.assignee_id = ?'; args.push(assignee_id); }
  if (status)      { sql += ' AND t.status = ?';      args.push(status); }
  if (priority)    { sql += ' AND t.priority = ?';    args.push(priority); }

  sql += ' ORDER BY t.order_idx ASC, t.created_at DESC';
  res.json(db.prepare(sql).all(...args));
});

router.post('/tasks', auth, (req, res) => {
  const { title, description, status, priority, assignee_id, project_id, due_date, story_points, tags } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  const db   = getDB();
  const info = db.prepare(`
    INSERT INTO tasks (title, description, status, priority, assignee_id, project_id, created_by, due_date, story_points, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title,
    description || '',
    status      || 'todo',
    priority    || 'medium',
    assignee_id || null,
    project_id  || null,
    req.session.userId,
    due_date    || null,
    story_points || 0,
    JSON.stringify(tags || [])
  );

  const task = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(info.lastInsertRowid);

  db.prepare('INSERT INTO activity (user_id, task_id, action, details) VALUES (?, ?, ?, ?)').run(
    req.session.userId, task.id, 'created', `created task "${title}"`
  );

  req.io.emit('task:created', task);
  res.status(201).json(task);
});

router.get('/tasks/:id', auth, (req, res) => {
  const db   = getDB();
  const task = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

router.put('/tasks/:id', auth, (req, res) => {
  const db   = getDB();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { title, description, status, priority, assignee_id, project_id, due_date, story_points, tags } = req.body;
  const oldStatus = task.status;

  db.prepare(`
    UPDATE tasks SET
      title = ?, description = ?, status = ?, priority = ?,
      assignee_id = ?, project_id = ?, due_date = ?, story_points = ?,
      tags = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    title        !== undefined ? title       : task.title,
    description  !== undefined ? description : task.description,
    status       !== undefined ? status      : task.status,
    priority     !== undefined ? priority    : task.priority,
    assignee_id  !== undefined ? assignee_id : task.assignee_id,
    project_id   !== undefined ? project_id  : task.project_id,
    due_date     !== undefined ? due_date    : task.due_date,
    story_points !== undefined ? story_points: task.story_points,
    tags         !== undefined ? JSON.stringify(tags) : task.tags,
    req.params.id
  );

  const updated = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(req.params.id);

  if (status && status !== oldStatus) {
    db.prepare('INSERT INTO activity (user_id, task_id, action, details) VALUES (?, ?, ?, ?)').run(
      req.session.userId, updated.id, 'moved', `moved to ${status}`
    );
  } else {
    db.prepare('INSERT INTO activity (user_id, task_id, action, details) VALUES (?, ?, ?, ?)').run(
      req.session.userId, updated.id, 'updated', `updated task details`
    );
  }

  req.io.emit('task:updated', updated);
  res.json(updated);
});

router.delete('/tasks/:id', auth, (req, res) => {
  const db   = getDB();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  db.prepare('INSERT INTO activity (user_id, task_id, action, details) VALUES (?, ?, ?, ?)').run(
    req.session.userId, null, 'deleted', `deleted task "${task.title}"`
  );

  req.io.emit('task:deleted', { id: parseInt(req.params.id) });
  res.json({ success: true });
});

// ── COMMENTS ─────────────────────────────────────────────────────────────────
router.get('/comments/:taskId', auth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(`
    SELECT c.*, u.name AS user_name, u.avatar_color, u.username
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.task_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.taskId);
  res.json(rows);
});

router.post('/comments', auth, (req, res) => {
  const { task_id, content } = req.body;
  if (!task_id || !content) return res.status(400).json({ error: 'task_id and content required' });

  const db   = getDB();
  const info = db.prepare('INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)').run(task_id, req.session.userId, content);
  const comment = db.prepare(`
    SELECT c.*, u.name AS user_name, u.avatar_color, u.username
    FROM comments c JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(info.lastInsertRowid);

  db.prepare('INSERT INTO activity (user_id, task_id, action, details) VALUES (?, ?, ?, ?)').run(
    req.session.userId, task_id, 'commented', 'added a comment'
  );

  req.io.emit('comment:added', comment);
  res.status(201).json(comment);
});

// ── STANDUPS ─────────────────────────────────────────────────────────────────
router.get('/standups', auth, (req, res) => {
  const db   = getDB();
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const rows = db.prepare(`
    SELECT s.*, u.name AS user_name, u.avatar_color, u.username, u.job_title
    FROM standups s
    JOIN users u ON s.user_id = u.id
    WHERE s.date = ?
    ORDER BY s.submitted_at DESC
  `).all(date);
  res.json(rows);
});

router.get('/standups/mine', auth, (req, res) => {
  const db   = getDB();
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const row  = db.prepare('SELECT * FROM standups WHERE user_id = ? AND date = ?').get(req.session.userId, date);
  res.json(row || null);
});

router.post('/standups', auth, (req, res) => {
  const { did_today, will_do, blockers, mood } = req.body;
  const date = new Date().toISOString().split('T')[0];
  const db   = getDB();

  db.prepare(`
    INSERT INTO standups (user_id, date, did_today, will_do, blockers, mood)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      did_today = excluded.did_today,
      will_do   = excluded.will_do,
      blockers  = excluded.blockers,
      mood      = excluded.mood,
      submitted_at = CURRENT_TIMESTAMP
  `).run(req.session.userId, date, did_today || '', will_do || '', blockers || '', mood || 'good');

  const standup = db.prepare(`
    SELECT s.*, u.name AS user_name, u.avatar_color, u.username, u.job_title
    FROM standups s JOIN users u ON s.user_id = u.id
    WHERE s.user_id = ? AND s.date = ?
  `).get(req.session.userId, date);

  req.io.emit('standup:submitted', standup);
  res.json(standup);
});

// ── ACTIVITY ──────────────────────────────────────────────────────────────────
router.get('/activity', auth, (req, res) => {
  const db   = getDB();
  const rows = db.prepare(`
    SELECT a.*, u.name AS user_name, u.avatar_color, u.username,
           t.title AS task_title
    FROM activity a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN tasks t ON a.task_id = t.id
    ORDER BY a.created_at DESC
    LIMIT 50
  `).all();
  res.json(rows);
});

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
router.get('/dashboard', auth, (req, res) => {
  const db   = getDB();
  const uid  = req.session.userId;
  const today = new Date().toISOString().split('T')[0];

  const totalTasks    = db.prepare("SELECT COUNT(*) AS c FROM tasks").get().c;
  const myTasks       = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE assignee_id = ? AND status != 'done'").get(uid).c;
  const inProgress    = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status = 'inprogress'").get().c;
  const doneToday     = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status = 'done' AND DATE(updated_at) = ?").get(today).c;
  const standupsDone  = db.prepare("SELECT COUNT(*) AS c FROM standups WHERE date = ?").get(today).c;
  const totalMembers  = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;

  const myTasksList = db.prepare(`
    ${TASK_SELECT} WHERE t.assignee_id = ? AND t.status != 'done'
    ORDER BY CASE t.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
    LIMIT 8
  `).all(uid);

  const recentActivity = db.prepare(`
    SELECT a.*, u.name AS user_name, u.avatar_color, t.title AS task_title
    FROM activity a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN tasks t ON a.task_id = t.id
    ORDER BY a.created_at DESC LIMIT 15
  `).all();

  const teamStandups = db.prepare(`
    SELECT u.id, u.name, u.avatar_color, u.job_title,
      CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS submitted,
      s.mood
    FROM users u
    LEFT JOIN standups s ON u.id = s.user_id AND s.date = ?
    ORDER BY u.name
  `).all(today);

  res.json({ totalTasks, myTasks, inProgress, doneToday, standupsDone, totalMembers, myTasksList, recentActivity, teamStandups });
});

module.exports = router;
