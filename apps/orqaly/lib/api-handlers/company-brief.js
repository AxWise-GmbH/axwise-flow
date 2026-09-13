/**
 * Company brief — the assistant's discovery "quiz" (semantic mapping). The
 * assistant asks a short set of questions about the company's situation,
 * strengths, weak spots and priorities, stores the answers, and uses them to
 * inform later decisions (see assistant-first-steps.js).
 *
 * GET  /api/app?path=company-brief                         -> { brief, answers }
 * POST /api/app?path=company-brief { action:'next-question', briefId? }
 *        -> { briefId, question:{ id, text }, index, max, done }   (adaptive, one at a time)
 * POST /api/app?path=company-brief { action:'generate-questions' }
 *        -> { briefId, questions:[{ id, text }] }                  (legacy fixed batch)
 * POST /api/app?path=company-brief { action:'answer', briefId, questionId, question, answer }
 *        -> { ok:true }
 *
 * `next-question` reads the running Q/A transcript each step, so it can ask a
 * clarifying follow-up when the last answer was thin and otherwise pick the next
 * new topic. A hard MAX_QUESTIONS cap (plus the model's own DONE) bounds it.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import {
  buildSupabaseUserClient,
  buildSupabaseAdminClient,
} from '../../api/_lib/supabase-server.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';
import { defaultProvider, defaultCheapModel } from '../_shared/llm-defaults.js';

const log = createLogger('company-brief');

const FALLBACK_QUESTIONS = [
  'In one or two sentences, what does your company do and who are your customers?',
  'What are your top 2-3 priorities for the next quarter?',
  'Where do you lose the most time or money today (your biggest pain points)?',
  'What are you best at — your strongest advantages over competitors?',
  'Which teams or functions are most overloaded right now?',
  'If the AI assistant could own one outcome for you, what should it be?',
];

const QUESTION_SYSTEM_PROMPT =
  'You are an onboarding analyst for an AI operations platform. Produce 6 short, ' +
  "plain-language discovery questions that help understand a company's current " +
  'situation: what they do, priorities, weak spots, strengths, and where AI agents ' +
  'could help most. Output ONE question per line, no numbering, no preamble.';

// Adaptive interview: the most questions we will ever ask (base + follow-ups).
const MAX_QUESTIONS = 8;

const NEXT_QUESTION_SYSTEM_PROMPT =
  'You are an onboarding analyst interviewing a company for an AI operations platform. ' +
  'Ask ONE short, plain-language question at a time to learn their situation, priorities, ' +
  'weak spots, strengths, and where AI agents could help most. ' +
  "If the user's LAST answer was vague, very short, or uncertain, ask ONE concise clarifying " +
  'follow-up about it. Otherwise ask the next most useful NEW topic and never repeat an earlier ' +
  'question. Keep every question under 25 words. When you have enough to brief a team, or the ' +
  'limit is reached, reply with exactly DONE and nothing else. Output only the question text or DONE.';

/** First built-in question not already asked (positional, skipping repeats). */
function fallbackQuestion(askedCount, askedSet) {
  const positional = FALLBACK_QUESTIONS[askedCount];
  if (positional && !askedSet.has(positional.trim().toLowerCase())) return positional;
  return FALLBACK_QUESTIONS.find((q) => !askedSet.has(q.trim().toLowerCase())) || '';
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseQuestions(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, '').trim())
    .filter((l) => l.length > 4)
    .slice(0, 8);
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const done = log.startTimer(req, 'request', { method: req.method });
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  const isWrite = req.method === 'POST';
  const rl = checkRateLimit({
    key: `company-brief:${isWrite ? 'w' : 'r'}:${getRateLimitIdentifier(req, user.id)}`,
    limit: isWrite ? 20 : 60,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  const userClient = buildSupabaseUserClient(token);
  if (!userClient) {
    done({ status: 500 });
    return jsonError(res, 500, 'Server not configured');
  }

  try {
    if (req.method === 'GET') return await handleLoad(req, res, userClient, user, done);
    if (req.method === 'POST') {
      const action = req.body?.action;
      if (action === 'next-question')
        return await handleNextQuestion(req, res, userClient, user, done);
      if (action === 'generate-questions')
        return await handleGenerate(req, res, userClient, user, done);
      if (action === 'answer') return await handleAnswer(req, res, userClient, user, done);
      done({ status: 400 });
      return jsonError(res, 400, 'Unknown action');
    }
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'company-brief');
  }
}

/** Ensure the user's single brief row exists; return it. */
async function ensureBrief(userClient, userId) {
  const { data: existing } = await userClient
    .from('company_brief')
    .select('id, status, summary')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await userClient
    .from('company_brief')
    .upsert({ user_id: userId }, { onConflict: 'user_id' })
    .select('id, status, summary')
    .single();
  if (error) throw error;
  return data;
}

async function handleLoad(req, res, userClient, user, done) {
  const { data: brief } = await userClient
    .from('company_brief')
    .select('id, status, summary, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();
  let answers = [];
  if (brief) {
    const { data } = await userClient
      .from('company_brief_answers')
      .select('id, question_id, question, answer, created_at')
      .eq('brief_id', brief.id)
      .order('created_at', { ascending: true });
    answers = data || [];
  }
  done({ status: 200 });
  return res.status(200).json({ brief: brief || null, answers });
}

async function handleGenerate(req, res, userClient, user, done) {
  const brief = await ensureBrief(userClient, user.id);

  let lines = [];
  try {
    const result = await executeLlmV2Tracked({
      systemPrompt: QUESTION_SYSTEM_PROMPT,
      prompt: 'Generate the discovery questions now.',
      provider: defaultProvider(),
      model: defaultCheapModel(),
      temperature: 0.5,
      maxTokens: 280,
      timeoutMs: 18000,
      usage: {
        admin: buildSupabaseAdminClient(),
        userId: user.id,
        source: 'company-brief',
        operation: 'generate-questions',
      },
    });
    lines = parseQuestions(result?.content);
  } catch (err) {
    log.warn(req, 'generate.llm_failed', { err: err.message });
  }
  if (lines.length < 3) lines = FALLBACK_QUESTIONS;

  const questions = lines.map((text, i) => ({ id: `q${i + 1}`, text }));
  done({ status: 200, count: questions.length });
  return res.status(200).json({ briefId: brief.id, questions });
}

async function handleNextQuestion(req, res, userClient, user, done) {
  const brief = await ensureBrief(userClient, user.id);

  const { data: prior } = await userClient
    .from('company_brief_answers')
    .select('question, answer')
    .eq('brief_id', brief.id)
    .order('created_at', { ascending: true });
  const answers = prior || [];
  const askedCount = answers.length;

  const finished = () => {
    done({ status: 200, count: askedCount });
    return res
      .status(200)
      .json({ briefId: brief.id, done: true, index: askedCount, max: MAX_QUESTIONS });
  };

  // Hard cap guarantees the interview terminates even if the model never says DONE.
  if (askedCount >= MAX_QUESTIONS) return finished();

  const asked = new Set(
    answers.map((a) =>
      String(a.question || '')
        .trim()
        .toLowerCase()
    )
  );

  let llmText = '';
  try {
    const transcript = answers.length
      ? answers
          .map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer || '(skipped)'}`)
          .join('\n')
      : '(no answers yet)';
    const result = await executeLlmV2Tracked({
      systemPrompt: NEXT_QUESTION_SYSTEM_PROMPT,
      prompt: `Interview so far (${askedCount} of up to ${MAX_QUESTIONS} questions asked):\n${transcript}\n\nWrite the single next question, or output DONE.`,
      provider: defaultProvider(),
      model: defaultCheapModel(),
      temperature: 0.5,
      maxTokens: 80,
      timeoutMs: 18000,
      usage: {
        admin: buildSupabaseAdminClient(),
        userId: user.id,
        source: 'company-brief',
        operation: 'next-question',
      },
    });
    llmText = String(result?.content || '')
      .trim()
      .replace(/^["'\s]+|["'\s]+$/g, '');
  } catch (err) {
    log.warn(req, 'next.llm_failed', { err: err.message });
  }

  let text;
  if (/^done\b/i.test(llmText)) {
    text = ''; // model decided we have enough
  } else if (llmText && !asked.has(llmText.toLowerCase())) {
    text = llmText; // a fresh, adaptive question
  } else {
    text = fallbackQuestion(askedCount, asked); // empty / failed / duplicate -> fixed list
  }

  if (!text) return finished();

  done({ status: 200, count: askedCount + 1 });
  return res.status(200).json({
    briefId: brief.id,
    question: { id: `q${askedCount + 1}`, text },
    index: askedCount + 1,
    max: MAX_QUESTIONS,
    done: false,
  });
}

async function handleAnswer(req, res, userClient, user, done) {
  const body = isPlainObject(req.body) ? req.body : {};
  const { briefId, questionId, question, answer } = body;
  if (!briefId || !questionId || !question) {
    done({ status: 400 });
    return jsonError(res, 400, 'briefId, questionId and question are required');
  }

  const { error: insErr } = await userClient.from('company_brief_answers').insert({
    brief_id: briefId,
    user_id: user.id,
    question_id: String(questionId),
    question: String(question),
    answer: String(answer || ''),
  });
  if (insErr) {
    log.warn(req, 'answer.insert_failed', { err: insErr.message });
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to save answer');
  }

  // Refresh the rolling text summary (used by the first-steps advisor).
  const { data: all } = await userClient
    .from('company_brief_answers')
    .select('question, answer')
    .eq('brief_id', briefId)
    .order('created_at', { ascending: true });
  const summary = (all || [])
    .filter((a) => a.answer)
    .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
    .join('\n\n');
  await userClient
    .from('company_brief')
    .update({ summary, status: 'in_progress' })
    .eq('id', briefId)
    .then(
      () => {},
      () => {}
    );

  done({ status: 200 });
  return res.status(200).json({ ok: true });
}
