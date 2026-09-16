import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const CWD = process.cwd();
const SCRIPT = path.join(CWD, 'scripts', 'validate-env.js');
const VALID_KEK = Buffer.alloc(32, 7).toString('base64');

function run(args, env) {
  const { status, stdout, stderr } = spawnSync('node', [SCRIPT, ...args], {
    cwd: CWD,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { code: status, stdout, stderr };
}

const BLANK_ENV = {
  ALLOWED_ORIGINS: '',
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_ANON_KEY: '',
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  GROQ_API_KEY: '',
  OPENAI_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  GLM_API_KEY: '',
  QWEN_API_KEY: '',
  GEMINI_API_KEY: '',
  OPENROUTER_API_KEY: '',
  AI_GATEWAY_API_KEY: '',
  VERCEL_OIDC_TOKEN: '',
  OLLAMA_BASE_URL: '',
  LOCAL_OPENAI_URL: '',
  LLM_DEFAULT_PROVIDER: '',
  LLM_DEFAULT_MODEL: '',
  LLM_DEFAULT_CHEAP_MODEL: '',
  GEMINI_REASONING_EFFORT: '',
  WORKER_SECRET: '',
  CRON_SECRET: '',
  ORQ_KEK_V1: '',
  ASSEMBLYAI_API_KEY: '',
  RESEND_API_KEY: '',
  RESEND_FROM_EMAIL: '',
  RESEND_WEBHOOK_SECRET: '',
  STITCH_TEMPLATE_SYNC_TOKEN: '',
  AXWISE_API_URL: '',
  AXWISE_API_KEY: '',
  AXWISE_ENABLE: '',
  AXWISE_ENFORCE: '',
  AXWISE_EVIDENCE_PROFILE_V2_ENABLED: '',
  AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS: '',
  AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS: '',
  AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS: '',
};

const FULL_CRITICAL_ENV = {
  VITE_SUPABASE_URL: 'https://x.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  GEMINI_API_KEY: 'gemini',
  WORKER_SECRET: 'secret',
  CRON_SECRET: 'cron-secret',
  ORQ_KEK_V1: VALID_KEK,
};

describe('validate-env.js', () => {
  it('exits 0 with only a warning when critical vars are missing and --strict is not passed', () => {
    const { code, stdout, stderr } = run([], BLANK_ENV);
    expect(code).toBe(0);
    expect(stderr).toMatch(/Critical env vars not set/);
    expect(stdout).toMatch(/Env validation OK/);
  });

  it('exits 1 when critical vars are missing and --strict is passed', () => {
    const { code, stderr } = run(['--strict'], BLANK_ENV);
    expect(code).toBe(1);
    expect(stderr).toMatch(/Missing critical env vars \(--strict\)/);
    expect(stderr).toMatch(/ORQ_KEK_V1/);
  });

  it('exits 0 with --strict once all critical vars are set', () => {
    const { code, stdout } = run(['--strict'], { ...BLANK_ENV, ...FULL_CRITICAL_ENV });
    expect(code).toBe(0);
    expect(stdout).toMatch(/Env validation OK/);
  });

  it.each([
    ['malformed base64', `${VALID_KEK}!`],
    ['a 31-byte key', Buffer.alloc(31, 7).toString('base64')],
    ['a 33-byte key', Buffer.alloc(33, 7).toString('base64')],
  ])('rejects ORQ_KEK_V1 when it contains %s', (_case, key) => {
    const { code, stderr } = run(['--strict'], {
      ...BLANK_ENV,
      ...FULL_CRITICAL_ENV,
      ORQ_KEK_V1: key,
    });
    expect(code).toBe(1);
    expect(stderr).toMatch(/ORQ_KEK_V1 must be valid base64/);
    expect(stderr).toMatch(/exactly 32 bytes/);
    expect(stderr).not.toContain(key);
  });

  it('requires the key for the configured default provider instead of Groq', () => {
    const env = {
      ...BLANK_ENV,
      ...FULL_CRITICAL_ENV,
      GROQ_API_KEY: '',
      LLM_DEFAULT_PROVIDER: 'gemini',
      LLM_DEFAULT_MODEL: 'gemini-3.8-flash',
      LLM_DEFAULT_CHEAP_MODEL: 'gemini-3.8-flash',
      GEMINI_API_KEY: 'gemini',
    };
    const { code, stdout, stderr } = run(['--strict'], env);
    expect(code).toBe(0);
    expect(stdout).toMatch(/Env validation OK/);
    expect(stderr).not.toMatch(/GROQ_API_KEY/);
  });

  it('fails strict validation when the configured provider key is absent', () => {
    const env = {
      ...BLANK_ENV,
      ...FULL_CRITICAL_ENV,
      GROQ_API_KEY: '',
      GEMINI_API_KEY: '',
      LLM_DEFAULT_PROVIDER: 'gemini',
      LLM_DEFAULT_MODEL: 'gemini-3.8-flash',
    };
    const { code, stderr } = run(['--strict'], env);
    expect(code).toBe(1);
    expect(stderr).toMatch(/GEMINI_API_KEY/);
  });

  it('requires a Gemini key for the unset platform default', () => {
    const env = {
      ...BLANK_ENV,
      ...FULL_CRITICAL_ENV,
      GEMINI_API_KEY: '',
    };
    const { code, stderr } = run(['--strict'], env);
    expect(code).toBe(1);
    expect(stderr).toMatch(/LLM_DEFAULT_PROVIDER=gemini requires GEMINI_API_KEY/);
  });

  it('rejects a partial provider override because its fallback model may be incompatible', () => {
    const { code, stderr } = run(['--strict'], {
      ...BLANK_ENV,
      ...FULL_CRITICAL_ENV,
      LLM_DEFAULT_PROVIDER: 'gemini',
    });
    expect(code).toBe(1);
    expect(stderr).toMatch(/must be configured together/);
  });

  it.each([
    ['LLM_DEFAULT_MODEL', 'gemini-flash-latest'],
    ['LLM_DEFAULT_MODEL', 'gemini-3.6-flash'],
    ['LLM_DEFAULT_MODEL', 'gemini-3.5-flash'],
    ['LLM_DEFAULT_CHEAP_MODEL', 'gemini-flash-latest'],
    ['LLM_DEFAULT_CHEAP_MODEL', 'gemini-3.1-flash-lite'],
  ])('rejects non-exact Gemini defaults in %s', (name, value) => {
    const env = {
      ...BLANK_ENV,
      ...FULL_CRITICAL_ENV,
      LLM_DEFAULT_PROVIDER: 'gemini',
      LLM_DEFAULT_MODEL: 'gemini-3.8-flash',
      LLM_DEFAULT_CHEAP_MODEL: 'gemini-3.8-flash',
      [name]: value,
    };
    const { code, stderr } = run(['--strict'], env);
    expect(code).toBe(1);
    expect(stderr).toContain(name);
    expect(stderr).toContain('gemini-3.8-flash');
  });

  it.each(['low', 'medium', 'high'])('accepts GEMINI_REASONING_EFFORT=%s', (value) => {
    const { code } = run(['--strict'], {
      ...BLANK_ENV,
      ...FULL_CRITICAL_ENV,
      GEMINI_REASONING_EFFORT: value,
    });
    expect(code).toBe(0);
  });

  it('rejects an unsupported Gemini reasoning level', () => {
    const { code, stderr } = run(['--strict'], {
      ...BLANK_ENV,
      ...FULL_CRITICAL_ENV,
      GEMINI_REASONING_EFFORT: 'xhigh',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('low, medium, high');
  });

  it('preserves explicit non-Gemini provider and model selections', () => {
    const env = {
      ...BLANK_ENV,
      ...FULL_CRITICAL_ENV,
      GEMINI_API_KEY: '',
      LLM_DEFAULT_PROVIDER: 'openai',
      LLM_DEFAULT_MODEL: 'gpt-4o-mini',
      LLM_DEFAULT_CHEAP_MODEL: 'gpt-4o-mini',
      OPENAI_API_KEY: 'openai',
    };
    const { code, stdout, stderr } = run(['--strict'], env);
    expect(code).toBe(0);
    expect(stdout).toMatch(/Env validation OK/);
    expect(stderr).not.toMatch(/GEMINI_API_KEY/);
  });

  it('accepts separate strict admission and execution model lists for a v2 rollout', () => {
    const { code, stdout } = run([], {
      ...BLANK_ENV,
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'true',
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS: 'physical_product',
      AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS: 'physical_product',
      AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS: '11111111-1111-4111-8111-111111111111',
    });
    expect(code).toBe(0);
    expect(stdout).toMatch(/Env validation OK/);
  });

  it.each([
    ['AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', 'physical_product,unknown'],
    ['AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', 'physical_product,physical_product'],
    ['AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'physical_product,unknown'],
    ['AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'physical_product,physical_product'],
  ])('rejects malformed %s while the v2 global flag is on', (name, value) => {
    const { code, stderr } = run([], {
      ...BLANK_ENV,
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'true',
      [name]: value,
    });
    expect(code).toBe(1);
    expect(stderr).toContain(name);
  });

  it('rejects a malformed v2 global flag', () => {
    const { code, stderr } = run([], {
      ...BLANK_ENV,
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'truthy-ish',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('AXWISE_EVIDENCE_PROFILE_V2_ENABLED');
  });

  it('rejects admission models that are absent from the execution list', () => {
    const { code, stderr } = run([], {
      ...BLANK_ENV,
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'true',
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS: 'physical_product',
      AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS: '',
    });
    expect(code).toBe(1);
    expect(stderr).toMatch(/must be a subset/i);
    expect(stderr).toContain('physical_product');
  });

  it('accepts an execution-only model while new admission is closed for queue drain', () => {
    const { code, stdout } = run([], {
      ...BLANK_ENV,
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'true',
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS: '',
      AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS: 'physical_product',
    });
    expect(code).toBe(0);
    expect(stdout).toMatch(/Env validation OK/);
  });

  it.each([
    ['not-a-uuid'],
    ['11111111-1111-4111-8111-111111111111,11111111-1111-4111-8111-111111111111'],
    ['11111111-1111-4111-8111-111111111111,'],
  ])('rejects malformed v2 admission org cohorts', (configuredOrgIds) => {
    const { code, stderr } = run([], {
      ...BLANK_ENV,
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'true',
      AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS: configuredOrgIds,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS');
  });
});
