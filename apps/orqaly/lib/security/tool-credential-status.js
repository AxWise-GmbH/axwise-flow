/** Metadata-only tool credential status checks; never reads Vault ciphertext. */
import { TOOL_PROVIDER_ALIAS } from './provider-catalog.js';

export async function listConfiguredToolIds(client, userId, toolIds, { slot = 'default' } = {}) {
  const ids = [...new Set((toolIds || []).filter(Boolean))];
  if (!client || !userId || ids.length === 0) return new Set();

  const providers = new Set(ids.map((id) => `tool:${id}`));
  if (slot === 'default') {
    for (const id of ids) {
      const alias = TOOL_PROVIDER_ALIAS[id];
      if (alias) providers.add(alias);
    }
  }

  const { data, error } = await client
    .from('user_api_keys')
    .select('provider, slot')
    .eq('user_id', userId)
    .eq('is_current', true)
    .eq('slot', slot)
    .in('provider', [...providers]);
  if (error) throw new Error('TOOL_CREDENTIAL_STATUS_UNAVAILABLE');

  const present = new Set((data || []).map((row) => row.provider));
  return new Set(
    ids.filter(
      (id) =>
        present.has(`tool:${id}`) || (slot === 'default' && present.has(TOOL_PROVIDER_ALIAS[id]))
    )
  );
}

export async function isToolCredentialConfigured(client, userId, toolId, options) {
  const configured = await listConfiguredToolIds(client, userId, [toolId], options);
  return configured.has(toolId);
}
