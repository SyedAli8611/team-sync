/* ═══════════════════════════════════════════════════════
   TEAMSYNC — Frontend Application
═══════════════════════════════════════════════════════ */
'use strict';

// ── STATE ──────────────────────────────────────────────
const state = {
  user:     null,
  users:    [],
  projects: [],
  currentView: 'dashboard',
  boardFilters: { project_id: '', assignee_id: '', priority: '' },
  selectedProjectColor: '#6366F1',
  openTaskId: null,
};

// ── SOCKET ─────────────────────────────────────────────
const socket = io();

socket.on('task:created',   (t) => { showToast(`New task: "${t.title}"`, 'info'); if (state.currentView === 'board') renderBoard(); });
socket.on('task:updated',   ()  => { if (state.currentView === 'board') renderBoard(); if (state.currentView === 'mytasks') renderMyTasks(); });
socket.on('task:deleted',   ()  => { if (state.currentView === 'board') renderBoard(); if (state.currentView === 'mytasks') renderMyTasks(); });
socket.on('standup:submitted', (s) => { showToast(`${s.user_name} submitted their standup!`, 'info'); if (state.currentView === 'standup' || state.currentView === 'dashboard') renderView(state.currentView); });
socket.on('comment:added',  (c) => { if (state.openTaskId) renderComments(state.openTaskId); });

// ── API ─────────────────────────────────────────────────
const api = {
  async req(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  get:    (p)    => api.req('GET',    p),
  post:   (p, b) => api.req('POST',   p, b),
  put:    (p, b) => api.req('PUT',    p, b),
  delete: (p)    => api.req('DELETE', p),
};

// ── UTILS ───────────────────────────────────────────────
function initials(name) { return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }

function avatar(name, color, size = 'md') {
  return `<div class="avatar avatar-${size}" style="background:${color}" title="${name}">${initials(name)}</div>`;
}

function priorityBadge(p) {
  const labels = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
  return `<span class="priority-badge priority-${p}">${labels[p] || p}</span>`;
}

function statusBadge(s) {
  const labels = { todo: 'To Do', inprogress: 'In Progress', review: 'In Review', done: 'Done' };
  return `<span class="status-badge status-${s}">${labels[s] || s}</span>`;
}

function timeAgo(dateStr) {
  const now  = new Date();
  const then = new Date(dateStr.replace(' ', 'T') + 'Z');
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60)     return 'just now';
  if (diff < 3600)   return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff/3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(d) {
  if (!d) return '';
  const dt   = new Date(d + 'T00:00:00');
  const today = new Date();
  today.setHours(0,0,0,0);
  const diff  = Math.floor((dt - today) / 86400000);
  if (diff === 0)  return 'Today';
  if (diff === 1)  return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(d) {
  if (!d) return false;
  const dt   = new Date(d + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  return dt < today;
}

function moodEmoji(m) {
  return { great: '🚀', good: '😊', ok: '😐', tired: '😴', blocked: '🚧' }[m] || '😊';
}

function showToast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── ROUTER ──────────────────────────────────────────────
function navigate(view) {
  state.currentView = view;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  const titles = { dashboard: 'Dashboard', board: 'Kanban Board', mytasks: 'My Tasks', standup: 'Daily Standup', team: 'Our Team' };
  document.getElementById('page-title').textContent = titles[view] || 'TeamSync';
  renderView(view);
}

async function renderView(view) {
  const content = document.getElementById('main-content');
  content.innerHTML = `<div class="page-loading"><div class="spinner"></div><span>Loading...</span></div>`;
  try {
    switch (view) {
      case 'dashboard': await renderDashboard(); break;
      case 'board':     await renderBoard();     break;
      case 'mytasks':   await renderMyTasks();   break;
      case 'standup':   await renderStandup();   break;
      case 'team':      await renderTeam();      break;
    }
  } catch(e) {
    content.innerHTML = `<div class="empty-state"><h3>Error loading page</h3><p>${e.message}</p></div>`;
  }
}

// ── DASHBOARD ───────────────────────────────────────────
async function renderDashboard() {
  const data = await api.get('/api/dashboard');
  const content = document.getElementById('main-content');

  const pct = data.standupsDone + '/' + data.totalMembers;

  content.innerHTML = `
  <div class="dashboard-grid">
    <div class="stat-card">
      <div class="stat-header">
        <div class="stat-label">Total Tasks</div>
        <div class="stat-icon" style="background:rgba(110,84,232,0.15)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6E54E8" stroke-width="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        </div>
      </div>
      <div class="stat-value" style="color:#6E54E8">${data.totalTasks}</div>
      <div class="stat-sub">across all projects</div>
    </div>
    <div class="stat-card">
      <div class="stat-header">
        <div class="stat-label">In Progress</div>
        <div class="stat-icon" style="background:rgba(88,166,255,0.15)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#58A6FF" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
      </div>
      <div class="stat-value" style="color:#58A6FF">${data.inProgress}</div>
      <div class="stat-sub">tasks active now</div>
    </div>
    <div class="stat-card">
      <div class="stat-header">
        <div class="stat-label">Done Today</div>
        <div class="stat-icon" style="background:rgba(63,185,80,0.15)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3FB950" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      </div>
      <div class="stat-value" style="color:#3FB950">${data.doneToday}</div>
      <div class="stat-sub">completed today</div>
    </div>
    <div class="stat-card">
      <div class="stat-header">
        <div class="stat-label">Standups</div>
        <div class="stat-icon" style="background:rgba(249,115,22,0.15)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="2.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        </div>
      </div>
      <div class="stat-value" style="color:#F97316">${pct}</div>
      <div class="stat-sub">submitted today</div>
    </div>
  </div>

  <div class="dashboard-lower">
    <div class="dashboard-left">
      <div class="card">
        <div class="section-header">
          <div class="section-title">My Tasks</div>
          <a href="#mytasks" class="btn btn-ghost btn-sm">View All</a>
        </div>
        ${data.myTasksList.length === 0
          ? '<div class="empty-state"><p>No pending tasks assigned to you 🎉</p></div>'
          : data.myTasksList.map(t => `
          <div class="task-list-item" onclick="openTask(${t.id})">
            <div style="flex:1">
              <div class="task-list-title">${t.title}</div>
              <div class="task-list-meta" style="margin-top:4px">
                ${priorityBadge(t.priority)}
                ${t.project_name ? `<span style="font-size:11px;color:var(--text-faint)">${t.project_name}</span>` : ''}
                ${t.due_date ? `<span class="task-due ${isOverdue(t.due_date) && t.status !== 'done' ? 'overdue' : ''}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${formatDate(t.due_date)}</span>` : ''}
              </div>
            </div>
            ${statusBadge(t.status)}
          </div>`).join('')}
      </div>

      <div class="card">
        <div class="section-header">
          <div class="section-title">Recent Activity</div>
        </div>
        <div>
          ${data.recentActivity.slice(0, 10).map(a => `
          <div class="activity-item">
            ${avatar(a.user_name, '#6E54E8', 'sm')}
            <div class="activity-content">
              <div class="activity-text">
                <strong>${a.user_name}</strong> ${a.details}
                ${a.task_title ? `<span class="task-link" onclick="openTask(${a.task_id})">"${a.task_title}"</span>` : ''}
              </div>
              <div class="activity-time">${timeAgo(a.created_at)}</div>
            </div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="dashboard-right">
      <div class="card">
        <div class="section-header">
          <div class="section-title">Today's Standup</div>
          <a href="#standup" class="btn btn-ghost btn-sm">Go</a>
        </div>
        <div class="standup-grid">
          ${data.teamStandups.map(m => `
          <div class="standup-member ${m.submitted ? 'submitted' : 'pending'}">
            ${avatar(m.name, '#6E54E8', 'sm')}
            <div class="standup-member-info">
              <div class="standup-member-name">${m.name.split(' ')[0]}</div>
              ${m.submitted
                ? `<div class="standup-status-text standup-submitted">${moodEmoji(m.mood)} Done</div>`
                : `<div class="standup-status-text standup-pending">Pending</div>`}
            </div>
          </div>`).join('')}
        </div>
        <div class="progress-bar" style="margin-top:12px">
          <div class="progress-fill" style="width:${(data.standupsDone/data.totalMembers*100).toFixed(0)}%"></div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px">${data.standupsDone} of ${data.totalMembers} submitted</div>
      </div>

      <div class="card">
        <div class="section-header">
          <div class="section-title">Quick Stats</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${[
            { label: 'My Open Tasks', value: data.myTasks, color: '#6E54E8' },
            { label: 'Team Members', value: data.totalMembers, color: '#EC4899' },
          ].map(s => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--bg);border-radius:var(--radius-sm);border:1px solid var(--border)">
            <span style="font-size:13px;color:var(--text-muted)">${s.label}</span>
            <span style="font-size:18px;font-weight:800;color:${s.color}">${s.value}</span>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;

  // wire up navigation links
  content.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); navigate(a.getAttribute('href').slice(1)); });
  });
}

// ── BOARD ───────────────────────────────────────────────
async function renderBoard() {
  const { project_id, assignee_id, priority } = state.boardFilters;
  let url = '/api/tasks?';
  if (project_id)  url += `project_id=${project_id}&`;
  if (assignee_id) url += `assignee_id=${assignee_id}&`;
  if (priority)    url += `priority=${priority}&`;

  const [tasks, projects, users] = await Promise.all([api.get(url), api.get('/api/projects'), api.get('/api/users')]);
  state.projects = projects;
  state.users    = users;

  const cols = [
    { id: 'todo',       label: 'To Do',       color: '#8B949E', indicator: '#484F58' },
    { id: 'inprogress', label: 'In Progress',  color: '#58A6FF', indicator: '#58A6FF' },
    { id: 'review',     label: 'In Review',    color: '#A78BFA', indicator: '#A78BFA' },
    { id: 'done',       label: 'Done',         color: '#3FB950', indicator: '#3FB950' },
  ];

  const byStatus = {};
  cols.forEach(c => byStatus[c.id] = []);
  tasks.forEach(t => { if (byStatus[t.status]) byStatus[t.status].push(t); });

  const content = document.getElementById('main-content');
  content.innerHTML = `
  <div class="board-filters">
    <select id="bf-project" style="min-width:140px">
      <option value="">All Projects</option>
      ${projects.map(p => `<option value="${p.id}" ${project_id==p.id?'selected':''}>${p.name}</option>`).join('')}
    </select>
    <select id="bf-assignee" style="min-width:140px">
      <option value="">All Members</option>
      ${users.map(u => `<option value="${u.id}" ${assignee_id==u.id?'selected':''}>${u.name}</option>`).join('')}
    </select>
    <select id="bf-priority" style="min-width:120px">
      <option value="">All Priorities</option>
      ${['critical','high','medium','low'].map(p => `<option value="${p}" ${priority===p?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
    </select>
    <button class="btn btn-ghost btn-sm" id="bf-clear">Clear Filters</button>
    <div style="margin-left:auto;font-size:13px;color:var(--text-muted)">${tasks.length} task${tasks.length!==1?'s':''}</div>
  </div>
  <div class="board-columns">
    ${cols.map(col => `
    <div class="board-column">
      <div class="column-header">
        <div class="column-title-row">
          <div class="column-indicator" style="background:${col.indicator}"></div>
          <span class="column-title">${col.label}</span>
          <span class="column-count">${byStatus[col.id].length}</span>
        </div>
        <button class="column-add" title="Add task" onclick="openCreateTask('${col.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      <div class="column-cards" id="col-${col.id}" data-status="${col.id}">
        ${byStatus[col.id].length === 0
          ? `<div class="empty-column">
               <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
               <span>Drop tasks here</span>
             </div>`
          : byStatus[col.id].map(t => taskCard(t)).join('')}
      </div>
    </div>`).join('')}
  </div>`;

  // Drag & drop with SortableJS
  cols.forEach(col => {
    const el = document.getElementById(`col-${col.id}`);
    if (!el) return;
    new Sortable(el, {
      group: 'tasks',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: async (evt) => {
        const taskId    = evt.item.dataset.taskId;
        const newStatus = evt.to.dataset.status;
        if (!taskId || !newStatus) return;
        try {
          await api.put(`/api/tasks/${taskId}`, { status: newStatus });
          showToast('Task moved', 'success');
          await renderBoard();
        } catch(e) {
          showToast(e.message, 'error');
        }
      }
    });
  });

  // Filter listeners
  document.getElementById('bf-project')?.addEventListener('change', e => { state.boardFilters.project_id  = e.target.value; renderBoard(); });
  document.getElementById('bf-assignee')?.addEventListener('change', e => { state.boardFilters.assignee_id = e.target.value; renderBoard(); });
  document.getElementById('bf-priority')?.addEventListener('change', e => { state.boardFilters.priority    = e.target.value; renderBoard(); });
  document.getElementById('bf-clear')?.addEventListener('click', () => { state.boardFilters = {}; renderBoard(); });
}

function taskCard(t) {
  const overdue = isOverdue(t.due_date) && t.status !== 'done';
  return `
  <div class="task-card" data-task-id="${t.id}" onclick="openTask(${t.id})">
    <div class="task-card-top">
      <div class="task-card-title">${t.title}</div>
      ${priorityBadge(t.priority)}
    </div>
    ${t.description ? `<div style="font-size:12px;color:var(--text-faint);line-height:1.4;margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${t.description}</div>` : ''}
    ${t.project_name ? `<div style="font-size:11px;color:var(--text-faint);margin-bottom:4px">
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${t.project_color};margin-right:4px;vertical-align:middle"></span>${t.project_name}
    </div>` : ''}
    <div class="task-card-bottom">
      <div class="task-card-meta">
        ${t.due_date ? `<span class="task-due ${overdue ? 'overdue' : ''}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${formatDate(t.due_date)}</span>` : ''}
        ${t.story_points ? `<span class="task-points">${t.story_points}pt</span>` : ''}
      </div>
      ${t.assignee_name ? avatar(t.assignee_name, t.avatar_color || '#6E54E8', 'sm') : '<div style="width:24px"></div>'}
    </div>
  </div>`;
}

// ── MY TASKS ────────────────────────────────────────────
async function renderMyTasks() {
  const tasks = await api.get(`/api/users/${state.user.id}/tasks`);
  const content = document.getElementById('main-content');

  const statusMap = { todo: 0, inprogress: 1, review: 2, done: 3 };
  const priorityMap = { critical: 0, high: 1, medium: 2, low: 3 };
  tasks.sort((a,b) => (statusMap[a.status]||0) - (statusMap[b.status]||0) || (priorityMap[a.priority]||0) - (priorityMap[b.priority]||0));

  content.innerHTML = `
  <div class="tasks-filter-bar">
    <span style="font-size:13px;color:var(--text-muted);font-weight:600">${tasks.length} task${tasks.length!==1?'s':''} assigned to you</span>
  </div>
  ${tasks.length === 0
    ? `<div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        <h3>You're all clear!</h3>
        <p>No tasks assigned to you yet.</p>
       </div>`
    : `<div class="tasks-table">
        <div class="tasks-table-header">
          <div>Task</div>
          <div>Priority</div>
          <div>Status</div>
          <div class="hide-mobile">Project</div>
          <div class="hide-mobile">Due Date</div>
          <div>Points</div>
        </div>
        ${tasks.map(t => `
        <div class="tasks-table-row" onclick="openTask(${t.id})">
          <div class="task-row-title">${t.title}</div>
          <div>${priorityBadge(t.priority)}</div>
          <div>${statusBadge(t.status)}</div>
          <div class="task-row-project hide-mobile">${t.project_name || '—'}</div>
          <div class="hide-mobile">
            ${t.due_date ? `<span class="${isOverdue(t.due_date) && t.status !== 'done' ? 'task-due overdue' : 'task-due'}">${formatDate(t.due_date)}</span>` : '—'}
          </div>
          <div style="color:var(--text-muted);font-size:13px">${t.story_points || 0}pt</div>
        </div>`).join('')}
      </div>`}`;
}

// ── STANDUP ─────────────────────────────────────────────
async function renderStandup() {
  const today   = new Date().toISOString().split('T')[0];
  const [teamStandups, myStandup, users] = await Promise.all([
    api.get(`/api/standups?date=${today}`),
    api.get('/api/standups/mine'),
    api.get('/api/users'),
  ]);

  state.users = users;
  const content = document.getElementById('main-content');

  const submitted = !!myStandup;

  content.innerHTML = `
  <div class="standup-layout">
    <div>
      <div class="standup-form-card">
        <div class="standup-form-header">
          <h3>${submitted ? '✅ Standup Submitted' : '📝 Submit Today\'s Standup'}</h3>
          <p>${new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}</p>
        </div>
        <div class="standup-form-body">
          ${submitted ? `
          <div class="standup-submitted-banner">
            <span>✅</span>
            <span>Your standup is submitted! You can update it anytime.</span>
          </div>` : ''}
          <div class="form-group">
            <label>What did you do today?</label>
            <textarea class="standup-textarea" id="std-did" placeholder="Summarize what you accomplished today..." rows="3">${myStandup?.did_today || ''}</textarea>
          </div>
          <div class="form-group">
            <label>What will you do tomorrow?</label>
            <textarea class="standup-textarea" id="std-will" placeholder="What are you planning to work on next?" rows="3">${myStandup?.will_do || ''}</textarea>
          </div>
          <div class="form-group">
            <label>Any blockers? <span style="color:var(--text-faint);font-weight:400">(optional)</span></label>
            <textarea class="standup-textarea" id="std-blockers" placeholder="Anything blocking you? Leave empty if none." rows="2">${myStandup?.blockers || ''}</textarea>
          </div>
          <div class="form-group">
            <label>How are you feeling today?</label>
            <div class="mood-picker" id="mood-picker">
              ${[['great','🚀'],['good','😊'],['ok','😐'],['tired','😴'],['blocked','🚧']].map(([m,e]) => `
              <button type="button" class="mood-btn ${(myStandup?.mood||'good')===m?'selected':''}" data-mood="${m}" title="${m}">${e}</button>`).join('')}
            </div>
          </div>
          <button class="btn btn-primary btn-full" id="submit-standup">
            ${submitted ? '🔄 Update Standup' : '🚀 Submit Standup'}
          </button>
        </div>
      </div>
    </div>

    <div>
      <div style="font-size:15px;font-weight:700;margin-bottom:14px">Team Updates · ${teamStandups.length}/${users.length} submitted</div>
      <div class="progress-bar" style="margin-bottom:16px">
        <div class="progress-fill" style="width:${(teamStandups.length/users.length*100).toFixed(0)}%"></div>
      </div>
      <div class="team-standups-grid" id="team-standups-grid">
        ${renderTeamStandupCards(users, teamStandups)}
      </div>
    </div>
  </div>`;

  // Mood picker
  let selectedMood = myStandup?.mood || 'good';
  content.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      content.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedMood = btn.dataset.mood;
    });
  });

  document.getElementById('submit-standup')?.addEventListener('click', async () => {
    const did_today = document.getElementById('std-did').value.trim();
    const will_do   = document.getElementById('std-will').value.trim();
    const blockers  = document.getElementById('std-blockers').value.trim();
    if (!did_today || !will_do) { showToast('Please fill in what you did and will do', 'error'); return; }
    try {
      await api.post('/api/standups', { did_today, will_do, blockers, mood: selectedMood });
      showToast('Standup submitted!', 'success');
      document.getElementById('standup-dot').classList.add('hidden');
      renderStandup();
    } catch(e) { showToast(e.message, 'error'); }
  });
}

function renderTeamStandupCards(users, standups) {
  return users.map(u => {
    const s = standups.find(sd => sd.user_id === u.id);
    return `
    <div class="team-standup-card ${s ? 'has-standup' : ''}">
      <div class="team-standup-header">
        ${avatar(u.name, u.avatar_color || '#6E54E8', 'md')}
        <div class="team-standup-user">
          <div class="team-standup-name">${u.name} ${s ? moodEmoji(s.mood) : ''}</div>
          <div class="team-standup-title">${u.job_title}</div>
        </div>
        <span class="standup-chip ${s ? 'done' : 'pending'}">${s ? 'Done' : 'Pending'}</span>
      </div>
      ${s ? `
      <div class="standup-field">
        <div class="standup-field-label">Did Today</div>
        <div class="standup-field-value">${s.did_today || '—'}</div>
      </div>
      <div class="standup-field">
        <div class="standup-field-label">Will Do</div>
        <div class="standup-field-value">${s.will_do || '—'}</div>
      </div>
      ${s.blockers ? `<div class="standup-field">
        <div class="standup-field-label">⚠️ Blockers</div>
        <div class="standup-field-value has-blocker">${s.blockers}</div>
      </div>` : ''}
      ` : '<div class="no-standup-text">No standup submitted yet today.</div>'}
    </div>`;
  }).join('');
}

// ── TEAM ─────────────────────────────────────────────────
async function renderTeam() {
  const today = new Date().toISOString().split('T')[0];
  const [users, standups] = await Promise.all([api.get('/api/users'), api.get(`/api/standups?date=${today}`)]);
  state.users = users;

  const content = document.getElementById('main-content');
  content.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
    <div style="font-size:13px;color:var(--text-muted)">${users.length} team members</div>
  </div>
  <div class="team-grid" id="team-grid">
    ${users.map(u => {
      const sd = standups.find(s => s.user_id === u.id);
      return `
      <div class="team-member-card" onclick="openMemberDetail(${u.id})">
        <div class="team-member-header">
          ${avatar(u.name, u.avatar_color || '#6E54E8', 'lg')}
          <div class="team-member-info">
            <div class="team-member-name">${u.name}</div>
            <div class="team-member-title">${u.job_title}</div>
          </div>
          <span class="standup-chip ${sd ? 'done' : 'pending'}">${sd ? moodEmoji(sd.mood) : '⏳'}</span>
        </div>
        <div id="member-tasks-${u.id}" style="font-size:12px;color:var(--text-faint)">Loading tasks...</div>
      </div>`;
    }).join('')}
  </div>`;

  // Load tasks for each member
  users.forEach(u => loadMemberTasksSummary(u));
}

async function loadMemberTasksSummary(u) {
  const el = document.getElementById(`member-tasks-${u.id}`);
  if (!el) return;
  try {
    const tasks = await api.get(`/api/users/${u.id}/tasks`);
    const counts = { todo: 0, inprogress: 0, review: 0, done: 0 };
    tasks.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });
    el.innerHTML = `
    <div class="team-task-stats">
      <div class="team-stat"><div class="team-stat-value" style="color:var(--text-muted)">${counts.todo}</div><div class="team-stat-label">To Do</div></div>
      <div class="team-stat"><div class="team-stat-value" style="color:var(--accent)">${counts.inprogress}</div><div class="team-stat-label">Active</div></div>
      <div class="team-stat"><div class="team-stat-value" style="color:#A78BFA">${counts.review}</div><div class="team-stat-label">Review</div></div>
      <div class="team-stat"><div class="team-stat-value" style="color:var(--success)">${counts.done}</div><div class="team-stat-label">Done</div></div>
    </div>
    ${tasks.filter(t => t.status !== 'done').slice(0, 3).map(t => `
    <div class="team-recent-tasks">
      <div class="team-task-item">
        ${priorityBadge(t.priority)}
        <span class="team-task-name">${t.title}</span>
      </div>
    </div>`).join('')}
    ${tasks.filter(t => t.status !== 'done').length === 0 ? '<div style="margin-top:8px;color:var(--success);font-size:12px">🎉 All caught up!</div>' : ''}`;
  } catch(e) { el.textContent = 'Could not load tasks'; }
}

async function openMemberDetail(userId) {
  const [user, tasks] = await Promise.all([api.get(`/api/users/${userId}`), api.get(`/api/users/${userId}/tasks`)]);
  const modal = document.getElementById('task-modal');
  document.getElementById('modal-project-badge').textContent = user.job_title;
  document.getElementById('modal-project-badge').style.cssText = 'display:inline-flex';
  document.getElementById('modal-title').textContent = user.name + "'s Tasks";

  document.getElementById('modal-body').innerHTML = `
  <div style="display:flex;align-items:center;gap:14px;padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:16px">
    ${avatar(user.name, user.avatar_color || '#6E54E8', 'xl')}
    <div>
      <div style="font-size:18px;font-weight:700">${user.name}</div>
      <div style="color:var(--text-muted)">${user.job_title}</div>
      <div style="color:var(--text-faint);font-size:12px">@${user.username}</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
    ${['todo','inprogress','review','done'].map(s => {
      const c = tasks.filter(t => t.status === s).length;
      const colors = { todo:'var(--text-muted)', inprogress:'var(--accent)', review:'#A78BFA', done:'var(--success)' };
      const labels = { todo:'To Do', inprogress:'Active', review:'Review', done:'Done' };
      return `<div class="team-stat"><div class="team-stat-value" style="color:${colors[s]}">${c}</div><div class="team-stat-label">${labels[s]}</div></div>`;
    }).join('')}
  </div>
  ${tasks.length === 0
    ? '<div class="empty-state"><p>No tasks assigned</p></div>'
    : tasks.map(t => `
  <div class="task-list-item" onclick="closeModal('task-modal');openTask(${t.id})">
    <div style="flex:1">
      <div class="task-list-title">${t.title}</div>
      <div class="task-list-meta" style="margin-top:4px">${priorityBadge(t.priority)} ${t.project_name ? `<span style="font-size:11px;color:var(--text-faint)">${t.project_name}</span>` : ''}</div>
    </div>
    ${statusBadge(t.status)}
  </div>`).join('')}`;

  modal.classList.remove('hidden');
}

// ── TASK DETAIL MODAL ───────────────────────────────────
async function openTask(id) {
  state.openTaskId = id;
  const modal = document.getElementById('task-modal');
  document.getElementById('modal-body').innerHTML = `<div class="page-loading"><div class="spinner"></div></div>`;
  modal.classList.remove('hidden');

  try {
    const [task, comments] = await Promise.all([api.get(`/api/tasks/${id}`), api.get(`/api/comments/${id}`)]);

    document.getElementById('modal-project-badge').textContent = task.project_key || task.project_name || '';
    document.getElementById('modal-project-badge').style.cssText = task.project_color ? `display:inline-flex;background:${task.project_color}22;color:${task.project_color}` : 'display:none';
    document.getElementById('modal-title').textContent = task.title;

    document.getElementById('modal-body').innerHTML = `
    <div class="task-detail-layout">
      <div class="task-detail-main">
        <div style="margin-bottom:16px">
          <div class="detail-section-title">Description</div>
          <div class="task-description" id="task-desc-${id}">${task.description || '<span style="color:var(--text-faint);font-style:italic">No description</span>'}</div>
        </div>

        <div class="comments-section">
          <div class="detail-section-title">Comments (${comments.length})</div>
          <div class="comment-list" id="comment-list-${id}">
            ${comments.map(c => `
            <div class="comment-item">
              ${avatar(c.user_name, c.avatar_color || '#6E54E8', 'sm')}
              <div class="comment-body">
                <div class="comment-author">${c.user_name}</div>
                <div class="comment-text">${c.content}</div>
                <div class="comment-time">${timeAgo(c.created_at)}</div>
              </div>
            </div>`).join('')}
            ${comments.length === 0 ? '<div style="color:var(--text-faint);font-size:13px;font-style:italic">No comments yet</div>' : ''}
          </div>
          <div class="comment-input-row">
            ${avatar(state.user.name, state.user.avatar_color || '#6E54E8', 'sm')}
            <textarea class="comment-input" id="comment-input-${id}" placeholder="Leave a comment..." rows="1"></textarea>
            <button class="btn btn-primary btn-sm" onclick="submitComment(${id})">Post</button>
          </div>
        </div>
      </div>

      <div class="task-detail-side">
        <div class="detail-field">
          <div class="detail-label">Status</div>
          <select class="status-select" onchange="quickUpdateTask(${id},{status:this.value})">
            ${['todo','inprogress','review','done'].map(s => `<option value="${s}" ${task.status===s?'selected':''}>${{todo:'To Do',inprogress:'In Progress',review:'In Review',done:'Done'}[s]}</option>`).join('')}
          </select>
        </div>
        <div class="detail-field">
          <div class="detail-label">Priority</div>
          ${priorityBadge(task.priority)}
        </div>
        <div class="detail-field">
          <div class="detail-label">Assignee</div>
          ${task.assignee_name
            ? `<div class="detail-assignee">${avatar(task.assignee_name, task.avatar_color||'#6E54E8','sm')}<span>${task.assignee_name}</span></div>`
            : '<span style="color:var(--text-faint)">Unassigned</span>'}
        </div>
        ${task.project_name ? `
        <div class="detail-field">
          <div class="detail-label">Project</div>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:8px;height:8px;border-radius:50%;background:${task.project_color}"></div>
            <span style="font-size:13px">${task.project_name}</span>
          </div>
        </div>` : ''}
        ${task.due_date ? `
        <div class="detail-field">
          <div class="detail-label">Due Date</div>
          <div class="detail-value ${isOverdue(task.due_date) && task.status !== 'done' ? 'task-due overdue' : ''}">${formatDate(task.due_date)}</div>
        </div>` : ''}
        ${task.story_points ? `
        <div class="detail-field">
          <div class="detail-label">Story Points</div>
          <div class="detail-value">${task.story_points} pts</div>
        </div>` : ''}
        <div class="detail-field">
          <div class="detail-label">Created by</div>
          <div class="detail-value" style="font-size:13px">${task.creator_name || '—'}</div>
        </div>
        <div class="detail-field">
          <div class="detail-label">Created</div>
          <div class="detail-value" style="font-size:12px;color:var(--text-muted)">${timeAgo(task.created_at)}</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-ghost btn-sm" onclick="openEditTask(${id})" style="flex:1">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTask(${id})">Delete</button>
        </div>
      </div>
    </div>`;
  } catch(e) {
    document.getElementById('modal-body').innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}

async function renderComments(taskId) {
  const comments = await api.get(`/api/comments/${taskId}`);
  const el       = document.getElementById(`comment-list-${taskId}`);
  if (!el) return;
  el.innerHTML = comments.map(c => `
  <div class="comment-item">
    ${avatar(c.user_name, c.avatar_color || '#6E54E8', 'sm')}
    <div class="comment-body">
      <div class="comment-author">${c.user_name}</div>
      <div class="comment-text">${c.content}</div>
      <div class="comment-time">${timeAgo(c.created_at)}</div>
    </div>
  </div>`).join('') || '<div style="color:var(--text-faint);font-size:13px;font-style:italic">No comments yet</div>';
}

async function submitComment(taskId) {
  const input   = document.getElementById(`comment-input-${taskId}`);
  const content = input.value.trim();
  if (!content) return;
  try {
    await api.post('/api/comments', { task_id: taskId, content });
    input.value = '';
    await renderComments(taskId);
  } catch(e) { showToast(e.message, 'error'); }
}

async function quickUpdateTask(id, updates) {
  try {
    await api.put(`/api/tasks/${id}`, updates);
    showToast('Task updated', 'success');
    if (state.currentView === 'board') renderBoard();
  } catch(e) { showToast(e.message, 'error'); }
}

async function deleteTask(id) {
  if (!confirm('Delete this task? This cannot be undone.')) return;
  try {
    await api.delete(`/api/tasks/${id}`);
    closeModal('task-modal');
    showToast('Task deleted', 'success');
    renderView(state.currentView);
  } catch(e) { showToast(e.message, 'error'); }
}

function openEditTask(id) {
  const task = null; // fetch and populate create modal for editing
  document.querySelector('.modal-overlay:not(.hidden) #modal-title').textContent = 'Edit Task';
  // For now open create modal pre-filled
  showToast('Edit via the Create Task modal — fill in updated values', 'info');
}

// ── CREATE TASK MODAL ───────────────────────────────────
function openCreateTask(defaultStatus = 'todo') {
  const modal = document.getElementById('create-modal');

  // Populate selects
  const assigneeEl = document.getElementById('ct-assignee');
  const projectEl  = document.getElementById('ct-project');

  assigneeEl.innerHTML = '<option value="">Unassigned</option>' +
    state.users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');

  projectEl.innerHTML = '<option value="">No Project</option>' +
    state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  document.getElementById('ct-status').value = defaultStatus;
  document.getElementById('create-task-form').reset();
  document.getElementById('ct-status').value = defaultStatus;

  modal.classList.remove('hidden');
}

// ── PROJECT MODAL ────────────────────────────────────────
function openProjectModal() {
  document.getElementById('project-modal').classList.remove('hidden');
}

// ── SIDEBAR PROJECTS ─────────────────────────────────────
async function loadSidebarProjects() {
  try {
    const projects = await api.get('/api/projects');
    state.projects = projects;
    document.getElementById('project-list-sidebar').innerHTML = projects.map(p => `
    <div class="project-nav-item" onclick="filterByProject(${p.id})">
      <div class="project-dot" style="background:${p.color}"></div>
      <span>${p.name}</span>
    </div>`).join('');
  } catch(e) {}
}

function filterByProject(id) {
  state.boardFilters.project_id = String(id);
  navigate('board');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  if (id === 'task-modal') state.openTaskId = null;
}

// ── CHECK STANDUP DOT ───────────────────────────────────
async function checkStandupStatus() {
  try {
    const mine = await api.get('/api/standups/mine');
    document.getElementById('standup-dot').classList.toggle('hidden', !!mine);
  } catch(e) {}
}

// ── INIT ─────────────────────────────────────────────────
async function init() {
  // Check auth
  try {
    const user = await api.get('/api/auth/me');
    state.user = user;
    showApp();
  } catch(e) {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Set user info
  const av = document.getElementById('sidebar-avatar');
  av.textContent   = initials(state.user.name);
  av.style.background = state.user.avatar_color || '#6E54E8';
  document.getElementById('sidebar-name').textContent = state.user.name;
  document.getElementById('sidebar-role').textContent = state.user.role;

  // Set date
  document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // Show admin-only UI elements
  if (state.user.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }

  loadSidebarProjects();
  checkStandupStatus();
  navigate('dashboard');
}

// ── EVENT LISTENERS ───────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl  = document.getElementById('login-error');

  try {
    errorEl.classList.add('hidden');
    const res = await api.post('/api/auth/login', { username, password });
    state.user = res.user;
    showApp();
  } catch(err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

document.getElementById('logout-btn').addEventListener('click', toggleProfileMenu);

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(el.dataset.view);
  });
});

document.getElementById('btn-create-task').addEventListener('click', async () => {
  if (state.users.length === 0) state.users = await api.get('/api/users');
  if (state.projects.length === 0) state.projects = await api.get('/api/projects');
  openCreateTask();
});

document.getElementById('modal-close').addEventListener('click',         () => closeModal('task-modal'));
document.getElementById('create-modal-close').addEventListener('click',  () => closeModal('create-modal'));
document.getElementById('create-cancel').addEventListener('click',       () => closeModal('create-modal'));
document.getElementById('project-modal-close').addEventListener('click', () => closeModal('project-modal'));
document.getElementById('project-cancel').addEventListener('click',      () => closeModal('project-modal'));
document.getElementById('btn-new-project').addEventListener('click',     () => openProjectModal());

// Close modals on overlay click
['task-modal', 'create-modal', 'project-modal', 'change-pwd-modal', 'admin-reset-modal'].forEach(id => {
  document.getElementById(id).addEventListener('click', (e) => {
    if (e.target.id === id) closeModal(id);
  });
});

// Create task form
document.getElementById('create-task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    title:        document.getElementById('ct-title').value.trim(),
    description:  document.getElementById('ct-description').value.trim(),
    assignee_id:  document.getElementById('ct-assignee').value || null,
    project_id:   document.getElementById('ct-project').value  || null,
    priority:     document.getElementById('ct-priority').value,
    status:       document.getElementById('ct-status').value,
    due_date:     document.getElementById('ct-due-date').value  || null,
    story_points: parseInt(document.getElementById('ct-points').value) || 0,
  };
  try {
    await api.post('/api/tasks', data);
    closeModal('create-modal');
    showToast('Task created!', 'success');
    if (state.currentView === 'board' || state.currentView === 'mytasks') renderView(state.currentView);
    loadSidebarProjects();
  } catch(err) { showToast(err.message, 'error'); }
});

// Create project form
document.getElementById('create-project-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api.post('/api/projects', {
      name:        document.getElementById('p-name').value.trim(),
      description: document.getElementById('p-desc').value.trim(),
      color:       state.selectedProjectColor,
    });
    closeModal('project-modal');
    showToast('Project created!', 'success');
    loadSidebarProjects();
    document.getElementById('create-project-form').reset();
  } catch(err) { showToast(err.message, 'error'); }
});

// Color picker
document.getElementById('color-picker').addEventListener('click', (e) => {
  const swatch = e.target.closest('.color-swatch');
  if (!swatch) return;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  swatch.classList.add('selected');
  state.selectedProjectColor = swatch.dataset.color;
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    ['task-modal','create-modal','project-modal','change-pwd-modal','admin-reset-modal'].forEach(id => closeModal(id));
    profileMenu.classList.add('hidden');
  }
  if (e.key === 'n' && e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    openCreateTask();
  }
});

// ── PROFILE MENU ──────────────────────────────────────────
const profileMenu = document.getElementById('profile-menu');

function toggleProfileMenu(e) {
  e.stopPropagation();
  profileMenu.classList.toggle('hidden');
}

document.getElementById('sidebar-user').addEventListener('click', toggleProfileMenu);

document.addEventListener('click', (e) => {
  if (!profileMenu.contains(e.target)) profileMenu.classList.add('hidden');
});

// Change Password modal
document.getElementById('pm-change-pwd').addEventListener('click', () => {
  profileMenu.classList.add('hidden');
  document.getElementById('change-pwd-form').reset();
  document.getElementById('cp-error').classList.add('hidden');
  document.getElementById('change-pwd-modal').classList.remove('hidden');
});
document.getElementById('change-pwd-close').addEventListener('click', () => closeModal('change-pwd-modal'));
document.getElementById('cp-cancel').addEventListener('click',        () => closeModal('change-pwd-modal'));

document.getElementById('change-pwd-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const current  = document.getElementById('cp-current').value;
  const newPwd   = document.getElementById('cp-new').value;
  const confirm  = document.getElementById('cp-confirm').value;
  const errorEl  = document.getElementById('cp-error');

  if (newPwd !== confirm) {
    errorEl.textContent = 'New passwords do not match';
    errorEl.classList.remove('hidden');
    return;
  }
  try {
    errorEl.classList.add('hidden');
    await api.post('/api/auth/change-password', { current_password: current, new_password: newPwd });
    closeModal('change-pwd-modal');
    showToast('Password updated successfully!', 'success');
  } catch(err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

// Admin Reset Password modal
document.getElementById('pm-reset-pwd').addEventListener('click', async () => {
  profileMenu.classList.add('hidden');
  const users = await api.get('/api/users');
  const sel   = document.getElementById('ar-user');
  sel.innerHTML = users
    .filter(u => u.id !== state.user.id)
    .map(u => `<option value="${u.id}">${u.name} (@${u.username})</option>`)
    .join('');
  document.getElementById('admin-reset-form').reset();
  document.getElementById('ar-error').classList.add('hidden');
  document.getElementById('admin-reset-modal').classList.remove('hidden');
});
document.getElementById('admin-reset-close').addEventListener('click', () => closeModal('admin-reset-modal'));
document.getElementById('ar-cancel').addEventListener('click',         () => closeModal('admin-reset-modal'));

document.getElementById('admin-reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const user_id      = document.getElementById('ar-user').value;
  const new_password = document.getElementById('ar-password').value;
  const errorEl      = document.getElementById('ar-error');
  try {
    errorEl.classList.add('hidden');
    await api.post('/api/auth/reset-password', { user_id, new_password });
    closeModal('admin-reset-modal');
    showToast('Password reset! Share the new password with the member.', 'success');
  } catch(err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

// Sign out from profile menu
document.getElementById('pm-logout').addEventListener('click', async () => {
  await api.post('/api/auth/logout');
  state.user = null;
  profileMenu.classList.add('hidden');
  showLogin();
});

// ── BOOT ──────────────────────────────────────────────────
init();
