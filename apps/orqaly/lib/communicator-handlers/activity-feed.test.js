/**
 * Tests for groupByActionSignature — M8 cross-goal notification grouping.
 *
 * Motivation: when five goals all block on "Stripe key missing", the user
 * should see one grouped nudge with occurrences=5 and a goalIds list, not
 * five identical rows competing for attention in the activity feed.
 */
import { describe, it, expect } from 'vitest';
import { groupByActionSignature, __testing } from './activity-feed.js';

const mk = ({ id, severity, actionType, target, goalId, ts, title }) => ({
  id,
  severity,
  title: title || `Event ${id}`,
  body: '',
  timestamp: ts || new Date().toISOString(),
  goalId: goalId || null,
  action: actionType ? { type: actionType, target_url: target, label: 'Resolve' } : null,
  source: 'notification_log',
});

describe('groupByActionSignature', () => {
  it('returns the input unchanged when no needs_action events are present', () => {
    const events = [
      mk({ id: 'a', severity: 'info' }),
      mk({ id: 'b', severity: 'success' }),
    ];
    const grouped = groupByActionSignature(events);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].occurrences).toBeUndefined();
  });

  it('collapses same-signature needs_action events within 24h into one row', () => {
    const t = (h) => new Date(Date.now() - h * 3600_000).toISOString();
    const events = [
      mk({ id: 'a', severity: 'needs_action', actionType: 'configure_tools', target: '/agent-hub?tab=tools', goalId: 'g1', ts: t(1) }),
      mk({ id: 'b', severity: 'needs_action', actionType: 'configure_tools', target: '/agent-hub?tab=tools', goalId: 'g2', ts: t(2) }),
      mk({ id: 'c', severity: 'needs_action', actionType: 'configure_tools', target: '/agent-hub?tab=tools', goalId: 'g3', ts: t(3) }),
    ];
    const grouped = groupByActionSignature(events);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].occurrences).toBe(3);
    expect(grouped[0].goalIds).toEqual(expect.arrayContaining(['g1', 'g2', 'g3']));
  });

  it('keeps events older than 24h ungrouped (time window scope)', () => {
    const t = (h) => new Date(Date.now() - h * 3600_000).toISOString();
    const events = [
      mk({ id: 'a', severity: 'needs_action', actionType: 'configure_tools', target: '/x', goalId: 'g1', ts: t(1) }),
      mk({ id: 'b', severity: 'needs_action', actionType: 'configure_tools', target: '/x', goalId: 'g2', ts: t(25) }),
    ];
    const grouped = groupByActionSignature(events);
    expect(grouped).toHaveLength(2);
    expect(grouped.every((e) => !e.occurrences)).toBe(true);
  });

  it('does not merge different action signatures', () => {
    const events = [
      mk({ id: 'a', severity: 'needs_action', actionType: 'configure_tools', target: '/tools' }),
      mk({ id: 'b', severity: 'needs_action', actionType: 'raise_pulse_cap', target: '/pulse' }),
    ];
    const grouped = groupByActionSignature(events);
    expect(grouped).toHaveLength(2);
  });

  it('preserves the newest event as the group representative', () => {
    const t = (h) => new Date(Date.now() - h * 3600_000).toISOString();
    const events = [
      mk({ id: 'old',  severity: 'needs_action', actionType: 'configure_tools', target: '/t', goalId: 'g1', ts: t(5) }),
      mk({ id: 'new',  severity: 'needs_action', actionType: 'configure_tools', target: '/t', goalId: 'g2', ts: t(1) }),
    ];
    const grouped = groupByActionSignature(events);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].id).toBe('new');
    expect(grouped[0].occurrences).toBe(2);
  });
});

describe('normalize communication_log', () => {
  it('carries sender + context fields for the Home chat block', () => {
    const evt = __testing.normalize('communication_log', {
      id: 'm1',
      created_at: '2026-06-20T09:30:00Z',
      sender_id: 'a1',
      sender_name: 'Support Agent',
      sender_type: 'agent',
      content: 'Resolved 32 live chats.',
      context_type: 'organization',
      context_id: 'org-1',
      context_label: 'Acme Holding',
      platform: 'internal',
    }, { goalTitles: {}, agentNames: {} });

    expect(evt).toMatchObject({
      source: 'communication_log',
      actor: 'a1',
      senderName: 'Support Agent',
      senderType: 'agent',
      contextType: 'organization',
      contextId: 'org-1',
      contextLabel: 'Acme Holding',
      platform: 'internal',
      body: 'Resolved 32 live chats.',
    });
  });
});
