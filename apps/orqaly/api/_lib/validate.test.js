import { describe, it, expect } from 'vitest';
import {
  transcribeBodySchema,
  sendEmailBodySchema,
  sendNotificationBodySchema,
  stitchTemplateSyncSchema,
  usageAnalyticsQuerySchema,
  usageDirectoryQuerySchema,
  githubAgentsImportQuerySchema,
  conciliumMemberSchema,
} from './validate.js';

describe('conciliumMemberSchema', () => {
  it('accepts the Gemini release provider and exact default model', () => {
    const result = conciliumMemberSchema.safeParse({
      conciliumId: 'board-1',
      name: 'Evaluator',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });

    expect(result.success).toBe(true);
  });
});

describe('transcribeBodySchema', () => {
  it('accepts valid audioBase64', () => {
    const result = transcribeBodySchema.safeParse({ audioBase64: 'SGVsbG8=' });
    expect(result.success).toBe(true);
    expect(result.data.mimeType).toBe('audio/webm');
  });

  it('rejects missing audioBase64', () => {
    const result = transcribeBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects too large audio', () => {
    const result = transcribeBodySchema.safeParse({ audioBase64: 'x'.repeat(7_000_000) });
    expect(result.success).toBe(false);
  });
});

describe('usageAnalyticsQuerySchema', () => {
  it('defaults entity to "all" when omitted', () => {
    const result = usageAnalyticsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.entity).toBe('all');
  });

  it('no longer carries the removed groupBy param', () => {
    const result = usageAnalyticsQuerySchema.safeParse({ entity: 'all', groupBy: 'model' });
    expect(result.success).toBe(true);
    expect(result.data.groupBy).toBeUndefined();
  });

  it('requires entityId for a non-all entity', () => {
    expect(usageAnalyticsQuerySchema.safeParse({ entity: 'organization' }).success).toBe(false);
    expect(
      usageAnalyticsQuerySchema.safeParse({ entity: 'organization', entityId: 'org-1' }).success
    ).toBe(true);
  });

  it('rejects an unknown entity', () => {
    expect(usageAnalyticsQuerySchema.safeParse({ entity: 'nope', entityId: 'x' }).success).toBe(
      false
    );
  });

  it('accepts an optional from/to range', () => {
    const result = usageAnalyticsQuerySchema.safeParse({
      entity: 'goal',
      entityId: 'g1',
      from: '2026-01-01',
      to: '2026-02-01',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional provider/model/source filters', () => {
    const result = usageAnalyticsQuerySchema.safeParse({
      entity: 'all',
      provider: 'openai',
      model: 'gpt-4o',
      source: 'chat',
    });
    expect(result.success).toBe(true);
    expect(result.data.provider).toBe('openai');
  });
});

describe('usageDirectoryQuerySchema', () => {
  it('requires a valid entity', () => {
    expect(usageDirectoryQuerySchema.safeParse({}).success).toBe(false);
    expect(usageDirectoryQuerySchema.safeParse({ entity: 'nope' }).success).toBe(false);
    expect(usageDirectoryQuerySchema.safeParse({ entity: 'goal' }).success).toBe(true);
  });

  it('accepts all entity types', () => {
    for (const entity of ['goal', 'agent', 'team', 'consilium', 'organization']) {
      expect(usageDirectoryQuerySchema.safeParse({ entity }).success).toBe(true);
    }
  });

  it('defaults and coerces limit (string query params)', () => {
    expect(usageDirectoryQuerySchema.safeParse({ entity: 'goal' }).data.limit).toBe(100);
    expect(usageDirectoryQuerySchema.safeParse({ entity: 'goal', limit: '25' }).data.limit).toBe(
      25
    );
    expect(usageDirectoryQuerySchema.safeParse({ entity: 'goal', limit: '5000' }).success).toBe(
      false
    );
  });

  it('accepts optional search/status/range', () => {
    const r = usageDirectoryQuerySchema.safeParse({
      entity: 'organization',
      search: 'acme',
      status: 'active',
      from: '2026-01-01',
      to: '2026-02-01',
    });
    expect(r.success).toBe(true);
  });
});

describe('sendEmailBodySchema', () => {
  it('accepts valid to and subject', () => {
    const result = sendEmailBodySchema.safeParse({ to: 'a@b.com', subject: 'Hi' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = sendEmailBodySchema.safeParse({ to: 'invalid', subject: 'Hi' });
    expect(result.success).toBe(false);
  });

  it('rejects missing subject', () => {
    const result = sendEmailBodySchema.safeParse({ to: 'a@b.com' });
    expect(result.success).toBe(false);
  });
});

describe('sendNotificationBodySchema', () => {
  it('accepts action with data', () => {
    const result = sendNotificationBodySchema.safeParse({
      action: 'partner_created',
      data: { name: 'Acme' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid action format', () => {
    const result = sendNotificationBodySchema.safeParse({
      action: 'partner-created',
      data: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('stitchTemplateSyncSchema', () => {
  it('accepts valid template sync payload', () => {
    const result = stitchTemplateSyncSchema.safeParse({
      provider: 'stitch_google',
      templates: [
        {
          actionKey: 'partner_created',
          subject: 'Partner {{name}} created',
          html: '<p>Partner {{name}} created</p>',
          text: 'Partner {{name}} created',
          version: 2,
          variables: ['name'],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty template list', () => {
    const result = stitchTemplateSyncSchema.safeParse({
      templates: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('githubAgentsImportQuerySchema', () => {
  it('accepts valid url with defaults', () => {
    const result = githubAgentsImportQuerySchema.safeParse({ url: 'https://github.com/o/r' });
    expect(result.success).toBe(true);
    expect(result.data.url).toBe('https://github.com/o/r');
    expect(result.data.offset).toBe(0);
    expect(result.data.limit).toBe(30);
    expect(result.data.q).toBe('');
  });

  it('coerces string offset and limit to numbers', () => {
    const result = githubAgentsImportQuerySchema.safeParse({
      url: 'https://github.com/o/r',
      offset: '10',
      limit: '50',
    });
    expect(result.success).toBe(true);
    expect(result.data.offset).toBe(10);
    expect(result.data.limit).toBe(50);
  });

  it('rejects missing url', () => {
    const result = githubAgentsImportQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects limit exceeding max of 100', () => {
    const result = githubAgentsImportQuerySchema.safeParse({
      url: 'https://github.com/o/r',
      limit: '500',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional branch but strips path', () => {
    // `path` is deliberately absent from the schema: /api/app?path=<handler>
    // uses `path` as the router key, so a caller-supplied repo folder would
    // collide with it. Sub-path scoping is derived from the repo URL instead.
    const result = githubAgentsImportQuerySchema.safeParse({
      url: 'https://github.com/o/r',
      branch: 'feat',
      path: 'agents/',
    });
    expect(result.success).toBe(true);
    expect(result.data.branch).toBe('feat');
    expect(result.data.path).toBeUndefined();
  });

  it('accepts optional q search param', () => {
    const result = githubAgentsImportQuerySchema.safeParse({
      url: 'https://github.com/o/r',
      q: 'engineering',
    });
    expect(result.success).toBe(true);
    expect(result.data.q).toBe('engineering');
  });

  it('rejects negative offset', () => {
    const result = githubAgentsImportQuerySchema.safeParse({
      url: 'https://github.com/o/r',
      offset: '-1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects limit below 1', () => {
    const result = githubAgentsImportQuerySchema.safeParse({
      url: 'https://github.com/o/r',
      limit: '0',
    });
    expect(result.success).toBe(false);
  });
});
