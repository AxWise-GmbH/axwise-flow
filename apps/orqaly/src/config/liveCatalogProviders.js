/**
 * Which live external providers can be requested for each Marketplace category.
 * Only categories with a public/queryable provider API appear here; the rest
 * stay curated (see marketplaceImportSources.js). Consumed by the live catalog
 * page (MarketplaceImport.jsx) and its search hook.
 *
 * `needsKey` flags providers that require a platform/user API key to return
 * results (the page shows a graceful "not configured" state when missing).
 */
export const CATEGORY_PROVIDERS = {
  orgs: [],
  teams: [],
  agents: [],
  models: [
    { id: 'openrouter', label: 'OpenRouter', needsKey: false },
    { id: 'huggingface', label: 'Hugging Face', needsKey: false },
  ],
  tools: [{ id: 'composio', label: 'Composio', needsKey: true }],
  skills: [],
};

export function getProvidersForCategory(category) {
  return CATEGORY_PROVIDERS[category] || [];
}
