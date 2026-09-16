import { describe, it, expect } from 'vitest';
import {
  buildExecutiveSummary,
  buildInsights,
  buildRecommendations,
  buildHeadline,
  collectAlerts,
} from './insights';

const template = {
  name: 'Finance & Growth',
  category: 'finance',
  description: 'Revenue and ROI snapshot.',
};

describe('buildHeadline', () => {
  it('returns the biggest mover when deltas are present', () => {
    const headline = buildHeadline(
      {
        kpis: [
          { label: 'Revenue', value: 100, format: 'currency', change: 12.5 },
          { label: 'Spend', value: 50, format: 'currency', change: -4 },
        ],
      },
      template
    );
    expect(headline).toMatch(/Revenue/);
    expect(headline).toMatch(/12\.5%/);
  });

  it('falls back to first KPI value when no deltas', () => {
    const headline = buildHeadline(
      { kpis: [{ label: 'Goals', value: 4, format: 'number' }] },
      template
    );
    expect(headline).toBe('Goals: 4');
  });

  it('falls back to template name when no KPIs', () => {
    expect(buildHeadline({}, template)).toBe('Finance & Growth');
  });
});

describe('buildExecutiveSummary', () => {
  it('describes movers and surfaces alerts', () => {
    const summary = buildExecutiveSummary(
      {
        kpis: [
          { label: 'Revenue', value: 100, format: 'currency', change: 25 },
          { label: 'Spend', value: 80, format: 'currency', change: 10 },
        ],
        alerts: [
          { severity: 'error', title: 'API timeout' },
          { severity: 'warning', title: 'Retries above norm' },
        ],
      },
      template
    );
    expect(summary).toMatch(/Revenue/);
    expect(summary).toMatch(/Spend/);
    expect(summary).toMatch(/critical/);
  });

  it('handles empty snapshots gracefully', () => {
    expect(buildExecutiveSummary({}, template)).toMatch(/No critical alerts/);
  });
});

describe('buildInsights', () => {
  it('surfaces concentration risk when one partner dominates', () => {
    const insights = buildInsights(
      {
        kpis: [],
        partnerLeaderboard: [
          { name: 'Acme', revenue: 800 },
          { name: 'Beta', revenue: 200 },
        ],
      },
      template
    );
    expect(insights.some((i) => /Acme/.test(i))).toBe(true);
  });

  it('flags goal funnel drop-offs over 30%', () => {
    const insights = buildInsights(
      {
        goalStageFunnel: [
          { stage: 'Intake', count: 100 },
          { stage: 'Planning', count: 30 }, // 70% drop
          { stage: 'Execution', count: 25 },
        ],
      },
      { name: 'Goal Health', category: 'goals' }
    );
    expect(insights.some((i) => /Intake/.test(i) && /Planning/.test(i))).toBe(true);
  });

  it('mentions low-performing agents', () => {
    const insights = buildInsights(
      {
        agentLeaderboard: [
          { name: 'alpha', jobs: 10, successRate: 60 },
          { name: 'beta', jobs: 10, successRate: 95 },
        ],
      },
      { name: 'Agents', category: 'agents' }
    );
    expect(insights.some((i) => /alpha/.test(i) && /70%/.test(i))).toBe(true);
  });

  it('always returns at least one insight', () => {
    const insights = buildInsights({}, template);
    expect(insights.length).toBeGreaterThan(0);
  });
});

describe('buildRecommendations', () => {
  it('recommends stabilising declines', () => {
    const recs = buildRecommendations(
      {
        kpis: [
          { label: 'Revenue', value: 100, change: -15 },
          { label: 'Spend', value: 80, change: -5 },
        ],
      },
      template
    );
    expect(recs.some((r) => /Stabilise/.test(r))).toBe(true);
  });

  it('returns a non-empty list even with no signal', () => {
    expect(buildRecommendations({}, template).length).toBeGreaterThan(0);
  });
});

describe('collectAlerts', () => {
  it('merges per-module alert buckets and dedupes by title', () => {
    const all = collectAlerts({
      alerts: [{ severity: 'error', title: 'API down' }],
      agentAlerts: [{ severity: 'warning', title: 'Slow agent' }],
      goalAlerts: [{ severity: 'error', title: 'API down' }], // duplicate
    });
    expect(all).toHaveLength(2);
  });

  it('returns an empty array when none are present', () => {
    expect(collectAlerts({})).toEqual([]);
  });
});
