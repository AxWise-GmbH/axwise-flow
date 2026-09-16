/**
 * HTML Critic — validates agent-generated landing page HTML before deployment.
 *
 * Inspired by OpenHands' Critic pattern: evaluate output → return score + failures.
 * Runs before Cloudflare deploy to prevent broken pages going live.
 *
 * Score range: 0.0 – 1.0. Pages scoring < 0.7 are rejected with actionable feedback
 * so the agent can fix issues and retry the deploy.
 */
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('html-critic');

// Count helper for <img> tags with a real https src. Material-icons spans
// don't count because they're <span class="material-symbols-outlined">,
// not <img src="..."> — the critic was previously passing pages with only
// icons and no real photos.
function countRealImages(html) {
  const matches = html.match(/<img[^>]+src\s*=\s*["']https?:\/\/[^"']+["'][^>]*>/gi) || [];
  return matches.length;
}

// Detect a hero section that has a visible background — an <img>, a
// background-image style, or a saturated/dark Tailwind bg class.
// Passing pages where the hero is bg-white + a faint gradient look
// empty in the viewport and trip the "page is blank" user complaint.
function hasVisibleHero(html) {
  const heroBlockMatch = html.match(/<(header|section)[^>]*(id|class)\s*=\s*["'][^"']*(hero|h-screen|min-h-screen)[^"']*["'][^>]*>[\s\S]{0,3000}/i);
  const heroBlock = heroBlockMatch ? heroBlockMatch[0] : html.slice(0, 4000);
  if (/background-image\s*:\s*url\(/i.test(heroBlock)) return true;
  if (/<img[^>]+src\s*=\s*["']https?:\/\//i.test(heroBlock)) return true;
  // Tailwind bg- class with a non-white colour (100+ shade or pure tone).
  if (/bg-(black|slate-[89]00|gray-[89]00|zinc-[89]00|neutral-[89]00|stone-[89]00|red-[5-9]00|orange-[5-9]00|amber-[5-9]00|yellow-[5-9]00|lime-[5-9]00|green-[5-9]00|emerald-[5-9]00|teal-[5-9]00|cyan-[5-9]00|sky-[5-9]00|blue-[5-9]00|indigo-[5-9]00|violet-[5-9]00|purple-[5-9]00|fuchsia-[5-9]00|pink-[5-9]00|rose-[5-9]00)/i.test(heroBlock)) return true;
  return false;
}

// Count <h1>/<h2> text chars to avoid "empty heading" passes.
function longEnoughH1(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return false;
  const text = m[1].replace(/<[^>]+>/g, '').trim();
  return text.length >= 15;
}

// Count distinct <h2> or <section id=""> markers — a real landing page
// needs ≥3 sections (hero, features, testimonials, CTA, footer usually 5+).
function countSections(html) {
  const h2s = (html.match(/<h2[\s>]/gi) || []).length;
  const sections = (html.match(/<section[\s>]/gi) || []).length;
  return Math.max(h2s, sections);
}

// Strip tags and count words of visible body content. Excludes <style>,
// <script>, <head>. Short pages (<300 words) can't be landing pages.
function visibleWordCount(html) {
  const body = (html.match(/<body[\s\S]*?<\/body>/i) || [''])[0]
    .replace(/<(?:style|script)[\s\S]*?<\/(?:style|script)>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return body.split(/\s+/).filter(Boolean).length;
}

// Responsive design: must have ≥3 distinct Tailwind breakpoint classes OR
// at least one @media query. Mobile-only or desktop-only pages fail.
function hasResponsive(html) {
  const bp = new Set();
  for (const m of html.matchAll(/\b(sm|md|lg|xl|2xl):\w/g)) bp.add(m[1]);
  if (bp.size >= 3) return true;
  return /@media\s*\(/i.test(html);
}

// All <a href="..."> must be real (https://…, #section, tel:, mailto:).
// Bare "#" or "javascript:void(0)" links = broken navigation.
function anchorsAreReal(html) {
  const hrefs = [...html.matchAll(/<a[^>]+href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  if (hrefs.length === 0) return true; // no anchors, nothing to fail
  const broken = hrefs.filter((h) => h === '#' || /^javascript:/i.test(h));
  return broken.length === 0;
}

const CHECKS = [
  // Structure (weight 1 each)
  { name: 'has_doctype',       weight: 1,   test: /<!DOCTYPE html>/i },
  { name: 'has_viewport',      weight: 1,   test: /meta[^>]*viewport/i },
  { name: 'has_nav',           weight: 1,   test: /<nav[\s>]/i },
  { name: 'has_h1_with_text',  weight: 1.5, fn: longEnoughH1 },
  { name: 'has_footer',        weight: 1,   test: /<footer[\s>]/i },
  { name: 'has_3_sections',    weight: 1.5, fn: (html) => countSections(html) >= 3 },

  // Landing page essentials (weight 1)
  { name: 'has_hero_section',  weight: 1,   test: /hero|py-24|py-20|py-32|gradient.*text-white/i },
  { name: 'has_cta_button',    weight: 1,   test: /<a[^>]*rounded/i },

  // Visual quality — required checks (weight 2 each, heavier because
  // icons-only or blank-hero pages LOOK broken to users even when
  // structure is fine).
  { name: 'has_4_real_images', weight: 2,   fn: (html) => countRealImages(html) >= 4 },
  { name: 'hero_is_visible',   weight: 2,   fn: hasVisibleHero },
  { name: 'min_length_8k',     weight: 1,   fn: (html) => html.length >= 8000 },

  // Copy + content depth (new weight-2 checks — prevents skeleton passes)
  { name: 'min_500_words',     weight: 2,   fn: (html) => visibleWordCount(html) >= 500 },
  { name: 'has_responsive',    weight: 1.5, fn: hasResponsive },
  { name: 'anchors_are_real',  weight: 1,   fn: anchorsAreReal },

  // Quality signals (weight 0.5)
  { name: 'has_tailwind',      weight: 0.5, test: /tailwindcss|tailwind/i },
  { name: 'has_aos',           weight: 0.5, test: /data-aos/i },
  { name: 'has_google_fonts',  weight: 0.5, test: /fonts\.googleapis/i },
  { name: 'has_scroll_smooth', weight: 0.5, test: /scroll-smooth/i },

  // Anti-patterns — pass when NOT present (weight 1)
  { name: 'no_lorem_ipsum',    weight: 1,   fn: (html) => !/lorem ipsum/i.test(html) },
  { name: 'no_placeholder_txt',weight: 1,   fn: (html) => !/\b(?:placeholder|TBD|TODO|FIXME|\bTK\b)\b/i.test(html) },
  { name: 'no_example_com',    weight: 1,   fn: (html) => !/example\.com/i.test(html) },
];

const MIN_SCORE = 0.7;

/**
 * Score an HTML string against landing page quality checks.
 *
 * @param {string} html - Complete HTML document string
 * @returns {{ score: number, passed: boolean, failures: string[], details: Array }}
 */
export function scoreHtml(html) {
  if (!html || typeof html !== 'string') {
    return { score: 0, passed: false, failures: ['empty_html'], details: [] };
  }

  let earned = 0;
  let possible = 0;
  const failures = [];
  const details = [];

  for (const check of CHECKS) {
    possible += check.weight;
    const ok = check.fn
      ? check.fn(html)
      : check.test.test(html);

    details.push({ name: check.name, passed: ok, weight: check.weight });
    if (ok) {
      earned += check.weight;
    } else {
      failures.push(check.name);
    }
  }

  const score = possible > 0 ? earned / possible : 0;
  return {
    score: Math.round(score * 100) / 100,
    passed: score >= MIN_SCORE,
    failures,
    details,
  };
}

/**
 * Build a human-readable rejection message for the agent.
 * Fed back as a tool result so the agent can fix and retry.
 */
export function buildRejectionMessage(result) {
  const pct = Math.round(result.score * 100);
  const fixes = result.failures.map((f) => `- ${f.replace(/_/g, ' ')}`).join('\n');
  return `HTML quality score: ${pct}% (minimum 70%). Fix these issues before deploying:\n${fixes}\nThen call deploy_site again.`;
}

/**
 * Categorical failure taxonomy shared between html-critic (structural checks)
 * and the vision QA tool (visual checks). Keeps iterate.js's re-planner
 * feedback structured — when both critics speak the same vocabulary, the
 * re-planner can target the specific failing dimension instead of receiving
 * prose like "page feels plain" and over-correcting in the wrong direction.
 *
 * Used by:
 *   - vision-qa-tool.js (VISION_QA_FAILURE_CATEGORIES)
 *   - design_qa_results.failures.category
 *   - iterate.js when classifying iteration_failures
 */
export const FAILURE_CATEGORIES = Object.freeze({
  // Structural (html-critic can detect these)
  MISSING_IMAGES: 'missing_images',
  MISSING_SECTIONS: 'missing_sections',
  PLACEHOLDER_COPY: 'placeholder_copy',
  BROKEN_ANCHORS: 'broken_anchors',
  RESPONSIVE_MISSING: 'responsive_missing',
  TOO_SHORT: 'too_short',
  // Visual (only vision QA can detect)
  MOBILE_OVERFLOW: 'mobile_overflow',
  CONTRAST_FAIL: 'contrast_fail',
  PALETTE_MISMATCH: 'palette_mismatch',
  TYPOGRAPHY_MISMATCH: 'typography_mismatch',
  SPACING_ISSUE: 'spacing_issue',
  IMAGE_QUALITY: 'image_quality',
  CTA_INVISIBLE: 'cta_invisible',
  HERO_BLANK: 'hero_blank',
  LAYOUT_BROKEN: 'layout_broken',
  LOCALIZATION_VISIBLE_FAIL: 'localization_visible_fail',
});

/**
 * Map an html-critic check-name (from CHECKS) to a categorical bucket.
 * Used to translate the legacy `failures: string[]` into structured
 * `{ category, ... }` entries iterate.js can route into the new taxonomy.
 */
export function categorizeStructuralFailure(checkName) {
  if (!checkName) return FAILURE_CATEGORIES.LAYOUT_BROKEN;
  if (checkName === 'has_4_real_images' || checkName === 'hero_is_visible') return FAILURE_CATEGORIES.MISSING_IMAGES;
  if (checkName === 'has_3_sections' || checkName === 'has_h1_with_text' || checkName === 'has_nav' || checkName === 'has_footer' || checkName === 'has_hero_section' || checkName === 'has_cta_button') return FAILURE_CATEGORIES.MISSING_SECTIONS;
  if (checkName === 'no_lorem_ipsum' || checkName === 'no_placeholder_txt' || checkName === 'no_example_com') return FAILURE_CATEGORIES.PLACEHOLDER_COPY;
  if (checkName === 'anchors_are_real') return FAILURE_CATEGORIES.BROKEN_ANCHORS;
  if (checkName === 'has_responsive') return FAILURE_CATEGORIES.RESPONSIVE_MISSING;
  if (checkName === 'min_length_8k' || checkName === 'min_500_words') return FAILURE_CATEGORIES.TOO_SHORT;
  return FAILURE_CATEGORIES.LAYOUT_BROKEN;
}

/**
 * Translate the legacy scoreHtml() result into the structured failure shape
 * iterate.js and the design_qa_results table share with the vision QA tool.
 */
export function buildStructuredFailures(result) {
  if (!result || !Array.isArray(result.failures)) return [];
  return result.failures.map((checkName) => ({
    category: categorizeStructuralFailure(checkName),
    severity: 'medium',
    viewport: 'all',
    location: checkName.replace(/_/g, ' '),
    details: `Structural check failed: ${checkName.replace(/_/g, ' ')}`,
    suggestion: `Address ${checkName.replace(/_/g, ' ')} before re-deploying.`,
    source: 'html-critic',
  }));
}
