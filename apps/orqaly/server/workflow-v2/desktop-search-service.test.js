// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDesktopSearchService } from './desktop-search-service.js';

const auth = { userId: 'user-search' };
const clock = () => new Date('2026-09-23T09:00:00.000Z');
const input = {
  query: 'What are the latest local headlines in Bremen? Give me 3 short bullets.',
  location: 'Bremen',
  timeRange: 'this weekend',
  radiusKm: 25,
};

function interaction(statements = ['Café Bremen published an update.', 'The city announced a transit change.']) {
  const output = statements.join('\n');
  const annotations = statements.map((statement, index) => {
    const start = Buffer.byteLength(statements.slice(0, index).join('\n') + (index ? '\n' : ''), 'utf8');
    return {
      type: 'url_citation',
      url: `https://example.com/story-${index}`,
      title: index ? 'Transit [Bremen]' : 'Bremen source',
      start_index: start,
      end_index: start + Buffer.byteLength(statement, 'utf8'),
    };
  });
  return {
    status: 'completed',
    steps: [
      { type: 'google_search_call', arguments: { queries: ['Bremen local headlines'] } },
      { type: 'model_output', content: [{ type: 'text', text: output, annotations }] },
    ],
  };
}

function response(value) {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
}

describe('independent grounded desktop search', () => {
  it('uses one stateless native Google search and returns partial cited findings', async () => {
    const fetchImpl = vi.fn(async () => response(interaction()));
    const service = createDesktopSearchService({ apiKey: 'server-only-key', fetchImpl, clock });

    const result = await service.search(auth, input);

    expect(result).toEqual({
      markdown: 'Search-grounded findings; publication dates not independently verified.\n\n'
        + '- Café Bremen published an update. — [Bremen source](<https://example.com/story-0>)\n'
        + '- The city announced a transit change. — [Transit \\[Bremen\\]](<https://example.com/story-1>)',
      sources: [
        { title: 'Bremen source', url: 'https://example.com/story-0' },
        { title: 'Transit [Bremen]', url: 'https://example.com/story-1' },
      ],
      outcome: 'partial',
      verification: 'provider_grounded',
      warnings: ['publication_dates_not_independently_verified'],
      queries: ['Bremen local headlines'],
      retrievedAt: '2026-09-23T09:00:00.000Z',
    });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(options.headers['x-goog-api-key']).toBe('server-only-key');
    expect(JSON.parse(options.body)).toMatchObject({
      model: 'gemini-3.8-flash',
      tools: [{ type: 'google_search' }],
      store: false,
      generation_config: { thinking_level: 'low' },
    });
    expect(JSON.parse(JSON.parse(options.body).input)).toEqual({ ...input, currentDate: '2026-09-23' });
    expect(JSON.stringify(result)).not.toContain('server-only-key');
  });

  it('reports grounded when every response claim has a source', async () => {
    const service = createDesktopSearchService({
      apiKey: 'key', clock, fetchImpl: async () => response(interaction(['One supported result.'])),
    });
    const result = await service.search(auth, { query: 'Find one result' });
    expect(result.outcome).toBe('grounded');
    expect(result.sources).toHaveLength(1);
  });

  it('keeps all cited news while marking publication-date uncertainty as partial', async () => {
    const service = createDesktopSearchService({
      apiKey: 'key', clock,
      fetchImpl: async () => response(interaction(['First headline.', 'Second headline.', 'Third headline.'])),
    });
    const result = await service.search(auth, {
      query: 'Latest Bremen headlines, 3 short bullets', location: 'Bremen',
    });
    expect(result.outcome).toBe('partial');
    expect(result.sources).toHaveLength(3);
    expect(result.markdown.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(3);
  });

  it('merges nested citations by article and removes model supplied Markdown links', async () => {
    const lines = [
      '1. **Riga transit:** [A new route starts tomorrow](https://unverified.invalid/route) — 23 Sep 2026.',
      '2. **Riga council:** [A hearing is scheduled](https://unverified.invalid/hearing) — 24 Sep 2026.',
      '3. **Riga parks:** [A park reopens](https://unverified.invalid/park) — 25 Sep 2026.',
    ];
    const text = lines.join('\n');
    const bytes = Buffer.from(text, 'utf8');
    const urls = [
      'https://example.com/articles/transit',
      'https://example.com/articles/council',
      'https://example.com/articles/parks',
    ];
    const annotations = lines.flatMap((line, index) => {
      const start = bytes.indexOf(Buffer.from(line, 'utf8'));
      const title = line.match(/\[([^\]]+)\]/u)[1];
      const nestedStart = bytes.indexOf(Buffer.from(title, 'utf8'));
      return [
        { type: 'url_citation', url: urls[index], title: `Publisher ${index + 1}`,
          start_index: start, end_index: start + Buffer.byteLength(line, 'utf8') },
        { type: 'url_citation', url: urls[index], title: `Publisher ${index + 1}`,
          start_index: nestedStart, end_index: nestedStart + Buffer.byteLength(title, 'utf8') },
      ];
    });
    const grounded = {
      status: 'completed',
      steps: [
        { type: 'google_search_call', arguments: { queries: ['Riga local news'] } },
        { type: 'model_output', content: [{ type: 'text', text, annotations }] },
      ],
    };
    const service = createDesktopSearchService({ apiKey: 'key', clock,
      fetchImpl: async () => response(grounded) });

    const result = await service.search(auth, { query: 'Give me 3 Riga headlines' });

    expect(result.markdown.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(3);
    expect(result.markdown).toContain('Riga transit: A new route starts tomorrow — 23 Sep 2026.');
    expect(result.markdown).not.toContain('unverified.invalid');
    expect(result.markdown).not.toContain('**');
    expect(result.sources.map((source) => source.url)).toEqual(urls);
    for (const url of urls) expect(result.markdown).toContain(`<${url}>`);
    expect(result).toMatchObject({ verification: 'provider_grounded',
      warnings: ['publication_dates_not_independently_verified'] });
  });

  it('keeps nested article metadata in one bullet with only that article’s citations', async () => {
    const text = [
      '- **Café bridge works**',
      '  - **Date:** 23 Sep 2026',
      '  - **Summary:** Temporary closures affect the quay.',
      '  - **Source:** [Local desk](https://unverified.invalid/bridge)',
      '- **Park project**',
      '  - **Date:** unknown',
      '  - **Summary:** A new garden is proposed.',
    ].join('\n');
    const bytes = Buffer.from(text, 'utf8');
    const first = 'closures affect the quay';
    const second = 'A new garden is proposed';
    const firstStart = bytes.indexOf(Buffer.from(first, 'utf8'));
    const secondStart = bytes.indexOf(Buffer.from(second, 'utf8'));
    const urls = ['https://example.com/bridge', 'https://example.com/garden'];
    const grounded = {
      status: 'completed',
      steps: [
        { type: 'google_search_call', arguments: { queries: ['local projects'] } },
        { type: 'model_output', content: [{ type: 'text', text, annotations: [
          { type: 'url_citation', url: urls[0], title: 'Local desk',
            start_index: firstStart, end_index: firstStart + Buffer.byteLength(first, 'utf8') },
          { type: 'url_citation', url: urls[1], title: 'Park publisher',
            start_index: secondStart, end_index: secondStart + Buffer.byteLength(second, 'utf8') },
        ] }] },
      ],
    };
    const service = createDesktopSearchService({ apiKey: 'key', clock,
      fetchImpl: async () => response(grounded) });

    const result = await service.search(auth, { query: 'Give me 2 local headlines' });

    const bullets = result.markdown.split('\n').filter((line) => line.startsWith('- '));
    expect(bullets).toHaveLength(2);
    expect(bullets[0]).toContain('Café bridge works Date: 23 Sep 2026 Summary: Temporary closures affect the quay. Source: Local desk');
    expect(bullets[1]).toContain('Park project Date: unknown Summary: A new garden is proposed.');
    expect(bullets[0]).toContain(`<${urls[0]}>`);
    expect(bullets[0]).not.toContain(urls[1]);
    expect(bullets[1]).toContain(`<${urls[1]}>`);
    expect(bullets[1]).not.toContain(urls[0]);
    expect(result.markdown).not.toContain('unverified.invalid');
    expect(result.markdown).not.toContain('**');
    expect(result.sources.map((source) => source.url)).toEqual(urls);
  });

  it('removes orphaned Markdown delimiters from a non-list cited span', async () => {
    const text = '**Café headline** — an update.';
    const cited = 'Café headline** — an update.';
    const start = Buffer.from(text, 'utf8').indexOf(Buffer.from(cited, 'utf8'));
    const grounded = {
      status: 'completed',
      steps: [
        { type: 'google_search_call', arguments: { queries: ['Café update'] } },
        { type: 'model_output', content: [{ type: 'text', text, annotations: [
          { type: 'url_citation', url: 'https://example.com/cafe', title: 'Café news',
            start_index: start, end_index: start + Buffer.byteLength(cited, 'utf8') },
        ] }] },
      ],
    };
    const service = createDesktopSearchService({ apiKey: 'key', clock,
      fetchImpl: async () => response(grounded) });

    const result = await service.search(auth, { query: 'Café update' });

    expect(result.markdown).toContain('- Café headline — an update. — [Café news](<https://example.com/cafe>)');
    expect(result.markdown).not.toContain('**');
  });

  it('returns no result without exposing uncited model prose or invented links', async () => {
    const unsupported = interaction();
    unsupported.steps[1].content[0].annotations = [];
    const service = createDesktopSearchService({ apiKey: 'key', clock,
      fetchImpl: async () => response(unsupported) });
    const result = await service.search(auth, { query: 'Find sources' });
    expect(result).toMatchObject({ outcome: 'no_results', verification: 'unverified', sources: [],
      markdown: 'I could not verify a source for this search.' });
    expect(result.markdown).not.toContain('Café');
  });

  it('rejects unbounded and unscoped inputs before provider spend', async () => {
    const fetchImpl = vi.fn();
    const service = createDesktopSearchService({ apiKey: 'key', fetchImpl });
    await expect(service.search({}, input)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    for (const bad of [
      { ...input, query: '' },
      { ...input, query: 'x'.repeat(2_001) },
      { ...input, timeRange: 'x'.repeat(201) },
      { query: 'Nearby stories', radiusKm: 25 },
      { ...input, radiusKm: 10_000 },
      { ...input, url: 'https://attacker.invalid' },
    ]) await expect(service.search(auth, bad)).rejects.toMatchObject({ name: 'ZodError' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('bounds provider responses and deadlines without returning credentials', async () => {
    const huge = response({ status: 'completed', steps: [], padding: 'x'.repeat(1024 * 1024) });
    const largeService = createDesktopSearchService({ apiKey: 'secret-key', fetchImpl: async () => huge });
    await expect(largeService.search(auth, { query: 'x' })).rejects.toMatchObject({ code: 'SEARCH_PROVIDER_RESPONSE_TOO_LARGE' });
    const slowService = createDesktopSearchService({
      apiKey: 'secret-key', deadlineMs: 10,
      fetchImpl: () => new Promise(() => {}),
    });
    await expect(slowService.search(auth, { query: 'x' })).rejects.toMatchObject({ code: 'SEARCH_TIMEOUT' });
  });

  it('cancels the upstream search when the caller disconnects', async () => {
    const controller = new AbortController();
    let upstreamSignal;
    let markStarted;
    const started = new Promise((resolve) => { markStarted = resolve; });
    const service = createDesktopSearchService({
      apiKey: 'secret-key',
      fetchImpl: (_url, options) => {
        upstreamSignal = options.signal;
        markStarted();
        return new Promise((_finish, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
        });
      },
    });
    const request = service.search(auth, { query: 'Bremen' }, { signal: controller.signal });
    await started;
    controller.abort(new DOMException('caller disconnected', 'AbortError'));
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(upstreamSignal.aborted).toBe(true);
  });
});
