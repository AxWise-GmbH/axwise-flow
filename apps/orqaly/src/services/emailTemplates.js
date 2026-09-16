/**
 * Email templates for notification emails.
 *
 * 2026 PROFESSIONAL DESIGN SYSTEM
 * Clean, accessible, mobile-first. Matches Orchestrator platform.
 *
 * Design specs:
 * - Font: System UI stack (Inter-like)
 * - Primary: #0f172a (Slate 900)
 * - Accent bar: #3b82f6 (Blue 500)
 * - Background: #f8fafc (Slate 50)
 * - Card: #ffffff, radius 12px, soft shadow
 * - Text: #0f172a (primary), #64748b (secondary)
 */

import { getActionLabel } from '../../shared/notificationCatalog.js';

/* ------------------------------------------------------------------ */
/*  Shared layout & components                                         */
/* ------------------------------------------------------------------ */

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrap(title, bodyHtml, footerNote = '', actionButton = null) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>${esc(title)}</title>
<!--[if mso]>
<style type="text/css">
table {border-collapse:collapse;border-spacing:0;margin:0;}
div, td {padding:0;}
div {margin:0 !important;}
</style>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
</head>
<body style="margin:0;padding:0;word-spacing:normal;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Helvetica Neue',sans-serif;color:#0f172a;line-height:1.6;-webkit-font-smoothing:antialiased;">
<div role="article" aria-roledescription="email" lang="en" style="-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background-color:#f8fafc;">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:none;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;border:none;text-align:left;">
<tr><td style="padding-bottom:24px;text-align:center;">
<span style="font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.03em;">Orchestrator</span>
</td></tr>
<tr><td style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06),0 4px 12px rgba(0,0,0,0.04);border:1px solid #e2e8f0;">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:none;">
<tr><td style="height:4px;font-size:0;line-height:0;background:linear-gradient(90deg,#3b82f6 0%,#6366f1 100%);">&nbsp;</td></tr>
<tr><td style="padding:32px 28px 28px;">
<h1 style="margin:0 0 20px;font-size:22px;font-weight:600;color:#0f172a;letter-spacing:-0.02em;line-height:1.3;">${esc(title)}</h1>
${bodyHtml}
${actionButton ? `<div style="margin-top:28px;margin-bottom:4px;">${actionButton}</div>` : ''}
</td></tr>
</table>
</td></tr>
<tr><td style="padding:28px 16px;text-align:center;">
<p style="margin:0 0 6px;font-size:13px;color:#64748b;">
<a href="https://orchestratori.vercel.app/settings" style="color:#3b82f6;text-decoration:none;font-weight:500;">Notification settings</a>
<span style="color:#cbd5e1;">&nbsp;&bull;&nbsp;</span>
<a href="https://orchestratori.vercel.app/dashboard" style="color:#3b82f6;text-decoration:none;font-weight:500;">Dashboard</a>
</p>
<p style="margin:0;font-size:12px;color:#94a3b8;">${footerNote || 'Sent by Orchestrator.'}</p>
</td></tr>
</table>
</td></tr>
</table>
</div>
</body>
</html>`;
}

function paragraph(text) {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#334155;">${text}</p>`;
}

function row(label, value) {
  if (!value && value !== 0) return '';
  return `<tr>
<td style="padding:12px 0;width:130px;vertical-align:top;font-size:13px;font-weight:500;color:#64748b;border-bottom:1px solid #f1f5f9;">${esc(label)}</td>
<td style="padding:12px 0 12px 12px;vertical-align:top;font-size:14px;font-weight:400;color:#0f172a;border-bottom:1px solid #f1f5f9;">${esc(String(value))}</td>
</tr>`;
}

function detailTable(rows) {
  const html = rows.filter(Boolean).join('');
  if (!html) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:8px;margin-bottom:8px;">${html}</table>`;
}

function badge(text, type = 'neutral') {
  const styles = {
    success: { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
    warning: { bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
    error: { bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' },
    neutral: { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
    primary: { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
  };
  const s = styles[type] || styles.neutral;
  return `<span style="display:inline-block;padding:4px 10px;font-size:12px;font-weight:600;line-height:1.25;white-space:nowrap;border-radius:6px;background-color:${s.bg};color:${s.color};border:1px solid ${s.border};">${esc(text)}</span>`;
}

function button(label, url) {
  return `<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;line-height:1.25;color:#ffffff;text-decoration:none;background:linear-gradient(180deg,#3b82f6 0%,#2563eb 100%);border-radius:8px;border:1px solid rgba(0,0,0,0.06);box-shadow:0 1px 2px rgba(0,0,0,0.05);">
<!--[if mso]><i style="letter-spacing: 25px;mso-font-width:-100%;mso-text-raise:30pt">&nbsp;</i><![endif]-->
<span style="mso-text-raise:15pt;">${esc(label)}</span>
<!--[if mso]><i style="letter-spacing: 25px;mso-font-width:-100%">&nbsp;</i><![endif]-->
</a>`;
}

/* ------------------------------------------------------------------ */
/*  Templates                                                          */
/* ------------------------------------------------------------------ */

// --- Partners ---

export function partnerCreated({ name, funnelStatus, group, notes }) {
  const subject = `New partner: ${name}`;
  const body = `
${paragraph('A new partner has been successfully added to your platform.')}
${detailTable([
  row('Partner Name', name),
  row('Status', funnelStatus),
  row('Group / Team', group),
  notes ? row('Notes', notes.length > 100 ? notes.slice(0, 100) + '...' : notes) : '',
])}`;
  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('View Partner', 'https://orchestratori.vercel.app/partners')
    ),
    text: subject,
  };
}

export function partnerUpdated({ name, changes, changedFields }) {
  const subject = `Updated: ${name}`;
  const fields = changedFields || changes || 'Multiple fields';
  const body = `
${paragraph('The partner record has been modified.')}
${detailTable([row('Partner Name', name), row('Fields Changed', fields)])}`;
  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('View Partners', 'https://orchestratori.vercel.app/partners')
    ),
    text: subject,
  };
}

export function partnerArchived({ name, reason }) {
  const subject = `Archived: ${name}`;
  const body = `
${paragraph(`This partner has been moved to the archive. ${badge('Archived', 'neutral')}`)}
${detailTable([row('Partner Name', name), row('Reason', reason || 'No reason provided')])}`;
  return { subject, html: wrap(subject, body), text: subject };
}

// --- Tasks ---

export function taskCreated({ title, partner, priority, deadline }) {
  const subject = `New Task: ${title}`;
  const prioColor = (priority || '').toLowerCase() === 'high' ? 'error' : 'neutral';
  const body = `
${paragraph('A new task has been assigned.')}
${detailTable([
  row('Task', title),
  row('Partner', partner),
  row('Priority', priority ? `${badge(priority, prioColor)}` : ''),
  deadline ? row('Deadline', deadline) : '',
])}`;
  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('View Tasks', 'https://orchestratori.vercel.app/task-manager')
    ),
    text: subject,
  };
}

export function taskCompleted({ title, partner }) {
  const subject = `Completed: ${title}`;
  const body = `
${paragraph(`This task has been marked as done. ${badge('Completed', 'success')}`)}
${detailTable([row('Task', title), row('Partner', partner)])}`;
  return { subject, html: wrap(subject, body), text: subject };
}

export function taskDeleted({ title, partner }) {
  const subject = `Deleted Task: ${title}`;
  const body = `
${paragraph('The following task was removed from the system.')}
${detailTable([row('Task', title), row('Partner', partner)])}`;
  return { subject, html: wrap(subject, body), text: subject };
}

// --- Meetings ---

export function meetingCreated({ title, partner, channel, datetime }) {
  const subject = `Scheduled: ${title}`;
  const body = `
${paragraph('A new meeting has been scheduled.')}
${detailTable([
  row('Topic', title),
  row('Partner', partner),
  channel ? row('Channel', channel) : '',
  datetime ? row('Date & Time', new Date(datetime).toLocaleString()) : '',
])}`;
  return { subject, html: wrap(subject, body), text: subject };
}

export function meetingTranscribed({ title, partner, summary, actionItems }) {
  const subject = `Transcript Ready: ${title}`;
  const itemsList =
    Array.isArray(actionItems) && actionItems.length
      ? `<ul style="margin:0 0 16px 0;padding-left:20px;color:#24292F;">${actionItems
          .slice(0, 5)
          .map(
            (i) =>
              `<li style="font-size:14px;margin-bottom:4px;">${esc(typeof i === 'string' ? i : i.text || i.description || '')}</li>`
          )
          .join('')}</ul>`
      : '';

  const body = `
${paragraph(`Meeting processing is complete. ${badge('Transcribed', 'success')}`)}
${detailTable([
  row('Topic', title),
  row('Partner', partner),
  summary ? row('Summary', summary.length > 250 ? summary.slice(0, 250) + '...' : summary) : '',
])}
${itemsList ? `<h3 style="margin:24px 0 12px;font-size:14px;font-weight:600;color:#24292F;text-transform:uppercase;letter-spacing:0.04em;">Action Items</h3>${itemsList}` : ''}`;

  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('View Meeting Details', 'https://orchestratori.vercel.app/partners')
    ),
    text: subject,
  };
}

// --- Workflows ---

export function workflowCreated({ name }) {
  const subject = `New Workflow: ${name}`;
  const body = `
${paragraph('A new automation workflow has been created.')}
${detailTable([row('Workflow Name', name)])}`;
  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('View Workflow', 'https://orchestratori.vercel.app/workflow')
    ),
    text: subject,
  };
}

export function workflowUpdated({ name, changes }) {
  const subject = `Workflow Updated: ${name}`;
  const body = `
${paragraph('Workflow configuration has been modified.')}
${detailTable([row('Workflow', name), changes ? row('Changes', changes) : ''])}`;
  return { subject, html: wrap(subject, body), text: subject };
}

export function workflowDeleted({ name }) {
  const subject = `Workflow Deleted: ${name}`;
  const body = `
${paragraph('This workflow has been permanently removed.')}
${detailTable([row('Workflow', name)])}`;
  return { subject, html: wrap(subject, body), text: subject };
}

export function workflowToggled({ name, enabled }) {
  const status = enabled ? 'Enabled' : 'Disabled';
  const color = enabled ? 'success' : 'neutral';
  const subject = `Workflow ${status}: ${name}`;
  const body = `
${paragraph(`Workflow status changed to <strong>${status}</strong>. ${badge(status, color)}`)}
${detailTable([row('Workflow', name)])}`;
  return { subject, html: wrap(subject, body), text: subject };
}

// --- Partners (continued) ---

export function partnerPaymentReceived({ partner, amount, type, description }) {
  const subject = `Payment Recorded: ${partner || 'Partner'}`;
  const body = `
${paragraph(`A finance payment has been recorded. ${badge('Payment', 'success')}`)}
${detailTable([
  row('Partner', partner),
  row('Amount', amount ? `$${Number(amount).toFixed(2)}` : '—'),
  type ? row('Type', type) : '',
  description ? row('Description', description) : '',
])}`;
  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('View Partner', 'https://orchestratori.vercel.app/partners')
    ),
    text: subject,
  };
}

// --- Tasks (continued) ---

export function taskOverdue({ title, partner, deadline }) {
  const subject = `Overdue: ${title}`;
  const body = `
${paragraph(`This task has passed its deadline. ${badge('Overdue', 'error')}`)}
${detailTable([
  row('Task', title),
  row('Partner', partner),
  deadline ? row('Deadline', deadline) : '',
])}`;
  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('View Tasks', 'https://orchestratori.vercel.app/task-manager')
    ),
    text: subject,
  };
}

export function taskAssigned({ title, partner, assignedTo }) {
  const subject = `Assigned to you: ${title}`;
  const body = `
${paragraph('A task has been assigned to you.')}
${detailTable([row('Task', title), row('Partner', partner), row('Assigned To', assignedTo)])}`;
  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('View Tasks', 'https://orchestratori.vercel.app/task-manager')
    ),
    text: subject,
  };
}

// --- Projects ---

export function projectCreated({ name, partner, status }) {
  const subject = `New Project: ${name}`;
  const body = `
${paragraph('A new project has been initiated.')}
${detailTable([
  row('Project Name', name),
  row('Partner', partner),
  status ? row('Status', badge(status, 'primary')) : '',
])}`;
  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('View Projects', 'https://orchestratori.vercel.app/projects')
    ),
    text: subject,
  };
}

export function projectStatusChanged({ name, oldStatus, newStatus }) {
  const color =
    (newStatus || '').toLowerCase() === 'completed'
      ? 'success'
      : (newStatus || '').toLowerCase() === 'archived'
        ? 'neutral'
        : 'primary';
  const subject = `Project Status: ${name}`;
  const body = `
${paragraph(`Project status has changed. ${badge(newStatus || 'Updated', color)}`)}
${detailTable([
  row('Project', name),
  oldStatus ? row('Previous Status', oldStatus) : '',
  row('New Status', newStatus),
])}`;
  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('View Projects', 'https://orchestratori.vercel.app/projects')
    ),
    text: subject,
  };
}

export function projectDeleted({ name }) {
  const subject = `Project Deleted: ${name}`;
  const body = `
${paragraph('This project has been removed.')}
${detailTable([row('Project', name)])}`;
  return { subject, html: wrap(subject, body), text: subject };
}

export function projectLinked({ name, linkedType, linkedName }) {
  const subject = `Project Linked: ${name}`;
  const body = `
${paragraph(`A ${linkedType || 'resource'} has been linked to this project.`)}
${detailTable([row('Project', name), row('Linked', `${linkedType}: ${linkedName}`)])}`;
  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('View Projects', 'https://orchestratori.vercel.app/projects')
    ),
    text: subject,
  };
}

// --- Permissions ---

export function userInvited({ email, roleName, invitedBy }) {
  const subject = `User Invited: ${email}`;
  const body = `
${paragraph('A new user has been invited to the platform.')}
${detailTable([
  row('Email', email),
  roleName ? row('Role', roleName) : '',
  invitedBy ? row('Invited By', invitedBy) : '',
])}`;
  return {
    subject,
    html: wrap(subject, body, '', button('Manage Users', 'https://orchestratori.vercel.app/roles')),
    text: subject,
  };
}

export function userDeleted({ email, deletedBy }) {
  const subject = `User Removed: ${email}`;
  const body = `
${paragraph(`A user account has been permanently removed. ${badge('Deleted', 'error')}`)}
${detailTable([row('Email', email), deletedBy ? row('Removed By', deletedBy) : ''])}`;
  return {
    subject,
    html: wrap(subject, body, '', button('Manage Users', 'https://orchestratori.vercel.app/roles')),
    text: subject,
  };
}

export function roleCreated({ roleName, createdBy }) {
  const subject = `New Role: ${roleName}`;
  const body = `
${paragraph('A new role has been created in the permissions system.')}
${detailTable([row('Role Name', roleName), createdBy ? row('Created By', createdBy) : ''])}`;
  return {
    subject,
    html: wrap(subject, body, '', button('Manage Roles', 'https://orchestratori.vercel.app/roles')),
    text: subject,
  };
}

export function roleUpdated({ roleName, changes }) {
  const subject = `Role Updated: ${roleName}`;
  const body = `
${paragraph('Role permissions have been modified.')}
${detailTable([row('Role', roleName), changes ? row('Changes', changes) : ''])}`;
  return {
    subject,
    html: wrap(subject, body, '', button('Manage Roles', 'https://orchestratori.vercel.app/roles')),
    text: subject,
  };
}

// --- Data ---

export function githubPushCreated({ repo, branch, sha, message }) {
  const shortSha = sha ? String(sha).slice(0, 10) : '';
  const subject = `GitHub Push: ${repo || 'Repository updated'}`;
  const body = `
${paragraph('A new GitHub push has been recorded in Orchestrator.')}
${detailTable([
  row('Repository', repo),
  row('Branch', branch || 'main'),
  shortSha ? row('Commit SHA', shortSha) : '',
  message ? row('Message', message.length > 180 ? `${message.slice(0, 180)}...` : message) : '',
])}`;
  return { subject, html: wrap(subject, body), text: subject };
}

export function taskAssignedToPush({ task, pushId }) {
  const subject = `Task Linked to Push: ${task || 'Task assigned'}`;
  const body = `
${paragraph('A task has been linked to a GitHub push for execution tracking.')}
${detailTable([row('Task', task), row('Push ID', pushId)])}`;
  return { subject, html: wrap(subject, body), text: subject };
}

// --- Reports ---

export function reportGenerated({ reportName, reportType, computedAt }) {
  const subject = `Report Ready: ${reportName || reportType || 'Report'}`;
  const body = `
${paragraph(`A report has been generated. ${badge('Ready', 'success')}`)}
${detailTable([
  row('Report', reportName || reportType),
  reportType ? row('Type', reportType) : '',
  computedAt ? row('Generated At', computedAt) : '',
])}`;
  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('View Reports', 'https://orchestratori.vercel.app/reports')
    ),
    text: subject,
  };
}

export function reportExported({ reportName, format }) {
  const subject = `Report Exported: ${reportName || 'Report'}`;
  const body = `
${paragraph('A report has been exported for download.')}
${detailTable([row('Report', reportName), row('Format', (format || 'PDF').toUpperCase())])}`;
  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('View Reports', 'https://orchestratori.vercel.app/reports')
    ),
    text: subject,
  };
}

export function reportIngested({ token, receivedKeys, source }) {
  const subject = 'Report Data Ingested';
  const body = `
${paragraph('External data has been received via the Report Ingest API.')}
${detailTable([
  token ? row('Session Token', String(token).slice(0, 12) + '...') : '',
  receivedKeys
    ? row('Data Keys', Array.isArray(receivedKeys) ? receivedKeys.join(', ') : String(receivedKeys))
    : '',
  source ? row('Source', source) : '',
])}`;
  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('View Report Builder', 'https://orchestratori.vercel.app/reports/builder')
    ),
    text: subject,
  };
}

// --- Security ---

export function loginWarning({ email, attemptCount, ipAddress, timestamp }) {
  const subject = 'Security Alert: Unusual Login Activity';
  const body = `
${paragraph(`We detected multiple unsuccessful login attempts on your account. ${badge('Warning', 'warning')}`)}
${paragraph('If this was you, please ensure you are using the correct credentials. If you did not make these attempts, we recommend changing your password immediately.')}
${detailTable([
  row('Account', email),
  row('Failed Attempts', attemptCount || 3),
  ipAddress ? row('IP Address', ipAddress) : '',
  timestamp ? row('Time', new Date(timestamp).toLocaleString()) : '',
])}
<div style="margin-top:24px;background-color:#FFF8C5;border:1px solid rgba(27,31,36,0.15);border-radius:6px;padding:16px;">
  <p style="margin:0;font-size:13px;color:#24292F;"><strong>Security Tip:</strong> If you did not attempt to log in, change your password and review your account activity immediately.</p>
</div>`;
  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('Review Security Settings', 'https://orchestratori.vercel.app/settings')
    ),
    text: subject,
  };
}

export function loginFrozen({ email, attemptCount, duration, ipAddress, timestamp }) {
  const subject = 'Security Alert: Account Temporarily Restricted';
  const body = `
${paragraph(`Due to ${attemptCount || 13} unsuccessful login attempts, your account has been temporarily restricted. ${badge('Restricted', 'error')}`)}
${paragraph(`Access will be automatically restored after ${duration || '60 minutes'}. No action is needed if you recognize this activity.`)}
${detailTable([
  row('Account', email),
  row('Failed Attempts', attemptCount || 13),
  row('Restriction Duration', duration || '60 minutes'),
  ipAddress ? row('IP Address', ipAddress) : '',
  timestamp ? row('Time', new Date(timestamp).toLocaleString()) : '',
])}
<div style="margin-top:24px;background-color:#FEE2E2;border:1px solid #FECACA;border-radius:6px;padding:16px;">
  <p style="margin:0;font-size:13px;color:#991B1B;"><strong>Important:</strong> If you did not make these attempts, please contact support immediately as someone may be trying to access your account.</p>
</div>`;
  return {
    subject,
    html: wrap(subject, body),
    text: subject,
  };
}

export function loginBlocked({ email, attemptCount, ipAddress, timestamp }) {
  const subject = 'Security Alert: Account Blocked';
  const body = `
${paragraph(`Your account has been permanently blocked due to ${attemptCount || 16} unsuccessful login attempts. ${badge('Blocked', 'error')}`)}
${paragraph('This action was taken automatically by our security system to protect your account. Your account now requires manual review to regain access.')}
${detailTable([
  row('Account', email),
  row('Total Failed Attempts', attemptCount || 16),
  ipAddress ? row('IP Address', ipAddress) : '',
  timestamp ? row('Time', new Date(timestamp).toLocaleString()) : '',
])}
<div style="margin-top:24px;background-color:#FEE2E2;border:1px solid #DC2626;border-radius:6px;padding:16px;">
  <p style="margin:0;font-size:13px;color:#7F1D1D;"><strong>Account Locked:</strong> Your account requires manual review. Please contact support to verify your identity and restore access.</p>
</div>`;
  return {
    subject,
    html: wrap(subject, body),
    text: subject,
  };
}

export function passwordChanged() {
  const subject = 'Security Alert: Password Changed';
  const body = `
${paragraph('Your account password was recently changed. If you made this change, no further action is required.')}
${paragraph('If you did NOT make this change, please secure your account immediately.')}
<div style="margin-top:24px;background-color:#FFF8C5;border:1px solid rgba(27,31,36,0.15);border-radius:6px;padding:16px;">
  <p style="margin:0;font-size:13px;color:#24292F;"><strong>Security Tip:</strong> Review your active sessions and sign-in methods in Settings.</p>
</div>`;
  return {
    subject,
    html: wrap(
      subject,
      body,
      '',
      button('Review Security Settings', 'https://orchestratori.vercel.app/settings')
    ),
    text: subject,
  };
}

/* ------------------------------------------------------------------ */
/*  Registry                                                           */
/* ------------------------------------------------------------------ */

/**
 * Generic fallback used for catalog actions that don't have a bespoke template
 * yet. Subject is the catalog action label; body is a short summary of the
 * provided data, so every subscribed action can still deliver an email.
 */
export function genericNotificationTemplate(actionKey, data = {}) {
  const label = getActionLabel(actionKey) || 'Notification';
  const entries = Object.entries(data || {})
    .filter(([, v]) => v != null && typeof v !== 'object')
    .slice(0, 6);
  const detailHtml = entries.length
    ? `<table role="presentation" style="margin-top:8px;font-size:14px;color:#334155;">${entries
        .map(
          ([k, v]) =>
            `<tr><td style="padding:2px 12px 2px 0;color:#64748b;">${esc(k)}</td><td style="padding:2px 0;">${esc(v)}</td></tr>`
        )
        .join('')}</table>`
    : '';
  const body = `<p style="margin:0 0 8px;font-size:15px;color:#334155;">${esc(label)}.</p>${detailHtml}`;
  const textDetail = entries.map(([k, v]) => `${k}: ${v}`).join('\n');
  return {
    subject: label,
    html: wrap(label, body),
    text: `${label}\n${textDetail}`.trim(),
  };
}

export const TEMPLATE_MAP = {
  // Partners
  partner_created: partnerCreated,
  partner_updated: partnerUpdated,
  partner_archived: partnerArchived,
  partner_payment_received: partnerPaymentReceived,
  meeting_created: meetingCreated,
  meeting_transcribed: meetingTranscribed,
  // Task Manager
  task_created: taskCreated,
  task_completed: taskCompleted,
  task_overdue: taskOverdue,
  task_assigned: taskAssigned,
  task_deleted: taskDeleted,
  // Workflow
  workflow_created: workflowCreated,
  workflow_updated: workflowUpdated,
  workflow_toggled: workflowToggled,
  workflow_deleted: workflowDeleted,
  // Projects
  project_created: projectCreated,
  project_status_changed: projectStatusChanged,
  project_deleted: projectDeleted,
  project_linked: projectLinked,
  // Permissions
  user_invited: userInvited,
  user_deleted: userDeleted,
  role_created: roleCreated,
  role_updated: roleUpdated,
  // Data
  github_push_created: githubPushCreated,
  task_assigned_to_push: taskAssignedToPush,
  // Reports
  report_generated: reportGenerated,
  report_exported: reportExported,
  report_ingested: reportIngested,
  // Security
  password_changed: passwordChanged,
  login_warning: loginWarning,
  login_frozen: loginFrozen,
  login_blocked: loginBlocked,
  // Legacy key for stored preferences
  project_updated: projectStatusChanged,
};
