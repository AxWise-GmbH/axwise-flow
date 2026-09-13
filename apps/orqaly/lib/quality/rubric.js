/**
 * Quality Rubric — deterministic, automated scorers for deliverables.
 *
 * Phase 0 of the 4-phase quality test plan. Grades agent outputs against
 * objective professional-quality criteria that the current structural-only
 * quality_score in execute-task.js can't detect.
 *
 * Four categories of scorers:
 *   1. scoreCopywriting(text)          — prose quality (banned phrases, em-dashes, variance, specificity, hedging)
 *   2. scoreVisualAsset({ imageUrl })  — real image URL validation + format/dimensions
 *   3. scoreCodeDeployment({ ... })    — real repo + real deployment + responsive + no boilerplate
 *   4. scoreStrategyDoc(text)          — citations, numeric claims, platform-specific tactics
 *
 * Plus a summary helper `scoreAll(category, input)` that picks the right
 * scorer based on deliverable type and returns a single 0-100 composite score.
 *
 * All scorers are pure JS (no LLM calls) so they can run inline in
 * execute-task.js without cost. Network checks (HEAD requests) are async.
 *
 * Ref: deep research reports under the 4-phase plan.
 */
import { fetchWithJobLease } from '../../api/_lib/fetch.js';

// ── 1. COPYWRITING SCORERS ──────────────────────────────────────

/**
 * Banned phrase patterns that mark AI-slop copywriting.
 * Each match costs 8 points off a 100 base.
 */
export const BANNED_PHRASES = [
  /\bin\s+today'?s?\s+fast[\s-]?paced/i,
  /\bunlock\s+the\s+power\s+of\b/i,
  /\bseamlessly\s+(integrate|connect|work|transition)/i,
  /\bleverage\s+(?:our|the)\s+(?:power|potential|capabilities|expertise)/i,
  /\bgame[\s-]?changer/i,
  /\bas\s+a\s+\[(?:role|job|title|company)\]/i,
  /\bdelve\s+into\b/i,
  /\bit'?s?\s+important\s+to\s+note\b/i,
  /\bgoing\s+forward\b/i,
  /\bthink\s+outside\s+the\s+box\b/i,
  /\bblue[\s-]?sky\s+thinking\b/i,
  /\bsynergy\b/i,
  /\bparadigm\s+shift\b/i,
  /\bbarrier(?:s)?\s+to\s+entry\b/i,
  /\binnovative\s+solution/i,
  /\bneeds?\s+no\s+introduction\b/i,
  /\bcut\s+to\s+the\s+chase\b/i,
  /\blow[\s-]?hanging\s+fruit\b/i,
  /\bwe\s+help\s+you\s+(?:achieve|maximize|accelerate|drive|unlock)/i,
  /\bcutting[\s-]?edge\b/i,
  /\bbest[\s-]?in[\s-]?class\b/i,
  /\bworld[\s-]?class\b/i,
  /\bnext[\s-]?generation\b/i,
  /\brevolutionize\b/i,
  /\bstreamline\b/i,
  /\bempower\s+you\s+to\b/i,
];

export function scoreBannedPhrases(text) {
  const violations = [];
  for (const pattern of BANNED_PHRASES) {
    const matches = text.match(pattern);
    if (matches) {
      violations.push({ phrase: pattern.source, count: matches.length, sample: matches[0] });
    }
  }
  const totalMatches = violations.reduce((sum, v) => sum + v.count, 0);
  const score = Math.max(0, 100 - totalMatches * 8);
  return {
    passed: violations.length === 0,
    violations,
    totalMatches,
    score,
    feedback:
      violations.length === 0
        ? 'No banned AI-slop phrases'
        : `${totalMatches} banned phrase(s) found: ${violations
            .slice(0, 3)
            .map((v) => `"${v.sample}"`)
            .join(', ')}${violations.length > 3 ? '...' : ''}`,
  };
}

/**
 * Em-dash density — AI writes 5-15× more em-dashes than humans.
 * Human baseline: <0.8 per 100 words.
 */
export function scoreEmDashDensity(text) {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0)
    return { passed: null, density: 0, count: 0, score: 100, feedback: 'empty text' };

  const emDashCount = (text.match(/—/g) || []).length;
  const density = emDashCount / (words.length / 100); // per 100 words
  const humanMax = 0.8;
  const passed = density <= humanMax;

  return {
    passed,
    density: Number(density.toFixed(2)),
    count: emDashCount,
    wordCount: words.length,
    threshold: humanMax,
    score: passed ? 100 : Math.max(0, 100 - Math.round((density - humanMax) * 15)),
    feedback: passed
      ? `Em-dash density ${density.toFixed(2)}/100w is human-like`
      : `Em-dash density ${density.toFixed(2)}/100w exceeds human baseline ${humanMax} (AI artifact)`,
  };
}

/**
 * Sentence-length variance — AI writes uniformly long sentences.
 * Human baseline: coefficient of variation (stdDev/mean) >= 0.35.
 */
export function scoreSentenceVariance(text) {
  const sentences = (text.match(/[^.!?]+[.!?]+/g) || [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length < 3) {
    return {
      passed: null,
      score: null,
      sentences: sentences.length,
      feedback: 'Insufficient sentences (<3) for variance analysis',
    };
  }

  const lengths = sentences.map((s) => s.split(/\s+/).filter((w) => w.length > 0).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (mean === 0) return { passed: null, score: null, feedback: 'Zero-length sentences' };

  const variance = lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;
  const humanThreshold = 0.35;
  const passed = cv >= humanThreshold;

  return {
    passed,
    coefficientOfVariation: Number(cv.toFixed(3)),
    meanLength: Number(mean.toFixed(1)),
    stdDev: Number(stdDev.toFixed(1)),
    sentences: sentences.length,
    threshold: humanThreshold,
    score: Math.min(100, Math.round(cv * 200)),
    feedback: passed
      ? `Sentence length varies naturally (CV ${cv.toFixed(2)})`
      : `Sentences are too uniform (CV ${cv.toFixed(2)} < ${humanThreshold}) — AI artifact`,
  };
}

/**
 * Specificity — real numbers, named entities, dates, URLs per 100 words.
 * Human baseline: >=8 real entities per 100 words.
 */
export function scoreSpecificity(text) {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return { passed: null, score: 0, feedback: 'empty text' };

  const metrics = {
    numbers: (text.match(/\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\b/g) || []).length,
    percentages: (text.match(/\d+(?:\.\d+)?\s*%/g) || []).length,
    dates: (
      text.match(
        /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?:,?\s+\d{4})?\b/gi
      ) || []
    ).length,
    years: (text.match(/\b(?:19|20)\d{2}\b/g) || []).length,
    urls: (text.match(/https?:\/\/[^\s)<>"']+/g) || []).length,
    mentions: (text.match(/@[A-Za-z0-9_-]+/g) || []).length,
    hashtags: (text.match(/#[A-Za-z0-9_-]+/g) || []).length,
    dollars: (text.match(/\$\d+(?:,\d{3})*(?:\.\d+)?[KMB]?/g) || []).length,
  };

  const totalSpecific = Object.values(metrics).reduce((a, b) => a + b, 0);
  const specificity = (totalSpecific / words.length) * 100; // per 100 words
  const humanThreshold = 8;
  const passed = specificity >= humanThreshold;

  return {
    passed,
    specificity: Number(specificity.toFixed(1)),
    totalSpecific,
    wordCount: words.length,
    metrics,
    threshold: humanThreshold,
    score: Math.min(100, Math.round(specificity * 5)),
    feedback: passed
      ? `High specificity: ${specificity.toFixed(1)} concrete entities/100w`
      : `Low specificity: ${specificity.toFixed(1)}/100w (< ${humanThreshold}) — too generic`,
  };
}

/**
 * Hedging density — AI writes wishy-washy ("might", "could", "may").
 * Human baseline: <2.5% of words are hedges.
 */
export const HEDGING_WORDS = [
  'might',
  'could',
  'may',
  'perhaps',
  'possibly',
  'somewhat',
  'relatively',
  'fairly',
  'quite',
  'rather',
  'seems',
  'appears',
  'tends',
  'allegedly',
  'arguably',
  'generally',
  'typically',
  'usually',
];

export function scoreHedging(text) {
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return { passed: null, score: 100, feedback: 'empty text' };

  const hedgeSet = new Set(HEDGING_WORDS);
  let count = 0;
  for (const w of words) {
    const clean = w.replace(/[^a-z]/g, '');
    if (hedgeSet.has(clean)) count++;
  }
  const density = (count / words.length) * 100;
  const humanMax = 2.5;
  const passed = density <= humanMax;

  return {
    passed,
    density: Number(density.toFixed(2)),
    count,
    wordCount: words.length,
    threshold: humanMax,
    score: passed ? 100 : Math.max(0, 100 - Math.round((density - humanMax) * 10)),
    feedback: passed
      ? `Hedging density ${density.toFixed(2)}% is confident`
      : `Excessive hedging (${density.toFixed(2)}% > ${humanMax}%) — sounds uncertain`,
  };
}

/**
 * Composite copywriting score — runs all 5 sub-scorers.
 */
export function scoreCopywriting(text) {
  const banned = scoreBannedPhrases(text);
  const emDash = scoreEmDashDensity(text);
  const variance = scoreSentenceVariance(text);
  const specificity = scoreSpecificity(text);
  const hedging = scoreHedging(text);

  // Composite: weighted avg, capped by critical failures
  const scores = [
    banned.score,
    emDash.score ?? 100,
    variance.score ?? 100,
    specificity.score,
    hedging.score ?? 100,
  ];
  const composite = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // Critical fails — these drop the composite hard
  const criticalFail = !banned.passed || emDash.passed === false;
  const finalScore = criticalFail ? Math.min(composite, 60) : composite;

  return {
    score: finalScore,
    passed: finalScore >= 70 && banned.passed && emDash.passed !== false,
    subscores: { banned, emDash, variance, specificity, hedging },
    critical: criticalFail,
  };
}

// ── 2. VISUAL ASSET SCORERS ────────────────────────────────────

/**
 * Validate an image asset — real URL, resolvable, correct format.
 * @param {string} imageUrl
 * @param {object} [expected] — { format?: 'png'|'jpg', width?, height? }
 */
export async function scoreVisualAsset(imageUrl, expected = {}) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return { passed: false, score: 0, feedback: 'No image URL provided', checks: {} };
  }

  const urlPattern = /^https?:\/\//;
  if (!urlPattern.test(imageUrl)) {
    return {
      passed: false,
      score: 0,
      feedback: `Invalid URL: ${imageUrl.slice(0, 80)}`,
      checks: {},
    };
  }

  const checks = {
    urlFormat: true,
    urlResolves: false,
    correctFormat: null,
    dimensionsMatch: null,
    contentType: null,
    httpStatus: null,
  };

  try {
    const res = await fetchWithJobLease(imageUrl, { method: 'HEAD', redirect: 'follow' });
    checks.httpStatus = res.status;
    checks.urlResolves = res.ok;
    checks.contentType = res.headers.get('content-type') || null;

    if (expected.format && checks.contentType) {
      checks.correctFormat = checks.contentType
        .toLowerCase()
        .includes(expected.format.toLowerCase());
    }
  } catch (err) {
    return {
      passed: false,
      score: 0,
      feedback: `URL unreachable: ${err.message}`,
      checks,
    };
  }

  // Dimension check requires fetching image bytes — skip in sync rubric
  // (can be added later via image-size library)

  const passed = checks.urlResolves && checks.correctFormat !== false;
  const score = passed ? 100 : checks.urlResolves ? 70 : 0;

  return {
    passed,
    score,
    checks,
    feedback: passed
      ? `Image resolves (${checks.contentType})`
      : `Image check failed: status=${checks.httpStatus}, contentType=${checks.contentType}`,
  };
}

// ── 3. CODE + DEPLOYMENT SCORERS ────────────────────────────────

/**
 * Validate a code deployment — real repo + real URL + quality signals.
 * @param {object} input { repoUrl, deploymentUrl, html? }
 */
export async function scoreCodeDeployment({ repoUrl, deploymentUrl, html }) {
  const checks = {
    hasRepoUrl: false,
    hasDeployUrl: false,
    repoResolves: false,
    deploymentResolves: false,
    deploymentStatus: null,
    hasViewport: false,
    hasMediaQueries: false,
    hasAltText: false,
    noBoilerplate: false,
    hasTitle: false,
    htmlLength: 0,
  };

  // URL format checks
  checks.hasRepoUrl =
    !!repoUrl && /^https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+/.test(repoUrl);
  checks.hasDeployUrl = !!deploymentUrl && /^https?:\/\//.test(deploymentUrl);

  // Resolve repo
  if (checks.hasRepoUrl) {
    try {
      const res = await fetchWithJobLease(repoUrl, { method: 'HEAD', redirect: 'follow' });
      checks.repoResolves = res.ok;
    } catch {
      /* ignore */
    }
  }

  // Resolve deployment
  let fetchedHtml = html || null;
  if (checks.hasDeployUrl) {
    try {
      const res = await fetchWithJobLease(deploymentUrl, { redirect: 'follow' });
      checks.deploymentStatus = res.status;
      checks.deploymentResolves = res.ok;
      if (res.ok && !fetchedHtml) {
        fetchedHtml = await res.text();
      }
    } catch {
      /* ignore */
    }
  }

  // HTML quality checks
  if (fetchedHtml) {
    checks.htmlLength = fetchedHtml.length;
    checks.hasViewport = /<meta[^>]*name=["']viewport["']/i.test(fetchedHtml);
    checks.hasMediaQueries = /@media\s*(?:only\s+)?(?:screen|all|\()/i.test(fetchedHtml);
    checks.hasTitle = /<title[^>]*>[^<]{3,}<\/title>/i.test(fetchedHtml);
    // Alt text on at least 50% of images
    const imgTags = fetchedHtml.match(/<img\b[^>]*>/gi) || [];
    const altImages = imgTags.filter((tag) => /\balt=["'][^"']+["']/i.test(tag));
    checks.hasAltText = imgTags.length === 0 || altImages.length >= imgTags.length * 0.5;
    // Boilerplate detection
    const boilerplate =
      /Lorem ipsum|Welcome to our amazing|This is a template|sample text here|replace this with your/i;
    checks.noBoilerplate = !boilerplate.test(fetchedHtml);
  }

  const criticalChecks = [checks.hasDeployUrl, checks.deploymentResolves, checks.noBoilerplate];
  const qualityChecks = [
    checks.hasViewport,
    checks.hasMediaQueries,
    checks.hasTitle,
    checks.hasAltText,
  ];
  const repoChecks = [checks.hasRepoUrl, checks.repoResolves];

  const passedCritical = criticalChecks.every(Boolean);
  const qualityPct = qualityChecks.filter(Boolean).length / qualityChecks.length;
  const repoPct = repoChecks.filter(Boolean).length / repoChecks.length;

  const score = Math.round((passedCritical ? 60 : 0) + qualityPct * 25 + repoPct * 15);

  return {
    passed: passedCritical && qualityPct >= 0.5,
    score,
    checks,
    feedback: passedCritical
      ? `Deployment live (${checks.deploymentStatus}), ${qualityChecks.filter(Boolean).length}/${qualityChecks.length} quality signals`
      : `Deployment missing or unreachable (hasUrl=${checks.hasDeployUrl}, resolves=${checks.deploymentResolves})`,
  };
}

// ── 4. STRATEGY / RESEARCH DOC SCORERS ────────────────────────

/**
 * Strategy doc validation — real citations, numeric claims, platform specificity.
 */
export async function scoreStrategyDoc(text, { validateUrls = true } = {}) {
  const urls = text.match(/https?:\/\/[^\s)<>"'\]]+/g) || [];
  // Numeric claims: percentages, k/M/B suffixes, named units, OR dollar amounts
  const numericClaims =
    (
      text.match(
        /\d+(?:\.\d+)?\s*(?:%|k|K|M|B|million|billion|thousand|users|posts|followers|subscribers|engagements?|impressions?|clicks?|leads?|conversions?|views?)/g
      ) || []
    ).length + (text.match(/\$\d+(?:,\d{3})*(?:\.\d+)?[KMB]?/g) || []).length;

  // Platform-specific tactics (not just "use Instagram more")
  const platformTactics =
    /(?:Instagram|TikTok|Facebook|YouTube|LinkedIn|Twitter|X|Threads|Pinterest|Snapchat)\s*(?:Reels?|Duets?|Shorts?|Stories|Carousel|Live|Lives?|Posts?|Collaborations?|Polls?|Threads)/gi;
  const platformSpecificCount = (text.match(platformTactics) || []).length;

  const checks = {
    citationCount: urls.length,
    hasMinCitations: urls.length >= 3,
    numericClaims,
    hasNumericClaims: numericClaims >= 3,
    platformSpecificCount,
    hasPlatformSpecific: platformSpecificCount >= 2,
    citationsValidated: 0,
    citationsResolving: 0,
  };

  // Validate citations (HEAD check)
  if (validateUrls && urls.length > 0) {
    const checkUrl = async (url) => {
      try {
        const res = await fetchWithJobLease(url, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(5000),
        });
        return res.ok;
      } catch {
        return false;
      }
    };
    const results = await Promise.all(urls.slice(0, 10).map(checkUrl));
    checks.citationsValidated = Math.min(urls.length, 10);
    checks.citationsResolving = results.filter(Boolean).length;
  }

  // Score: citations 40, numeric 20, platform 20, resolving 20
  const citationScore = checks.hasMinCitations ? 40 : (urls.length / 3) * 40;
  const numericScore = checks.hasNumericClaims ? 20 : (numericClaims / 3) * 20;
  const platformScore = checks.hasPlatformSpecific ? 20 : (platformSpecificCount / 2) * 20;
  const resolvingScore =
    checks.citationsValidated > 0
      ? (checks.citationsResolving / checks.citationsValidated) * 20
      : 0;

  const score = Math.round(citationScore + numericScore + platformScore + resolvingScore);

  return {
    passed: score >= 70 && checks.hasMinCitations && checks.hasNumericClaims,
    score,
    checks,
    urls: urls.slice(0, 10),
    feedback: checks.hasMinCitations
      ? `${checks.citationCount} citations (${checks.citationsResolving}/${checks.citationsValidated} resolve), ${numericClaims} numeric claims, ${platformSpecificCount} platform tactics`
      : `Too few citations: ${checks.citationCount} (need ≥3)`,
  };
}

// ── 4b. RESEARCH QUALITY SCORER ─────────────────────────────────

/**
 * Score research quality based on source diversity and citation coverage.
 * Works with or without a CitationRegistry — falls back to text analysis.
 *
 * @param {string} text — the research output markdown
 * @param {object} [citationRegistry] — CitationRegistry instance (optional)
 * @returns {{ score, sourceDiversity, totalSources, uniqueDomains, hasTriangulation }}
 */
export function scoreResearchQuality(text, citationRegistry) {
  // If we have the registry, use it for precise stats
  let totalSources, uniqueDomains;
  if (citationRegistry?.getStats) {
    const stats = citationRegistry.getStats();
    totalSources = stats.totalSources;
    uniqueDomains = stats.uniqueDomains;
  } else {
    // Fallback: count URLs in text and extract unique domains
    const urls = text.match(/https?:\/\/[^\s)<>"'\]]+/g) || [];
    totalSources = urls.length;
    const domains = new Set();
    for (const url of urls) {
      try {
        domains.add(new URL(url).hostname.replace(/^www\./, ''));
      } catch {}
    }
    uniqueDomains = domains.size;
  }

  // Count inline citation markers [1], [2], etc.
  const inlineCitations = (text.match(/\[\d+\]/g) || []).length;

  // Check for References section
  const hasReferencesSection = /^##?\s*References/im.test(text);

  const sourceDiversity = uniqueDomains >= 5 ? 'excellent' : uniqueDomains >= 3 ? 'good' : 'poor';
  const hasTriangulation = totalSources >= uniqueDomains * 1.3;

  // Score: diversity 40, volume 30, inline citations 20, references section 10
  const diversityScore = Math.min(40, uniqueDomains * 8);
  const volumeScore = Math.min(30, totalSources * 3);
  const citationScore = Math.min(20, inlineCitations * 4);
  const refScore = hasReferencesSection ? 10 : 0;

  const score = Math.round(diversityScore + volumeScore + citationScore + refScore);

  return {
    score,
    passed: score >= 60 && uniqueDomains >= 3,
    totalSources,
    uniqueDomains,
    inlineCitations,
    hasReferencesSection,
    sourceDiversity,
    hasTriangulation,
    feedback: `${totalSources} sources from ${uniqueDomains} domains, ${inlineCitations} inline citations, diversity: ${sourceDiversity}`,
  };
}

// ── 5. UNIFIED SCORER — picks the right rubric for a deliverable type ──

/**
 * Score a deliverable by its type. Returns { score, passed, subscores }.
 * @param {string} deliverableType — markdown | code | deployment | asset | data | presentation | strategy
 * @param {object} input — shape depends on type; see below
 */
export async function scoreDeliverable(deliverableType, input) {
  switch (deliverableType) {
    case 'markdown':
    case 'prose':
      return scoreCopywriting(input.text || '');

    case 'code':
    case 'deployment':
      return await scoreCodeDeployment({
        repoUrl: input.repoUrl,
        deploymentUrl: input.deploymentUrl,
        html: input.html,
      });

    case 'asset': {
      if (!input.imageUrl) {
        return { passed: false, score: 0, feedback: 'No image URL', subscores: {} };
      }
      return await scoreVisualAsset(input.imageUrl, input.expected || {});
    }

    case 'strategy':
    case 'data':
      return await scoreStrategyDoc(input.text || '', {
        validateUrls: input.validateUrls !== false,
      });

    case 'presentation':
      // Presentation = both a PDF/Slides URL AND prose content
      return {
        asset: input.pdfUrl ? await scoreVisualAsset(input.pdfUrl) : { passed: false, score: 0 },
        copywriting: input.text ? scoreCopywriting(input.text) : null,
      };

    default:
      return {
        passed: null,
        score: null,
        feedback: `Unknown deliverable type: ${deliverableType}`,
      };
  }
}

// ── 6. AGGREGATE REPORT ─────────────────────────────────────────

/**
 * Build a flat scorecard row suitable for a test-results report.
 */
export function buildScorecardRow(goalId, goalTitle, taskResults) {
  const totalScore = taskResults.reduce((sum, t) => sum + (t.score || 0), 0);
  const avgScore = taskResults.length > 0 ? Math.round(totalScore / taskResults.length) : 0;
  const passedCount = taskResults.filter((t) => t.passed).length;

  return {
    goalId,
    goalTitle,
    taskCount: taskResults.length,
    passedCount,
    passRate: taskResults.length > 0 ? Math.round((passedCount / taskResults.length) * 100) : 0,
    avgScore,
    taskResults,
  };
}
