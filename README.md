# TeamSync — Internal Team Task Management

A modern, real-time project management tool built for the Navajna AI team. Think JIRA — but faster, cleaner, and built specifically for us.

---

## Features

- **Kanban Board** — Drag and drop tasks across To Do / In Progress / In Review / Done
- **Daily Standup** — Submit and view the whole team's standup in one place with mood tracking
- **Team View** — See everyone's tasks, workload, and standup status at a glance
- **Real-time Updates** — Changes reflect instantly across all open tabs via Socket.io
- **Activity Feed** — Live log of everything happening across projects
- **Project Management** — Separate boards for Videolytics and NHAI
- **Change Password** — Every member can update their own password after first login
- **Admin Controls** — Faizan can reset any member's password from the sidebar

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express.js |
| Database | SQLite via better-sqlite3 |
| Real-time | Socket.io |
| Frontend | Vanilla JS (SPA) |
| Styling | Custom CSS — dark theme |

---

## Team

| Name | Role | Projects |
|---|---|---|
| Varun | Team Lead | Videolytics |
| Twinkle | Product Manager | Videolytics |
| Subha | AI Engineer | Videolytics |
| Shivani | AI Engineer | Videolytics |
| Aeasha | AI Engineer | Videolytics |
| Jayanth | AI Engineer | Videolytics |
| Surya | AI Engineer | Videolytics |
| Renuka | AI Engineer | NHAI |
| Saurabh | AI Engineer | Videolytics · NHAI |
| Faizan | AI Engineer (Admin) | Videolytics · NHAI |

---

## Getting Started

### Prerequisites
- Node.js v18 or higher
- npm

### Installation

```bash
# Clone the repo
git clone https://github.com/SyedAli8611/team-sync.git
cd team-sync

# Install dependencies
npm install

# Start the server
npm start
```

Open **http://localhost:3000** in your browser.

---

## Login

All team members are pre-seeded. Use your first name (lowercase) as username.

```
Username: faizan       Password: password123
Username: varun        Password: password123
Username: twinkle      Password: password123
# ... same pattern for all members
```

> First login? Click your name in the sidebar → Change Password.

---

## Project Structure

```
team-sync/
├── server.js          # Express + Socket.io entry point
├── db.js              # SQLite setup and team seeding
├── routes/
│   ├── auth.js        # Login, logout, change password
│   └── api.js         # Tasks, projects, standups, comments, activity
└── public/
    ├── index.html     # Single page app shell
    ├── app.css        # All styles
    └── app.js         # Frontend logic and routing
```

---

## Running Locally with Public Access (Free)

To share with the team without any hosting cost, use Cloudflare Tunnel:

```bash
# Terminal 1 — run the app
npm start

# Terminal 2 — expose it publicly
cloudflared tunnel --url http://localhost:3000
```

Share the generated URL with the team. No server costs, data stays on your machine.

---

## Environment

The app runs on port `3000` by default. Override with:

```bash
PORT=8080 npm start
```

All data is stored locally in `teamsync.db` (SQLite file, excluded from git).

---

## License

Internal use only — Navajna AI Team.
