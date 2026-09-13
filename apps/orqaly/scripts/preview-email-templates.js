/**
 * Preview all email notification templates (2026 design).
 * Uses templates from src/services/emailTemplates.js.
 *
 * Generates one HTML file per template in /tmp/email-previews/
 * and opens the index in the default browser.
 *
 * Usage:  node scripts/preview-email-templates.js
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dynamic import so path resolves from script location
const {
  partnerCreated,
  partnerUpdated,
  partnerArchived,
  partnerPaymentReceived,
  meetingCreated,
  meetingTranscribed,
  taskCreated,
  taskCompleted,
  taskOverdue,
  taskAssigned,
  taskDeleted,
  workflowCreated,
  workflowUpdated,
  workflowToggled,
  workflowDeleted,
  projectCreated,
  projectStatusChanged,
  projectDeleted,
  projectLinked,
  userInvited,
  userDeleted,
  roleCreated,
  roleUpdated,
  githubPushCreated,
  taskAssignedToPush,
  reportGenerated,
  reportExported,
  reportIngested,
  passwordChanged,
} = await import('../src/services/emailTemplates.js');

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const previews = [
  { name: '01-partner-created', get: () => partnerCreated({ name: 'Acme Digital', funnelStatus: 'Active', group: 'Premium Partners', notes: 'High-priority onboarding. Focus on LATAM markets.' }) },
  { name: '02-partner-updated', get: () => partnerUpdated({ name: 'Acme Digital', changedFields: 'funnelStatus, trafficSources, notes' }) },
  { name: '03-partner-archived', get: () => partnerArchived({ name: 'BetaStream LLC', reason: 'Inactive for 6+ months.' }) },
  { name: '04-partner-payment', get: () => partnerPaymentReceived({ partner: 'Acme Digital', amount: 1250, type: 'CPA', description: 'Q1 bonus' }) },
  { name: '05-meeting-created', get: () => meetingCreated({ title: 'Weekly sync — Acme Digital', partner: 'Acme Digital', channel: 'Google Meet', datetime: '2026-02-20T14:00:00Z' }) },
  { name: '06-meeting-transcribed', get: () => meetingTranscribed({ title: 'Weekly sync — Acme Digital', partner: 'Acme Digital', summary: 'Discussed Q1 performance, agreed to expand LATAM.', actionItems: ['Follow up on traffic sources', 'Send rate card', 'Schedule creative review'] }) },
  { name: '07-task-created', get: () => taskCreated({ title: 'Review Q1 campaign metrics', partner: 'Acme Digital', priority: 'High', deadline: '2026-03-01' }) },
  { name: '08-task-completed', get: () => taskCompleted({ title: 'Set up tracking pixels', partner: 'Acme Digital' }) },
  { name: '09-task-overdue', get: () => taskOverdue({ title: 'Submit creative assets', partner: 'Acme Digital', deadline: '2026-02-15' }) },
  { name: '10-task-assigned', get: () => taskAssigned({ title: 'Review contract', partner: 'Acme Digital', assignedTo: 'you@company.com' }) },
  { name: '11-task-deleted', get: () => taskDeleted({ title: 'Old onboarding checklist', partner: 'BetaStream LLC' }) },
  { name: '12-workflow-created', get: () => workflowCreated({ name: 'LATAM Onboarding Flow' }) },
  { name: '13-workflow-updated', get: () => workflowUpdated({ name: 'LATAM Onboarding Flow', changes: 'actions, trafficSources' }) },
  { name: '14-workflow-toggled-on', get: () => workflowToggled({ name: 'LATAM Onboarding Flow', enabled: true }) },
  { name: '15-workflow-toggled-off', get: () => workflowToggled({ name: 'Legacy EU Pipeline', enabled: false }) },
  { name: '16-workflow-deleted', get: () => workflowDeleted({ name: 'Legacy EU Pipeline' }) },
  { name: '17-project-created', get: () => projectCreated({ name: 'Q1 LATAM Expansion', partner: 'Acme Digital', status: 'Active' }) },
  { name: '18-project-status-changed', get: () => projectStatusChanged({ name: 'Q1 LATAM Expansion', oldStatus: 'Active', newStatus: 'Completed' }) },
  { name: '19-project-deleted', get: () => projectDeleted({ name: 'Old Test Project' }) },
  { name: '20-project-linked', get: () => projectLinked({ name: 'Q1 LATAM Expansion', linkedType: 'Partner', linkedName: 'Acme Digital' }) },
  { name: '21-user-invited', get: () => userInvited({ email: 'newuser@company.com', roleName: 'Editor', invitedBy: 'admin@company.com' }) },
  { name: '22-user-deleted', get: () => userDeleted({ email: 'former@company.com', deletedBy: 'admin@company.com' }) },
  { name: '23-role-created', get: () => roleCreated({ roleName: 'Campaign Manager', createdBy: 'admin@company.com' }) },
  { name: '24-role-updated', get: () => roleUpdated({ roleName: 'Editor', changes: 'permissions' }) },
  { name: '25-github-push', get: () => githubPushCreated({ repo: 'acme/web', branch: 'main', sha: 'a1b2c3d4e5', message: 'feat: add reporting API' }) },
  { name: '26-task-assigned-to-push', get: () => taskAssignedToPush({ task: 'Deploy to staging', pushId: 'push_abc123' }) },
  { name: '27-report-generated', get: () => reportGenerated({ reportName: 'Q1 Performance', reportType: 'Summary', computedAt: new Date().toISOString() }) },
  { name: '28-report-exported', get: () => reportExported({ reportName: 'Q1 Performance', format: 'PDF' }) },
  { name: '29-report-ingested', get: () => reportIngested({ token: 'sess_abc123xyz', receivedKeys: ['revenue', 'conversions'], source: 'API' }) },
  { name: '30-password-changed', get: () => passwordChanged() },
];

const outDir = join(__dirname, '../tmp/email-previews');
mkdirSync(outDir, { recursive: true });

const indexLinks = [];
for (const p of previews) {
  const { subject, html } = p.get();
  const filePath = join(outDir, `${p.name}.html`);
  writeFileSync(filePath, html, 'utf-8');
  indexLinks.push(`<li style="margin-bottom:8px;"><a href="${p.name}.html" style="color:#0f172a;font-weight:600;text-decoration:none;">${esc(subject)}</a></li>`);
  console.log(`  ✓ ${p.name}.html`);
}

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email Template Previews — 2026</title></head>
<body style="margin:0;padding:40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#0f172a;">Email Template Previews</h1>
<p style="margin:0 0 24px;color:#64748b;font-size:14px;">${previews.length} templates — 2026 design. Click to open.</p>
<ol style="padding-left:20px;line-height:2;">${indexLinks.join('\n')}</ol>
</div>
</body>
</html>`;

const indexPath = join(outDir, 'index.html');
writeFileSync(indexPath, indexHtml, 'utf-8');

console.log(`\n  Generated ${previews.length} templates in ${outDir}/`);
console.log('  Opening index...\n');

try {
  execSync(`open "${indexPath}"`);
} catch {
  console.log(`  Open manually: ${indexPath}`);
}
