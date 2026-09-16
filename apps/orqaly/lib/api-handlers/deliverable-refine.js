/**
 * Deliverable refinements — "Improve quality" on any finished artifact.
 *
 * Routes (via query param `op`):
 *   POST ?op=start  — body { kind, parent_id, prompt }
 *                     Validates the per-deliverable cap (2), inserts a
 *                     pending refinement row, routes to the appropriate
 *                     refiner (LLM rewrite or Stability image regen),
 *                     updates the row with the result, increments the
 *                     parent's refinement_count atomically. Returns the
 *                     refined content/url synchronously.
 *   GET  ?op=list&kind=&parent_id=
 *                   — Lists all refinements for a parent, version asc.
 *                     The frontend prepends v1 (the original) client-side.
 *
 * Per-kind refiners:
 *   knowledge_document → LLM rewrite (claude-sonnet-5), markdown out.
 *   landing_page       → LLM rewrite (claude-opus-5), HTML out. Does NOT
 *                        auto-redeploy — caller must Save + Deploy.
 *   goal_artifact (image/banner) → Stability/FLUX regen via executeStabilityAi.
 *   goal_artifact (html/report/markdown/note) → LLM rewrite.
 *   goal_artifact (pdf/deck/data) → 400 "not yet supported" (out of scope v1).
 *
 * Cap enforcement uses optimistic concurrency on the parent table's
 * refinement_count column so two simultaneous refinement attempts on the
 * same item can never both succeed.
 *
 * Failure mode: any refiner exception → refinement row marked 'failed',
 * error saved, refinement_count NOT incremented. User can retry without
 * losing a slot.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';
import { executeStabilityAi, executePdfGenerator } from '../agent-handlers/tool-runner.js';

const log = createLogger('deliverable-refine');

const MAX_REFINEMENTS = 2;
const VALID_KINDS = new Set(['knowledge_document', 'landing_page', 'goal_artifact', 'task_output']);

const PARENT_TABLE = {
  knowledge_document: 'knowledge_documents',
  landing_page: 'landing_pages',
  goal_artifact: 'goal_artifacts',
  task_output: 'team_tasks',
};

// task_output uses team_tasks rows, which don't have a refinement_count column.
// Cap enforcement for task_output counts done rows in deliverable_refinements
// directly (see handleStart) instead of using the optimistic-concurrency path.
const COUNTERLESS_KINDS = new Set(['task_output']);

// ── Loading parent rows ───────────────────────────────────────────

async function loadParent(admin, kind, id, userId) {
  const table = PARENT_TABLE[kind];
  if (!table) return null;

  // task_output is special: team_tasks doesn't have a user_id column.
  // Ownership is goal-scoped → goals.user_id. Verify by joining.
  if (kind === 'task_output') {
    const { data: task, error: taskErr } = await admin
      .from('team_tasks')
      .select('id, title, data, status, goal_id')
      .eq('id', id)
      .maybeSingle();
    if (taskErr) {
      log.warn(null, 'parent.load.task.error', { id, error: taskErr.message });
      const err = new Error(`Task lookup error: ${taskErr.message}`);
      err.userFacing = true; err.status = 500;
      throw err;
    }
    if (!task) {
      const err = new Error('The task that produced this deliverable is no longer available (it may have been replaced by a goal iteration).');
      err.userFacing = true; err.status = 404;
      throw err;
    }
    const goalId = task.goal_id || task.data?.goal_id;
    if (!goalId) {
      const err = new Error('This task isn\'t linked to a goal so it can\'t be refined.');
      err.userFacing = true; err.status = 400;
      throw err;
    }
    const { data: goal } = await admin
      .from('goals')
      .select('id, user_id')
      .eq('id', goalId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!goal) {
      const err = new Error('You don\'t have access to this task\'s goal.');
      err.userFacing = true; err.status = 403;
      throw err;
    }
    return { ...task, _table: table };
  }

  const { data, error } = await admin
    .from(table)
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    log.warn(null, 'parent.load.failed', { kind, id, error: error.message });
    return null;
  }
  return data ? { ...data, _table: table } : null;
}

// Count completed refinements for task_output (which lacks a counter column).
async function countTaskOutputRefinements(admin, parentId) {
  const { count, error } = await admin
    .from('deliverable_refinements')
    .select('id', { count: 'exact', head: true })
    .eq('parent_kind', 'task_output')
    .eq('parent_id', parentId)
    .eq('status', 'done');
  if (error) {
    log.warn(null, 'refinement.count.failed', { parentId, error: error.message });
    return 0;
  }
  return count || 0;
}

// ── Per-kind refiners ─────────────────────────────────────────────

async function refineKnowledgeDoc(parent, userPrompt, usage) {
  const content = String(parent.content || '');
  const result = await executeLlmV2Tracked({
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    systemPrompt: 'You are a senior editor. Rewrite the given markdown document applying the user\'s feedback. Preserve the document\'s purpose and any factual content; only restructure, tighten, or expand as requested. Output ONLY the new markdown — no preamble, no commentary, no fences.',
    prompt: `Current document:\n\n${content}\n\nUser feedback:\n${userPrompt}\n\nReturn the improved markdown only.`,
    temperature: 0.35,
    maxTokens: 8000,
    timeoutMs: 60000,
    usage: usage && { ...usage, operation: 'refine-knowledge-document' },
  });
  return {
    refined_content: String(result.content || '').trim(),
    refined_url: null,
    refined_mime: 'text/markdown',
    model: result.model || 'claude-sonnet-5',
    output_tokens: result.usage?.output_tokens || result.usage?.completion_tokens || 0,
    duration_ms: result.durationMs || 0,
  };
}

async function refineLandingPage(parent, userPrompt, usage) {
  const html = String(parent.html || '');
  const result = await executeLlmV2Tracked({
    provider: 'anthropic',
    model: 'claude-opus-5',
    systemPrompt: 'You are a senior landing page designer. The user will give you a complete HTML landing page and a request for changes. Return ONLY the updated complete HTML document — no explanation, no markdown fences, no preamble. Use Tailwind CSS classes. Keep data-aos attributes and Material Symbols icons. Preserve the overall structure and brand palette unless told otherwise.',
    prompt: `Current landing page HTML:\n\n${html}\n\nUser feedback:\n${userPrompt}\n\nReturn the complete improved HTML document only.`,
    temperature: 0.4,
    maxTokens: 16000,
    timeoutMs: 60000,
    usage: usage && { ...usage, operation: 'refine-landing-page' },
  });
  let refined = String(result.content || '').trim();
  // Strip markdown fences if the LLM wraps them — matches landing-pages.js:195
  refined = refined.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();
  return {
    refined_content: refined,
    refined_url: null,
    refined_mime: 'text/html',
    model: result.model || 'claude-opus-5',
    output_tokens: result.usage?.output_tokens || result.usage?.completion_tokens || 0,
    duration_ms: result.durationMs || 0,
  };
}

async function refineGoalArtifactText(parent, userPrompt, usage) {
  // markdown / html / report / note kinds — text refine via LLM.
  const original = String(parent.content || parent.body || parent.metadata?.body || '');
  const result = await executeLlmV2Tracked({
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    systemPrompt: 'You are a senior editor. Rewrite the given content applying the user\'s feedback. Output ONLY the new content — no preamble, no commentary, no markdown fences.',
    prompt: `Current content:\n\n${original}\n\nUser feedback:\n${userPrompt}\n\nReturn the improved content only.`,
    temperature: 0.35,
    maxTokens: 8000,
    timeoutMs: 60000,
    usage: usage && { ...usage, operation: 'refine-goal-artifact-text' },
  });
  const mime = parent.kind === 'html' ? 'text/html' : 'text/markdown';
  return {
    refined_content: String(result.content || '').trim(),
    refined_url: null,
    refined_mime: mime,
    model: result.model || 'claude-sonnet-5',
    output_tokens: result.usage?.output_tokens || result.usage?.completion_tokens || 0,
    duration_ms: result.durationMs || 0,
  };
}

async function refineGoalArtifactImage(parent, userPrompt, refinementId) {
  // Combine the original generation prompt (if available) with user feedback.
  // Stability returns { imageUrl }; we don't need to re-upload because the
  // tool already stores in Supabase Storage and returns a public URL.
  const originalPrompt = String(parent.metadata?.prompt || parent.title || 'image');
  const combined = `${originalPrompt}. Refinement requested by user: ${userPrompt}`;
  const aspectRatio = parent.metadata?.aspectRatio || parent.metadata?.aspect_ratio || 'square';
  const start = Date.now();
  const result = await executeStabilityAi('generate_image', {
    projectName: `refine-${refinementId}`,
    prompt: combined.slice(0, 1900),
    aspectRatio,
  }, start);
  if (!result.success) {
    throw new Error(result.error || 'Image generation failed');
  }
  let parsed = {};
  try { parsed = JSON.parse(result.result); } catch { /* keep empty */ }
  return {
    refined_content: null,
    refined_url: parsed.imageUrl || null,
    refined_mime: 'image/png',
    model: parsed.renderer || 'stability-sdxl',
    output_tokens: 0,
    duration_ms: result.durationMs || 0,
  };
}

// task_output is the parent kind for markdown that lives in team_tasks.data.output.
// Refines the raw markdown via the same LLM prompt shape as knowledge_document.
async function refineTaskOutput(parent, userPrompt, usage) {
  const original = String(parent.data?.output || '');
  if (!original.trim()) {
    const err = new Error('Task has no output to refine yet.');
    err.userFacing = true;
    err.status = 400;
    throw err;
  }
  const result = await executeLlmV2Tracked({
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    systemPrompt: 'You are a senior editor. Rewrite the given content applying the user\'s feedback. Preserve the purpose and any factual content; only restructure, tighten, or expand as requested. Output ONLY the new content — no preamble, no commentary, no markdown fences.',
    prompt: `Current task output:\n\n${original}\n\nUser feedback:\n${userPrompt}\n\nReturn the improved content only.`,
    temperature: 0.35,
    maxTokens: 8000,
    timeoutMs: 60000,
    usage: usage && { ...usage, operation: 'refine-task-output' },
  });
  return {
    refined_content: String(result.content || '').trim(),
    refined_url: null,
    refined_mime: 'text/markdown',
    model: result.model || 'claude-sonnet-5',
    output_tokens: result.usage?.output_tokens || result.usage?.completion_tokens || 0,
    duration_ms: result.durationMs || 0,
  };
}

// PDF refinement: regenerate a fresh slide deck from the user's prompt
// because the original slides[] spec isn't persisted. Honest trade-off
// noted in the plan — v2 is a re-roll, not a line-edit of v1.
async function refinePdfArtifact(parent, userPrompt, refinementId, usage) {
  const title = parent.title || parent.filename || 'Deck';
  // 1) Ask Claude for a slide JSON
  const llm = await executeLlmV2Tracked({
    provider: 'anthropic',
    model: 'claude-opus-5',
    systemPrompt: 'You produce slide-deck JSON for a PDF generator. Output ONLY a JSON object of shape: { "title": "...", "subtitle": "...", "slides": [{ "title": "...", "body": "...", "bullets": ["...", "..."], "note": "..." }] }. 6 to 12 slides. Each slide has a clear title and either body OR bullets (not both). No markdown, no fences, JSON only.',
    prompt: `Source deck title: ${title}\n\nUser feedback for the new version:\n${userPrompt}\n\nReturn JSON.`,
    temperature: 0.5,
    maxTokens: 4000,
    timeoutMs: 60000,
    jsonMode: true,
    usage: usage && { ...usage, operation: 'refine-deck-spec' },
  });
  let spec;
  try {
    spec = JSON.parse(String(llm.content || '').trim().replace(/^```json\n?|\n?```$/gi, ''));
  } catch (parseErr) {
    throw new Error(`LLM did not return valid slide JSON: ${parseErr.message}`);
  }
  if (!Array.isArray(spec?.slides) || spec.slides.length === 0) {
    throw new Error('LLM returned no slides — try a more specific prompt.');
  }

  // 2) Render via the existing PDF generator
  const start = Date.now();
  const pdfResult = await executePdfGenerator('create_slides', {
    projectName: `refine-${refinementId}`,
    title: spec.title || title,
    subtitle: spec.subtitle || '',
    slides: spec.slides,
  }, start);
  if (!pdfResult.success) {
    throw new Error(pdfResult.error || 'PDF render failed');
  }
  let parsed = {};
  try { parsed = JSON.parse(pdfResult.result); } catch { /* keep empty */ }
  return {
    refined_content: null,
    refined_url: parsed.pdfUrl || parsed.htmlUrl || null,
    refined_mime: parsed.kind === 'html' ? 'text/html' : 'application/pdf',
    model: llm.model || 'claude-opus-5',
    output_tokens: llm.usage?.output_tokens || llm.usage?.completion_tokens || 0,
    duration_ms: (llm.durationMs || 0) + (pdfResult.durationMs || 0),
  };
}

// Deck refinement: same path as PDFs since tool-pdf-generator's HTML renderer
// already produces HTML decks when DECK_RENDERER=auto/html. The route picks
// the right output URL from the result envelope.
async function refineDeckArtifact(parent, userPrompt, refinementId, usage) {
  return refinePdfArtifact(parent, userPrompt, refinementId, usage);
}

async function routeRefiner(parent, kind, userPrompt, refinementId, usage) {
  if (kind === 'knowledge_document') return refineKnowledgeDoc(parent, userPrompt, usage);
  if (kind === 'landing_page') return refineLandingPage(parent, userPrompt, usage);
  if (kind === 'task_output') return refineTaskOutput(parent, userPrompt, usage);
  // goal_artifact — split by kind column
  const artifactKind = String(parent.kind || '').toLowerCase();
  if (['image', 'banner'].includes(artifactKind)) {
    return refineGoalArtifactImage(parent, userPrompt, refinementId);
  }
  if (['html', 'report', 'markdown', 'note'].includes(artifactKind)) {
    return refineGoalArtifactText(parent, userPrompt, usage);
  }
  if (artifactKind === 'pdf') return refinePdfArtifact(parent, userPrompt, refinementId, usage);
  if (artifactKind === 'deck') return refineDeckArtifact(parent, userPrompt, refinementId, usage);
  if (artifactKind === 'data') {
    const err = new Error('Data refinement requires re-running the goal — Improve quality is for content refinement only.');
    err.userFacing = true;
    err.status = 400;
    throw err;
  }
  // Unknown artifact kind — try text refine as a best-effort fallback
  return refineGoalArtifactText(parent, userPrompt, usage);
}

// ── Op: start ─────────────────────────────────────────────────────

export async function handleStart(admin, userId, body) {
  const kind = (body?.kind || '').trim();
  const parentId = String(body?.parent_id || '').trim();
  const prompt = String(body?.prompt || '').trim();
  // Optional — set by the loop continuation refinement job so the UI can
  // label refinements that came from a continuation. Null for user-initiated.
  const sourceGoalId = body?.source_goal_id || body?.sourceGoalId || null;

  if (!VALID_KINDS.has(kind)) return { status: 400, error: `Invalid kind: ${kind}` };
  if (!parentId) return { status: 400, error: 'parent_id is required' };
  if (!prompt) return { status: 400, error: 'prompt is required' };
  if (prompt.length > 4000) return { status: 400, error: 'prompt too long (max 4000 chars)' };

  let parent;
  try {
    parent = await loadParent(admin, kind, parentId, userId);
  } catch (loadErr) {
    // loadParent now throws userFacing errors with .status for clear
    // diagnosis instead of returning null for every failure mode.
    return { status: loadErr.status || 500, error: loadErr.message || 'Deliverable load failed' };
  }
  if (!parent) return { status: 404, error: 'Deliverable not found' };

  // Cap check — counterless kinds (task_output) count completed refinements
  // directly from deliverable_refinements; everything else reads the parent's
  // refinement_count column (incremented atomically below).
  const currentCount = COUNTERLESS_KINDS.has(kind)
    ? await countTaskOutputRefinements(admin, parentId)
    : Number(parent.refinement_count || 0);
  if (currentCount >= MAX_REFINEMENTS) {
    return { status: 409, error: `Limit reached (${MAX_REFINEMENTS}/${MAX_REFINEMENTS} refinements used)` };
  }
  const nextVersion = currentCount + 2; // v2 or v3 (v1 = original)

  // Insert a pending row first so the UI can show a placeholder if needed
  // and so failed runs are still auditable.
  const { data: row, error: insertErr } = await admin
    .from('deliverable_refinements')
    .insert({
      user_id: userId,
      parent_kind: kind,
      parent_id: parentId,
      version: nextVersion,
      user_prompt: prompt,
      status: 'pending',
      source_goal_id: sourceGoalId,
    })
    .select()
    .single();
  if (insertErr || !row) {
    log.warn(null, 'refinement.insert.failed', { kind, parentId, error: insertErr?.message });
    return { status: 500, error: `Failed to record refinement: ${insertErr?.message || 'unknown'}` };
  }

  try {
    // Usage-recording context — admin client + owner, tagged by this handler.
    // sourceGoalId is present only for loop-continuation refinements.
    const usage = {
      admin,
      userId,
      source: 'deliverable-refine',
      goalId: sourceGoalId || null,
    };
    const refined = await routeRefiner(parent, kind, prompt, row.id, usage);

    // Increment parent's refinement_count atomically. If a concurrent
    // refinement landed first, the count won't match and 0 rows update —
    // return 409 so this attempt fails cleanly without taking the slot.
    //
    // task_output has no counter column on team_tasks; race protection
    // for it relies on the deliverable_refinements unique (parent_kind,
    // parent_id, version) constraint instead — the loser gets a 23505
    // earlier at the pending-insert step.
    if (!COUNTERLESS_KINDS.has(kind)) {
      const { data: bumped, error: bumpErr } = await admin
        .from(PARENT_TABLE[kind])
        .update({ refinement_count: nextVersion - 1 })
        .eq('id', parentId)
        .eq('user_id', userId)
        .eq('refinement_count', currentCount)
        .select('id');
      if (bumpErr) throw new Error(`Counter update failed: ${bumpErr.message}`);
      if (!bumped || bumped.length === 0) {
        // Race lost — mark this row failed and surface a clean error.
        await admin.from('deliverable_refinements')
          .update({ status: 'failed', error: 'Concurrent refinement won the slot', completed_at: new Date().toISOString() })
          .eq('id', row.id);
        return { status: 409, error: 'Another refinement is already in progress for this deliverable' };
      }
    }

    // Mark refinement done
    const { error: updateErr } = await admin
      .from('deliverable_refinements')
      .update({
        status: 'done',
        refined_content: refined.refined_content,
        refined_url: refined.refined_url,
        refined_mime: refined.refined_mime,
        model: refined.model,
        output_tokens: refined.output_tokens || 0,
        duration_ms: refined.duration_ms || 0,
        completed_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (updateErr) {
      log.warn(null, 'refinement.update.failed', { id: row.id, error: updateErr.message });
    }

    log.info(null, 'refinement.success', {
      kind, parentId, version: nextVersion, model: refined.model,
      tokens: refined.output_tokens, ms: refined.duration_ms,
    });

    return {
      status: 200,
      data: {
        id: row.id,
        version: nextVersion,
        refined_content: refined.refined_content,
        refined_url: refined.refined_url,
        refined_mime: refined.refined_mime,
        refinement_count: nextVersion - 1,
        remaining: MAX_REFINEMENTS - (nextVersion - 1),
      },
    };
  } catch (err) {
    // Mark failed; do NOT increment parent count — user gets a free retry.
    await admin
      .from('deliverable_refinements')
      .update({
        status: 'failed',
        error: String(err.message || err).slice(0, 1000),
        completed_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    const status = err.status || 500;
    return { status, error: err.message || 'Refinement failed' };
  }
}

// ── Op: list ──────────────────────────────────────────────────────

async function handleList(admin, userId, kind, parentId) {
  if (!VALID_KINDS.has(kind)) return { status: 400, error: `Invalid kind: ${kind}` };
  if (!parentId) return { status: 400, error: 'parent_id is required' };

  const { data, error } = await admin
    .from('deliverable_refinements')
    .select('id, version, user_prompt, refined_content, refined_url, refined_mime, status, error, model, output_tokens, duration_ms, created_at, completed_at')
    .eq('parent_kind', kind)
    .eq('parent_id', parentId)
    .eq('user_id', userId)
    .order('version', { ascending: true });
  if (error) throw error;
  return { status: 200, data: data || [] };
}

// ── Router ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (cors(res, req)) return;

  const op = (req.query?.op || '').trim().toLowerCase();

  const token = getBearerToken(req);
  if (!token) return jsonError(res, 401, 'Missing token');

  const user = await verifySupabaseToken(token);
  if (!user?.id) return jsonError(res, 401, 'Invalid token');

  // Slightly tighter rate limit than landing-pages — these calls are LLM-
  // heavy and cap-protected per item, but still rate-limit per minute to
  // protect against rapid retries.
  const rl = await checkRateLimit(getRateLimitIdentifier(req), 'deliverable-refine', 20, 60);
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limited');

  const admin = buildSupabaseAdminClient();

  try {
    let result;
    switch (op) {
      case 'start':
        result = await handleStart(admin, user.id, req.body);
        break;
      case 'list':
        result = await handleList(
          admin,
          user.id,
          (req.query?.kind || '').trim(),
          String(req.query?.parent_id || '').trim(),
        );
        break;
      default:
        return jsonError(res, 400, `Unknown op: ${op}`);
    }

    if (result.error && result.status >= 400) {
      return jsonError(res, result.status, result.error);
    }
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, log, req);
  }
}
