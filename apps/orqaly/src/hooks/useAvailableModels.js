/**
 * useAvailableModels — the LLM/provider list for the assistant Brain picker,
 * annotated with which providers the user has configured a key for (BYOK).
 *
 * The copilot backend falls back to platform keys, so every provider stays
 * usable; `hasKey` just highlights the ones the user set up in Settings > API keys.
 */
import { useEffect, useState } from 'react';
import { PROVIDERS } from '../config/assistantBrain';
import { listUserKeys } from '../services/userKeysService';

// providerCatalog ids ("llm:openai") -> assistantBrain ids ("openai")
const CATALOG_TO_BRAIN = {
  'llm:openai': 'openai',
  'llm:anthropic': 'anthropic',
  'llm:groq': 'groq',
  'llm:gemini': 'gemini',
  'llm:google': 'gemini',
};

export default function useAvailableModels() {
  const [configured, setConfigured] = useState(() => new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await listUserKeys();
        const s = new Set();
        for (const r of rows || []) {
          const brainId = CATALOG_TO_BRAIN[r.provider] || String(r.provider || '').replace(/^llm:/, '');
          if (brainId) s.add(brainId);
        }
        if (alive) setConfigured(s);
      } catch {
        /* platform keys still work; leave configured empty */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const providers = PROVIDERS.map((p) => ({ ...p, hasKey: configured.has(p.id) }));
  return { providers, configured, loading };
}
