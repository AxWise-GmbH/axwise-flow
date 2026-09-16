/**
 * Assistant Console blocks + layout templates.
 *
 * `ASSISTANT_BLOCK_DEFS` is the single source of truth for which blocks exist on
 * the Assistant Console, their default order, and — unlike Home — their *size*.
 * Sizing (column span + height tier) is intrinsic to each block here rather than
 * a property of a template, because the Assistant uses one fixed structure (the
 * "Beginner" layout) that renders identically in Simple and Advanced UI modes.
 *
 * A template is still a named `{ hidden, order, widths }` snapshot (applied via
 * useSettingsBlockLayout.applyLayout) so users can hide/reorder blocks and snap
 * back to the built-in arrangement or their own saved ones. Width is unused on
 * the Assistant (span is intrinsic), so templates carry `widths: []`.
 */

// Fixed block heights per tier (px), applied from the `sm` breakpoint up. On
// `xs` every block falls back to `auto` (single-column stack). Content taller
// than its tier scrolls inside the card (BentoCard `scrollBody`).
export const ASSISTANT_TIER_H = {
  xl: 442, // conversation history, usage
  tall: 340, // communication activity
  control: 411, // profile, channels, voice (Core/Channels/Voice: +10% from 374)
  medium: 370, // team comms
  short: 317, // data, contacts, insights
  strip: 84, // company brief
};

// Default order === the "Beginner" wireframe. `span` is the column count in the
// 3-column bento ('full' = whole row); `tier` keys into ASSISTANT_TIER_H.
export const ASSISTANT_BLOCK_DEFS = [
  { id: 'communication', label: 'Communication Activity', span: 'full', tier: 'tall' },
  { id: 'chat', label: 'Assistant Chat', span: 'full', tier: 'strip' },
  { id: 'conversations', label: 'Conversations', span: 2, tier: 'xl' },
  { id: 'usage', label: 'Usage', span: 1, tier: 'xl' },
  { id: 'profile', label: 'Core', span: 1, tier: 'control' },
  { id: 'channels', label: 'Channels', span: 1, tier: 'control' },
  { id: 'voice', label: 'Voice', span: 1, tier: 'control' },
  { id: 'brief', label: 'Company Brief', span: 'full', tier: 'strip' },
  { id: 'arena', label: 'Arena', span: 'full', tier: 'short' },
  { id: 'data', label: 'Data', span: 1, tier: 'short' },
  { id: 'contacts', label: 'Contacts', span: 1, tier: 'short' },
  { id: 'insights', label: 'Insights', span: 1, tier: 'short' },
  { id: 'team', label: 'Contributions', span: 'full', tier: 'medium' },
];

export const ASSISTANT_BLOCK_IDS = ASSISTANT_BLOCK_DEFS.map((b) => b.id);

// Quick lookups for the grid renderer.
export const ASSISTANT_BLOCK_SPAN = Object.fromEntries(
  ASSISTANT_BLOCK_DEFS.map((b) => [b.id, b.span])
);
export const ASSISTANT_BLOCK_TIER = Object.fromEntries(
  ASSISTANT_BLOCK_DEFS.map((b) => [b.id, b.tier])
);

/**
 * Built-in templates. Only "Beginner" exists — it is the default arrangement and
 * the one the user snaps back to. `order` lists every block id (visible first);
 * nothing is hidden; `widths` is empty (span is intrinsic to the block).
 */
export const BUILTIN_ASSISTANT_TEMPLATES = [
  {
    id: 'builtin:beginner',
    name: 'Beginner',
    builtin: true,
    order: ASSISTANT_BLOCK_IDS,
    hidden: [],
    widths: [],
  },
];
