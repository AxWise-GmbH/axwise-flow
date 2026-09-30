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

const ENGINEERING_INSTRUCTION = `Optional native engineering tools are available for requested repository work:
- Choose ordinary local tools or native engineering tools according to the task; delegation is not required for inspection, edits, builds or tests.
  - \`ast_search\`: Structural syntax pattern search across the codebase.
  - \`hashline_edit\`: Content-hash anchored line editing with stale file collision defense.
  - \`lsp_query\`: In-memory language server symbol and diagnostics lookup.
  - \`safe_edit_and_test\`: Atomic in-session edit, test execution, and auto-repair.
- Edits verified through the evidence review pipeline receive JEV evaluation. A receipt with \`verified: true\` may be described as checks passed and evidence reviewed, never as independent proof or absolute verification.
- Local tool approvals and sandboxing remain in effect.`;

const ENGINEERING_WITHOUT_JEV_INSTRUCTION = `Optional native engineering tools are available for requested repository work:
- Choose ordinary local tools or native engineering tools according to the task; delegation is not required for inspection, edits, builds or tests.
  - \`ast_search\`, \`hashline_edit\`, \`lsp_query\` and \`safe_edit_and_test\`.
- JEV review is disabled by the user for this conversation. Treat disabled_by_user as not_evaluated.
- Local tool approvals and sandboxing remain in effect.`;

export function engineeringInstruction(capabilities: {
  nativeGemsEnabled?: boolean;
  ompEnabled?: boolean;
  jevReviewEnabled: boolean;
}) {
  const enabled =
    typeof capabilities.nativeGemsEnabled === 'boolean'
      ? capabilities.nativeGemsEnabled
      : typeof capabilities.ompEnabled === 'boolean'
        ? capabilities.ompEnabled
        : true;
  if (!enabled) return '';
  return capabilities.jevReviewEnabled
    ? ENGINEERING_INSTRUCTION
    : ENGINEERING_WITHOUT_JEV_INSTRUCTION;
}

export function replyQuestionInstruction(capabilities: {
  nativeGemsEnabled?: boolean;
  ompEnabled?: boolean;
  jevReviewEnabled: boolean;
}) {
  const engineering = engineeringInstruction(capabilities);
  return engineering ? `${CONVERSATION_INSTRUCTION}\n\n${engineering}` : CONVERSATION_INSTRUCTION;
}

// This keyed session prompt stays capability-neutral. Per-turn capability descriptions live in the
// trusted workspace resource, so a failed prompt refresh cannot leave stale OMP/JEV instructions.
export const REPLY_QUESTION_INSTRUCTION = CONVERSATION_INSTRUCTION;
