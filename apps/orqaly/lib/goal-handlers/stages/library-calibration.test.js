import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeLlmV2Tracked: vi.fn(),
  clearCriteriaCache: vi.fn(),
}));

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../usage-handlers/tracked-llm.js', () => ({
  executeLlmV2Tracked: mocks.executeLlmV2Tracked,
}));
vi.mock('../../agent-handlers/tool-router.js', () => ({
  selectBestTool: () => null,
  optsFromCostPreference: () => ({}),
}));
vi.mock('../../../shared/libraryMcpCatalog.js', () => ({ listToolsForCategory: () => [] }));
vi.mock('../../_shared/quality-criteria.js', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, clearCriteriaCache: mocks.clearCriteriaCache };
});
vi.mock('../../_shared/llm-defaults.js', () => ({
  defaultProvider: () => 'gemini',
  defaultModel: () => 'gemini-test',
}));
vi.mock('../goal-stage-llm.js', () => ({
  resolveGoalStageLlm: () => ({ provider: 'gemini', model: 'gemini-test' }),
}));
vi.mock('../../agent-handlers/tool-runner.js', () => ({
  executeCloudflareDeploy: vi.fn(),
  executeStabilityAi: vi.fn(),
  executePdfGenerator: vi.fn(),
}));

import { handle } from './library-calibration.js';

function matches(row, filters) {
  return Object.entries(filters).every(([field, value]) => {
    if (field.startsWith('metadata->>')) {
      return (
        String(row.metadata?.[field.slice('metadata->>'.length)] || '') === String(value || '')
      );
    }
    return String(row[field] || '') === String(value || '');
  });
}

function calibrationAdmin(seed) {
  const rows = structuredClone(seed);
  const reads = [];
  const deletes = [];
  const inserts = [];

  const admin = {
    reads,
    deletes,
    inserts,
    from: vi.fn((table) => {
      expect(table).toBe('knowledge_documents');
      return {
        select(columns) {
          const filters = {};
          const query = {
            eq(field, value) {
              filters[field] = value;
              return query;
            },
            is(field, value) {
              filters[field] = value;
              return query;
            },
            order() {
              return query;
            },
            limit() {
              return query;
            },
            async single() {
              reads.push({ columns, filters: { ...filters }, single: true });
              const row = rows.find((candidate) => matches(candidate, filters));
              return row
                ? { data: structuredClone(row), error: null }
                : { data: null, error: { message: 'not found' } };
            },
            then(resolve) {
              reads.push({ columns, filters: { ...filters }, single: false });
              const data = rows.filter((candidate) => matches(candidate, filters));
              return Promise.resolve({ data: structuredClone(data), error: null }).then(resolve);
            },
          };
          return query;
        },
        delete() {
          const filters = {};
          const query = {
            eq(field, value) {
              filters[field] = value;
              return query;
            },
            is(field, value) {
              filters[field] = value;
              return query;
            },
            in(field, values) {
              filters[field] = values;
              return query;
            },
            then(resolve) {
              deletes.push({ ...filters });
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
          return query;
        },
        insert(value) {
          inserts.push(structuredClone(value));
          const insertedRows = (Array.isArray(value) ? value : [value]).map((row, index) => ({
            id: row.id || `insert-${inserts.length}-${index}`,
            ...structuredClone(row),
          }));
          return {
            async select() {
              return { data: insertedRows, error: null };
            },
            then(resolve) {
              return Promise.resolve({ data: insertedRows, error: null }).then(resolve);
            },
          };
        },
      };
    }),
  };
  return admin;
}

const ownedSample = {
  id: 'sample-owned',
  user_id: 'user-a',
  organization_id: 'org-a',
  title: 'Owned sample',
  content: 'Current output',
  category: 'calibration_sample',
  metadata: {
    calibration_run_id: 'run-a',
    deliverable_type: 'document_template',
    tool_name: 'Docs',
    tool_tier: 'free',
    sample_prompt: 'Write a brief',
    user_comment: 'Make it concise',
  },
};

describe('library calibration tenant boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeLlmV2Tracked.mockResolvedValue({ content: 'Use concise sections.' });
  });

  it('loads a preview sample only from the exact owner and organization', async () => {
    const admin = calibrationAdmin([
      ownedSample,
      { ...ownedSample, id: 'sample-foreign', user_id: 'user-b' },
    ]);

    const result = await handle(
      admin,
      {
        type: 'library-calibration',
        phase: 'preview',
        userId: 'user-a',
        organizationId: 'org-a',
        sampleId: 'sample-owned',
        comment: 'Use less text',
      },
      {}
    );

    expect(result).toMatchObject({
      phase: 'preview',
      sampleId: 'sample-owned',
      improvedDescription: 'Use concise sections.',
    });
    expect(admin.reads[0].filters).toMatchObject({
      id: 'sample-owned',
      category: 'calibration_sample',
      user_id: 'user-a',
      organization_id: 'org-a',
    });
  });

  it('rejects a cross-tenant preview before any LLM or tool executes', async () => {
    const admin = calibrationAdmin([{ ...ownedSample, user_id: 'user-b' }]);

    await expect(
      handle(
        admin,
        {
          type: 'library-calibration',
          phase: 'preview',
          userId: 'user-a',
          organizationId: 'org-a',
          sampleId: 'sample-owned',
          comment: 'Use less text',
        },
        {}
      )
    ).rejects.toThrow('Sample not found');
    expect(mocks.executeLlmV2Tracked).not.toHaveBeenCalled();
  });

  it('scopes synthesis samples, anchors, replacement delete, inserts, mode, and cache', async () => {
    const admin = calibrationAdmin([
      ownedSample,
      {
        id: 'anchor-owned',
        user_id: 'user-a',
        organization_id: 'org-a',
        title: 'Owned anchor',
        content: 'Good structure',
        category: 'library_example',
        metadata: { deliverable_type: 'document_template', quality_score: 95 },
      },
      {
        id: 'anchor-foreign',
        user_id: 'user-b',
        organization_id: 'org-a',
        title: 'Foreign anchor',
        content: 'Foreign criteria',
        category: 'library_example',
        metadata: { deliverable_type: 'document_template', quality_score: 100 },
      },
      {
        id: 'anchor-public',
        user_id: null,
        organization_id: null,
        title: 'Curated public anchor',
        content: 'Public best-in-class structure',
        category: 'library_example',
        metadata: {
          deliverable_type: 'document_template',
          quality_score: 98,
          source: 'curated',
        },
      },
    ]);

    const result = await handle(
      admin,
      {
        type: 'library-calibration',
        phase: 'synthesize',
        userId: 'user-a',
        organizationId: 'org-a',
        calibrationRunId: 'run-a',
      },
      {}
    );

    expect(result).toMatchObject({ phase: 'synthesize', calibrationRunId: 'run-a' });
    expect(admin.reads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filters: expect.objectContaining({
            category: 'calibration_sample',
            'metadata->>calibration_run_id': 'run-a',
            user_id: 'user-a',
            organization_id: 'org-a',
          }),
        }),
        expect.objectContaining({
          filters: expect.objectContaining({
            category: 'library_example',
            user_id: 'user-a',
            organization_id: 'org-a',
          }),
        }),
        expect.objectContaining({
          filters: expect.objectContaining({
            category: 'library_example',
            'metadata->>source': 'curated',
            user_id: null,
            organization_id: null,
          }),
        }),
      ])
    );
    expect(admin.deletes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'quality_criteria',
          user_id: 'user-a',
          organization_id: 'org-a',
        }),
        expect.objectContaining({
          category: 'system_flag',
          user_id: 'user-a',
          organization_id: 'org-a',
        }),
      ])
    );
    const criteriaInsert = admin.inserts.find(
      (value) => Array.isArray(value) && value[0]?.category === 'quality_criteria'
    );
    expect(criteriaInsert).toEqual([
      expect.objectContaining({
        user_id: 'user-a',
        organization_id: 'org-a',
        category: 'quality_criteria',
      }),
    ]);
    expect(
      admin.inserts.find((value) => !Array.isArray(value) && value.category === 'system_flag')
    ).toMatchObject({ user_id: 'user-a', organization_id: 'org-a' });
    expect(mocks.clearCriteriaCache).toHaveBeenCalledWith({
      userId: 'user-a',
      organizationId: 'org-a',
    });
    const synthesisPrompt = mocks.executeLlmV2Tracked.mock.calls[0][0].prompt;
    expect(synthesisPrompt).toContain('Curated public anchor');
    expect(synthesisPrompt).toContain('Owned anchor');
    expect(synthesisPrompt).not.toContain('Foreign criteria');
  });

  it('cannot synthesize a run owned by another tenant', async () => {
    const admin = calibrationAdmin([{ ...ownedSample, user_id: 'user-b' }]);

    await expect(
      handle(
        admin,
        {
          type: 'library-calibration',
          phase: 'synthesize',
          userId: 'user-a',
          organizationId: 'org-a',
          calibrationRunId: 'run-a',
        },
        {}
      )
    ).rejects.toThrow('No samples found');
    expect(admin.deletes).toEqual([]);
    expect(admin.inserts).toEqual([]);
    expect(mocks.executeLlmV2Tracked).not.toHaveBeenCalled();
  });

  it('fails closed when no tenant owner is supplied', async () => {
    const admin = calibrationAdmin([ownedSample]);
    await expect(
      handle(admin, { type: 'library-calibration', phase: 'synthesize', calibrationRunId: 'run-a' })
    ).rejects.toThrow('tenant owner');
    expect(admin.reads).toEqual([]);
  });
});
