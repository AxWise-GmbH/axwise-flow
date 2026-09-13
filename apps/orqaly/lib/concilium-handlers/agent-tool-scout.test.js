import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockVerify, mockExecuteLlm, mockResolveCred, mockBuildAdmin } = vi.hoisted(() => ({
  mockVerify: vi.fn(async () => ({ id: 'user-1' })),
  mockExecuteLlm: vi.fn(),
  mockResolveCred: vi.fn(async () => ({ source: 'user', apiKey: 'k', ready: true })),
  mockBuildAdmin: vi.fn(),
}));

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  verifySupabaseToken: mockVerify,
  getBearerToken: vi.fn(() => 'token'),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'id'),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), startTimer: () => vi.fn() }),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({ buildSupabaseAdminClient: mockBuildAdmin }));
vi.mock('../usage-handlers/tracked-llm.js', () => ({ executeLlmV2Tracked: mockExecuteLlm }));
vi.mock('../agent-handlers/tool-credentials.js', () => ({ resolveToolCredential: mockResolveCred }));

import handler, {
  validatePicks,
  catalogSummaryForScout,
  buildScoutPrompt,
  scoutableTools,
  isThirdParty,
} from './agent-tool-scout.js';

/** First-party: written by the user. May hold write tools. */
const AGENT = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Frontend Developer',
  description: 'Builds UIs',
  category: 'Engineering',
  metadata: { tools: [], system_prompt: 'You are a Frontend Developer.' },
};

/** Third-party: prompt came from a public repo nobody here has read. */
const IMPORTED = {
  ...AGENT,
  id: '22222222-2222-4222-8222-222222222222',
  metadata: {
    ...AGENT.metadata,
    imported_from: { source: 'github', repo: 'msitarzewski/agency-agents', path: 'engineering/x.md' },
  },
};

function mockRes() {
  const res = { statusCode: null, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = () => res;
  return res;
}

/** admin stub: agents select -> [AGENT]; agents update captured; tools -> no row. */
function mockAdmin(agents = [AGENT]) {
  const updates = [];
  const admin = {
    _updates: updates,
    from: vi.fn((table) => {
      if (table === 'agents') {
        const b = {
          select: () => b,
          eq: () => b,
          in: () => b,
          update: (data) => {
            updates.push(data);
            return { eq: () => ({ eq: async () => ({ error: null }) }) };
          },
          then: (r) => Promise.resolve({ data: agents, error: null }).then(r),
        };
        return b;
      }
      const t = { select: () => t, eq: () => t, maybeSingle: async () => ({ data: null, error: null }) };
      return t;
    }),
  };
  return admin;
}

const llmReturns = (obj) => mockExecuteLlm.mockResolvedValue({ content: JSON.stringify(obj) });

let savedComposioKey;
beforeEach(() => {
  vi.clearAllMocks();
  mockVerify.mockResolvedValue({ id: 'user-1' });
  mockResolveCred.mockResolvedValue({ source: 'user', apiKey: 'k', ready: true });
  mockBuildAdmin.mockReturnValue(mockAdmin());
  // Default: Composio not configured, so scoutable stays tool-* only unless a
  // test opts in. Restored in afterEach so a dev shell's real key can't leak in.
  savedComposioKey = process.env.COMPOSIO_API_KEY;
  delete process.env.COMPOSIO_API_KEY;
});

afterEach(() => {
  if (savedComposioKey === undefined) delete process.env.COMPOSIO_API_KEY;
  else process.env.COMPOSIO_API_KEY = savedComposioKey;
});

describe('scoutableTools / catalog exposure', () => {
  it('offers only tool-* ids when Composio is not configured', () => {
    expect(scoutableTools(AGENT).every((t) => t.id.startsWith('tool-'))).toBe(true);
    expect(catalogSummaryForScout(AGENT)).not.toMatch(/mcp-/);
  });

  it('offers composio (mcp-*) ids to a first-party agent when configured', () => {
    process.env.COMPOSIO_API_KEY = 'cmp_test_key';
    const ids = scoutableTools(AGENT).map((t) => t.id);
    expect(ids.some((id) => id.startsWith('mcp-'))).toBe(true);
    expect(ids).toContain('mcp-slack');
  });

  it('withholds composio from a third-party agent even when configured', () => {
    // Composio actions run outward under the user's OAuth identity — same
    // can't-be-undone risk as WRITE_TOOLS, so third-party prompts never get them.
    process.env.COMPOSIO_API_KEY = 'cmp_test_key';
    const ids = scoutableTools(IMPORTED).map((t) => t.id);
    expect(ids.some((id) => id.startsWith('mcp-'))).toBe(false);
  });

  it('withholds tool-http-client from EVERY agent — unrestricted egress primitive', () => {
    // url/method/headers/body are all LLM-controlled with no allowlist or private-IP block.
    for (const a of [AGENT, IMPORTED]) {
      expect(scoutableTools(a).map((t) => t.id)).not.toContain('tool-http-client');
      expect(catalogSummaryForScout(a)).not.toContain('tool-http-client');
    }
  });

  it('withholds write tools from a third-party agent', () => {
    const ids = scoutableTools(IMPORTED).map((t) => t.id);
    for (const w of ['tool-github', 'tool-email', 'tool-vercel']) expect(ids).not.toContain(w);
  });

  it('never even shows them to a third-party agent', () => {
    const summary = catalogSummaryForScout(IMPORTED);
    expect(summary).not.toContain('tool-github');
    expect(summary).not.toContain('tool-email');
  });

  it('still offers write tools to a first-party agent', () => {
    const ids = scoutableTools(AGENT).map((t) => t.id);
    for (const w of ['tool-github', 'tool-email', 'tool-vercel']) expect(ids).toContain(w);
  });

  it('leaves harmless tools alone for third-party agents', () => {
    const ids = scoutableTools(IMPORTED).map((t) => t.id);
    for (const ok of ['tool-web-search', 'tool-doc-generator', 'tool-figma']) expect(ids).toContain(ok);
  });
});

describe('isThirdParty', () => {
  it('keys off imported_from provenance', () => {
    expect(isThirdParty(IMPORTED)).toBe(true);
    expect(isThirdParty(AGENT)).toBe(false);
    expect(isThirdParty({ metadata: {} })).toBe(false);
    expect(isThirdParty(undefined)).toBe(false);
  });
});

describe('validatePicks', () => {
  it('keeps real catalog ids', () => {
    expect(validatePicks(['tool-github', 'tool-web-search'], AGENT)).toEqual(['tool-github', 'tool-web-search']);
  });

  it('drops hallucinated ids', () => {
    expect(validatePicks(['tool-github', 'tool-imaginary', 'nonsense'], AGENT)).toEqual(['tool-github']);
  });

  it('drops a withheld id even when the model names it', () => {
    expect(validatePicks(['tool-http-client', 'tool-github'], AGENT)).toEqual(['tool-github']);
  });

  it('drops a write tool for a third-party agent even when the model names it', () => {
    // Narrowing the prompt is not a control — the model can still say anything.
    // The same filter has to run on the way out.
    expect(validatePicks(['tool-github', 'tool-email', 'tool-web-search'], IMPORTED)).toEqual(['tool-web-search']);
  });

  it('drops composio ids', () => {
    expect(validatePicks(['mcp-github'], AGENT)).toEqual([]);
  });

  it('dedupes and caps at 8', () => {
    expect(validatePicks(['tool-github', 'tool-github'], AGENT)).toEqual(['tool-github']);
    const many = scoutableTools(AGENT).slice(0, 12).map((t) => t.id);
    expect(validatePicks(many, AGENT)).toHaveLength(8);
  });

  it('tolerates junk input', () => {
    expect(validatePicks(undefined, AGENT)).toEqual([]);
    expect(validatePicks('tool-github', AGENT)).toEqual([]);
    expect(validatePicks([null, 42, {}], AGENT)).toEqual([]);
  });
});

describe('buildScoutPrompt', () => {
  it('includes the agent identity and the catalog', () => {
    const p = buildScoutPrompt(AGENT);
    expect(p).toContain('Frontend Developer');
    expect(p).toContain('tool-github');
  });

  it('does not leak other agents or credentials into the prompt', () => {
    expect(buildScoutPrompt(AGENT)).not.toMatch(/apiKey|password|secret/i);
  });
});

describe('handler', () => {
  it('rejects an unauthenticated caller', async () => {
    mockVerify.mockResolvedValue(null);
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { all_untooled: true } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('requires agent_ids or all_untooled', async () => {
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('writes validated picks to metadata.tools', async () => {
    llmReturns({ tool_ids: ['tool-github', 'tool-web-search'], reason: 'builds UIs' });
    const admin = mockAdmin();
    mockBuildAdmin.mockReturnValue(admin);
    const res = mockRes();

    await handler({ method: 'POST', headers: {}, body: { all_untooled: true } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.scouted[0].picked).toEqual(['tool-github', 'tool-web-search']);
    expect(admin._updates[0].metadata.tools).toEqual(['tool-github', 'tool-web-search']);
  });

  it('preserves the rest of metadata when writing tools', async () => {
    llmReturns({ tool_ids: ['tool-github'] });
    const admin = mockAdmin();
    mockBuildAdmin.mockReturnValue(admin);
    await handler({ method: 'POST', headers: {}, body: { all_untooled: true } }, mockRes());
    expect(admin._updates[0].metadata.system_prompt).toBe('You are a Frontend Developer.');
  });

  it('writes nothing on a dry run', async () => {
    llmReturns({ tool_ids: ['tool-github'] });
    const admin = mockAdmin();
    mockBuildAdmin.mockReturnValue(admin);
    const res = mockRes();

    await handler({ method: 'POST', headers: {}, body: { all_untooled: true, dry_run: true } }, res);

    expect(res.body.dryRun).toBe(true);
    expect(res.body.scouted[0].picked).toEqual(['tool-github']);
    expect(admin._updates).toHaveLength(0);
  });

  it('reports picks that lack a credential', async () => {
    llmReturns({ tool_ids: ['tool-github'] });
    mockResolveCred.mockResolvedValue({ source: 'none', apiKey: null, ready: false });
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { all_untooled: true } }, res);
    expect(res.body.scouted[0].needs_credential).toEqual(['tool-github']);
  });

  it('never returns a credential, even though it resolves one', async () => {
    llmReturns({ tool_ids: ['tool-github'] });
    mockResolveCred.mockResolvedValue({ source: 'user', apiKey: 'ghp_supersecret', ready: true });
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { all_untooled: true } }, res);
    expect(JSON.stringify(res.body)).not.toContain('ghp_supersecret');
  });

  it('survives an LLM failure without failing the batch', async () => {
    mockExecuteLlm.mockRejectedValue(new Error('provider down'));
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { all_untooled: true } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.scouted[0].error).toBe('llm_failed');
    expect(res.body.scouted[0].picked).toEqual([]);
  });

  it('survives unparseable LLM output', async () => {
    mockExecuteLlm.mockResolvedValue({ content: 'I think it should use GitHub!' });
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { all_untooled: true } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.scouted[0].picked).toEqual([]);
  });

  it('skips agents that already have tools when all_untooled is set', async () => {
    llmReturns({ tool_ids: ['tool-github'] });
    mockBuildAdmin.mockReturnValue(mockAdmin([{ ...AGENT, metadata: { tools: ['tool-canva'] } }]));
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { all_untooled: true } }, res);
    expect(res.body.scouted).toHaveLength(0);
    expect(mockExecuteLlm).not.toHaveBeenCalled();
  });

  it('reports hasMore when the batch is capped', async () => {
    llmReturns({ tool_ids: ['tool-github'] });
    const many = Array.from({ length: 4 }, (_, i) => ({ ...AGENT, id: `${i}`, name: `A${i}` }));
    mockBuildAdmin.mockReturnValue(mockAdmin(many));
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { all_untooled: true, limit: 2 } }, res);
    expect(res.body.scouted).toHaveLength(2);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.remaining).toBe(2);
  });

  it('rejects a non-POST method', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('a re-run cannot silently re-grant a write tool to an imported agent', async () => {
    // The guard has to live in the scout, not only in the one-off prune script,
    // or the next scout run quietly undoes the pruning.
    llmReturns({ tool_ids: ['tool-github', 'tool-email', 'tool-web-search'] });
    const admin = mockAdmin([IMPORTED]);
    mockBuildAdmin.mockReturnValue(admin);
    const res = mockRes();

    await handler({ method: 'POST', headers: {}, body: { all_untooled: true } }, res);

    expect(res.body.scouted[0].picked).toEqual(['tool-web-search']);
    expect(admin._updates[0].metadata.tools).toEqual(['tool-web-search']);
  });

  it('still lets a first-party agent keep its write tools', async () => {
    llmReturns({ tool_ids: ['tool-github', 'tool-web-search'] });
    const admin = mockAdmin([AGENT]);
    mockBuildAdmin.mockReturnValue(admin);
    const res = mockRes();

    await handler({ method: 'POST', headers: {}, body: { all_untooled: true } }, res);

    expect(res.body.scouted[0].picked).toEqual(['tool-github', 'tool-web-search']);
  });
});
