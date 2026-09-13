/**
 * Tests for the knowledge-base `versions` op (per-document version history).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'u1' })),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  applyRateLimitHeaders: vi.fn(),
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getRateLimitIdentifier: vi.fn(() => 'rl-id'),
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, status, msg) => {
    res._status = status;
    res._body = { error: msg };
    return res;
  }),
  handleApiError: vi.fn((res) => {
    res._status = 500;
    return res;
  }),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../_shared/embeddings.js', () => ({
  generateEmbedding: vi.fn(async () => [0]),
  hashEmbedding: vi.fn(() => [0]),
  estimateTokens: vi.fn(() => 1),
  EMBEDDING_DIM: 1,
}));
vi.mock('../../api/_lib/fetch.js', () => ({ fetchWithRetry: vi.fn() }));

let adminImpl = null;
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: () => adminImpl,
}));

import handler from './knowledge-base.js';

function makeRes() {
  return {
    _status: 200,
    _body: null,
    status(c) {
      this._status = c;
      return this;
    },
    json(b) {
      this._body = b;
      return this;
    },
    end() {
      return this;
    },
    setHeader() {},
  };
}

function mockAdmin({ doc, versions }) {
  return {
    from: (table) => {
      if (table === 'knowledge_documents') {
        const b = {
          select: () => b,
          eq: () => b,
          single: () => Promise.resolve({ data: doc, error: doc ? null : { message: 'nf' } }),
        };
        return b;
      }
      const b = {
        select: () => b,
        eq: () => b,
        order: () => Promise.resolve({ data: versions, error: null }),
      };
      return b;
    },
  };
}

beforeEach(() => {
  adminImpl = null;
});

describe('knowledge-base versions op', () => {
  it('returns the document versions newest-first when the doc is owned', async () => {
    adminImpl = mockAdmin({
      doc: { id: 'd1' },
      versions: [
        { id: 'v2', version_no: 2, change_type: 'write' },
        { id: 'v1', version_no: 1, change_type: 'create' },
      ],
    });
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { op: 'versions', id: 'd1' } }, res);
    expect(res._status).toBe(200);
    expect(res._body.versions).toHaveLength(2);
    expect(res._body.versions[0].version_no).toBe(2);
  });

  it('400s when id is missing', async () => {
    adminImpl = mockAdmin({ doc: { id: 'd1' }, versions: [] });
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { op: 'versions' } }, res);
    expect(res._status).toBe(400);
  });
});

// Captures the row/patch/filters a handler sends to knowledge_documents so we
// can assert org/consilium scoping. Versions table is stubbed (best-effort).
function mockScopingAdmin({ listResult = [] } = {}) {
  const captured = { insertedRow: null, updatePatch: null, filters: {} };
  const admin = {
    from(table) {
      if (table === 'knowledge_document_versions') {
        const vb = {
          select: () => vb,
          eq: () => vb,
          order: () => vb,
          limit: () => vb,
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          insert: () => Promise.resolve({ data: null, error: null }),
        };
        return vb;
      }
      let mode = null;
      const qb = {
        select: () => qb,
        insert(row) {
          captured.insertedRow = row;
          mode = 'insert';
          return qb;
        },
        update(patch) {
          captured.updatePatch = patch;
          mode = 'update';
          return qb;
        },
        eq(col, val) {
          captured.filters[col] = val;
          return qb;
        },
        in: () => qb,
        order: () => qb,
        limit: () => qb,
        gte: () => qb,
        lte: () => qb,
        ilike: () => qb,
        contains: () => qb,
        or: () => qb,
        single() {
          if (mode === 'insert')
            return Promise.resolve({
              data: { id: 'new-id', ...captured.insertedRow },
              error: null,
            });
          if (mode === 'update')
            return Promise.resolve({
              data: { id: captured.filters.id, ...captured.updatePatch },
              error: null,
            });
          // fresh-snapshot read inside handleUpdate / handleGet
          return Promise.resolve({
            data: { id: 'd1', title: 't', content: 'c', category: 'general', content_type: 'note' },
            error: null,
          });
        },
        then(resolve) {
          return resolve({ data: listResult, error: null });
        },
      };
      return qb;
    },
  };
  return { admin, captured };
}

describe('knowledge-base org/consilium scoping', () => {
  it('add persists organization_id and concilium_id', async () => {
    const { admin, captured } = mockScopingAdmin();
    adminImpl = admin;
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: {},
        query: { op: 'add' },
        body: { content: 'hello', organization_id: 'org-1', concilium_id: 'concilium-9' },
      },
      res
    );
    expect(res._status).toBe(200);
    expect(captured.insertedRow.organization_id).toBe('org-1');
    expect(captured.insertedRow.concilium_id).toBe('concilium-9');
  });

  it('add defaults org/consilium to null when omitted', async () => {
    const { admin, captured } = mockScopingAdmin();
    adminImpl = admin;
    const res = makeRes();
    await handler(
      { method: 'POST', headers: {}, query: { op: 'add' }, body: { content: 'hello' } },
      res
    );
    expect(res._status).toBe(200);
    expect(captured.insertedRow.organization_id).toBeNull();
    expect(captured.insertedRow.concilium_id).toBeNull();
  });

  it('list filters by organization_id and concilium_id', async () => {
    const { admin, captured } = mockScopingAdmin({ listResult: [] });
    adminImpl = admin;
    const res = makeRes();
    await handler(
      {
        method: 'GET',
        headers: {},
        query: { op: 'list', organization_id: 'org-1', concilium_id: 'concilium-9' },
      },
      res
    );
    expect(res._status).toBe(200);
    expect(captured.filters.organization_id).toBe('org-1');
    expect(captured.filters.concilium_id).toBe('concilium-9');
  });

  it('update allows changing organization_id and concilium_id', async () => {
    const { admin, captured } = mockScopingAdmin();
    adminImpl = admin;
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: {},
        query: { op: 'update' },
        body: { id: 'd1', organization_id: 'org-2', concilium_id: 'concilium-3' },
      },
      res
    );
    expect(res._status).toBe(200);
    expect(captured.updatePatch.organization_id).toBe('org-2');
    expect(captured.updatePatch.concilium_id).toBe('concilium-3');
  });
});

function mockRegisterAdmin({ agents, existingBySource = {}, inserts }) {
  return {
    from(table) {
      if (table === 'agents') {
        return { select: () => ({ eq: () => Promise.resolve({ data: agents, error: null }) }) };
      }
      let src = null;
      const b = {
        select: () => b,
        eq: (col, val) => {
          if (col === 'source') src = val;
          return b;
        },
        maybeSingle: () => Promise.resolve({ data: existingBySource[src] || null, error: null }),
        insert: (row) => {
          inserts.push(row);
          return Promise.resolve({ error: null });
        },
        update: (row) => ({
          eq: () => {
            inserts.push({ __update: true, ...row });
            return Promise.resolve({ error: null });
          },
        }),
      };
      return b;
    },
  };
}

describe('knowledge-base register-agent op', () => {
  it('resolves role -> agent_id and inserts an owner_type=agent persona doc', async () => {
    const inserts = [];
    // Custom metadata.agent_id is user-controlled, so the immutable row UUID
    // is the memory owner even when custom metadata contains another ID.
    adminImpl = mockRegisterAdmin({
      agents: [{ id: 'row-uuid-1', name: 'AI Engineer', metadata: { agent_id: 'agent-local-1' } }],
      inserts,
    });
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        query: { op: 'register-agent' },
        body: {
          items: [
            { role: 'AI Engineer', title: 'AI Engineer', content: 'You are an AI Engineer.' },
          ],
        },
      },
      res
    );
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ registered: 1, skipped: 0 });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      owner_type: 'agent',
      owner_id: 'row-uuid-1',
      category: 'agent-persona',
      source: 'agent-persona:row-uuid-1',
    });
    expect(inserts[0].metadata).toMatchObject({ agent_name: 'AI Engineer' });
  });

  it('keeps the stable predefined identity for reseeded catalogue agents', async () => {
    const inserts = [];
    adminImpl = mockRegisterAdmin({
      agents: [
        {
          id: 'row-uuid-predefined',
          name: 'AI Engineer',
          metadata: { agent_id: 'predefined:ai-engineer' },
        },
      ],
      inserts,
    });
    const res = makeRes();

    await handler(
      {
        method: 'POST',
        query: { op: 'register-agent' },
        body: { items: [{ role: 'AI Engineer', content: 'Catalogue persona.' }] },
      },
      res
    );

    expect(inserts[0]).toMatchObject({
      owner_id: 'predefined:ai-engineer',
      source: 'agent-persona:predefined:ai-engineer',
    });
  });

  it('isolates custom personas whose user-controlled metadata IDs collide', async () => {
    const inserts = [];
    adminImpl = mockRegisterAdmin({
      agents: [
        { id: 'custom-row-a', name: 'Researcher A', metadata: { agent_id: 'collision' } },
        { id: 'custom-row-b', name: 'Researcher B', metadata: { agent_id: 'collision' } },
      ],
      inserts,
    });
    const res = makeRes();

    await handler(
      {
        method: 'POST',
        query: { op: 'register-agent' },
        body: {
          items: [
            { role: 'Researcher A', content: 'Persona A.' },
            { role: 'Researcher B', content: 'Persona B.' },
          ],
        },
      },
      res
    );

    expect(inserts.map(({ owner_id }) => owner_id)).toEqual(['custom-row-a', 'custom-row-b']);
    expect(inserts.map(({ source }) => source)).toEqual([
      'agent-persona:custom-row-a',
      'agent-persona:custom-row-b',
    ]);
  });

  it('skips items with no matching agent or empty content', async () => {
    const inserts = [];
    adminImpl = mockRegisterAdmin({ agents: [{ id: 'a1', name: 'AI Engineer' }], inserts });
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        query: { op: 'register-agent' },
        body: {
          items: [
            { role: 'Nonexistent', content: 'x' },
            { role: 'AI Engineer', content: '' },
          ],
        },
      },
      res
    );
    expect(res._body).toMatchObject({ registered: 0, skipped: 2 });
    expect(inserts).toHaveLength(0);
  });

  it('updates instead of inserting when a persona doc already exists (dedupe by source)', async () => {
    const inserts = [];
    adminImpl = mockRegisterAdmin({
      agents: [{ id: 'a1', name: 'AI Engineer' }],
      existingBySource: { 'agent-persona:a1': { id: 'doc-1' } },
      inserts,
    });
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        query: { op: 'register-agent' },
        body: { items: [{ role: 'AI Engineer', content: 'Updated persona.' }] },
      },
      res
    );
    expect(res._body).toMatchObject({ registered: 1 });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].__update).toBe(true);
  });
});
