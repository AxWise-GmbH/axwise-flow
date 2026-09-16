import { providerLabel, shortModelLabel } from '../../config/assistantBrain';

/**
 * What a freshly-picked assistant says when it introduces itself.
 *
 * Kept as a pure function, the way `goalSetupSections.js` and
 * `settingsSections.js` keep their copy, so "what does a half-configured
 * assistant with no organization say?" is a unit test rather than a rendered
 * dialog. It must tolerate a bare row: the picker's list carries `name`,
 * `config`, `activated` and `organizationId`, and any of them can be missing.
 */

const FALLBACK_NAME = 'My Assistant';

const PURPOSE =
  'I look after your goals, agents and reports, and I can answer anything about this workspace.';

const READY = "I'm set up and ready - I'll do my best for you.";

const NOT_READY =
  "I still need my Core - a model and storage - before I can start. Set it and I'll do my best for you.";

/**
 * @param {{ assistant?: object, orgName?: string|null }} params
 * @returns {{ title: string, lines: string[], footnote: string|null }}
 */
export function buildAssistantWelcome({ assistant, orgName } = {}) {
  const name = String(assistant?.name || '').trim() || FALLBACK_NAME;
  const org = String(orgName || '').trim();
  const config = assistant?.config || {};

  const provider = providerLabel(config.provider);
  const model = shortModelLabel(config.model);
  // No model means nothing has been chosen yet; an empty chip would say less
  // than no chip.
  const footnote = model ? [provider, model].filter(Boolean).join(' · ') : null;

  return {
    title: `Hi, I'm ${name}.`,
    lines: [
      org ? `I'm the assistant for ${org}.` : "I'm your assistant here.",
      PURPOSE,
      assistant?.activated ? READY : NOT_READY,
    ],
    footnote,
  };
}

export default buildAssistantWelcome;
