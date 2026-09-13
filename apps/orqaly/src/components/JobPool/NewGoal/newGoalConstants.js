/**
 * Static option sets for the New Goal dialog.
 *
 * Extracted verbatim from SmartRequestDialog so the wizard steps, the block
 * components and the tests can share one definition.
 */
export const CATEGORIES = [
  'development',
  'design',
  'marketing',
  'data',
  'operations',
  'finance',
  'support',
  'consulting',
  'other',
];

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export const PRIORITY_STYLES = {
  low: { bg: '#F3F4F6', color: '#6B7280' },
  medium: { bg: '#DBEAFE', color: '#2563EB' },
  high: { bg: '#FEF3C7', color: '#D97706' },
  urgent: { bg: '#FEE2E2', color: '#DC2626' },
};

export const INTAKE_QUESTIONS = [
  {
    key: 'goal',
    label: 'What is your main goal?',
    placeholder: 'e.g., Build a customer dashboard, automate reporting, redesign landing page...',
    required: true,
  },
  {
    key: 'challenges',
    label: 'What challenges are you facing?',
    placeholder: 'e.g., Current process is manual, data is scattered, need faster turnaround...',
    required: false,
  },
  {
    key: 'timeline',
    label: 'Expected timeline?',
    placeholder: 'e.g., Within 1 week, 2-3 days, no rush...',
    required: false,
  },
  {
    key: 'details',
    label: 'Any specific requirements or preferences?',
    placeholder: 'e.g., Must integrate with Slack, need mobile support, budget under $500...',
    required: false,
  },
];

/**
 * Tool policy. The wire values are unchanged; only the labels are new.
 *
 * Auto and the server both default to `with_tools`, so AxWise can choose the
 * evidence and capabilities required by the accepted scope. `no_tools` remains
 * an explicit user constraint rather than an invisible product default.
 */
export const TOOL_OPTIONS = [
  {
    id: 'no_tools',
    label: 'None',
    hint: 'LLM knowledge only, no external calls.',
  },
  {
    id: 'with_tools',
    label: 'All library',
    hint: 'Agents can use APIs, web search and external tools.',
  },
  {
    id: 'existing_only',
    label: 'Only existing',
    hint: 'Only tools you have already configured, plus attached materials.',
  },
];

export const DESTINATION_OPTIONS = [
  { id: 'new_business', label: 'New' },
  { id: 'existing_business', label: 'Existing' },
  { id: 'standalone', label: 'Standalone' },
];

/**
 * What Setup: Auto fills in. Kept in one place so the locked block summaries
 * and the submitted payload can never drift apart.
 */
export const AUTO_DEFAULTS = {
  toolMode: 'with_tools',
  goalDest: 'standalone',
  kbDocumentIds: [],
  materialsSummary: 'Picked for you',
};

export const TOOL_LABELS = Object.fromEntries(TOOL_OPTIONS.map((o) => [o.id, o.label]));
export const DESTINATION_LABELS = Object.fromEntries(
  DESTINATION_OPTIONS.map((o) => [o.id, o.label])
);
