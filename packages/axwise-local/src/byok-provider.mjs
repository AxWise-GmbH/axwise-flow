import { LocalAxwiseError, MAX_FRAME_BYTES, abortable, object, readProviderJson } from './runtime.mjs';
import { providerSchema } from './schema.mjs';
import { validateStandaloneConfig } from './standalone-config.mjs';

const fail = (code, message) => { throw new LocalAxwiseError(code, message); };
const MODEL = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/;

/** Explicit JSON-schema transport, not an agent, router or hosted auth client. */
export function createByokProvider({ config, env = process.env, fetchImpl = fetch } = {}) {
  const options = validateStandaloneConfig(config);
  const provider = async (prepared, signal = new AbortController().signal) => {
    signal.throwIfAborted();
    if (!object(prepared) || typeof prepared.systemPrompt !== 'string' || typeof prepared.userPrompt !== 'string'
      || !object(prepared.responseSchema) || !Number.isInteger(prepared.maxOutputTokens)
      || prepared.maxOutputTokens < 1 || prepared.maxOutputTokens > 16_384)
      fail('KERNEL_INVALID', 'The local specialist prompt is invalid.');
    const body = {
      model: options.model, stream: false,
      // Gemini's compatibility API rejects the OpenAI-only `store` field.
      // Local persistence is independent of provider retention policies.
      ...(options.provider === 'openai-compatible' ? { store: false } : {}),
      max_completion_tokens: prepared.maxOutputTokens,
      messages: [{ role: 'system', content: prepared.systemPrompt }, { role: 'user', content: prepared.userPrompt }],
      response_format: { type: 'json_schema', json_schema: { name: 'axwise_specialist_artifact',
        // OpenAI strict mode requires every property to be required and every
        // object to reject extras; the kernel intentionally has optional fields.
        // Preserve its original schema in non-strict generic mode rather than
        // falsely declaring the compact Gemini schema OpenAI-strict-compatible.
        strict: options.provider === 'gemini',
        schema: options.provider === 'gemini' ? providerSchema(prepared.responseSchema) : prepared.responseSchema } },
    };
    const bytes = JSON.stringify(body);
    if (Buffer.byteLength(bytes) > MAX_FRAME_BYTES) fail('KERNEL_INVALID', 'The local specialist prompt exceeds the request limit.');
    // Resolve only at invocation. Do not put secrets in config, paths, metadata,
    // subprocess arguments, persisted snapshots or returned diagnostic errors.
    let key;
    try { key = env[options.apiKeyEnv]; } catch {}
    if (typeof key !== 'string' || !key || key.length > 8192 || /\s|[^\x21-\x7e]/.test(key))
      fail('PROVIDER_KEY_REQUIRED', 'Set the configured provider API-key environment variable before using Axwise inference.');
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(options.providerTimeoutMs)]);
    const started = performance.now();
    try {
      let response;
      try {
        response = await abortable(() => fetchImpl(`${options.baseUrl}/chat/completions`, {
          method: 'POST', redirect: 'error', signal: deadline,
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: bytes,
        }), deadline);
      } catch {
        if (deadline.aborted) throw deadline.reason;
        fail('PROVIDER_UNAVAILABLE', 'The configured inference provider is unavailable. No automatic retry was performed.');
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        if ([401, 403].includes(response.status)) fail('PROVIDER_AUTH_FAILED', 'The configured inference provider rejected its API key or access permissions.');
        fail(response.status === 429 ? 'PROVIDER_BUSY' : 'PROVIDER_UNAVAILABLE', 'The configured inference provider could not complete the request. No automatic retry was performed.');
      }
      const data = await readProviderJson(response, deadline), choice = data?.choices?.[0];
      if (data?.choices?.length !== 1 || choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string'
        || !choice.message.content.trim() || choice.message.tool_calls?.length || choice.message.refusal)
        fail('PROVIDER_INVALID', 'The model did not return a complete specialist artifact.');
      // Report an actual provider-returned model where supplied, without
      // claiming that an unreported alias is a resolved backend model.
      const usage = { modelCalls: 1, provider: options.provider, requestedModel: options.model,
        model: MODEL.test(data.model || '') ? data.model : options.model,
        modelReported: typeof data.model === 'string' && MODEL.test(data.model) };
      for (const [name, value] of Object.entries({ inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
        cacheReadTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? data.usage?.cache_read_input_tokens,
        cacheWriteTokens: data.usage?.cache_creation_input_tokens }))
        if (Number.isSafeInteger(value) && value >= 0) usage[name] = value;
      return { response: choice.message.content, usage, timings: { authMs: 0, providerMs: Math.round(performance.now() - started) } };
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (deadline.aborted) fail('PROVIDER_TIMEOUT', 'The configured inference provider timed out. No automatic retry was performed.');
      if (error instanceof LocalAxwiseError) throw error;
      fail('PROVIDER_INVALID', 'The configured inference provider returned an invalid response.');
    }
  };
  provider.metadata = Object.freeze({ model: options.model, requestedModel: options.model, provider: options.provider });
  return provider;
}
