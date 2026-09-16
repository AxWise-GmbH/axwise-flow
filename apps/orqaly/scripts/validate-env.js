#!/usr/bin/env node
/**
 * Validate required environment variables.
 * Run: node scripts/validate-env.js
 * Exits 0 if OK; 1 if missing required vars.
 * Optional: Supabase, transcription, and email keys (needed for full production features)
 */
import { config } from 'dotenv';
import {
  evidenceProfileV2Enabled,
  parseEvidenceProfileV2AdmissionOrgIds,
  parseEvidenceProfileV2EnabledModels,
  parseEvidenceProfileV2ExecutionModels,
  validateEvidenceProfileV2Rollout,
} from '../lib/integrations/axwise/evidence-contract-v2.js';

// Match Vite/local-worker configuration loading. The quickstart tells
// developers to create .env.local, so validating only .env silently ignored
// the very file the local stack uses. Existing process variables still win.
config({ path: ['.env.local', '.env'], quiet: true });

const required = [];

// Vars the app is broken without in production (BYOK encryption, worker/cron
// auth, admin DB access, core Supabase connectivity) but that CI never has
// set — so they can't go in `required` without breaking every PR. Gated
// behind --strict instead; run `npm run validate-env:strict` against a
// prod-like .env before a go-live deploy.
const critical = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'WORKER_SECRET',
  'CRON_SECRET',
  'ORQ_KEK_V1',
];

// The platform default is configurable. Requiring GROQ_API_KEY unconditionally
// made a valid Gemini/OpenAI/etc. deployment fail strict validation even when
// no Groq call would be made. Keep this map aligned with the LLM executors.
const providerRequirements = {
  groq: ['GROQ_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  glm: ['GLM_API_KEY'],
  qwen: ['QWEN_API_KEY'],
  gemini: ['GEMINI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  gateway: ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN'],
  ollama: ['OLLAMA_BASE_URL'],
  'local-openai': ['LOCAL_OPENAI_URL'],
  'claude-code': [],
};

const optional = [
  // CORS — comma-separated list of allowed origins; falls back to Vercel prod + localhost if unset
  'ALLOWED_ORIGINS',
  'ASSEMBLYAI_API_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_WEBHOOK_SECRET',
  'STITCH_TEMPLATE_SYNC_TOKEN',
  // AxWise conditions layer — unset = disabled (safe default). AXWISE_ENABLE
  // ('true' to call out) + AXWISE_ENFORCE ('shadow' | 'authoritative') gate it.
  'AXWISE_API_URL',
  'AXWISE_API_KEY',
  'AXWISE_ENABLE',
  'AXWISE_ENFORCE',
  'AXWISE_EVIDENCE_PROFILE_V2_ENABLED',
  'AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS',
  'AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS',
  'AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS',
];

const strict = process.argv.includes('--strict');

function isBase64OfByteLength(value, expectedBytes) {
  const encoded = String(value || '').trim();
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;

  const unpadded = encoded.replace(/=+$/, '');
  if (unpadded.length % 4 === 1) return false;

  const suppliedPadding = encoded.length - unpadded.length;
  const canonicalPadding = (4 - (unpadded.length % 4)) % 4;
  if (suppliedPadding > 0 && suppliedPadding !== canonicalPadding) return false;

  try {
    const decoded = Buffer.from(encoded, 'base64');
    return (
      decoded.length === expectedBytes && decoded.toString('base64').replace(/=+$/, '') === unpadded
    );
  } catch {
    return false;
  }
}

const configuredProvider = process.env.LLM_DEFAULT_PROVIDER?.trim();
const configuredModel = process.env.LLM_DEFAULT_MODEL?.trim();
const configuredCheapModel = process.env.LLM_DEFAULT_CHEAP_MODEL?.trim();
const configuredGeminiReasoning = process.env.GEMINI_REASONING_EFFORT?.trim().toLowerCase();
const effectiveProvider = configuredProvider || 'gemini';
const exactGeminiDefaultModel = 'gemini-3.8-flash';

if (configuredGeminiReasoning && !['low', 'medium', 'high'].includes(configuredGeminiReasoning)) {
  console.error('GEMINI_REASONING_EFFORT must be one of: low, medium, high');
  process.exit(1);
}

if (Boolean(configuredProvider) !== Boolean(configuredModel)) {
  console.error('LLM_DEFAULT_PROVIDER and LLM_DEFAULT_MODEL must be configured together');
  process.exit(1);
}

if (!Object.hasOwn(providerRequirements, effectiveProvider)) {
  console.error(`Unsupported LLM_DEFAULT_PROVIDER: ${effectiveProvider}`);
  process.exit(1);
}

if (strict && effectiveProvider === 'gemini') {
  if (configuredModel && configuredModel !== exactGeminiDefaultModel) {
    console.error(
      `LLM_DEFAULT_MODEL must be exactly ${exactGeminiDefaultModel} when LLM_DEFAULT_PROVIDER=gemini`
    );
    process.exit(1);
  }
  if (configuredCheapModel && configuredCheapModel !== exactGeminiDefaultModel) {
    console.error(
      `LLM_DEFAULT_CHEAP_MODEL must be exactly ${exactGeminiDefaultModel} when LLM_DEFAULT_PROVIDER=gemini`
    );
    process.exit(1);
  }
}

if (strict && effectiveProvider === 'claude-code' && process.env.VERCEL) {
  console.error('LLM_DEFAULT_PROVIDER=claude-code is local-only and cannot be used on Vercel');
  process.exit(1);
}

const missing = required.filter((k) => !process.env[k]?.trim());
if (missing.length > 0) {
  console.error('Missing required env vars:', missing.join(', '));
  process.exit(1);
}

const missingCritical = critical.filter((k) => !process.env[k]?.trim());
if (missingCritical.length > 0) {
  if (strict) {
    console.error('Missing critical env vars (--strict):', missingCritical.join(', '));
    process.exit(1);
  }
  console.warn(
    'Critical env vars not set (app will be broken in production):',
    missingCritical.join(', ')
  );
}

if (strict && !isBase64OfByteLength(process.env.ORQ_KEK_V1, 32)) {
  console.error('ORQ_KEK_V1 must be valid base64 that decodes to exactly 32 bytes (--strict)');
  process.exit(1);
}

if (strict) {
  const alternatives = providerRequirements[effectiveProvider];
  const providerReady =
    alternatives.length === 0 || alternatives.some((k) => process.env[k]?.trim());
  if (!providerReady) {
    const requirement =
      alternatives.length === 1 ? alternatives[0] : `one of ${alternatives.join(', ')}`;
    console.error(`LLM_DEFAULT_PROVIDER=${effectiveProvider} requires ${requirement} (--strict)`);
    process.exit(1);
  }
}

const empty = optional.filter((k) => !process.env[k]?.trim());
if (empty.length > 0) {
  console.warn('Optional env vars not set (some features may be limited):', empty.join(', '));
}

// AxWise gates are compared by exact string at every call site, so a typo fails
// silently into the safe-but-wrong state (shadow / disabled) and looks exactly
// like a working rollout. Catch it here instead.
const axEnable = process.env.AXWISE_ENABLE?.trim();
if (axEnable && !['true', 'false'].includes(axEnable)) {
  console.error(`AXWISE_ENABLE must be "true" or "false" (got "${axEnable}"); anything else = off`);
  process.exit(1);
}

const axEnforce = process.env.AXWISE_ENFORCE?.trim();
if (axEnforce && !['shadow', 'authoritative'].includes(axEnforce)) {
  console.error(`AXWISE_ENFORCE must be "shadow" or "authoritative" (got "${axEnforce}")`);
  process.exit(1);
}

const evidenceV2Flag = process.env.AXWISE_EVIDENCE_PROFILE_V2_ENABLED?.trim();
if (evidenceV2Flag && !/^(?:1|true|yes|on|0|false|no|off)$/i.test(evidenceV2Flag)) {
  console.error(
    'AXWISE_EVIDENCE_PROFILE_V2_ENABLED must be a supported boolean value; anything else is off'
  );
  process.exit(1);
}

for (const [name, parse] of [
  ['AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', parseEvidenceProfileV2EnabledModels],
  ['AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', parseEvidenceProfileV2ExecutionModels],
]) {
  const configured = process.env[name]?.trim();
  if (!configured && !evidenceProfileV2Enabled(process.env)) continue;
  const rollout = parse(process.env);
  if (!rollout.ok) {
    console.error(
      `${name} must be a unique comma-separated subset of physical_product, subscription, ` +
        `usage_based, project_service, none (got ${rollout.errors.join(', ')})`
    );
    process.exit(1);
  }
}

const cohortConfigured = process.env.AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS?.trim();
if (cohortConfigured || evidenceProfileV2Enabled(process.env)) {
  const cohort = parseEvidenceProfileV2AdmissionOrgIds(process.env);
  if (!cohort.ok) {
    console.error(
      'AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS must contain unique canonical lowercase UUIDs ' +
        `(got ${cohort.errors.join(', ')})`
    );
    process.exit(1);
  }
}

if (evidenceProfileV2Enabled(process.env)) {
  const rollout = validateEvidenceProfileV2Rollout(process.env);
  if (!rollout.ok) {
    console.error(
      'AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS must be a subset of ' +
        `AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS (missing ${rollout.missingExecutionModels.join(', ')})`
    );
    process.exit(1);
  }
}

// Enabled without a destination: every evaluate() throws, so agent.generate
// (fail-closed) would route every new agent to manual approval.
if (axEnable === 'true') {
  const axMissing = ['AXWISE_API_URL', 'AXWISE_API_KEY'].filter((k) => !process.env[k]?.trim());
  if (axMissing.length > 0) {
    console.error(`AXWISE_ENABLE=true requires: ${axMissing.join(', ')}`);
    process.exit(1);
  }
}

console.log('Env validation OK');
process.exit(0);
