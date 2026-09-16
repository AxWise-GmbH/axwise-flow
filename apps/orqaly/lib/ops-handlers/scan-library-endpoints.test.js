/**
 * Tests for the weekly VT re-scan cron.
 * Mocks Supabase admin + scanUrl + catalog lookup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runScan } from './scan-library-endpoints.js';

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader() { return this; },
  };
}

function makeAdmin(initialRows) {
  const rows = initialRows.map((r) => ({ ...r }));

  function chain(table) {
    const state = { table, filters: {}, updateRow: null };
    const self = {
      select: () => self,
      eq: (col, val) => { state.filters[col] = val; return self; },
      neq: (col, val) => { state.filters[`${col}__neq`] = val; return self; },
      update: (row) => { state.updateRow = row; return self; },
      then: (onResolve) => {
        if (state.updateRow) {
          for (const r of rows) {
            if (matches(r, state.filters)) Object.assign(r, state.updateRow);
          }
          return Promise.resolve({ error: null }).then(onResolve);
        }
        return Promise.resolve({ data: rows.filter((r) => matches(r, state.filters)), error: null }).then(onResolve);
      },
    };
    return self;
  }
  function matches(r, filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (k.endsWith('__neq')) {
        if (r[k.slice(0, -5)] === v) return false;
      } else if (r[k] !== v) return false;
    }
    return true;
  }
  return { from: vi.fn((t) => chain(t)), _rows: rows };
}

const lookup = (id) => ({
  'mcp-github': { id: 'mcp-github', endpointUrl: 'https://api.github.com' },
  'mcp-stripe': { id: 'mcp-stripe', endpointUrl: 'https://api.stripe.com' },
  'mcp-no-url': { id: 'mcp-no-url' /* no endpointUrl */ },
}[id] || null);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runScan', () => {
  it('flips status to vt_warn when verdict is warn', async () => {
    const admin = makeAdmin([
      { id: 'r1', tool_id: 'mcp-github', status: 'active', vt_last_scan: null },
    ]);
    const scan = vi.fn().mockResolvedValue({ verdict: 'warn', harmless: 50, malicious: 0, suspicious: 3, scanned_at: 'x', url: 'https://api.github.com' });

    const res = mockRes();
    const out = await runScan(admin, {}, res, { scan, lookup });

    expect(res.statusCode).toBe(200);
    expect(out.body.scanned).toBe(1);
    expect(out.body.rowsUpdated).toBe(1);
    expect(out.body.rowsDegraded).toBe(1);
    expect(admin._rows[0].status).toBe('vt_warn');
    expect(admin._rows[0].vt_last_scan).toMatchObject({ verdict: 'warn' });
  });

  it('keeps status active and writes vt_last_scan when verdict is clean', async () => {
    const admin = makeAdmin([
      { id: 'r1', tool_id: 'mcp-github', status: 'active', vt_last_scan: null },
    ]);
    const scan = vi.fn().mockResolvedValue({ verdict: 'clean', harmless: 78, malicious: 0, suspicious: 0, scanned_at: 'x', url: 'x' });

    const res = mockRes();
    await runScan(admin, {}, res, { scan, lookup });

    expect(admin._rows[0].status).toBe('active');
    expect(admin._rows[0].vt_last_scan.verdict).toBe('clean');
  });

  it('un-degrades vt_warn → active when next verdict is clean', async () => {
    const admin = makeAdmin([
      { id: 'r1', tool_id: 'mcp-github', status: 'vt_warn', vt_last_scan: { verdict: 'warn' } },
    ]);
    const scan = vi.fn().mockResolvedValue({ verdict: 'clean', harmless: 80, malicious: 0, suspicious: 0, scanned_at: 'x', url: 'x' });

    const res = mockRes();
    await runScan(admin, {}, res, { scan, lookup });

    expect(admin._rows[0].status).toBe('active');
  });

  it('flips to vt_warn on block as well', async () => {
    const admin = makeAdmin([
      { id: 'r1', tool_id: 'mcp-stripe', status: 'active', vt_last_scan: null },
    ]);
    const scan = vi.fn().mockResolvedValue({ verdict: 'block', harmless: 50, malicious: 2, suspicious: 0, scanned_at: 'x', url: 'x' });

    const res = mockRes();
    await runScan(admin, {}, res, { scan, lookup });
    expect(admin._rows[0].status).toBe('vt_warn');
  });

  it('only calls scan once per distinct tool_id (cache)', async () => {
    const admin = makeAdmin([
      { id: 'r1', tool_id: 'mcp-github', status: 'active', vt_last_scan: null },
      { id: 'r2', tool_id: 'mcp-github', status: 'active', vt_last_scan: null },
      { id: 'r3', tool_id: 'mcp-stripe', status: 'active', vt_last_scan: null },
    ]);
    const scan = vi.fn().mockResolvedValue({ verdict: 'clean', harmless: 50, malicious: 0, suspicious: 0, scanned_at: 'x', url: 'x' });

    const res = mockRes();
    await runScan(admin, {}, res, { scan, lookup });
    expect(scan).toHaveBeenCalledTimes(2); // 2 distinct tool_ids
  });

  it('skips tool_id with no endpointUrl in catalog', async () => {
    const admin = makeAdmin([
      { id: 'r1', tool_id: 'mcp-no-url', status: 'active', vt_last_scan: null },
    ]);
    const scan = vi.fn();

    const res = mockRes();
    const out = await runScan(admin, {}, res, { scan, lookup });
    expect(scan).not.toHaveBeenCalled();
    expect(out.body.scanned).toBe(0);
  });

  it('counts failed scans without crashing', async () => {
    const admin = makeAdmin([
      { id: 'r1', tool_id: 'mcp-github', status: 'active', vt_last_scan: null },
    ]);
    const scan = vi.fn().mockRejectedValue(new Error('rate limited'));

    const res = mockRes();
    const out = await runScan(admin, {}, res, { scan, lookup });
    expect(out.body.failed).toBe(1);
    expect(out.body.scanned).toBe(0);
    expect(admin._rows[0].status).toBe('active'); // unchanged
  });
});
