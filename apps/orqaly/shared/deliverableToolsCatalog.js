/**
 * Deliverable tools catalog — central registry of every tool the system
 * can use to generate each deliverable category, with display metadata
 * for the wizard's tool selector UI.
 *
 * Lives in shared/ so both the backend (lib/) and the frontend (src/) can
 * import it without crossing the import boundary CLAUDE.md enforces.
 *
 * Phase 7 scope: only `presentation` has tools listed. Other categories
 * are auto-generated until the selector pattern proves out.
 *
 * HONEST POLICY (locked with the user 2026-04-09): only list tools that
 * are actually buildable today. No "Coming soon" placeholder cards. The
 * earlier draft listed Canva Pro, Gamma, and Pitch as paid placeholders;
 * research showed:
 *   - Canva Connect API is Enterprise-only (not on Pro tier) — can't be
 *     wired with bring-your-own-key, requires Canva legal approval
 *   - Pitch has no public API at all (open feature request)
 *   - Gamma has a real public API on Pro tier and IS buildable, but the
 *     user chose to defer it until they're ready to pay $15/mo to test
 * So the catalog ships with one tool. When more become real, they get
 * added. No theater, no fake teasers.
 *
 * Each entry:
 *   id              — short stable identifier, used as preferredTool value
 *   name            — display name in the selector card
 *   tier            — 'free' | 'paid'
 *   price_label     — short label rendered on the chip ('FREE', '$15/mo', etc.)
 *   quality_stars   — 1-5, displayed as ★★★★☆
 *   description     — 1-2 sentence card body
 *   enabled         — true if the tool is wired and clickable
 */
export const DELIVERABLE_TOOLS = {
  presentation: [
    {
      id: 'html-browserless',
      name: 'Designed HTML deck',
      tier: 'free',
      price_label: 'FREE',
      quality_stars: 4,
      description: 'An LLM writes a complete designed HTML slide deck with modern fonts, real layouts, and a custom color palette. Rendered live in your browser. ~15s generation.',
      enabled: true,
    },
  ],
  landing_page: [
    {
      id: 'ai-generate-visual-edit',
      name: 'AI Generate + Visual Editor',
      tier: 'free',
      price_label: 'FREE',
      quality_stars: 5,
      description: 'AI generates a full landing page, then edit visually in the page builder with GrapesJS. Deploy to a live URL.',
      enabled: true,
    },
  ],
  // M6: smm_banner exposes the Stability AI SDXL path that already lives in
  // library-calibration.js::generateRealArtifact (line ~94). Listed because it
  // is buildable today via BYOK — user supplies a Stability AI key on the
  // Tools page, the pipeline refines the brief into an SDXL prompt and
  // renders a landscape banner. Not a teaser per HONEST POLICY — the handler
  // is wired and the renderer (ImageGrid for `asset` deliverables) exists.
  smm_banner: [
    {
      id: 'stability-sdxl',
      name: 'AI Banner (Stability AI SDXL)',
      tier: 'paid',
      price_label: 'BYOK',
      quality_stars: 4,
      description: 'Refines the brief into an SDXL prompt, generates a landscape banner via your Stability AI key, and delivers the image URL.',
      enabled: true,
    },
  ],
  // document_template, table_structure, code — intentionally not listed.
  // These deliverable types have no calibration handler yet in
  // library-calibration.js. Adding entries without handlers would violate
  // HONEST POLICY (fake teaser cards). Add once the generator paths land.
};

/**
 * Return the array of tools for one deliverable category, or [] if none.
 */
export function listToolsForDeliverable(deliverableType) {
  return DELIVERABLE_TOOLS[deliverableType] || [];
}

/**
 * Return the first enabled tool for a category (the default selection),
 * or null if none are enabled. Used by the wizard to pre-select.
 */
export function getDefaultEnabledTool(deliverableType) {
  return (DELIVERABLE_TOOLS[deliverableType] || []).find(t => t.enabled) || null;
}

/**
 * Lookup a single tool by id across all categories.
 */
export function getToolById(toolId) {
  for (const tools of Object.values(DELIVERABLE_TOOLS)) {
    const found = tools.find(t => t.id === toolId);
    if (found) return found;
  }
  return null;
}
