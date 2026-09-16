/**
 * Section-by-section deliverable generator (Tier 5 Bug C).
 *
 * When a single LLM call would produce too much content (8-section briefs,
 * full landing-page specs, multi-chapter business plans), the model either:
 *   a) hits its output token ceiling and truncates mid-sentence, or
 *   b) the Agent SDK stream stalls because the response is taking too long.
 *
 * Both observed live: goal `d3627d69` truncated at Section 2 of 8; goal
 * `8616be67` hung at 300s.
 *
 * This helper splits the work across N smaller LLM calls — one per
 * mandated section — and stitches the results. Each call asks for only one
 * section's content (target 600-1200 words), uses 4000 maxTokens (well under
 * any cap), and includes a 2-3 sentence summary of prior sections for
 * cohesion (NOT the full prior text — that would re-create the problem).
 *
 * Guarded by `LARGE_DELIVERABLE_SPLIT` env flag for safe rollout. Off → falls
 * back to the original single-call path.
 */

// ── Detection ──────────────────────────────────────────────────────────────

/**
 * Parse the task description for mandated sections that we'd want to split on.
 * Recognises three common patterns:
 *   - `Section N: <name>` lines
 *   - Numbered list items `1. <name>` / `1) <name>` (when ≥3 items)
 *   - Multi-section markdown with `## <name>` headers (when ≥3 headers)
 *
 * Returns an ordered array of section names; empty if no mandated structure
 * detected (caller should fall back to single-call generation).
 *
 * Conservative on purpose: short descriptions, single-section deliverables,
 * code patches, etc. should NOT split.
 *
 * @param {string} description — task description text
 * @returns {string[]} ordered section names; [] if not splittable
 */
export function detectMandatedSections(description) {
  const text = String(description || '');
  if (text.length < 200) return [];

  // Pattern 1: explicit "Section N: name" labels — strongest signal.
  const sectionLabels = [];
  const sectionRe = /\bsection\s+(\d+)\s*[:\-—]\s*([^\n]{2,80})/gi;
  let m;
  while ((m = sectionRe.exec(text)) !== null) {
    sectionLabels.push({ idx: Number(m[1]), name: m[2].trim().replace(/[*_`]/g, '') });
  }
  if (sectionLabels.length >= 3) {
    sectionLabels.sort((a, b) => a.idx - b.idx);
    return sectionLabels.map((s) => s.name);
  }

  // Pattern 2: "Step N:" / "Part N:" / "Phase N:" — split per keyword so a
  // task that lives inside one Phase but has many Steps doesn't fold the Phase
  // header into the section list (it'd produce N+1 sections with idx=1 twice).
  for (const keyword of ['step', 'part', 'phase']) {
    const labels = [];
    const re = new RegExp(`\\b${keyword}\\s+(\\d+)\\s*[:\\-—]\\s*([^\\n]{2,80})`, 'gi');
    while ((m = re.exec(text)) !== null) {
      labels.push({ idx: Number(m[1]), name: m[2].trim().replace(/[*_`]/g, '') });
    }
    if (labels.length >= 3) {
      labels.sort((a, b) => a.idx - b.idx);
      return labels.map((s) => s.name);
    }
  }

  // Pattern 3: numbered list with header-style items.
  const numberedLines = text.split('\n').map((l) => l.trim());
  const numItemRe = /^(\d+)[.)]\s+([A-Z][^\n]{2,80})$/;
  const numberedItems = [];
  for (const line of numberedLines) {
    const lm = line.match(numItemRe);
    if (lm) numberedItems.push({ idx: Number(lm[1]), name: lm[2].trim() });
  }
  if (numberedItems.length >= 3) {
    // Require monotonic numbering (1, 2, 3, ...) to avoid grabbing prose
    // that happens to start with digits.
    const monotonic = numberedItems.every(
      (item, i) => i === 0 || item.idx === numberedItems[i - 1].idx + 1
    );
    if (monotonic) return numberedItems.map((s) => s.name);
  }

  // Pattern 4: markdown `## Header` lines (3+ headers, exclude top-level title).
  // Allow leading whitespace so template-literal indents and code-formatted
  // input still match (the headers must start the line content but may be
  // preceded by spaces or tabs).
  const headers = [];
  const hRe = /^[ \t]*##+\s+([^\n#]{2,80})\s*$/gm;
  while ((m = hRe.exec(text)) !== null) {
    headers.push(m[1].trim().replace(/[*_`]/g, ''));
  }
  if (headers.length >= 3) return headers;

  return [];
}

/**
 * Build the per-section prompt. Includes a brief summary of prior sections
 * (≤350 chars combined) so the model can keep voice and reference what's
 * already been said, without re-reading the full prior output.
 *
 * @param {object} args
 * @param {string} args.basePrompt — original user prompt
 * @param {string} args.sectionName — the section we're asking for now
 * @param {Array<{name: string, content: string}>} args.previousSections
 * @returns {string}
 */
export function buildSectionPrompt({ basePrompt, sectionName, previousSections = [] }) {
  const priorSummary = previousSections.length
    ? `\n\n## Already written sections (for cohesion — do NOT repeat their content):\n${previousSections
        .map((s) => `- "${s.name}" — ${oneSentenceSummary(s.content)}`)
        .join('\n')}`
    : '';

  return `${basePrompt}${priorSummary}

## Your current task

Produce ONLY the "${sectionName}" section. Self-contained, deeply detailed, target 600-1200 words.
Do NOT include other sections — they will be written separately.
Do NOT include a title heading; start directly with the section content.
Match the voice and brand consistency of the prior sections (referenced above).`;
}

function oneSentenceSummary(text) {
  const trimmed = String(text || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!trimmed) return '(empty)';
  // First sentence-ish, capped at 220 chars.
  const firstSentence = trimmed.split(/[.!?](?:\s|$)/)[0] || trimmed;
  return firstSentence.slice(0, 220) + (firstSentence.length > 220 ? '…' : '');
}

// ── Generator ──────────────────────────────────────────────────────────────

/**
 * Run a section-by-section LLM generation.
 *
 * @param {object} args
 * @param {string} args.basePrompt
 * @param {string} args.systemPrompt
 * @param {string[]} args.sections — section names in order
 * @param {Function} args.executeLlm — bound LLM call (executeLlmV2 or test mock)
 * @param {object} args.llmOpts — provider, model, temperature, etc. (maxTokens overridden per call)
 * @param {object} [args.logCtx] — { log, req, taskId, jobId } for logging
 * @returns {Promise<{content: string, usage: object, sectionsGenerated: number, sectionsFailed: number, durationMs: number, estimatedCostUsd: number, model: string, provider: string}>}
 */
export async function runSectionedGeneration({
  basePrompt,
  systemPrompt,
  sections,
  executeLlm,
  llmOpts,
  logCtx,
}) {
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error('runSectionedGeneration: sections array is empty');
  }

  const start = Date.now();
  const generated = [];
  let totalCost = 0;
  const usageTotals = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let modelUsed = llmOpts.model;
  let providerUsed = llmOpts.provider;
  let failed = 0;

  for (const sectionName of sections) {
    const sectionPrompt = buildSectionPrompt({
      basePrompt,
      sectionName,
      previousSections: generated,
    });

    try {
      const result = await executeLlm({
        ...llmOpts,
        prompt: sectionPrompt,
        systemPrompt,
        maxTokens: 4000, // generous for one section, well under any cap
      });
      const content = String(result?.content || '').trim();
      if (!content) {
        failed++;
        logCtx?.log?.warn?.(logCtx.req, 'section-splitter.empty-section', {
          section: sectionName,
          taskId: logCtx?.taskId,
        });
        continue;
      }
      generated.push({ name: sectionName, content });
      totalCost += Number(result?.estimatedCostUsd || 0);
      if (result?.usage) {
        usageTotals.prompt_tokens += Number(result.usage.prompt_tokens || 0);
        usageTotals.completion_tokens += Number(result.usage.completion_tokens || 0);
        usageTotals.total_tokens += Number(result.usage.total_tokens || 0);
      }
      if (result?.model) modelUsed = result.model;
      if (result?.provider) providerUsed = result.provider;
    } catch (err) {
      if (err?.code === 'EXECUTION_AUTHORIZATION_REVOKED') throw err;
      failed++;
      logCtx?.log?.warn?.(logCtx.req, 'section-splitter.section-failed', {
        section: sectionName,
        error: err.message,
        taskId: logCtx?.taskId,
      });
      // Don't abort — try the next section. Partial deliverable is better
      // than zero deliverable. The evaluator can decide if it's enough.
    }
  }

  if (generated.length === 0) {
    throw new Error(`runSectionedGeneration: all ${sections.length} sections failed`);
  }

  const stitched = stitchSections(generated);
  return {
    content: stitched,
    usage: usageTotals,
    sectionsGenerated: generated.length,
    sectionsFailed: failed,
    sectionsRequested: sections.length,
    durationMs: Date.now() - start,
    estimatedCostUsd: totalCost,
    model: modelUsed,
    provider: providerUsed,
  };
}

/**
 * Stitch generated sections into a single markdown document. Each section
 * gets a `## <name>` header followed by its content, with blank line spacing.
 * @param {Array<{name: string, content: string}>} sections
 * @returns {string}
 */
export function stitchSections(sections) {
  return sections
    .map(({ name, content }) => {
      const trimmed = String(content || '').trim();
      // Strip a leading "## Name" or "# Name" header if the model added one
      // despite our instruction not to — avoid double-titling.
      const stripped = trimmed.replace(
        new RegExp(`^#{1,3}\\s+${escapeRegExp(name)}\\s*\\n+`, 'i'),
        ''
      );
      return `## ${name}\n\n${stripped}`;
    })
    .join('\n\n');
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Decision helper used by execute-task to decide whether the splitter
 * should run. Centralised so the rule is in one place and easy to tune.
 *
 * @param {object} args
 * @param {string} args.deliverableType — 'markdown' | 'deployment' | ...
 * @param {string} args.description — task description / user prompt
 * @param {object} [args.env=process.env] — injected for tests
 * @returns {{ shouldSplit: boolean, sections: string[], reason?: string }}
 */
export function shouldUseSplitter({ deliverableType, description, env = process.env }) {
  if (env.LARGE_DELIVERABLE_SPLIT !== '1') {
    return { shouldSplit: false, sections: [], reason: 'flag-off' };
  }
  if (!['markdown', 'deployment'].includes(deliverableType)) {
    return { shouldSplit: false, sections: [], reason: 'deliverable-type-not-supported' };
  }
  const sections = detectMandatedSections(description);
  if (sections.length < 3) {
    return { shouldSplit: false, sections, reason: 'too-few-sections-detected' };
  }
  return { shouldSplit: true, sections };
}
