/**
 * buildAgentProfile - deterministically build a COMPLETE agent_profiles payload
 * from an agent's data (a marketplace import item, a marketplace card, or an
 * Agent Hub record), so activated agents get a full profile card in the same
 * style as the hand-authored predefined agents (see predefinedAgentProfiles.js).
 *
 * No LLM, no photos: contact/signature/org and sensible tone/behavior defaults
 * are derived; bio/backstory are templated from the agent's role + description.
 * The result is fed straight to seedProfiles() (activation) or upsertProfile()
 * (the "Generate profile" button) - both insert whatever fields we pass.
 *
 * Output contains only real agent_profiles columns, so seedProfiles matches the
 * agent by job_title/role (agents.name stores the role) with nothing to strip.
 */

const ORG = 'Orqaly Inc.';
const EMAIL_DOMAIN = 'orchestratori.fake'; // matches the predefined agents' fake domain

/** Accent-folding slug (mirrors the headshot/email slug used across the app). */
export function slugify(name, sep = '-') {
  const s = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, sep);
  // trim leading/trailing separators
  const esc = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return s.replace(new RegExp(`^${esc}+|${esc}+$`, 'g'), '');
}

function firstNameOf(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

export function buildAgentProfile(agent = {}) {
  const role = String(agent.role || agent.name || 'Agent').trim();
  const displayName = String(agent.display_name || agent.name || role).trim();
  const description = String(agent.description || '').trim();
  // Persona (color/emoji) only comes from an import item, never an agent record's
  // own metadata (which holds unrelated fields).
  const persona = agent._persona || agent.persona || {};

  const emailSlug = slugify(displayName, '.') || slugify(role, '.') || 'agent';
  const email = `${emailSlug}@${EMAIL_DOMAIN}`;
  const first = firstNameOf(displayName);
  const roleLower = role.toLowerCase();

  const bio =
    description ||
    `${displayName} is a specialist ${roleLower} on the Orqaly team, focused on delivering ${roleLower} work reliably and clearly.`;
  const backstory = (
    `${displayName} joined Orqaly as a ${role}. ` +
    (description || `Brings deep expertise in ${roleLower} and a bias for clear, dependable execution.`)
  ).trim();

  return {
    display_name: displayName,
    pronouns: 'they/them', // neutral default (unknown for a generated agent)
    age: null,
    gender: '',
    job_title: role,
    role,
    organization: ORG,
    location: '',
    timezone: '',
    bio,
    email,
    phone: '',
    linkedin_url: `linkedin.com/in/${slugify(displayName)}`,
    whatsapp: '',
    telegram: '',
    email_signature: `${displayName} | ${role}\n${ORG} | ${email}`,
    communication_tone: {
      style: 'professional',
      verbosity: 'concise',
      emoji_usage: 'never',
      formality: 'neutral',
    },
    message_templates: [
      {
        name: 'Status Update',
        subject: `Update - ${role}`,
        body: `Hi [Name],\n\nQuick update on the work in progress. [Details]\n\nI'll flag anything that needs a decision.\n\n${first}`,
        category: 'status_update',
      },
      {
        name: 'Handoff',
        subject: 'Handoff - next steps',
        body: `Hi [Name],\n\nHanding this over with everything you need: [Context]. Next steps: [Actions].\n\nShout if anything is unclear.\n\n${first}`,
        category: 'handoff',
      },
    ],
    backstory,
    behavior_rules: {
      reply_delay_min_sec: 60,
      reply_delay_max_sec: 300,
      escalation_rules: ['pricing', 'legal review', 'security', 'irreversible actions'],
      topics_to_avoid: ['politics', 'religion'],
    },
    metadata: persona.color || persona.emoji ? { color: persona.color, emoji: persona.emoji } : {},
  };
}
