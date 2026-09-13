export const RESEARCH_MODE_OPTIONS = [
  {
    id: 'instant',
    label: 'Instant',
    description: 'Synthetic only; no web grounding. Use attached and already-imported context.',
  },
  {
    id: 'grounded_fast',
    label: 'Grounded fast',
    description: 'Run a focused source-backed research pass before planning.',
  },
  {
    id: 'grounded_deep',
    label: 'Grounded deep',
    description: 'Build the full customer, market, interview, and executor research bundle.',
  },
  {
    id: 'auto',
    label: 'Auto',
    description: 'Let Orqaly select the research depth from the request.',
  },
];

export const COMMERCIAL_MARKET_LAUNCH_INTENT = 'commercial_market_launch';

export const COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES = Object.freeze([
  'Marketing ICP Specialist',
  'Finance Pricing Specialist',
  'GDPR Legal Compliance Specialist',
  'Business Development Sales Specialist',
  'Commercial Risk Analyst',
]);

const COMMERCIAL_RESEARCH_CATEGORIES = new Set(['marketing', 'consulting', 'finance']);
const COMMERCIAL_RESEARCH_PATTERN =
  /\b(commercial|customer|market|marketing|sales|revenue|pricing|package|outreach|lead(?:s| generation)?|conversion|funnel|go[- ]?to[- ]?market|gtm|buyer|competitor|icp|persona)\b/i;

export function isCommercialResearchRequest({ category, title, description } = {}) {
  if (
    COMMERCIAL_RESEARCH_CATEGORIES.has(
      String(category || '')
        .trim()
        .toLowerCase()
    )
  )
    return true;
  return COMMERCIAL_RESEARCH_PATTERN.test(`${title || ''} ${description || ''}`);
}

export function resolveAdvancedResearchMode(
  request,
  selectedMode = 'auto',
  explicitlySelected = false
) {
  if (explicitlySelected) return selectedMode;
  return isCommercialResearchRequest(request) ? 'grounded_deep' : selectedMode;
}

export function advancedResearchRequiresGrounding(mode) {
  return mode !== 'instant';
}
