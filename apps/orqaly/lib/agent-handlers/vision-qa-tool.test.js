/**
 * Tests for the vision QA tool — the QA-agent-callable check that
 * screenshots a deployed page at 3 viewports and grades it against the
 * design brief via Claude vision.
 *
 * Focus: argument validation, screenshot-fail paths, vision-LLM parse
 * paths, and the structured envelope that the QA agent reads back. The
 * actual Cloudflare Browser Rendering and Anthropic calls are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mockFetchWithRetry = vi.fn();
vi.mock('../../api/_lib/fetch.js', () => ({
  fetchWithRetry: (...args) => mockFetchWithRetry(...args),
}));

const mockStorageUpload = vi.fn();
const mockStorageGetBucket = vi.fn();
const mockStorageCreateBucket = vi.fn();
const mockStorageGetPublicUrl = vi.fn();
const mockFromInsert = vi.fn();
const mockFromBuilder = vi.fn();
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: () => ({
    storage: {
      getBucket: (...a) => mockStorageGetBucket(...a),
      createBucket: (...a) => mockStorageCreateBucket(...a),
      from: () => ({
        upload: (...a) => mockStorageUpload(...a),
        getPublicUrl: (...a) => mockStorageGetPublicUrl(...a),
      }),
    },
    from: (...a) => mockFromBuilder(...a),
  }),
}));

import { executeVisionQa, VISION_QA_FAILURE_CATEGORIES } from './vision-qa-tool.js';

function pngBufferFetchResponse() {
  // Minimal PNG header bytes are enough for the tool — it just base64-encodes them.
  const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    text: async () => '',
  };
}

function anthropicVisionResponse(jsonText) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ text: jsonText }],
      usage: { input_tokens: 1200, output_tokens: 250 },
    }),
    text: async () => jsonText,
  };
}

beforeEach(() => {
  mockFetchWithRetry.mockReset();
  mockStorageGetBucket.mockReset();
  mockStorageCreateBucket.mockReset();
  mockStorageUpload.mockReset();
  mockStorageGetPublicUrl.mockReset();
  mockFromInsert.mockReset();
  mockFromBuilder.mockReset();

  mockStorageGetBucket.mockResolvedValue({ data: { name: 'goal-deliverables' } });
  mockStorageCreateBucket.mockResolvedValue({ error: null });
  mockStorageUpload.mockResolvedValue({ error: null });
  mockStorageGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://example.com/shot.png' } });
  mockFromBuilder.mockReturnValue({ insert: mockFromInsert });
  mockFromInsert.mockResolvedValue({ error: null });

  process.env.CLOUDFLARE_ACCOUNT_ID = 'acc-123';
  process.env.CLOUDFLARE_API_TOKEN = 'cf-token';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  // Force anthropic provider so tests can mock its response shape predictably.
  process.env.VISION_QA_PROVIDER = 'anthropic';
});

afterEach(() => {
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.VISION_QA_PROVIDER;
});

describe('executeVisionQa - argument validation', () => {
  it('rejects unknown endpoint', async () => {
    const result = await executeVisionQa({
      endpointName: 'unknown',
      args: { deploymentUrl: 'https://x', designBrief: 'y' },
      start: Date.now(),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown vision-qa endpoint');
  });

  it('rejects missing deploymentUrl', async () => {
    const result = await executeVisionQa({
      endpointName: 'compare',
      args: { designBrief: 'brief' },
      start: Date.now(),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('deploymentUrl');
  });

  it('rejects missing designBrief', async () => {
    const result = await executeVisionQa({
      endpointName: 'compare',
      args: { deploymentUrl: 'https://x' },
      start: Date.now(),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('designBrief');
  });
});

describe('executeVisionQa - env validation', () => {
  it('fails clearly when Cloudflare creds are missing', async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    const result = await executeVisionQa({
      endpointName: 'compare',
      args: { deploymentUrl: 'https://x', designBrief: 'brief' },
      start: Date.now(),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('CLOUDFLARE');
  });

  it('fails clearly when no vision provider key is configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.VISION_QA_PROVIDER;
    const result = await executeVisionQa({
      endpointName: 'compare',
      args: { deploymentUrl: 'https://x', designBrief: 'brief' },
      start: Date.now(),
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/GROQ_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY/);
  });

  it('picks Groq when only GROQ_API_KEY is set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.VISION_QA_PROVIDER;
    process.env.GROQ_API_KEY = 'gsk-test';

    mockFetchWithRetry
      .mockResolvedValueOnce(pngBufferFetchResponse())
      .mockResolvedValueOnce(pngBufferFetchResponse())
      .mockResolvedValueOnce(pngBufferFetchResponse())
      // Groq returns OpenAI-style envelope
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ score: 80, summary: 'looks good', failures: [] }) } }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
        text: async () => '',
      });

    const result = await executeVisionQa({
      endpointName: 'compare',
      args: { deploymentUrl: 'https://x', designBrief: 'brief' },
      start: Date.now(),
    });
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.result);
    expect(parsed.score).toBe(80);
    expect(parsed.passed).toBe(true);
  });
});

describe('executeVisionQa - failure paths', () => {
  it('returns an error when every screenshot capture fails', async () => {
    // 3 viewports * 1 failed fetch each
    mockFetchWithRetry.mockResolvedValue({
      ok: false, status: 500,
      arrayBuffer: async () => new ArrayBuffer(0),
      text: async () => 'cloudflare boom',
    });

    const result = await executeVisionQa({
      endpointName: 'compare',
      args: { deploymentUrl: 'https://target.example.com', designBrief: 'brief' },
      start: Date.now(),
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to capture/i);
  });

  it('returns an error when vision LLM returns unparseable text', async () => {
    // 3 successful screenshots, then a vision response with no JSON
    mockFetchWithRetry
      .mockResolvedValueOnce(pngBufferFetchResponse())
      .mockResolvedValueOnce(pngBufferFetchResponse())
      .mockResolvedValueOnce(pngBufferFetchResponse())
      .mockResolvedValueOnce(anthropicVisionResponse('not valid json'));

    const result = await executeVisionQa({
      endpointName: 'compare',
      args: { deploymentUrl: 'https://target.example.com', designBrief: 'brief' },
      start: Date.now(),
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unparseable/i);
  });
});

describe('executeVisionQa - success path', () => {
  it('returns structured failures the QA agent can read back', async () => {
    mockFetchWithRetry
      .mockResolvedValueOnce(pngBufferFetchResponse())
      .mockResolvedValueOnce(pngBufferFetchResponse())
      .mockResolvedValueOnce(pngBufferFetchResponse())
      .mockResolvedValueOnce(anthropicVisionResponse(JSON.stringify({
        score: 62,
        summary: 'Hero is blank and CTA contrast is too low on mobile.',
        failures: [
          {
            category: 'hero_blank',
            severity: 'high',
            viewport: 'desktop',
            location: 'hero section',
            details: 'Hero background is plain white.',
            suggestion: 'Add the gradient specified in the brief.',
          },
          {
            category: 'contrast_fail',
            severity: 'medium',
            viewport: 'mobile',
            location: 'primary CTA',
            details: 'Button text is gray-on-light, fails WCAG AA.',
            suggestion: 'Increase button background contrast.',
          },
          {
            // Unknown category falls back to layout_broken; severity stays as-is
            category: 'totally_made_up',
            severity: 'low',
            viewport: 'tablet',
            location: 'footer',
            details: 'Spacing feels off.',
            suggestion: 'Tighten footer padding to 24px.',
          },
        ],
      })));

    const result = await executeVisionQa({
      endpointName: 'compare',
      args: {
        deploymentUrl: 'https://target.example.com',
        designBrief: '# Brief\nGradient hero, primary indigo.',
        goalId: 'goal-1',
        iteration: 2,
      },
      start: Date.now(),
    });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.result);
    expect(parsed.score).toBe(62);
    expect(parsed.passed).toBe(false); // has a severity:"high" failure
    expect(parsed.failures).toHaveLength(3);
    expect(parsed.failures[0].category).toBe('hero_blank');
    expect(parsed.failures[2].category).toBe('layout_broken'); // sanitized from "totally_made_up"
    expect(parsed.summary).toMatch(/Hero is blank/);
    expect(parsed.message).toMatch(/Vision QA score 62\/100/);
    // Persisted to design_qa_results
    expect(mockFromBuilder).toHaveBeenCalledWith('design_qa_results');
    expect(mockFromInsert).toHaveBeenCalledTimes(1);
    const inserted = mockFromInsert.mock.calls[0][0];
    expect(inserted.goal_id).toBe('goal-1');
    expect(inserted.iteration).toBe(2);
    expect(inserted.score).toBe(62);
    expect(inserted.failures).toHaveLength(3);
    expect(inserted.screenshot_urls).toHaveLength(3);
  });

  it('marks passed:true when score is high and no high-severity failures', async () => {
    mockFetchWithRetry
      .mockResolvedValueOnce(pngBufferFetchResponse())
      .mockResolvedValueOnce(pngBufferFetchResponse())
      .mockResolvedValueOnce(pngBufferFetchResponse())
      .mockResolvedValueOnce(anthropicVisionResponse(JSON.stringify({
        score: 88,
        summary: 'Matches the brief cleanly across viewports.',
        failures: [],
      })));

    const result = await executeVisionQa({
      endpointName: 'compare',
      args: { deploymentUrl: 'https://target.example.com', designBrief: 'brief' },
      start: Date.now(),
    });
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.result);
    expect(parsed.passed).toBe(true);
    expect(parsed.failures).toHaveLength(0);
    expect(parsed.message).toMatch(/Vision QA passed/);
  });
});

describe('VISION_QA_FAILURE_CATEGORIES', () => {
  it('exposes the categorical taxonomy the QA agent prompt references', () => {
    expect(VISION_QA_FAILURE_CATEGORIES).toContain('mobile_overflow');
    expect(VISION_QA_FAILURE_CATEGORIES).toContain('contrast_fail');
    expect(VISION_QA_FAILURE_CATEGORIES).toContain('cta_invisible');
    expect(VISION_QA_FAILURE_CATEGORIES).toContain('hero_blank');
  });
});
