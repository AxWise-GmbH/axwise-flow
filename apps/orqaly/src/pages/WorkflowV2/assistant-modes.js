export const ASSISTANT_MODES = Object.freeze({
  auto: Object.freeze({
    label: 'Auto',
    description: 'Orqanix chooses Assistant, Research, or Agent from your message.',
    pendingDescription: 'Choosing the right action for this message.',
    placeholder: 'Ask Orqanix anything…',
  }),
  assistant: Object.freeze({
    label: 'Assistant',
    description: 'Ask and refine in this conversation.',
    pendingDescription: 'Using the conversation and preparing a response.',
    placeholder: 'Ask a question or continue the conversation…',
  }),
  research: Object.freeze({
    label: 'Research',
    description: 'Run grounded research and return sources.',
    pendingDescription: 'Researching your request with supporting sources.',
    placeholder: 'Describe what Orqanix should research…',
  }),
  goal: Object.freeze({
    // `goal` remains the wire intent while Agent is the user-facing delegation model.
    // That keeps the existing durable Workflow v2 protocol and stored history compatible.
    label: 'Agent',
    description: 'Delegate tracked work to a scoped Agent with progress and approvals.',
    pendingDescription: 'Creating a scoped Agent and its durable workflow.',
    placeholder: 'Describe the task your Agent should own…',
  }),
});

export const ASSISTANT_MODE_ORDER = Object.freeze(Object.keys(ASSISTANT_MODES));

export function assistantIntentForRoute(route) {
  if (route === 'AXWISE_ONE_SHOT') return 'research';
  if (['PROPOSE_GOAL', 'START_GOAL', 'CONTINUE_GOAL'].includes(route)) return 'goal';
  return 'assistant';
}

export function assistantModeForRoute(route) {
  return ASSISTANT_MODES[assistantIntentForRoute(route)];
}
