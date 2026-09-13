import { createLogger } from '../../api/_lib/logger.js';
import { resolveUserKey } from '../security/resolve-user-key.js';

const log = createLogger('local-llm-models');

/**
 * Fetch available models from configured Local LLM endpoints.
 */
export async function handleLocalLlmModels(req, res) {
  const userId = req.user?.id || req.body?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const results = [];

  // 1. Try Ollama
  try {
    const { key: ollamaUrl } = await resolveUserKey({
      userId,
      provider: 'llm:ollama',
      envVar: 'OLLAMA_BASE_URL',
      requireUser: true,
    });
    if (ollamaUrl) {
      const baseUrl = ollamaUrl.replace(/\/v1\/?$/, '').replace(/\/$/, ''); // Remove /v1 if present for Ollama tags API
      const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const data = await response.json();
        const models = (data.models || []).map((m) => ({
          id: m.name,
          name: m.name,
          details: `${(m.size / 1024 / 1024 / 1024).toFixed(1)} GB`,
        }));
        results.push({ provider: 'Ollama', url: baseUrl, status: 'Online', models });
      } else {
        results.push({ provider: 'Ollama', url: baseUrl, status: `Error (${response.status})`, models: [] });
      }
    }
  } catch (err) {
    if (!err.message.includes('No key configured')) {
      results.push({ provider: 'Ollama', status: 'Offline / Unreachable', models: [], error: err.message });
    }
  }

  // 2. Try Local OpenAI
  try {
    const { key: localOpenaiUrl } = await resolveUserKey({
      userId,
      provider: 'llm:local-openai',
      envVar: 'LOCAL_OPENAI_URL',
      requireUser: true,
    });
    if (localOpenaiUrl) {
      const baseUrl = localOpenaiUrl.replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const data = await response.json();
        const models = (data.data || []).map((m) => ({
          id: m.id,
          name: m.id,
          details: 'OpenAI Compatible',
        }));
        results.push({ provider: 'LM Studio / Compatible', url: baseUrl, status: 'Online', models });
      } else {
        results.push({ provider: 'LM Studio / Compatible', url: baseUrl, status: `Error (${response.status})`, models: [] });
      }
    }
  } catch (err) {
    if (!err.message.includes('No key configured')) {
      results.push({ provider: 'LM Studio / Compatible', status: 'Offline / Unreachable', models: [], error: err.message });
    }
  }

  return res.json({ success: true, endpoints: results });
}
