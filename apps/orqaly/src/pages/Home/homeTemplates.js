/**
 * Home dashboard blocks + layout templates.
 *
 * `HOME_BLOCK_DEFS` is the single source of truth for which blocks exist on the
 * Home overview and their default order. A "template" is a named snapshot of
 * { hidden, order } that can be applied to the layout in one click.
 *
 * Built-in templates live here in code. Custom templates are saved per account
 * in the database (see lib/api-handlers/dashboard-templates.js) and merged with
 * these at render time.
 *
 * The surface-agnostic matching/grouping helpers live in utils/blockTemplates.js
 * and are re-exported here so existing Home imports keep working.
 */
export {
  templateMatches,
  groupBlockRows,
  sameMembers,
  sameSequence,
} from '../../utils/blockTemplates';

// Customizable dashboard blocks (drag-to-reorder + show/hide). Nothing is
// pinned, so every block is reorderable. The id/label pairs are consumed by the
// layout engine (useSettingsBlockLayout) and the filter dialog.
export const HOME_BLOCK_DEFS = [
  { id: 'org_metrics', label: 'Key Stats' },
  { id: 'goals', label: 'Goals in Action' },
  { id: 'loops', label: 'Loops from Agents' },
  { id: 'performance', label: 'Performance' },
  { id: 'activity', label: 'Activity' },
  { id: 'communicator', label: 'Communicator' },
  { id: 'llm_usage', label: 'LLM Usage' },
  { id: 'data_ops', label: 'Data Operations' },
  { id: 'org_structure', label: 'Organization' },
  { id: 'consilium', label: 'Consilium Activity' },
];

export const HOME_BLOCK_IDS = HOME_BLOCK_DEFS.map((b) => b.id);

/**
 * Built-in templates. `id` is stable and prefixed so it never collides with a
 * database UUID. `order` lists every block id (visible first, hidden after);
 * `hidden` lists the ids that start collapsed; `widths` lists the ids rendered
 * at half width (everything else is full width). Width is a property of the
 * template, not the block, so the same block can pair in one template and be
 * full width in another.
 */
export const BUILTIN_HOME_TEMPLATES = [
  {
    id: 'builtin:default',
    name: 'Advanced',
    builtin: true,
    // Org structure, Consilium, Activity | Communicator, Performance,
    // Goals in Action | Loops from Agents, Data Operations, LLM Usage.
    // Key Stats is hidden.
    order: [
      'org_structure',
      'consilium',
      'activity',
      'communicator',
      'performance',
      'goals',
      'loops',
      'data_ops',
      'llm_usage',
      'org_metrics',
    ],
    hidden: ['org_metrics'],
    widths: ['activity', 'communicator', 'goals', 'loops'],
  },
  {
    id: 'builtin:beginner',
    name: 'Beginner',
    builtin: true,
    // Goals in Action | Activity paired at the top, then Performance, LLM Usage
    // and Data Operations full width. Loops from Agents and Communicator are
    // hidden here (they live in their own blocks).
    order: [
      'goals',
      'activity',
      'performance',
      'llm_usage',
      'data_ops',
      'loops',
      'communicator',
      'org_metrics',
      'org_structure',
      'consilium',
    ],
    hidden: ['loops', 'communicator', 'org_metrics', 'org_structure', 'consilium'],
    widths: ['goals', 'activity'],
  },
];
