/**
 * Pure derivation of proactive copilot suggestions from live signals.
 *
 * buildSuggestions({ homeSummary, activityFeed }) -> [{ id, severity, title, detail, actions:[{ label, kind, payload }] }]
 *   kind: 'navigate' (route) | 'prefill' (seed the input) | 'propose' (send a directive to the copilot)
 *
 * No network here — the caller supplies already-fetched signals so this stays
 * trivially unit-testable.
 */

function countFailedWorkflows(activityFeed) {
  if (!Array.isArray(activityFeed)) return 0;
  return activityFeed.filter(
    (e) => e && (e.severity === 'error' || /fail|error/i.test(e.action || e.title || ''))
  ).length;
}

export function buildSuggestions({ homeSummary, activityFeed } = {}) {
  const s = homeSummary || {};
  const out = [];

  const overdue = Number(s.tasksOverdue ?? s.overdueTasks ?? 0);
  if (overdue > 0) {
    out.push({
      id: 'overdue-tasks',
      severity: 'warning',
      title: `${overdue} overdue task${overdue === 1 ? '' : 's'}`,
      detail: 'Past their deadline and not done.',
      actions: [
        { label: 'View', kind: 'navigate', payload: { route: '/task-manager' } },
        { label: 'Reschedule', kind: 'prefill', payload: { text: 'Reschedule my overdue tasks to next week.' } },
        { label: 'Assign', kind: 'prefill', payload: { text: 'Assign my overdue tasks to an available agent.' } },
      ],
    });
  }

  const failed = countFailedWorkflows(activityFeed) || Number(s.workflowsFailed ?? 0);
  if (failed >= 3) {
    out.push({
      id: 'failed-workflows',
      severity: 'error',
      title: `Workflow failed ${failed} times`,
      detail: 'A workflow keeps failing.',
      actions: [
        { label: 'Retry', kind: 'propose', payload: { text: 'Retry the workflow that keeps failing.' } },
        { label: 'Inspect', kind: 'navigate', payload: { route: '/workflow' } },
        { label: 'Logs', kind: 'prefill', payload: { text: 'Show the recent errors for my failing workflow.' } },
      ],
    });
  }

  const pending = Number(s.pendingApprovals ?? s.tasksWaitingApproval ?? 0);
  if (pending > 0) {
    out.push({
      id: 'pending-approvals',
      severity: 'info',
      title: `${pending} waiting for approval`,
      detail: 'Items need your sign-off.',
      actions: [
        { label: 'Review', kind: 'prefill', payload: { text: 'Show everything waiting for my approval.' } },
      ],
    });
  }

  const ownerless = Number(s.goalsWithoutOwner ?? 0);
  if (ownerless > 0) {
    out.push({
      id: 'ownerless-goals',
      severity: 'warning',
      title: `${ownerless} goal${ownerless === 1 ? '' : 's'} without an owner`,
      detail: 'No one is accountable yet.',
      actions: [
        { label: 'Assign owner', kind: 'prefill', payload: { text: 'Assign an owner to my goals that have none.' } },
      ],
    });
  }

  return out;
}

export default buildSuggestions;
