/**
 * Tests for the clone-reference stage. Covers:
 *   - cleanHtml: strips behavior + noise, preserves structure + inline CSS
 *   - extractOutline: pulls title, metas, headings, section landmarks
 *   - handle(): no-op when not a clone goal; populates clone_reference when
 *     it is, with mocked fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../_helpers.js', () => ({
  logGoalEvent: vi.fn(),
  updateGoalIfExecutionAuthorized: vi.fn(async () => true),
  loadGoal: vi.fn(),
  enqueueGoalAction: vi.fn(),
}));

vi.mock('./_system-enrichment-authorization.js', () => ({
  requireSystemEnrichmentAuthorization: vi.fn(async ({ goal }) => ({
    ok: true,
    reasons: [],
    enrichment: {
      source_urls:
        `${goal.title || ''} ${goal.description || ''}`
          .match(/https?:\/\/[^\s]+/g)
          ?.map((url) => url.replace(/[),.;!?]+$/, '')) || [],
    },
  })),
  recheckSystemEnrichmentAuthorization: vi.fn(async () => ({
    ok: true,
    reasons: [],
    goal: { data: {} },
  })),
  enqueueAuthorizedSystemEnrichmentNext: vi.fn(async () => ({ ok: true, reasons: [] })),
}));

import {
  buildPinnedHttpsRequestOptions,
  cleanHtml,
  extractOutline,
  fetchPublicHtml,
  handle,
  isPublicIpAddress,
  resolvePublicTarget,
} from './clone-reference.js';
import { loadGoal, updateGoalIfExecutionAuthorized } from '../_helpers.js';
import { acceptedNativeLandingEnrichmentGoal } from '../native-enrichment-context.test-fixture.js';
import {
  enqueueAuthorizedSystemEnrichmentNext,
  recheckSystemEnrichmentAuthorization,
  requireSystemEnrichmentAuthorization,
} from './_system-enrichment-authorization.js';

function htmlResponse(html, status = 200, location = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (String(name).toLowerCase() === 'location' ? location : null) },
    text: async () => html,
  };
}

describe('cleanHtml', () => {
  it('strips <script> blocks', () => {
    const out = cleanHtml('<html><body><script>alert(1)</script><h1>Hi</h1></body></html>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert');
    expect(out).toContain('<h1>Hi</h1>');
  });

  it('strips <noscript> and HTML comments', () => {
    const out = cleanHtml('<noscript>x</noscript><!-- ad pixel --><p>copy</p>');
    expect(out).not.toContain('noscript');
    expect(out).not.toContain('ad pixel');
    expect(out).toContain('<p>copy</p>');
  });

  it('strips <iframe> blocks', () => {
    const out = cleanHtml('<iframe src="https://ad.com">x</iframe><h2>Real</h2>');
    expect(out).not.toContain('iframe');
    expect(out).toContain('<h2>Real</h2>');
  });

  it('compresses <style> blocks but keeps the CSS content', () => {
    const out = cleanHtml('<style>\n  :root {\n    --primary: #7C3AED;\n  }\n</style><h1>x</h1>');
    expect(out).toContain('<style>');
    expect(out).toContain('--primary: #7C3AED');
  });

  it('replaces <svg> with self-closing placeholder', () => {
    const out = cleanHtml('<svg><path d="M0 0"/></svg><h1>x</h1>');
    expect(out).toContain('<svg/>');
    expect(out).not.toContain('<path');
  });

  it('handles empty / falsy input', () => {
    expect(cleanHtml('')).toBe('');
    expect(cleanHtml(null)).toBe('');
    expect(cleanHtml(undefined)).toBe('');
  });

  it('truncates beyond 40KB cap', () => {
    const big = '<p>' + 'x'.repeat(100_000) + '</p>';
    const out = cleanHtml(big);
    expect(out.length).toBeLessThanOrEqual(40 * 1024);
  });
});

describe('extractOutline', () => {
  it('extracts title, headings, and section landmarks', () => {
    const html = `
      <html>
        <head>
          <title>Stripe Connect</title>
          <meta name="description" content="Accept payments globally"/>
          <meta property="og:title" content="Stripe Connect"/>
        </head>
        <body>
          <header><h1>Accept Payments Globally</h1></header>
          <section>
            <h2>Build with Stripe</h2>
            <h2>Scale your business</h2>
          </section>
          <section><h2>Pricing</h2></section>
          <footer>Footer text</footer>
        </body>
      </html>`;
    const outline = extractOutline(html);
    expect(outline.title).toBe('Stripe Connect');
    expect(outline.h1s).toEqual(['Accept Payments Globally']);
    expect(outline.h2s).toEqual(['Build with Stripe', 'Scale your business', 'Pricing']);
    expect(outline.sections.find((s) => s.tag === 'section').count).toBe(2);
    expect(outline.sections.find((s) => s.tag === 'header').count).toBe(1);
    expect(outline.sections.find((s) => s.tag === 'footer').count).toBe(1);
    expect(outline.metas.some((m) => m.key === 'description')).toBe(true);
    expect(outline.metas.some((m) => m.key === 'og:title')).toBe(true);
  });

  it('returns empty structure for falsy input', () => {
    const empty = extractOutline('');
    expect(empty.title).toBe('');
    expect(empty.h1s).toEqual([]);
    expect(empty.h2s).toEqual([]);
    expect(empty.sections).toEqual([]);
    expect(empty.metas).toEqual([]);
  });

  it('caps the number of metas and headings to a reasonable limit', () => {
    const many = '<h2>x</h2>'.repeat(50);
    const outline = extractOutline(many);
    expect(outline.h2s.length).toBeLessThanOrEqual(20);
  });
});

describe('clone-reference network trust boundary', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '100.64.0.1',
    '169.254.169.254',
    '192.0.2.10',
    '198.51.100.8',
    '203.0.113.4',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
  ])('rejects non-global address %s', (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111'])(
    'accepts globally routable address %s',
    (address) => {
      expect(isPublicIpAddress(address)).toBe(true);
    }
  );

  it('rejects a public-looking hostname when any DNS answer is private', async () => {
    const lookupHost = vi.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.9', family: 4 },
    ]);

    await expect(resolvePublicTarget('example.com', lookupHost)).rejects.toThrow(/non-public/i);
    expect(lookupHost).toHaveBeenCalledWith('example.com', { all: true, verbatim: true });
  });

  it('resolves and validates every redirect hostname before making its request', async () => {
    const lookupHost = vi.fn(async (hostname) => {
      if (hostname === 'public.example') return [{ address: '93.184.216.34', family: 4 }];
      return [{ address: '169.254.169.254', family: 4 }];
    });
    const requestPinned = vi
      .fn()
      .mockResolvedValueOnce(
        htmlResponse('', 302, 'https://metadata-alias.example/latest/meta-data')
      );

    await expect(
      fetchPublicHtml('https://public.example/start', undefined, { lookupHost, requestPinned })
    ).rejects.toThrow(/non-public/i);

    expect(requestPinned).toHaveBeenCalledTimes(1);
    expect(lookupHost).toHaveBeenNthCalledWith(1, 'public.example', {
      all: true,
      verbatim: true,
    });
    expect(lookupHost).toHaveBeenNthCalledWith(2, 'metadata-alias.example', {
      all: true,
      verbatim: true,
    });
  });

  it('pins the validated address while preserving Host and TLS SNI', () => {
    const target = { address: '93.184.216.34', family: 4 };
    const options = buildPinnedHttpsRequestOptions(
      new URL('https://example.com:8443/path?q=1'),
      target
    );
    const callback = vi.fn();

    options.lookup('example.com', {}, callback);

    expect(callback).toHaveBeenCalledWith(null, target.address, target.family);
    expect(options.agent).toBe(false);
    expect(options.hostname).toBe('example.com');
    expect(options.servername).toBe('example.com');
    expect(options.headers.Host).toBe('example.com:8443');
    expect(options.path).toBe('/path?q=1');
  });
});

describe('clone-reference handle()', () => {
  const admin = {};
  const req = {};
  const goalId = 'goal-1';

  beforeEach(() => {
    vi.clearAllMocks();
    recheckSystemEnrichmentAuthorization.mockResolvedValue({
      ok: true,
      reasons: [],
      snapshot_hash: 'approved-hash',
      goal: { status: 'active', data: {} },
    });
  });

  it('skips and advances to image enrichment when goal is not a clone goal', async () => {
    loadGoal.mockResolvedValue({
      id: goalId,
      title: 'Build me a coffee shop landing page',
      description: 'Use color #6B4F35',
      data: {},
    });

    const result = await handle(admin, { goalId }, req);
    expect(result.status).toBe('skipped');
    expect(enqueueAuthorizedSystemEnrichmentNext).toHaveBeenCalledWith(
      expect.objectContaining({ admin, action: 'image-pool', goalId })
    );
    expect(updateGoalIfExecutionAuthorized).not.toHaveBeenCalledWith(
      admin,
      goalId,
      expect.objectContaining({
        data: expect.objectContaining({ clone_reference: expect.anything() }),
      })
    );
  });

  it('populates clone_reference for a single-URL clone goal', async () => {
    loadGoal.mockResolvedValue({
      id: goalId,
      title: 'Clone https://example.com landing page with new brand color #7C3AED',
      description: '',
      data: {},
    });

    const fakeHtml = '<html><head><title>Example</title></head><body><h1>Hello</h1></body></html>';
    const fetchHtml = vi.fn().mockResolvedValue(htmlResponse(fakeHtml));

    const result = await handle(admin, { goalId }, req, { fetchHtml });
    expect(result.status).toBe('created');
    expect(result.mode).toBe('single');
    expect(result.sourceCount).toBe(1);
    expect(updateGoalIfExecutionAuthorized).toHaveBeenCalled();
    expect(updateGoalIfExecutionAuthorized.mock.calls[0][2]).toBe('approved-hash');
    const updateArgs = updateGoalIfExecutionAuthorized.mock.calls[0][3];
    expect(updateArgs.data.clone_reference.sources[0].url).toBe('https://example.com');
    expect(updateArgs.data.clone_reference.sources[0].status).toBe('ok');
    expect(updateArgs.data.clone_reference.sources[0].cleaned_html).toContain('<h1>Hello</h1>');
    expect(enqueueAuthorizedSystemEnrichmentNext).toHaveBeenCalledWith(
      expect.objectContaining({ admin, action: 'image-pool', goalId })
    );
  });

  it('records an error source when the fetch fails (404)', async () => {
    loadGoal.mockResolvedValue({
      id: goalId,
      title: 'Clone https://does-not-exist.example landing page #FF6600',
      description: '',
      data: {},
    });
    const fetchHtml = vi.fn().mockResolvedValue(htmlResponse('', 404));

    const result = await handle(admin, { goalId }, req, { fetchHtml });
    expect(result.status).toBe('created');
    const updateArgs = updateGoalIfExecutionAuthorized.mock.calls[0][3];
    expect(updateArgs.data.clone_reference.sources[0].status).toBe('error');
    expect(updateArgs.data.clone_reference.sources[0].error).toContain('404');
  });

  it('does NOT re-run when clone_reference already populated', async () => {
    loadGoal.mockResolvedValue({
      id: goalId,
      title: 'Clone https://example.com landing page #7C3AED',
      description: '',
      data: { clone_reference: { mode: 'single', sources: [{ url: 'x', status: 'ok' }] } },
    });

    const result = await handle(admin, { goalId }, req);
    expect(result.status).toBe('already_set');
    expect(enqueueAuthorizedSystemEnrichmentNext).toHaveBeenCalledWith(
      expect.objectContaining({ admin, action: 'image-pool', goalId })
    );
    expect(updateGoalIfExecutionAuthorized).not.toHaveBeenCalled();
  });

  it('handles multi-source goals (fetches multiple URLs in parallel)', async () => {
    loadGoal.mockResolvedValue({
      id: goalId,
      title:
        'Review the whole site at https://a.example and https://b.example and create an affiliate landing page #7C3AED',
      description: '',
      data: {},
    });
    const fetchHtml = vi
      .fn()
      .mockResolvedValue(htmlResponse('<html><body><h1>x</h1></body></html>'));

    const result = await handle(admin, { goalId }, req, { fetchHtml });
    expect(result.status).toBe('created');
    expect(result.mode).toBe('multi');
    expect(result.sourceCount).toBe(2);
    expect(fetchHtml).toHaveBeenCalledTimes(2);
  });

  it('fetches only canonical native URLs and replaces an unbound stale clone reference', async () => {
    const goal = acceptedNativeLandingEnrichmentGoal();
    goal.data.clone_reference = {
      mode: 'single',
      sources: [{ url: 'https://unapproved.example', status: 'ok' }],
    };
    loadGoal.mockResolvedValue(goal);
    requireSystemEnrichmentAuthorization.mockResolvedValueOnce({
      ok: true,
      reasons: [],
      enrichment: { source_urls: ['https://canonical.example/reference'] },
    });
    recheckSystemEnrichmentAuthorization.mockResolvedValueOnce({
      ok: true,
      reasons: [],
      snapshot_hash: 'approved-hash',
      goal,
    });
    const fetchHtml = vi
      .fn()
      .mockResolvedValue(htmlResponse('<html><body><h1>Canonical</h1></body></html>'));

    const result = await handle(admin, { goalId: goal.id }, req, { fetchHtml });

    expect(result.status).toBe('created');
    expect(fetchHtml).toHaveBeenCalledOnce();
    expect(fetchHtml).toHaveBeenCalledWith(
      'https://canonical.example/reference',
      expect.anything()
    );
    expect(fetchHtml).not.toHaveBeenCalledWith('https://unapproved.example', expect.anything());
    const cloneReference = updateGoalIfExecutionAuthorized.mock.calls[0][3].data.clone_reference;
    expect(cloneReference.sources[0].url).toBe('https://canonical.example/reference');
    expect(cloneReference.scope_hash).toBe(
      goal.data.axwise_customer_intelligence.scope_packet.scope_hash
    );
  });

  it('does not persist fetched HTML when approval is lost in flight', async () => {
    loadGoal.mockResolvedValue({
      id: goalId,
      title: 'Clone https://example.com landing page with new brand color #7C3AED',
      description: '',
      data: {},
    });
    recheckSystemEnrichmentAuthorization.mockResolvedValueOnce({
      ok: false,
      reasons: ['goal_not_active'],
      goal: { status: 'cancelled', data: {} },
    });
    const fetchHtml = vi
      .fn()
      .mockResolvedValue(
        htmlResponse('<html><body><h1>Fetched but not retained</h1></body></html>')
      );

    const result = await handle(admin, { goalId }, req, { fetchHtml });

    expect(result.status).toBe('authorization_lost');
    expect(updateGoalIfExecutionAuthorized).not.toHaveBeenCalled();
    expect(enqueueAuthorizedSystemEnrichmentNext).not.toHaveBeenCalled();
  });

  it('does not chain when the atomic approval-hash write loses the race', async () => {
    loadGoal.mockResolvedValue({
      id: goalId,
      title: 'Clone https://example.com landing page with new brand color #7C3AED',
      description: '',
      data: {},
    });
    updateGoalIfExecutionAuthorized.mockResolvedValueOnce(false);
    const fetchHtml = vi
      .fn()
      .mockResolvedValue(htmlResponse('<html><body><h1>Stale approval</h1></body></html>'));

    const result = await handle(admin, { goalId }, req, { fetchHtml });

    expect(result.status).toBe('authorization_lost');
    expect(enqueueAuthorizedSystemEnrichmentNext).not.toHaveBeenCalled();
  });
});
