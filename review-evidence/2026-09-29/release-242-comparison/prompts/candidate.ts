// Standing instruction that makes the assistant ask for missing details in the shape
// `extractQuestions` turns into the answer form: a numbered list with short suggested
// answers. Appended to each session's system prompt under a fixed key, so re-sending it
// replaces the previous copy instead of stacking. It also teaches the shape
// `extractNextSteps` turns into the next-steps card, for replies that offer what to do next.

export const REPLY_QUESTION_PROMPT_KEY = 'orqaly-reply-questions';

export const REPLY_QUESTION_EXAMPLE = `1. **Banner size:** 300x250, 728x90, or 160x600?
2. **Main goal:** Clicks, brand awareness, or sign-ups?
3. **Theme:** Dark, Light, or something else?
4. **Brand name:** What is the brand called? (e.g. *PurrFresh*)`;

export const NEXT_STEPS_EXAMPLE = `Next, I can:
1. Draft the homepage copy
2. Set up the product catalogue
3. Connect Stripe payments

Which should I start?`;

const CONVERSATION_INSTRUCTION = `When you need details from the user before you can continue, ask for them in this exact format so the app can show answer buttons:
- Introduce questions addressed to the user with "Questions for you:". Interview guides, participant questions, example questionnaires and a document's open questions are document content, not a request for the user to answer; label those sections clearly and do not use that introduction.
- Ask all missing details together as one numbered Markdown list with one or more questions, one question per item. Do not ask them in a paragraph, and never invent another question just to make the list longer.
- Start each item with a short bold label ending in a colon, then the question, ending with a question mark.
- Suggest likely answers inline, based on this conversation: three or four answers written "A, B, or C?", each five words or fewer. With only two sensible answers, write "A, B, or something else?".
- For a detail with no sensible fixed choices, ask plainly and add a hint such as "(e.g. an example)".
- Ask only what you really need, and do not add options that are wrong for this user.

Example:
${REPLY_QUESTION_EXAMPLE}

Only offer a next-steps choice for substantive actions in a multi-step task. A quick fact, weather, currency, simple answer, or failed quick lookup needs a short answer only; do not append a menu or "Which should I start?".

When you end a multi-step task reply by offering substantive actions, write the offers so the app can show them as steps to tick and start:
- Introduce them with a short line such as "Next, I can:", then one numbered Markdown list, one short action per item, with no questions inside the items.
- End the reply right after the list with one line such as "Which should I start?", or "Which one should I start?" when only one makes sense.

Example:
${NEXT_STEPS_EXAMPLE}`;

const ENGINEERING_INSTRUCTION = `Native engineering tools are available in this conversation for requested repository work:
- \`ast_search\` queries code syntax trees. \`lsp_query\` requests information from a configured language server; report unavailable servers honestly.
- \`hashline_edit\` reads line hashes and applies exact edits only while those hashes still match. Re-read changed files before retrying a stale edit.
- \`safe_edit_and_test\` applies hash-checked edits and runs explicit tests, returning the actual command results. Inspect its receipt before describing checks as passed.
- These tools run directly in the current Goose conversation. Use ordinary local tools when appropriate, respect local approvals and keep changes within the user's request.
- A passing test receipt is evidence for the checks that ran, never independent proof or absolute verification. Native edit receipts record local checks; they do not include a remote JEV review.`;

export function engineeringInstruction(capabilities: {
  nativeGemsEnabled: boolean;
  jevReviewEnabled: boolean;
}) {
  if (!capabilities.nativeGemsEnabled) return '';
  return ENGINEERING_INSTRUCTION;
}

export function replyQuestionInstruction(capabilities: {
  nativeGemsEnabled: boolean;
  jevReviewEnabled: boolean;
}) {
  const engineering = engineeringInstruction(capabilities);
  return engineering ? `${CONVERSATION_INSTRUCTION}\n\n${engineering}` : CONVERSATION_INSTRUCTION;
}

// This keyed session prompt stays capability-neutral. Per-turn capability descriptions live in the
// trusted workspace resource, so a failed prompt refresh cannot leave stale engineering instructions.
export const REPLY_QUESTION_INSTRUCTION = CONVERSATION_INSTRUCTION;

export function workspacePromptResource(
  state: OrqalyWorkspaceState,
  capabilities: OrqalySessionCapabilities = DEFAULT_CAPABILITIES
): ContentBlock {
  const engineeringGuidance = engineeringInstruction(capabilities);
  return {
    type: 'resource',
    annotations: { audience: ['assistant'] },
    resource: {
      uri: `orqaly://conversation/${encodeURIComponent(state.sessionId)}/desktop-routing`,
      mimeType: 'application/json',
      text: JSON.stringify({
        kind: 'orqaly.desktop-routing.v1',
        guidance:
          'Desktop capabilities are tools, not a mandatory workflow or action permission. ' +
          'Choose available tools to serve the current user request and respect local approvals. ' +
          'Read tool results before deciding whether to answer or continue; a tool cannot finish the conversation for you. ' +
          'Follow-ups such as "go deeper" or "more detail" refer to the latest unambiguous conversational subject. ' +
          'A previous specialist task does not override a later topic change. ' +
          'Depth words, an attached project or the word "research" alone do not justify specialist delegation. ' +
          'If several subjects plausibly fit, ask which one the user means before choosing tools. ' +
          'If no conversational subject is available, ask what topic they mean; do not inspect a project to invent a subject. ' +
          'When the user explicitly returns to earlier work, reuse its exact saved artifact reference only if available in the conversation; never guess missing references. ' +
          'For follow-ups, reuse the latest unambiguous user-supplied location, dates and other constraints. ' +
          'Do not carry stale filters into unrelated requests. Ask only for missing or ambiguous details. ' +
          'Preserve source links and distinguish verified findings from incomplete or failed retrieval. ' +
          'If retrieval fails, you may try another relevant permitted query or tool within a modest time and call budget; ' +
          'report any remaining uncertainty instead of inventing results.' +
          (engineeringGuidance ? `\n\n${engineeringGuidance}` : ''),
        conversationId: state.sessionId,
      }),
    },
  };
}