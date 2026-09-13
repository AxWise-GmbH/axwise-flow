/**
 * Tier 5 Bug C — section-splitter unit tests.
 *
 * Covers the three deliberate decisions:
 *  1. `detectMandatedSections` recognises the patterns we care about and
 *     conservatively returns [] otherwise.
 *  2. `runSectionedGeneration` makes N calls, stitches the results, and
 *     surfaces sectional failures without aborting the run.
 *  3. `shouldUseSplitter` only opts in when the env flag is on AND the
 *     deliverable type matches AND a real section structure is detected.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  detectMandatedSections,
  buildSectionPrompt,
  runSectionedGeneration,
  stitchSections,
  shouldUseSplitter,
} from './section-splitter.js';

describe('detectMandatedSections', () => {
  it('detects explicit Section N: labels', () => {
    const text = `
      Build a landing page brief with the following 8 sections.

      Section 1: Research & Market Analysis
      Section 2: Architecture & 7-block selling structure
      Section 3: Design system with brand colors
      Section 4: Full copy deck (Latvian + English)
      Section 5: Image plan with Pexels queries
      Section 6: Technical specs
      Section 7: QA checklist
      Section 8: Deployment notes
    `;
    const sections = detectMandatedSections(text);
    expect(sections).toHaveLength(8);
    expect(sections[0]).toMatch(/Research/);
    expect(sections[7]).toMatch(/Deployment/);
  });

  it('detects Step N: labels (PM-planning style)', () => {
    const text = `
      Phase 1 — "Brief Creation" (deliverable_type: "markdown")
      Lorem ipsum dolor sit amet, this is filler that pushes us past 200 chars.

      Step 1: Research
      Step 2: Architecture
      Step 3: Copy
      Step 4: Image plan
    `;
    expect(detectMandatedSections(text)).toEqual([
      'Research',
      'Architecture',
      'Copy',
      'Image plan',
    ]);
  });

  it('detects numbered list of headers when monotonic', () => {
    const text = `
      Please produce a market analysis with the following structure.
      Lorem ipsum dolor sit amet — filler so the length passes the 200 char gate.

      1. Executive Summary
      2. Market Sizing
      3. Competitor Teardown
      4. Recommendations
    `;
    expect(detectMandatedSections(text)).toEqual([
      'Executive Summary',
      'Market Sizing',
      'Competitor Teardown',
      'Recommendations',
    ]);
  });

  it('detects markdown ## headers (3+)', () => {
    const text = `
      Produce a markdown document. Some explanatory text first so we hit the
      200-char minimum length threshold — otherwise the detector short-circuits.

      ## Overview
      ## Findings
      ## Conclusion
    `;
    expect(detectMandatedSections(text)).toEqual(['Overview', 'Findings', 'Conclusion']);
  });

  it('returns [] for short descriptions', () => {
    expect(detectMandatedSections('Write a one-pager.')).toEqual([]);
  });

  it('returns [] when fewer than 3 sections are detected', () => {
    const text = `
      Build a one-section thing with a single heading.
      Lorem ipsum filler text so the description passes the minimum length gate
      and we genuinely test the section-count threshold, not the size threshold.

      Section 1: Only Section
    `;
    expect(detectMandatedSections(text)).toEqual([]);
  });

  it('returns [] when numbered list is not monotonic (prose with numbers)', () => {
    const text = `
      Long enough text to pass the size gate. The user pasted some research
      where prose happens to mention numbers like "1. First option" and
      "3. Third option" without any structural meaning.

      1. First option
      3. Third option
      99. Edge case
    `;
    expect(detectMandatedSections(text)).toEqual([]);
  });

  it('handles null / empty input safely', () => {
    expect(detectMandatedSections(null)).toEqual([]);
    expect(detectMandatedSections('')).toEqual([]);
    expect(detectMandatedSections(undefined)).toEqual([]);
  });
});

describe('buildSectionPrompt', () => {
  it('includes prior section summaries when previousSections is non-empty', () => {
    const prompt = buildSectionPrompt({
      basePrompt: 'Write a brief.',
      sectionName: 'Copy Deck',
      previousSections: [
        {
          name: 'Research',
          content:
            'Latvia mobile market growing 18% YoY. Consumer demand for budget cases is strong.',
        },
        { name: 'Architecture', content: 'Hero, features, social proof, pricing, FAQ, footer.' },
      ],
    });
    expect(prompt).toContain('Already written sections');
    expect(prompt).toContain('Research');
    expect(prompt).toContain('Architecture');
    expect(prompt).toContain('Copy Deck');
    expect(prompt).toContain('do NOT repeat');
  });

  it('omits prior-section block on first call (empty previousSections)', () => {
    const prompt = buildSectionPrompt({
      basePrompt: 'Write a brief.',
      sectionName: 'Research',
      previousSections: [],
    });
    expect(prompt).not.toContain('Already written sections');
    expect(prompt).toContain('Research');
  });
});

describe('stitchSections', () => {
  it('concatenates sections with ## headers', () => {
    const out = stitchSections([
      { name: 'Intro', content: 'Welcome to the brief.' },
      { name: 'Body', content: 'The body details follow.' },
    ]);
    expect(out).toContain('## Intro\n\nWelcome to the brief.');
    expect(out).toContain('## Body\n\nThe body details follow.');
  });

  it('strips a model-added duplicate header to avoid double titling', () => {
    const out = stitchSections([
      { name: 'Research', content: '## Research\n\nThe model added its own header.' },
    ]);
    // Should contain exactly one "## Research" header, not two.
    const matches = out.match(/## Research/g) || [];
    expect(matches).toHaveLength(1);
  });
});

describe('runSectionedGeneration', () => {
  it('calls executeLlm once per section, in order, with cumulative context', async () => {
    const calls = [];
    const fakeLlm = vi.fn(async (opts) => {
      calls.push(opts.prompt);
      return {
        content: `content for call ${calls.length}`,
        usage: { total_tokens: 100 },
        estimatedCostUsd: 0.01,
        model: 'fake',
        provider: 'fake',
      };
    });

    const result = await runSectionedGeneration({
      basePrompt: 'Build a brief.',
      systemPrompt: 'You are a writer.',
      sections: ['A', 'B', 'C'],
      executeLlm: fakeLlm,
      llmOpts: { provider: 'fake', model: 'fake-v1', temperature: 0.4 },
    });

    expect(fakeLlm).toHaveBeenCalledTimes(3);
    expect(result.sectionsGenerated).toBe(3);
    expect(result.sectionsFailed).toBe(0);
    expect(result.content).toContain('## A');
    expect(result.content).toContain('## B');
    expect(result.content).toContain('## C');
    // Section B's prompt must reference section A
    expect(calls[1]).toContain('"A"');
    // Section C's prompt must reference both A and B
    expect(calls[2]).toContain('"A"');
    expect(calls[2]).toContain('"B"');
    expect(result.estimatedCostUsd).toBeCloseTo(0.03);
  });

  it('continues past a failed section instead of aborting', async () => {
    let i = 0;
    const fakeLlm = vi.fn(async () => {
      i++;
      if (i === 2) throw new Error('simulated provider hiccup');
      return { content: `s${i}`, usage: {}, estimatedCostUsd: 0 };
    });

    const result = await runSectionedGeneration({
      basePrompt: 'x',
      systemPrompt: 'y',
      sections: ['A', 'B', 'C'],
      executeLlm: fakeLlm,
      llmOpts: { provider: 'fake', model: 'm' },
    });

    expect(result.sectionsGenerated).toBe(2);
    expect(result.sectionsFailed).toBe(1);
    expect(result.content).toContain('## A');
    expect(result.content).not.toContain('## B');
    expect(result.content).toContain('## C');
  });

  it('immediately propagates execution revocation instead of returning partial output', async () => {
    const revoked = Object.assign(new Error('revoked'), {
      code: 'EXECUTION_AUTHORIZATION_REVOKED',
    });
    const fakeLlm = vi
      .fn()
      .mockResolvedValueOnce({ content: 'first section', usage: {}, estimatedCostUsd: 0 })
      .mockRejectedValueOnce(revoked);

    await expect(
      runSectionedGeneration({
        basePrompt: 'x',
        systemPrompt: 'y',
        sections: ['A', 'B', 'C'],
        executeLlm: fakeLlm,
        llmOpts: { provider: 'fake', model: 'm' },
      })
    ).rejects.toBe(revoked);
    expect(fakeLlm).toHaveBeenCalledTimes(2);
  });

  it('treats empty-content sections as failed; throws when every section is empty', async () => {
    const fakeLlm = vi.fn(async () => ({ content: '   ', usage: {}, estimatedCostUsd: 0 }));
    await expect(
      runSectionedGeneration({
        basePrompt: 'x',
        systemPrompt: 'y',
        sections: ['A', 'B'],
        executeLlm: fakeLlm,
        llmOpts: { provider: 'fake', model: 'm' },
      })
    ).rejects.toThrow(/all 2 sections failed/);
  });

  it('partial empties: one section returns content, one returns empty → success with 1/2 generated', async () => {
    let call = 0;
    const fakeLlm = vi.fn(async () => {
      call++;
      return call === 1
        ? { content: 'real content', usage: {}, estimatedCostUsd: 0 }
        : { content: '', usage: {}, estimatedCostUsd: 0 };
    });
    const result = await runSectionedGeneration({
      basePrompt: 'x',
      systemPrompt: 'y',
      sections: ['A', 'B'],
      executeLlm: fakeLlm,
      llmOpts: { provider: 'fake', model: 'm' },
    });
    expect(result.sectionsGenerated).toBe(1);
    expect(result.sectionsFailed).toBe(1);
    expect(result.content).toContain('## A');
    expect(result.content).not.toContain('## B');
  });

  it('throws when EVERY section fails', async () => {
    const fakeLlm = vi.fn(async () => {
      throw new Error('always fail');
    });
    await expect(
      runSectionedGeneration({
        basePrompt: 'x',
        systemPrompt: 'y',
        sections: ['A', 'B'],
        executeLlm: fakeLlm,
        llmOpts: { provider: 'fake', model: 'm' },
      })
    ).rejects.toThrow(/all 2 sections failed/);
  });
});

describe('shouldUseSplitter', () => {
  const longSectionedDesc = `
    Please produce a complete brief covering the following 4 sections.
    Lorem ipsum filler so the description is long enough to pass the size gate.

    Section 1: Research
    Section 2: Architecture
    Section 3: Copy
    Section 4: QA
  `;

  it('returns shouldSplit=true when env flag on, deliverable matches, sections detected', () => {
    const r = shouldUseSplitter({
      deliverableType: 'markdown',
      description: longSectionedDesc,
      env: { LARGE_DELIVERABLE_SPLIT: '1' },
    });
    expect(r.shouldSplit).toBe(true);
    expect(r.sections).toHaveLength(4);
  });

  it('returns shouldSplit=false when env flag off (even if sections detected)', () => {
    const r = shouldUseSplitter({
      deliverableType: 'markdown',
      description: longSectionedDesc,
      env: { LARGE_DELIVERABLE_SPLIT: '0' },
    });
    expect(r.shouldSplit).toBe(false);
    expect(r.reason).toBe('flag-off');
  });

  it('returns shouldSplit=false for unsupported deliverable types (e.g. code)', () => {
    const r = shouldUseSplitter({
      deliverableType: 'code',
      description: longSectionedDesc,
      env: { LARGE_DELIVERABLE_SPLIT: '1' },
    });
    expect(r.shouldSplit).toBe(false);
    expect(r.reason).toBe('deliverable-type-not-supported');
  });

  it('returns shouldSplit=false when description lacks a clear section structure', () => {
    const r = shouldUseSplitter({
      deliverableType: 'markdown',
      description: 'Write a one-pager about widgets.',
      env: { LARGE_DELIVERABLE_SPLIT: '1' },
    });
    expect(r.shouldSplit).toBe(false);
    expect(r.reason).toBe('too-few-sections-detected');
  });

  it('returns shouldSplit=true for deployment tasks with mandated sections', () => {
    const r = shouldUseSplitter({
      deliverableType: 'deployment',
      description: longSectionedDesc,
      env: { LARGE_DELIVERABLE_SPLIT: '1' },
    });
    expect(r.shouldSplit).toBe(true);
  });
});
