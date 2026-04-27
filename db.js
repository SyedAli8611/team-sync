const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'teamsync.db');
let db;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDB() {
  const database = getDB();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      avatar_color TEXT DEFAULT '#6366F1',
      job_title TEXT DEFAULT 'Team Member',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#6366F1',
      key TEXT UNIQUE NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'todo',
      priority TEXT DEFAULT 'medium',
      assignee_id INTEGER,
      project_id INTEGER,
      created_by INTEGER NOT NULL,
      due_date DATE,
      story_points INTEGER DEFAULT 0,
      tags TEXT DEFAULT '[]',
      order_idx INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assignee_id) REFERENCES users(id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS standups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date DATE NOT NULL,
      did_today TEXT DEFAULT '',
      will_do TEXT DEFAULT '',
      blockers TEXT DEFAULT '',
      mood TEXT DEFAULT 'good',
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, date)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_id INTEGER,
      action TEXT NOT NULL,
      details TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  const userCount = database.prepare('SELECT COUNT(*) as count FROM users').get();

  if (userCount.count === 0) {
    const teamMembers = [
      { name: 'Varun',   username: 'varun',   color: '#6366F1', title: 'Team Lead' },
      { name: 'Twinkle', username: 'twinkle', color: '#EC4899', title: 'Product Manager' },
      { name: 'Subha',   username: 'subha',   color: '#14B8A6', title: 'AI Engineer' },
      { name: 'Shivani', username: 'shivani', color: '#F59E0B', title: 'AI Engineer' },
      { name: 'Aeasha',  username: 'aeasha',  color: '#8B5CF6', title: 'AI Engineer' },
      { name: 'Jayanth', username: 'jayanth', color: '#10B981', title: 'AI Engineer' },
      { name: 'Surya',   username: 'surya',   color: '#F97316', title: 'AI Engineer' },
      { name: 'Renuka',  username: 'renuka',  color: '#06B6D4', title: 'AI Engineer' },
      { name: 'Saurabh', username: 'saurabh', color: '#84CC16', title: 'AI Engineer' },
      { name: 'Faizan',  username: 'faizan',  color: '#EF4444', title: 'AI Engineer' },
    ];

    const insertUser = database.prepare(
      `INSERT INTO users (name, username, password, role, avatar_color, job_title)
       VALUES (?, ?, 'password123', 'member', ?, ?)`
    );

    database.transaction(() => {
      for (const m of teamMembers) insertUser.run(m.name, m.username, m.color, m.title);
    })();

    database.prepare("UPDATE users SET role='admin' WHERE username='faizan'").run();

    const faizan = database.prepare("SELECT id FROM users WHERE username='faizan'").get();

    // Videolytics: everyone except Renuka
    database.prepare(
      `INSERT INTO projects (name, description, color, key, created_by)
       VALUES ('Videolytics', 'AI-powered video analytics platform', '#6366F1', 'VID', ?)`
    ).run(faizan.id);

    // NHAI: Renuka, Saurabh, Faizan
    database.prepare(
      `INSERT INTO projects (name, description, color, key, created_by)
       VALUES ('NHAI', 'National Highways AI Initiative', '#F59E0B', 'NHAI', ?)`
    ).run(faizan.id);

    console.log('✅ DB seeded with team members and projects (no dummy tasks)');
  }

  console.log('✅ Database ready');
}

module.exports = { getDB, initDB };
