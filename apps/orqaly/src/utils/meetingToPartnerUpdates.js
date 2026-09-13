import { AGREEMENT_TYPES, FUNNEL_STATUSES, TRAFFIC_SOURCES } from './constants';

/**
 * Derives suggested partner profile updates from a meeting's structured transcript.
 * Used to show an "Actions from meeting" block where the user can apply or correct changes.
 *
 * @param {Object} meeting - Meeting with transcriptStructured
 * @param {Object} partner - Current partner (flat or projected)
 * @returns {Array<{ id, field, label, currentValue, suggestedValue, applied }>}
 */
export function deriveSuggestedPartnerUpdates(meeting, partner) {
  const structured = meeting?.transcriptStructured;
  if (!structured || !partner) return [];

  const suggestions = [];
  const text = [
    structured.summary,
    (structured.decisions || []).join(' '),
    (structured.topics || []).join(' '),
    (structured.tags || []).join(' '),
    (structured.action_items || []).map((a) => a.task).join(' '),
    (structured.agreements || []).join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const existingIds = new Set();

  const add = (field, label, currentValue, suggestedValue) => {
    if (suggestedValue == null || String(suggestedValue) === String(currentValue)) return;
    const id = `${meeting.id}-${field}-${existingIds.size}`;
    existingIds.add(id);
    suggestions.push({
      id,
      field,
      label,
      currentValue,
      suggestedValue,
      applied: false,
    });
  };

  // Agreement: look for hybrid, revshare, cpl
  const currentAgreement = partner.agreement || partner.information?.agreement || '';
  if (/\bhybrid\b/.test(text)) add('agreement', 'Agreement', currentAgreement, 'Hybrid');
  else if (/\brevshare|revenue share|rev share\b/.test(text))
    add('agreement', 'Agreement', currentAgreement, 'Revshare');
  else if (/\bcpl\b|cost per lead/.test(text))
    add('agreement', 'Agreement', currentAgreement, 'CPL');

  // Funnel status: look for working, onboard, proposal, etc.
  const currentFunnel = partner.funnelStatus || partner.information?.funnelStatus || '';
  const funnelMap = [
    [/\bworking\b|onboard|live\b/, 'Working'],
    [/\bagreed start|agreed start date\b/, 'Agreed start date'],
    [/\bproposal sent|proposal\b/, 'Proposal Sent'],
    [/\bmeeting scheduled|scheduled\b/, 'Meeting Scheduled'],
    [/\bcontacted\b/, 'Contacted'],
  ];
  for (const [regex, status] of funnelMap) {
    if (regex.test(text)) {
      add('funnelStatus', 'Funnel status', currentFunnel, status);
      break;
    }
  }

  // Traffic sources: map keywords to TRAFFIC_SOURCES and suggest merging with current
  const currentSources = Array.isArray(partner.trafficSources)
    ? partner.trafficSources
    : partner.trafficSource
      ? [partner.trafficSource]
      : [];
  const keywordToSource = {
    facebook: 'FB',
    fb: 'FB',
    tiktok: 'TikTok',
    google: 'Google',
    ppc: 'PPC',
    sms: 'SMS',
    seo: 'SEO',
    email: 'Email',
    native: 'Native',
    adexium: 'Adexium',
    tads: 'TADS',
  };
  const mentioned = new Set();
  for (const [keyword, source] of Object.entries(keywordToSource)) {
    if (text.includes(keyword)) mentioned.add(source);
  }
  const validMentioned = [...mentioned].filter((s) => TRAFFIC_SOURCES.includes(s));
  if (validMentioned.length > 0) {
    const merged = [...new Set([...currentSources.map(String), ...validMentioned])];
    const currentStr = [...currentSources].sort().join(', ');
    const suggestedStr = merged.sort().join(', ');
    if (suggestedStr !== currentStr)
      add('trafficSources', 'Traffic sources', currentStr || '—', suggestedStr);
  }

  // Group: Webmaster vs Partner
  const currentGroup = partner.group || partner.information?.group || '';
  if (/\bwebmaster\b/.test(text)) add('group', 'Group', currentGroup, 'Webmaster');
  else if (/\bpartner\b/.test(text) && !/\bpartner\s+(agency|manager)/.test(text))
    add('group', 'Group', currentGroup, 'Partner');

  return suggestions;
}

/**
 * Generate a unique id for a suggested update (for list keys and updates).
 */
export function suggestedUpdateId(meetingId, field, index) {
  return `sug-${meetingId}-${field}-${index}`;
}
