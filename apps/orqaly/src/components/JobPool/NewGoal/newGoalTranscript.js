/**
 * The Simple-mode goal thread, derived from state rather than accumulated.
 *
 * Step 1 used to be a stacked form. It is now a conversation, and this module
 * is the one place that decides what the conversation contains. It is a pure
 * function of the state SmartRequestDialog already holds, which means the
 * thread can never drift out of sync with the form values behind it: there is
 * no separate message list to append to and forget to update.
 *
 * Ids are derived from the message kind, never generated. A churning key would
 * remount the live controls these messages carry, and MaterialsBlock's KbPicker
 * refetches its document list on mount, so unstable ids would fire a network
 * request on every keystroke.
 */

/** Every message kind the Step 1 thread can hold, in the order they appear. */
export const TRANSCRIPT_KINDS = [
  'intro',
  'request',
  'setup',
  'approve',
  'thinking',
  'brief',
  'error',
  'launched',
];

export const INTRO_TEXT =
  'Tell me what you want to achieve. I will turn it into a brief, pick a team and run it.';

/**
 * What the composer does right now.
 *
 * The composer is permanent, so it must never be an input with nowhere to send.
 * Every non-terminal state has a real destination on the server, and this maps
 * the goal's status onto the one it currently has.
 *
 * Between the send and the goal existing there is no team lead yet, so `sent`
 * is the one role with nothing to send to: the box is empty, the request is in
 * the thread, and the label says what is happening rather than still asking
 * the user to describe a goal they have already sent.
 */
export function composerRole(status, { hasGoal = false, sent = false } = {}) {
  if (!hasGoal) return sent ? 'sent' : 'describe';
  if (status === 'awaiting_po_input') return 'answer';
  if (status === 'awaiting_context_approval' || status === 'awaiting_approval') return 'revise';
  if (status === 'completed' || status === 'failed' || status === 'cancelled') return 'done';
  return 'lead';
}

/** Roles whose send goes to the goal's team lead rather than starting a goal. */
export function composerTalksToLead(role) {
  return role === 'lead' || role === 'revise' || role === 'answer' || role === 'done';
}

const COMPOSER_COPY = {
  describe: {
    state: 'Describing your goal',
    placeholder: 'Describe what you want. One or two sentences is plenty.',
  },
  sent: {
    state: 'Sent - preparing your brief',
    placeholder: 'Your team lead will be here in a moment…',
  },
  lead: {
    state: 'Running - messages go to your team lead',
    placeholder: 'Ask your team lead something…',
  },
  revise: {
    state: 'Waiting on you - approve, or say what to change',
    placeholder: 'Describe what you want changed…',
  },
  answer: {
    state: 'Scope ready - proceed or edit',
    placeholder: 'Say proceed, or add a correction…',
  },
  done: {
    state: 'Finished - your team lead can still answer questions',
    placeholder: 'Ask about the result…',
  },
};

/**
 * The one role that draws its state above the box.
 *
 * Before the request is sent there is no thread to read it from, so the label
 * is the only thing saying what the box is for. Every state after that is
 * already on screen: the request is in the thread, the run reports into it
 * underneath, and the gates render as their own cards with their own buttons.
 * A label restating any of that sits in the exact spot the eye lands before
 * typing, and says nothing the user did not just watch happen.
 */
const ROLES_WITH_LINE = new Set(['describe']);

/**
 * What the composer says about itself.
 *
 * `state` is the accessible name and is always present, for every role - an
 * input with no name is unusable by anything but a mouse, and the state is
 * exactly what a screen reader needs to announce. `line` is what is drawn on
 * screen, and is null wherever the thread already says it.
 */
export function composerCopy(role) {
  const key = COMPOSER_COPY[role] ? role : 'describe';
  const copy = COMPOSER_COPY[key];
  return { ...copy, line: ROLES_WITH_LINE.has(key) ? copy.state : null };
}

/**
 * Build the Step 1 thread.
 *
 * @param {object} state
 * @param {string} state.simpleInput        what the user typed
 * @param {string} state.simplePhase        'input' | 'processing' | 'result'
 * @param {boolean} state.setupManual       Setup switch, Manual when true
 * @param {boolean} state.humanApprove      Human Approve switch
 * @param {object|null} state.structuredResult  the parsed brief
 * @param {object|null} state.extracted     LLM breakdown of the request
 * @param {string[]} state.suggestions      follow-up questions from the LLM
 * @param {number} state.budgetUsd
 * @param {string} state.complexity
 * @param {string} state.expectedResults
 * @param {number|null} state.analyzingSince  epoch ms the analysis started
 * @param {string} state.aiError
 * @param {object|null} state.createdGoal
 * @param {boolean} state.organizationLoadError  forces the blocks open
 * @param {boolean} state.resumed  reopening a goal that already exists
 * @returns {Array<{id: string, kind: string, role: 'user'|'assistant'}>}
 */
export function buildTranscript(state = {}) {
  // Reopening an existing goal: there is no form to fill, so the setup half of
  // the thread is empty and the run history stands on its own. Replaying the
  // intro and the Setup card here would offer choices the goal already made.
  if (state.resumed) return [];

  const {
    simpleInput = '',
    submittedText = '',
    simplePhase = 'input',
    setupManual = false,
    humanApprove = false,
    structuredResult = null,
    extracted = null,
    suggestions = [],
    budgetUsd = 0,
    complexity = 'simple',
    expectedResults = '',
    aiError = '',
    createdGoal = null,
    organizationLoadError = '',
    analyzingSince = null,
  } = state;

  const out = [{ id: 'intro', kind: 'intro', role: 'assistant', text: INTRO_TEXT }];

  // Before the send this previews what is being typed; after it, the box is
  // empty and this is the record of what was sent. The id changes with it so
  // React remounts the bubble and it animates into place rather than simply
  // being there - the send has to look like it happened.
  const sent = String(submittedText || '').trim();
  const typed = sent || String(simpleInput || '').trim();
  if (typed) {
    out.push({
      id: sent ? 'request-sent' : 'request',
      kind: 'request',
      role: 'user',
      text: typed,
      sent: Boolean(sent),
    });
  }

  // Setup carries its own three blocks rather than trailing a second message.
  // Materials, Tools and Destination are the goal's own configuration, so they
  // belong in the card that governs them: Auto shows them locked holding what
  // it picked, Manual unlocks the same three. The one exception is a workspace
  // load failure - Auto cannot pick an organization that does not exist, so
  // they unlock regardless rather than leaving the only remedy behind a lock.
  out.push({
    id: 'setup',
    kind: 'setup',
    role: 'assistant',
    manual: setupManual,
    forced: Boolean(!setupManual && organizationLoadError),
  });

  out.push({ id: 'approve', kind: 'approve', role: 'assistant', enabled: humanApprove });

  if (simplePhase === 'processing') {
    // startedAt lets the indicator show elapsed time. Silence is the failure
    // mode here: a wedged provider and a merely slow one look identical, and
    // the user has no way to tell which they are looking at.
    out.push({ id: 'thinking', kind: 'thinking', role: 'assistant', startedAt: analyzingSince });
  }

  if (structuredResult) {
    out.push({
      id: 'brief',
      kind: 'brief',
      role: 'assistant',
      title: structuredResult.title || '',
      category: structuredResult.category || 'other',
      priority: structuredResult.priority || 'medium',
      complexity,
      budgetUsd,
      expectedResults,
      extracted,
      suggestions: Array.isArray(suggestions) ? suggestions : [],
    });
  }

  if (aiError) out.push({ id: 'error', kind: 'error', role: 'assistant', message: aiError });

  if (createdGoal) {
    out.push({
      id: 'launched',
      kind: 'launched',
      role: 'assistant',
      goalId: createdGoal.id,
      title: createdGoal.title || structuredResult?.title || typed.slice(0, 100),
    });
  }

  return out;
}
