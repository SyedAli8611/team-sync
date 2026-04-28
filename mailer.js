const nodemailer = require('nodemailer');

const FROM_EMAIL = 'alisyedfaizan390@gmail.com';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: FROM_EMAIL,
    pass: 'shsczskuxbpguemz',
  },
});

function base(content) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8"/>
    <style>
      body { margin:0; padding:0; background:#0D1117; font-family:'Segoe UI',Arial,sans-serif; }
      .wrap { max-width:560px; margin:32px auto; background:#161B22; border-radius:12px; overflow:hidden; border:1px solid #30363D; }
      .header { background:#6E54E8; padding:24px 28px; }
      .header-logo { font-size:18px; font-weight:700; color:#fff; letter-spacing:-0.3px; }
      .header-logo span { opacity:0.75; font-weight:400; }
      .body { padding:28px; }
      .label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#484F58; margin-bottom:4px; }
      .value { font-size:14px; color:#E6EDF3; margin-bottom:16px; line-height:1.5; }
      .task-title { font-size:20px; font-weight:700; color:#E6EDF3; margin-bottom:20px; line-height:1.35; }
      .badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; }
      .badge-purple { background:rgba(110,84,232,0.2); color:#A78BFA; border:1px solid rgba(110,84,232,0.3); }
      .badge-green  { background:rgba(63,185,80,0.2);  color:#3FB950; border:1px solid rgba(63,185,80,0.3); }
      .divider { border:none; border-top:1px solid #30363D; margin:20px 0; }
      .footer { padding:16px 28px; border-top:1px solid #21262D; font-size:11px; color:#484F58; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">
        <div class="header-logo">TeamSync <span>— notifications</span></div>
      </div>
      <div class="body">${content}</div>
      <div class="footer">You're receiving this because you're a member of TeamSync. Do not reply to this email.</div>
    </div>
  </body>
  </html>`;
}

async function sendTaskAssigned({ to, assigneeName, taskTitle, projectName, createdBy, priority }) {
  if (!to) return;
  const priorityColors = { critical: '#F85149', high: '#F97316', medium: '#D29922', low: '#3FB950' };
  const pColor = priorityColors[priority] || '#8B949E';
  const html = base(`
    <div class="task-title">${taskTitle}</div>
    <div class="label">Assigned by</div>
    <div class="value">${createdBy}</div>
    ${projectName ? `<div class="label">Project</div><div class="value">${projectName}</div>` : ''}
    <div class="label">Priority</div>
    <div class="value"><span style="color:${pColor};font-weight:600;text-transform:capitalize;">${priority}</span></div>
    <hr class="divider"/>
    <div style="font-size:13px;color:#8B949E;">Hi ${assigneeName}, a new task has been assigned to you. Log in to TeamSync to view the details and get started.</div>
  `);
  await transporter.sendMail({
    from: `"TeamSync" <${FROM_EMAIL}>`,
    to,
    subject: `New task assigned: ${taskTitle}`,
    html,
  });
}

async function sendTaskDone({ recipients, taskTitle, projectName, resolvedBy }) {
  const emails = recipients.filter(Boolean);
  if (!emails.length) return;
  const html = base(`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
      <span class="badge badge-green">✓ Completed</span>
    </div>
    <div class="task-title">${taskTitle}</div>
    <div class="label">Resolved by</div>
    <div class="value">${resolvedBy}</div>
    ${projectName ? `<div class="label">Project</div><div class="value">${projectName}</div>` : ''}
    <hr class="divider"/>
    <div style="font-size:13px;color:#8B949E;">This task has been marked as done. Great work, team!</div>
  `);
  await transporter.sendMail({
    from: `"TeamSync" <${FROM_EMAIL}>`,
    to: emails.join(', '),
    subject: `Task completed: ${taskTitle}`,
    html,
  });
}

module.exports = { sendTaskAssigned, sendTaskDone };
