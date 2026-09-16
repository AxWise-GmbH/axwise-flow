# One workflow, one conversation, one canvas

## User outcome

The workflow detail page is the canonical place to discuss, inspect and improve a
saved workflow. A proposed revision belongs to that same workflow. Neither asking
a question nor proposing a revision creates another Solution, source task or chat.

This change fixes the September 6 preview feedback: the conversation was too small,
Ask mode silently explained change requests, draft selection cleared the message,
and a completed proposal could leave the canvas on the unchanged active version.

## Interaction

- One readable message history and one composer beside the native n8n canvas.
- Direct **Ask** and **Propose change** actions replace the persistent mode switch.
  An explanation is not presented as a completed implementation.
- An existing question can be reused as a proposal without retyping or navigating
  to another chat. Reuse only fills the composer; submission remains explicit.
- If an existing draft must be selected, keep the message and change intention.
  Confirm the exact draft; reload its owner/version/hash context before submission.
- A newly completed proposal is shown in the existing canvas. Loading historical
  messages must not unexpectedly switch the canvas. Never interrupt native edits.
- Evidence and optional run-data sharing are secondary, collapsed controls. Run
  input/output sharing is off by default, requires opt-in for each message, and
  never grants permission to change or execute the workflow.
- When the existing design operation asks for missing information, show **One quick
  question**, use the same composer for **Your answer**, and offer **Answer & continue**.
  The answer is another durable scoped change turn using the original proposal and
  question history. This is continuation of workflow drafting, not a claim that an
  arbitrary running n8n/coding job can be paused/resumed through this UI.
  A question from another workflow revision, a changed draft hash/row version, or
  outside the backend's latest-eight-turn context is not adopted. Previous run-data
  consent must be renewed explicitly if that context is needed again.
- Review, testing and activation remain explicit. A saved draft is not a live
  release. New email/provider connections still require secure setup.

## Boundaries

No new backend mode, model provider, conversation store, workflow entity, database,
n8n instance or coding runtime is introduced. Existing durable Ask/Change commands,
idempotency, ownership, exact revision checks and credential exclusion stay intact.
No customer message is automatically resubmitted to verify this UI change.

Native editor expiry must not silently remove unsaved on-screen work. Reconnecting
an editable frame is explicit and warns that only changes saved in n8n survive.
Read-only reconnect stays a simple refresh of the same scoped canvas.

## Verification plan

1. Component regressions: same-workflow draft selection preserves text; fresh
   context is required; consent resets; retries retain the same command; historical
   completion does not steal selection; new completion reveals the saved revision.
2. Synthetic browser acceptance: actual production components, clearly labeled
   in-memory API fixture, long replies and existing draft, desktop and mobile.
   Verify readable transcript dimensions, exact one change submission and unchanged
   Solution identity. This does not claim real model or n8n execution.
3. Production GCP web build and graph boundary checks. Web-only rollout preserving
   API, worker, native runtime, IAM, scaling, existing tags and customer records.
4. Signed-in preview check of the existing user's question and native canvas. Do
   not submit a change, tick consent or activate a workflow during visual acceptance.

## Local acceptance — September 6, 2026

- 203 workspace tests passed, including message preservation through a real React
  parent rerender, pending-context submission rejection, exact draft binding, one
  proposal despite repeated clicks, and expired-editor review blocking.
- 66 existing conversation API/service and native access-boundary tests passed.
- Production GCP build and retained-module verification passed. The local build
  reports 32 scripts / 1,210,798 bytes; deployment uses the actual public auth key.
- Actual production UI components in the explicitly synthetic browser fixture:
  one reused question, existing draft selected, exactly one `mode: change` command,
  no input/output consent, same draft ID in the canvas, one conversation, no browser
  errors. Desktop transcript measured 553px at a 1470×850 viewport. Mobile390×844
  had one composer and no horizontal overflow.
- Native n8n execution and real-model generation were not repeated by these UI
  tests. The fixture explicitly omits the native runtime; existing live customer
  messages/drafts must not be used as disposable acceptance data.
- An additional synthetic browser scenario verified question → one explicit answer
  → exactly one `mode: change` command → the saved draft in the same canvas, no new
  chat and no run-data sharing. The existing backend continuation test verifies the
  original request, clarification prompt and answer all reach the design envelope.

Rollout and signed-in acceptance are recorded separately after completion.
