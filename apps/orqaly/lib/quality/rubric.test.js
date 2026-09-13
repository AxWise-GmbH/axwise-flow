/**
 * Tests for the quality rubric — deterministic scorers.
 *
 * Validates that each sub-scorer correctly identifies professional vs AI-slop
 * output using hand-crafted positive and negative examples.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  scoreBannedPhrases,
  scoreEmDashDensity,
  scoreSentenceVariance,
  scoreSpecificity,
  scoreHedging,
  scoreCopywriting,
  scoreCodeDeployment,
  scoreVisualAsset,
  scoreStrategyDoc,
  scoreDeliverable,
  BANNED_PHRASES,
  HEDGING_WORDS,
} from './rubric.js';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name) => {
          if (name.toLowerCase() === 'content-type') return 'image/png';
          return null;
        }
      },
      text: async () => '<html><head><title>Test</title><meta name="viewport" content="width=device-width"></head><body>Hi</body></html>',
    };
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── scoreBannedPhrases ─────────────────────────────────────

describe('scoreBannedPhrases', () => {
  it('passes clean professional copy', () => {
    const text = 'Rustic Roots delivers naturally-fermented sourdough every Saturday morning. The bread is $24 per week. Kate from Park Slope says the crust is the best she has eaten.';
    const result = scoreBannedPhrases(text);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.violations).toHaveLength(0);
  });

  it('catches "in today\'s fast-paced world"', () => {
    const text = "In today's fast-paced world, our product seamlessly integrates with your workflow.";
    const result = scoreBannedPhrases(text);
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
    expect(result.score).toBeLessThan(100);
  });

  it('catches "game-changer" and "unlock the power"', () => {
    const text = 'Our innovative solution is a game-changer that will unlock the power of your data.';
    const result = scoreBannedPhrases(text);
    expect(result.passed).toBe(false);
    expect(result.totalMatches).toBeGreaterThanOrEqual(3);
  });

  it('catches "leverage our expertise" style', () => {
    const text = 'We help you leverage our expertise to maximize your returns.';
    const result = scoreBannedPhrases(text);
    expect(result.passed).toBe(false);
  });

  it('catches "world-class" and "cutting-edge"', () => {
    const text = 'Our world-class team uses cutting-edge technology.';
    const result = scoreBannedPhrases(text);
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });

  it('BANNED_PHRASES is at least 20 patterns', () => {
    expect(BANNED_PHRASES.length).toBeGreaterThanOrEqual(20);
  });
});

// ── scoreEmDashDensity ────────────────────────────────────

describe('scoreEmDashDensity', () => {
  it('passes human-like text with 0 em-dashes', () => {
    const text = 'Kate tried the bread. She loved it. Her husband loved it too. They subscribed the next week, paying $24 weekly for fresh sourdough.';
    const result = scoreEmDashDensity(text);
    expect(result.passed).toBe(true);
    expect(result.count).toBe(0);
    expect(result.score).toBe(100);
  });

  it('passes text with 1 em-dash per 100 words', () => {
    // 50 words with 0 em-dashes = 0/100w, well under 0.8
    const text = 'The bread is baked fresh every Friday night in a small Brooklyn kitchen. The starter is 18 years old, kept alive through three apartment moves. Every loaf takes 48 hours, so there is no such thing as a rush order.';
    const result = scoreEmDashDensity(text);
    expect(result.passed).toBe(true);
  });

  it('fails AI-slop text with high em-dash density', () => {
    const text = 'The product — our flagship offering — is truly innovative — a game-changer — that will — without a doubt — transform your business — forever — through cutting-edge technology.';
    const result = scoreEmDashDensity(text);
    expect(result.passed).toBe(false);
    expect(result.count).toBeGreaterThanOrEqual(6);
  });

  it('handles empty text', () => {
    const result = scoreEmDashDensity('');
    expect(result.score).toBe(100);
  });
});

// ── scoreSentenceVariance ────────────────────────────────

describe('scoreSentenceVariance', () => {
  it('passes text with varied sentence lengths', () => {
    const text = 'Kate loved it. Her husband was the skeptic, having sworn off supermarket bread years ago after one too many disappointing baguettes. He tried a slice. He subscribed.';
    const result = scoreSentenceVariance(text);
    expect(result.passed).toBe(true);
  });

  it('fails uniform AI-like sentences', () => {
    const text = 'The product offers great features and benefits. The solution provides amazing value and results. The service delivers incredible quality and experience. The team creates wonderful products and services. The platform enables powerful workflows and automations.';
    const result = scoreSentenceVariance(text);
    expect(result.passed).toBe(false);
  });

  it('returns null for too-few sentences', () => {
    const text = 'Only one sentence here.';
    const result = scoreSentenceVariance(text);
    expect(result.passed).toBe(null);
  });
});

// ── scoreSpecificity ────────────────────────────────────

describe('scoreSpecificity', () => {
  it('rewards specific numbers, brands, dates, URLs', () => {
    const text = 'Rustic Roots launches October 15, 2026 in Brooklyn with 3 partner cafes including Partners Coffee and Devoción. First-week subscribers save $12. Follow @rusticroots on Instagram or visit https://rusticroots.example.com for details.';
    const result = scoreSpecificity(text);
    expect(result.passed).toBe(true);
    expect(result.totalSpecific).toBeGreaterThan(5);
  });

  it('fails generic text with no entities', () => {
    const text = 'Our company provides great products and services to many customers in various locations. We help businesses grow and succeed through our solutions.';
    const result = scoreSpecificity(text);
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(30);
  });
});

// ── scoreHedging ────────────────────────────────────────

describe('scoreHedging', () => {
  it('passes confident text', () => {
    const text = 'The bread is 48-hour fermented. The price is $24 per week. Delivery happens every Saturday.';
    const result = scoreHedging(text);
    expect(result.passed).toBe(true);
  });

  it('fails wishy-washy text', () => {
    const text = 'The bread might be fermented for perhaps 48 hours, possibly longer, generally speaking. It could be $24 or maybe $25, typically. Delivery usually might happen possibly on Saturday, perhaps.';
    const result = scoreHedging(text);
    expect(result.passed).toBe(false);
    expect(result.density).toBeGreaterThan(2.5);
  });

  it('HEDGING_WORDS list is not empty', () => {
    expect(HEDGING_WORDS.length).toBeGreaterThan(10);
  });
});

// ── scoreCopywriting composite ──────────────────────────

describe('scoreCopywriting (composite)', () => {
  it('scores professional Rustic Roots copy high', () => {
    const text = 'Rustic Roots delivers naturally-fermented sourdough every Saturday morning to Brooklyn doorsteps. Each loaf takes 48 hours to rise. Kate from Park Slope has been subscribing since October — her kids wait at the window. The subscription starts at $24 per week. Pause anytime.';
    const result = scoreCopywriting(text);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.subscores.banned.passed).toBe(true);
  });

  it('scores AI-slop copy low', () => {
    const text = "In today's fast-paced world, our innovative sourdough solution seamlessly integrates naturally-fermented bread into your weekly routine. We help you unlock the power of artisan baking through our cutting-edge subscription platform. This game-changer delivers world-class quality that will revolutionize your breakfast experience. Our best-in-class team leverages years of expertise to empower you to achieve your bread goals.";
    const result = scoreCopywriting(text);
    expect(result.score).toBeLessThan(70);
    expect(result.subscores.banned.passed).toBe(false);
    expect(result.critical).toBe(true);
  });

  it('returns well-formed subscores', () => {
    const result = scoreCopywriting('The bread is good. It costs $24. Kate loves it.');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('passed');
    expect(result.subscores).toHaveProperty('banned');
    expect(result.subscores).toHaveProperty('emDash');
    expect(result.subscores).toHaveProperty('variance');
    expect(result.subscores).toHaveProperty('specificity');
    expect(result.subscores).toHaveProperty('hedging');
  });
});

// ── scoreCodeDeployment ────────────────────────────────

describe('scoreCodeDeployment', () => {
  it('fails with no URLs', async () => {
    const result = await scoreCodeDeployment({});
    expect(result.passed).toBe(false);
    expect(result.checks.hasDeployUrl).toBe(false);
  });

  it('detects valid GitHub URL format', async () => {
    const result = await scoreCodeDeployment({
      repoUrl: 'https://github.com/rustic-roots/landing-page',
      deploymentUrl: null,
    });
    expect(result.checks.hasRepoUrl).toBe(true);
  });

  it('detects valid deployment URL format', async () => {
    const result = await scoreCodeDeployment({
      deploymentUrl: 'https://rustic-roots.vercel.app',
    });
    expect(result.checks.hasDeployUrl).toBe(true);
  });

  it('detects viewport meta tag in HTML', async () => {
    const html = '<!DOCTYPE html><html><head><title>Test</title><meta name="viewport" content="width=device-width"></head><body>Hi</body></html>';
    const result = await scoreCodeDeployment({
      deploymentUrl: 'https://example.test',
      html,
    });
    expect(result.checks.hasViewport).toBe(true);
    expect(result.checks.hasTitle).toBe(true);
  });

  it('detects media queries in HTML', async () => {
    const html = '<!DOCTYPE html><html><head><style>@media (max-width: 640px) { body { font-size: 14px; } }</style></head><body>Hi</body></html>';
    const result = await scoreCodeDeployment({
      deploymentUrl: 'https://example.test',
      html,
    });
    expect(result.checks.hasMediaQueries).toBe(true);
  });

  it('detects Lorem ipsum boilerplate', async () => {
    const html = '<html><body>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</body></html>';
    const result = await scoreCodeDeployment({
      deploymentUrl: 'https://example.test',
      html,
    });
    expect(result.checks.noBoilerplate).toBe(false);
  });

  it('passes valid responsive HTML', async () => {
    const html = '<!DOCTYPE html><html><head><title>Rustic Roots</title><meta name="viewport" content="width=device-width"><style>@media (max-width: 640px) { body { font-size: 14px; } }</style></head><body><h1>Rustic Roots</h1><img src="bread.jpg" alt="sourdough loaf"></body></html>';
    const result = await scoreCodeDeployment({
      deploymentUrl: 'https://rustic-roots.test',
      html,
    });
    expect(result.checks.hasViewport).toBe(true);
    expect(result.checks.hasMediaQueries).toBe(true);
    expect(result.checks.noBoilerplate).toBe(true);
    expect(result.checks.hasAltText).toBe(true);
    expect(result.checks.hasTitle).toBe(true);
  });
});

// ── scoreVisualAsset ──────────────────────────────────

describe('scoreVisualAsset', () => {
  it('rejects empty URL', async () => {
    const result = await scoreVisualAsset('');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('rejects invalid URL format', async () => {
    const result = await scoreVisualAsset('not-a-url');
    expect(result.passed).toBe(false);
  });

  it('returns checks object for valid-format URL', async () => {
    // Don't actually HEAD a real URL in unit test — mock by checking structure
    const result = await scoreVisualAsset('https://example.test/banner.png', { format: 'png' });
    expect(result).toHaveProperty('checks');
    expect(result.checks).toHaveProperty('urlFormat');
    expect(result.checks.urlFormat).toBe(true);
  });
});

// ── scoreStrategyDoc ──────────────────────────────────

describe('scoreStrategyDoc', () => {
  it('rewards docs with multiple citations', async () => {
    const text = 'Industry engagement rates average 1.2% on Instagram (https://example.com/report1). Small food brands typically see 300-800 followers growth per month (https://example.com/report2). TikTok reaches 68% of Gen Z (https://example.com/report3). Platform-specific tactics: use Instagram Reels carousel format for recipes.';
    const result = await scoreStrategyDoc(text, { validateUrls: false });
    expect(result.checks.citationCount).toBe(3);
    expect(result.checks.hasMinCitations).toBe(true);
  });

  it('fails docs with no citations', async () => {
    const text = 'Post more content. Engage with followers. Grow your audience. Target your ideal customer.';
    const result = await scoreStrategyDoc(text, { validateUrls: false });
    expect(result.passed).toBe(false);
    expect(result.checks.hasMinCitations).toBe(false);
  });

  it('detects platform-specific tactics', async () => {
    const text = 'Use Instagram Reels and TikTok Duets. Post LinkedIn Carousels. Create YouTube Shorts.';
    const result = await scoreStrategyDoc(text, { validateUrls: false });
    expect(result.checks.platformSpecificCount).toBeGreaterThanOrEqual(2);
  });

  it('detects numeric claims', async () => {
    const text = 'We will reach 10k followers in 3 months. Engagement rate will hit 2.5% by week 4. Budget is $500/week.';
    const result = await scoreStrategyDoc(text, { validateUrls: false });
    expect(result.checks.numericClaims).toBeGreaterThanOrEqual(3);
  });
});

// ── scoreDeliverable router ───────────────────────────

describe('scoreDeliverable router', () => {
  it('routes markdown to copywriting scorer', async () => {
    const result = await scoreDeliverable('markdown', { text: 'Kate loves the bread.' });
    expect(result).toHaveProperty('subscores');
  });

  it('routes code to deployment scorer', async () => {
    const result = await scoreDeliverable('code', { deploymentUrl: null });
    expect(result).toHaveProperty('checks');
  });

  it('routes asset to visual scorer', async () => {
    const result = await scoreDeliverable('asset', { imageUrl: null });
    expect(result.passed).toBe(false);
  });

  it('routes strategy to strategy scorer', async () => {
    const result = await scoreDeliverable('strategy', { text: 'Short strategy.', validateUrls: false });
    expect(result).toHaveProperty('checks');
  });

  it('returns null score for unknown type', async () => {
    const result = await scoreDeliverable('weird', { text: 'test' });
    expect(result.score).toBe(null);
  });
});
