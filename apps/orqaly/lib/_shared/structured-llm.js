/**
 * [module: shared]
 * Structured-output engine for the copilot's answer templates.
 *
 * Weak/cheap LLMs are unreliable at free-form prose but far more reliable at
 * filling named slots. This runner forces a template's JSON schema, validates
 * the slots, repairs once, then escalates to a stronger model — so the same
 * template yields consistent output regardless of the model behind the chat.
 *
 * The weak model only fills slots; the template's deterministic render() owns
 * structure and tone. See lib/_shared/answer-templates.js for the registry.
 */

import { parseLlmJson } from './llm-json.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';
import { defaultProvider, defaultModel } from './llm-defaults.js';

/**
 * Validate a parsed object against a template schema.
 * Schema is a flat map of `field -> typeSpec`, where typeSpec is one of
 * 'string' | 'string[]' | 'number' (append '?' to mark a field optional,
 * e.g. 'string?'). Arrays must be present and hold at least one non-empty item.
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateSlots(schema, obj) {
  const keys = Object.keys(schema || {});
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, missing: keys };
  }
  const missing = [];
  for (const [key, rawSpec] of Object.entries(schema)) {
    const spec = String(rawSpec);
    const optional = spec.endsWith('?');
    const type = spec.replace(/\?$/, '');
    const v = obj[key];
    if (v == null) {
      if (!optional) missing.push(key);
      continue;
    }
    if (type === 'string[]' || type === 'array') {
      const ok = Array.isArray(v) && v.filter((x) => String(x ?? '').trim()).length > 0;
      if (!ok && !optional) missing.push(key);
    } else if (type === 'number') {
      if ((typeof v !== 'number' || Number.isNaN(v)) && !optional) missing.push(key);
    } else {
      if ((typeof v !== 'string' || !v.trim()) && !optional) missing.push(key);
    }
  }
  return { valid: missing.length === 0, missing };
}

function describeSchema(schema) {
  const label = {
    string: 'string',
    'string[]': 'array of short strings',
    array: 'array of short strings',
    number: 'number',
  };
  return Object.entries(schema)
    .map(
      ([k, spec]) =>
        `- ${k}: ${label[String(spec).replace(/\?$/, '')] || 'string'}${String(spec).endsWith('?') ? ' (optional)' : ''}`
    )
    .join('\n');
}

function buildSystemPrompt(template) {
  const fewShot = (template.fewShot || [])
    .map(
      (ex, i) =>
        `Example ${i + 1}:\nINPUT:\n${ex.context}\nOUTPUT:\n${typeof ex.output === 'string' ? ex.output : JSON.stringify(ex.output)}`
    )
    .join('\n\n');
  return `${template.systemInstruction}

Return ONLY a single JSON object (no prose, no markdown code fences) with exactly these keys:
${describeSchema(template.schema)}

Use ONLY facts present in the input. Never invent numbers, names, or ids that are not in the input. Keep each field tight.${fewShot ? `\n\n${fewShot}` : ''}`;
}

function buildUserPrompt(context, extra) {
  return `${extra ? `${extra}\n\n` : ''}INPUT:\n${context || '(no data)'}\n\nOUTPUT (JSON only):`;
}

/**
 * Run a template through a weak-model-safe structured call.
 *
 * @param {object} opts
 * @param {object} opts.template  - an answer-template ({ schema, systemInstruction, fewShot, render })
 * @param {string} opts.context   - the grounding data the model fills slots from
 * @param {string} opts.userId
 * @param {string} opts.provider  - primary (weak/cheap) provider
 * @param {string} opts.model     - primary model
 * @param {object} opts.usage     - tracked-llm usage tag ({ admin, userId, source, operation })
 * @param {number} [opts.temperature=0.2]
 * @param {string} [opts.strongProvider] - escalation provider (platform default when omitted)
 * @param {string} [opts.strongModel] - escalation model (platform default when omitted)
 * @returns {Promise<{ fields: object|null, degraded: boolean, missing?: string[] }>}
 *          fields is null only when all attempts failed — the caller should fall back.
 */
export async function runStructuredTemplate({
  template,
  context,
  userId,
  provider,
  model,
  usage,
  temperature = 0.2,
  strongProvider = defaultProvider(),
  strongModel = defaultModel(),
}) {
  const systemPrompt = buildSystemPrompt(template);

  const attempt = async (prov, mdl, extra) => {
    const r = await executeLlmV2Tracked({
      userId,
      systemPrompt,
      prompt: buildUserPrompt(context, extra),
      provider: prov,
      model: mdl,
      temperature,
      maxTokens: 1100,
      timeoutMs: 22000,
      jsonMode: true,
      usage,
    });
    const parsed = parseLlmJson(r?.content || '');
    return { parsed, ...validateSlots(template.schema, parsed) };
  };

  // 1) primary model
  let res = await attempt(provider, model);
  if (res.valid) return { fields: res.parsed, degraded: false };

  // 2) repair on the same model, naming the missing/malformed slots
  res = await attempt(
    provider,
    model,
    `Your previous answer was missing or malformed for: ${res.missing.join(', ')}. Return the COMPLETE JSON object with every key correctly filled.`
  );
  if (res.valid) return { fields: res.parsed, degraded: false };

  // 3) escalate once to a stronger model
  if (strongProvider && strongModel && !(strongProvider === provider && strongModel === model)) {
    res = await attempt(
      strongProvider,
      strongModel,
      'Return the COMPLETE JSON object with every key correctly filled.'
    );
    if (res.valid) return { fields: res.parsed, degraded: true };
  }

  return { fields: null, degraded: true, missing: res.missing };
}
