import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() }, from: vi.fn() },
  hasSupabase: vi.fn(() => false),
}));

import { supabase, hasSupabase } from '../lib/supabase';
import {
  buildAgentKpis,
  buildGoalStages,
  buildModuleDigest,
  fetchReportSnapshot,
  clearSnapshotCache,
  ReportApiError,
} from './reportService';

describe('fetchReportSnapshot auth + fallback', () => {
  beforeEach(() => {
    clearSnapshotCache();
    hasSupabase.mockReturnValue(true);
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok-123' } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sends the Supabase bearer token and returns the server payload on 200', async () => {
    const payload = { reportType: 'tpl-finance-growth', source: 'server', kpis: [] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal('fetch', fetchMock);

    const data = await fetchReportSnapshot('tpl-finance-growth', {}, true);

    expect(data).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer tok-123');
  });

  it('throws a ReportApiError on 401 instead of silently falling back', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchReportSnapshot('tpl-finance-growth', {}, true)).rejects.toBeInstanceOf(
      ReportApiError
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to client-side aggregation only on a network error', async () => {
    hasSupabase.mockReturnValue(false); // skip supabase reads in the fallback path
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const data = await fetchReportSnapshot('tpl-finance-growth', {}, true);

    expect(data.source).toBe('client');
    expect(data.reportType).toBe('tpl-finance-growth');
    expect(Array.isArray(data.kpis)).toBe(true);
  });
});

describe('buildAgentKpis', () => {
  it('returns zeroed stats for empty input', () => {
    const stats = buildAgentKpis([]);
    expect(stats.total).toBe(0);
    expect(stats.successRate).toBe(0);
    expect(stats.avgDuration).toBe(0);
    expect(stats.topAgent).toBe('-');
  });

  it('counts successes and failures across agents', () => {
    const today = new Date().toISOString();
    const stats = buildAgentKpis([
      { agent_name: 'alpha', status: 'completed', duration_ms: 2000, created_at: today },
      { agent_name: 'alpha', status: 'failed', duration_ms: 1000, created_at: today },
      { agent_name: 'beta', status: 'completed', duration_ms: 3000, created_at: today },
    ]);
    expect(stats.total).toBe(3);
    expect(stats.completed).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.runToday).toBe(3);
    expect(stats.avgDuration).toBeCloseTo(2);
    expect(stats.successRate).toBeCloseTo((2 / 3) * 100);
    const alpha = stats.byAgent.find((a) => a.name === 'alpha');
    expect(alpha.jobs).toBe(2);
    expect(alpha.succeeded).toBe(1);
    expect(alpha.failed).toBe(1);
  });
});

describe('buildGoalStages', () => {
  it('returns all five stages even when input is empty', () => {
    const stages = buildGoalStages([]);
    expect(stages.map((s) => s.stage)).toEqual([
      'Intake',
      'Planning',
      'Execution',
      'Qa',
      'Complete',
    ]);
    stages.forEach((s) => expect(s.count).toBe(0));
  });

  it('buckets goals by stage substring', () => {
    const stages = buildGoalStages([
      { stage: 'planning' },
      { stage: 'execution' },
      { status: 'qa-review' },
      { status: 'complete' },
      { stage: 'intake' },
      { stage: 'planning-deep' },
    ]);
    const byStage = Object.fromEntries(stages.map((s) => [s.stage, s.count]));
    expect(byStage.Planning).toBe(2);
    expect(byStage.Execution).toBe(1);
    expect(byStage.Qa).toBe(1);
    expect(byStage.Complete).toBe(1);
    expect(byStage.Intake).toBe(1);
  });
});

describe('buildModuleDigest', () => {
  it('returns one row per module with the right counts', () => {
    const digest = buildModuleDigest({
      agentJobs: [{}, {}],
      goals: [{}],
      kbDocs: [{}, {}, {}],
      partners: [{}],
      deliverableVersions: [{}, {}, {}, {}],
      dashboards: [],
    });
    const map = Object.fromEntries(digest.map((d) => [d.module, d.value]));
    expect(map.Agents).toBe(2);
    expect(map.Goals).toBe(1);
    expect(map.Knowledge).toBe(3);
    expect(map.Partners).toBe(1);
    expect(map.Quality).toBe(4);
    expect(map.Dashboards).toBe(0);
  });
});
