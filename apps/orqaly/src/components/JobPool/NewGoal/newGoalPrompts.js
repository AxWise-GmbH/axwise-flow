/**
 * Prompt construction and error formatting for the New Goal dialog.
 *
 * Pure functions only: no React, no network. Extracted from
 * SmartRequestDialog so both wizard modes build the same prompts and so the
 * roster constraint stays testable on its own.
 */
import { getAgents } from '../../../services/agentHubService';

// Shape: "Luna (Frontend Developer)\nOrion (Backend Developer)\n..."
// Falls back to empty string if no agents seeded yet (then the LLM is told to skip suggestedAgents).
export function buildAgentRoster() {
  try {
    const agents = getAgents() || [];
    if (!agents.length) return '';
    return agents
      .slice(0, 50)
      .map((a) => {
        const displayName = a.name && a.name !== a.role ? a.name : a.role;
        const roleSuffix = a.name && a.name !== a.role ? ` (${a.role})` : '';
        return `- ${displayName}${roleSuffix}`;
      })
      .join('\n');
  } catch {
    return '';
  }
}

/**
 * Build an editable review draft directly from Professional intake answers.
 * This is the lossless fallback when AI pre-fill times out or fails: the title
 * stays concise, while the complete intake remains visible in Requirements.
 */
export function buildManualReviewFallback(intake = {}) {
  const goal = String(intake.goal || '').trim();
  const challenges = String(intake.challenges || '').trim();
  const timeline = String(intake.timeline || '').trim();
  const details = String(intake.details || '').trim();
  const titleSource = goal.split(/\r?\n/).find((line) => line.trim()) || goal;
  const requirements = [
    goal && `Goal:\n${goal}`,
    challenges && `Challenges:\n${challenges}`,
    timeline && `Timeline:\n${timeline}`,
    details && `Requirements and preferences:\n${details}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    title: titleSource.trim().slice(0, 100) || 'Untitled request',
    category: 'other',
    priority: 'medium',
    requirements: requirements || goal,
    // Do not invent a deliverable when analysis is unavailable. Keeping the
    // stated goal here gives the user an editable, non-empty starting point.
    expectedResults: goal,
  };
}

// Build the system prompt dynamically so we can inject the real agent roster.
// The LLM is constrained to pick from the user's actual agents — no inventing names.
export function buildSystemPrompt(roster) {
  const rosterSection = roster
    ? `\n\nAvailable agents on this workspace (pick 2-4 for suggestedAgents, using the exact names shown):\n${roster}\n\nCRITICAL: Only use agent names from the list above. Do NOT invent new names like "Luna" or "Felix" — those would be hallucinations. If no agent in the list fits a role, leave suggestedAgents empty rather than making one up.`
    : '\n\nNo agents are currently available in this workspace. Return an empty suggestedAgents array.';

  return `You are a job description specialist for Orqaly, a partner management and agent marketplace platform.

Given a user's intake form answers (goal, challenges, timeline, additional details), create a structured job description.

Respond ONLY with a valid JSON object in this exact format:
{"title": "A clear job title (3-8 words)", "category": "one of: development, design, marketing, data, operations, finance, support, consulting, other", "priority": "one of: low, medium, high, urgent", "requirements": "2-4 sentences of specific deliverables and acceptance criteria", "summary": "1 sentence executive summary", "complexity": "simple or complex — simple = single agent task, complex = multi-phase team effort", "budget_suggestion": 5, "research_market": "the explicit country, country union, or named market stated by the user, otherwise null", "suggestedAgents": [{"name": "exact agent name from the roster", "role": "brief description of what this agent will do for this request"}]}

Base priority on the timeline urgency. Be specific in requirements. Suggest 2-4 AI agents that would form the ideal team.
Preserve the user's complete market expression, including unions, exclusions and priorities. Never infer a country from language, currency, a nearby city, or an example when the user did not state it.
Set complexity to "complex" if the request involves multiple steps, research, team coordination, or significant effort. Set budget_suggestion as a USD number ($1-$100) reflecting estimated AI compute cost.${rosterSection}`;
}

// Race a promise against a wall-clock timeout. The original promise keeps
// running (fetch isn't aborted) but the UI gets to surface a clear error
// instead of freezing forever when the API stalls. Goal creation is
// idempotent-ish from the user's POV — the server may have created the
// goal even if the response timed out, so the error message tells the
// user to check the Goals list rather than blindly retrying.
export function withTimeout(promise, ms, timeoutMsg) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(timeoutMsg)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// ── Error formatting ─────────────────────────────────────────
export function formatAiError(error) {
  if (!error) return 'Processing failed. You can proceed with manual entry.';
  if (error.includes('BYOK_REQUIRED')) {
    return 'Connect an LLM API key in Settings → API Keys to enable AI pre-fill. You can still review and submit the request manually.';
  }
  if (
    error.includes('API key not configured') ||
    (error.includes('Missing') && error.includes('_KEY'))
  ) {
    const keyMatch = error.match(
      /(GROQ_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|DEEPSEEK_API_KEY|GLM_API_KEY)/
    );
    const keyName = keyMatch ? keyMatch[1] : 'LLM API key';
    return `${keyName} is not configured. Go to your Vercel project → Settings → Environment Variables and add it. Agents need API keys to process requests.`;
  }
  if (error.includes('timeout') || error.includes('timed out')) {
    return 'Request timed out. Your answers are preserved; retry the analysis or continue with manual setup.';
  }
  if (error.includes('Rate limit') || error.includes('429')) {
    return 'Too many requests. Wait a moment and try again.';
  }
  return error;
}
