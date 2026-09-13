/**
 * [module: agent-core]
 * Catalog assertions for the Platform Copilot expansion — the new Phase 6 tools
 * must exist with the right risk classification and read/mutation split.
 */
import { describe, it, expect } from 'vitest';
import { TOOL_CATALOG, RISK_LEVELS, READ_TOOLS, getRiskLevel, isReadTool } from './assistant-chat.js';

const names = new Set(TOOL_CATALOG.map((t) => t.name));

describe('copilot tool catalog', () => {
  it('includes the new Phase 6 read tools', () => {
    for (const t of ['pulse.list', 'loop.list', 'goal.get', 'goal.nextSteps', 'task.overdue', 'task.today', 'workflow.executions', 'agent.listByStatus', 'concilium.analytics', 'org.kpis', 'usage.topSpenders', 'activity.feed', 'insights.overview']) {
      expect(names.has(t)).toBe(true);
      expect(getRiskLevel(t)).toBe('safe');
      expect(isReadTool(t)).toBe(true);
    }
  });

  it('classifies the new mutations by risk and keeps them out of READ_TOOLS', () => {
    expect(getRiskLevel('pulse.fireNow')).toBe('medium');
    expect(getRiskLevel('goal.pause')).toBe('medium');
    expect(getRiskLevel('goal.updateBudget')).toBe('medium');
    expect(getRiskLevel('workflow.retry')).toBe('medium');
    expect(getRiskLevel('goal.cancel')).toBe('high');
    for (const t of ['pulse.fireNow', 'goal.pause', 'goal.cancel', 'workflow.retry']) {
      expect(isReadTool(t)).toBe(false);
      expect(READ_TOOLS.has(t)).toBe(false);
    }
  });

  it('exposes the save-to-KB actions as confirmable mutations', () => {
    for (const t of ['insights.save', 'brief.generate']) {
      expect(names.has(t)).toBe(true);
      expect(getRiskLevel(t)).toBe('medium');
      expect(isReadTool(t)).toBe(false);
    }
  });

  it('does not auto-run safe-but-writing tools (note/todo create)', () => {
    // These are "safe" for confirmation gating but must never be auto-executed by the loop.
    expect(getRiskLevel('note.create')).toBe('safe');
    expect(isReadTool('note.create')).toBe(false);
    expect(isReadTool('todo.create')).toBe(false);
  });

  it('every READ_TOOLS entry exists in the catalog and is safe', () => {
    for (const t of READ_TOOLS) {
      expect(names.has(t)).toBe(true);
      expect(getRiskLevel(t)).toBe('safe');
    }
  });
});
