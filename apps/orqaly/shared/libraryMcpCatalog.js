/**
 * Library MCP Catalog — registry of every external tool / API the system can
 * call to produce a deliverable, tagged by tier so the free-first router can
 * pick the cheapest viable option.
 *
 * Tiers:
 *   'free'      — no payment ever (open-source, free APIs, no-key endpoints)
 *   'free-trial'— free credits then paid (Gamma, Recraft, etc.)
 *   'paid'      — always costs money (existing platform tools, Stability AI)
 *
 * quality_estimate (0-100) starts as a hand-guess and gets updated by the
 * Osja stage handler over time using rolling averages of real scores.
 *
 * Categories match knowledge_documents.metadata.deliverable_type.
 */
export const LIBRARY_MCP_CATALOG = [
  // ── Landing page ────────────────────────────────────────────────────
  {
    id: 'platform-deploy-site',
    category: 'landing_page',
    name: 'deploy_site (platform)',
    tier: 'paid',
    cost_per_call_usd: 0.02,
    quality_estimate: 80,
    api_key_required: true,
    mcp_available: true,
    notes: 'Existing platform tool. Cloudflare Workers deploy. Always available.',
  },
  {
    id: 'carrd',
    category: 'landing_page',
    name: 'Carrd',
    tier: 'free',
    cost_per_call_usd: 0,
    quality_estimate: 75,
    url: 'https://carrd.co',
    api_key_required: false,
    mcp_available: false,
    notes: 'One-page sites, free for personal use, no API but exportable HTML works.',
  },
  {
    id: 'vercel-deploy',
    category: 'landing_page',
    name: 'Vercel free tier',
    tier: 'free',
    cost_per_call_usd: 0,
    quality_estimate: 82,
    url: 'https://vercel.com',
    api_key_required: true,
    mcp_available: false,
    notes: 'Free hobby tier with generous limits. Same provider as Orchestratori hosting.',
  },
  {
    id: 'framer',
    category: 'landing_page',
    name: 'Framer',
    tier: 'free-trial',
    cost_per_call_usd: 0,
    quality_estimate: 88,
    url: 'https://framer.com',
    api_key_required: false,
    mcp_available: false,
    notes: 'Free for personal use, paid for custom domains. Strong template gallery.',
  },

  // ── Presentation ────────────────────────────────────────────────────
  {
    id: 'platform-create-slides',
    category: 'presentation',
    name: 'create_slides (platform)',
    tier: 'paid',
    cost_per_call_usd: 0.01,
    quality_estimate: 70,
    api_key_required: false,
    mcp_available: true,
    notes: 'Existing jsPDF-backed tool. Reliable but generic visual style.',
  },
  {
    id: 'slidev',
    category: 'presentation',
    name: 'Slidev',
    tier: 'free',
    cost_per_call_usd: 0,
    quality_estimate: 78,
    url: 'https://sli.dev',
    api_key_required: false,
    mcp_available: false,
    notes: 'Open-source, markdown-driven. Great for technical decks. No API — generated as Vue projects.',
  },
  {
    id: 'marp',
    category: 'presentation',
    name: 'Marp',
    tier: 'free',
    cost_per_call_usd: 0,
    quality_estimate: 72,
    url: 'https://marp.app',
    api_key_required: false,
    mcp_available: false,
    notes: 'Open-source markdown-to-slides. CLI exports PDF/HTML/PPTX directly.',
  },
  {
    id: 'reveal-js',
    category: 'presentation',
    name: 'reveal.js',
    tier: 'free',
    cost_per_call_usd: 0,
    quality_estimate: 75,
    url: 'https://revealjs.com',
    api_key_required: false,
    mcp_available: false,
    notes: 'Open-source HTML presentations. Most flexible but requires HTML authoring.',
  },
  {
    id: 'gamma',
    category: 'presentation',
    name: 'Gamma',
    tier: 'free-trial',
    cost_per_call_usd: 0,
    quality_estimate: 85,
    url: 'https://gamma.app',
    api_key_required: true,
    mcp_available: false,
    notes: 'AI-generated decks. Free credits then paid. Best visual quality of free-trial tier.',
  },

  // ── Banner / image ──────────────────────────────────────────────────
  {
    id: 'platform-generate-image',
    category: 'smm_banner',
    name: 'generate_image (platform / Stability)',
    tier: 'paid',
    cost_per_call_usd: 0.04,
    quality_estimate: 80,
    api_key_required: true,
    mcp_available: true,
    notes: 'Existing platform tool. Stability AI SDXL backbone.',
  },
  {
    id: 'pollinations-image',
    category: 'smm_banner',
    name: 'Pollinations.ai',
    tier: 'free',
    cost_per_call_usd: 0,
    quality_estimate: 75,
    url: 'https://image.pollinations.ai/prompt/{prompt}',
    api_key_required: false,
    mcp_available: false,
    notes: 'No API key required. SDXL backbone. Decent quality for social banners. URL-based.',
  },
  {
    id: 'unsplash',
    category: 'smm_banner',
    name: 'Unsplash API',
    tier: 'free',
    cost_per_call_usd: 0,
    quality_estimate: 78,
    url: 'https://api.unsplash.com',
    api_key_required: true,
    mcp_available: false,
    notes: 'Free 50 req/hr. Real photography (not AI). Great for hero banners that need authenticity.',
  },
  {
    id: 'recraft',
    category: 'smm_banner',
    name: 'Recraft',
    tier: 'free-trial',
    cost_per_call_usd: 0,
    quality_estimate: 86,
    url: 'https://recraft.ai',
    api_key_required: true,
    mcp_available: false,
    notes: 'Free credits then paid. Excellent for stylized illustrations and brand-consistent banners.',
  },

  // ── Document ────────────────────────────────────────────────────────
  {
    id: 'platform-generate-document',
    category: 'document_template',
    name: 'generate_document (platform)',
    tier: 'paid',
    cost_per_call_usd: 0.005,
    quality_estimate: 72,
    api_key_required: false,
    mcp_available: true,
    notes: 'Existing template-based document generator. Business plan, contract, report, proposal, policy.',
  },
  {
    id: 'pandoc',
    category: 'document_template',
    name: 'Pandoc',
    tier: 'free',
    cost_per_call_usd: 0,
    quality_estimate: 80,
    url: 'https://pandoc.org',
    api_key_required: false,
    mcp_available: false,
    notes: 'Open-source universal document converter. Markdown → PDF/DOCX/HTML/EPUB. CLI-based.',
  },
  {
    id: 'markdown-native',
    category: 'document_template',
    name: 'Plain Markdown',
    tier: 'free',
    cost_per_call_usd: 0,
    quality_estimate: 70,
    api_key_required: false,
    mcp_available: false,
    notes: 'No tool needed — just generate markdown text. Works for handbooks, READMEs, technical docs.',
  },

  // ── Table ───────────────────────────────────────────────────────────
  {
    id: 'platform-table',
    category: 'table_structure',
    name: 'generate_document tables',
    tier: 'paid',
    cost_per_call_usd: 0.005,
    quality_estimate: 70,
    api_key_required: false,
    mcp_available: true,
    notes: 'Tables embedded in generated documents.',
  },
  {
    id: 'markdown-tables',
    category: 'table_structure',
    name: 'Markdown tables',
    tier: 'free',
    cost_per_call_usd: 0,
    quality_estimate: 72,
    api_key_required: false,
    mcp_available: false,
    notes: 'No tool needed — pipe-separated markdown tables work everywhere.',
  },
  {
    id: 'notion-api',
    category: 'table_structure',
    name: 'Notion API',
    tier: 'free',
    cost_per_call_usd: 0,
    quality_estimate: 80,
    url: 'https://api.notion.com',
    api_key_required: true,
    mcp_available: true,
    notes: 'Free internal integration. Best when the user already lives in Notion.',
  },

  // ── Code ────────────────────────────────────────────────────────────
  {
    id: 'platform-deploy-site-code',
    category: 'code',
    name: 'deploy_site (code)',
    tier: 'paid',
    cost_per_call_usd: 0.02,
    quality_estimate: 75,
    api_key_required: true,
    mcp_available: true,
    notes: 'Same deploy tool, used for code-as-deliverable goals (commerce starters, demos).',
  },
];

/**
 * Get the catalog filtered by category. Used by selectBestTool().
 */
export function listToolsForCategory(category) {
  return LIBRARY_MCP_CATALOG.filter(t => t.category === category);
}

/**
 * Update a tool's quality_estimate using a rolling average. Called by the
 * Osja stage handler after each goal scoring. NOTE: this mutates the in-memory
 * array; persistence happens via the goal-orchestrator process restart picking
 * up new values from this file. For real persistence, move the catalog to a
 * DB table — defer until the catalog grows past ~50 entries.
 */
export function updateQualityEstimate(toolId, newScore, weight = 0.2) {
  const tool = LIBRARY_MCP_CATALOG.find(t => t.id === toolId);
  if (!tool) return;
  tool.quality_estimate = Math.round(
    tool.quality_estimate * (1 - weight) + newScore * weight,
  );
}
