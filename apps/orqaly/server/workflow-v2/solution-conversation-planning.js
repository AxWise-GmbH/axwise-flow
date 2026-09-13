import { z } from 'zod';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import { containsSolutionConversationSecret } from '../../shared/workflow-v2/solution-conversation-contracts.js';
import { requestsSolutionBuildSecret } from '../../shared/workflow-v2/solution-build-secrets.js';

const text = (max) => z.string().trim().min(1).max(max);
const question = z
  .object({ id: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/), prompt: text(1000) })
  .strict();
const proposal = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
    title: text(160),
    request: text(6000),
    requirements: z
      .object({
        nodeTypes: z.array(text(200)).max(20),
        newConnection: z.boolean(),
        separateWorkflow: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const ConversationPlanSchema = z
  .object({
    intent: z.enum(['answer', 'change', 'clarify']),
    reply: text(12000),
    request: text(8000).nullable(),
    questions: z.array(question).max(8),
    proposals: z.array(proposal).max(4),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.intent === 'change' && (!value.request || value.questions.length))
      ctx.addIssue({
        code: 'custom',
        message: 'A change needs one complete request and no unanswered question',
      });
    if (value.intent === 'clarify' && !value.questions.length)
      ctx.addIssue({ code: 'custom', message: 'Clarification needs a specific question' });
    if (
      new Set(value.proposals.map((item) => item.id)).size !== value.proposals.length ||
      containsSolutionConversationSecret(value) ||
      value.questions.some((item) => requestsSolutionBuildSecret(item.prompt))
    )
      ctx.addIssue({ code: 'custom', message: 'Unsafe or duplicate proposal' });
  });

const pureNodes = new Set(
  [
    'webhook',
    'respondToWebhook',
    'set',
    'if',
    'switch',
    'filter',
    'merge',
    'aggregate',
    'splitOut',
    'sort',
    'limit',
    'noOp',
    'stopAndError',
  ].map((name) => `n8n-nodes-base.${name}`)
);
export const conversationCapabilities = Object.freeze({
  operation: 'unapproved_single_workflow_draft_only',
  pureNodeTypes: [...pureNodes],
  connectionSetup:
    'Separate secure setup is required for any new service connection. Never request credentials in chat.',
  childWorkflows:
    'Do not promise separate error handlers or child workflows unless an owned version-pinned dependency plan is explicitly available.',
  execution: 'No chat intent or proposal authorizes testing, delivery, deployment or activation.',
});

export function publicConversationProposals(items) {
  return items.map((item) => {
    const dependency =
      item.requirements.separateWorkflow ||
      item.requirements.nodeTypes.some(
        (type) => !pureNodes.has(type) && type !== 'CUSTOM.boundedHttp'
      );
    const capability = dependency
      ? 'requires_runtime'
      : item.requirements.newConnection ||
          item.requirements.nodeTypes.includes('CUSTOM.boundedHttp')
        ? 'requires_setup'
        : 'supported';
    return {
      ...item,
      contentHash: hash(item),
      capability,
      reason:
        capability === 'requires_runtime'
          ? 'This proposal needs an additional reviewed runtime or owned workflow dependency before it can run.'
          : capability === 'requires_setup'
            ? 'A separate scoped connection and explicit test approval are required.'
            : 'Fits the current single-workflow authoring profile. Validation and an approved test are still required.',
    };
  });
}

export function parseConversationPlan(markdown) {
  // A model chooses conversational intent, never execution authority. Invalid
  // structured output fails closed instead of guessing from prose or regex.
  if (typeof markdown !== 'string' || Buffer.byteLength(markdown) > 60000)
    throw new Error('conversation_plan_invalid');
  let value;
  try {
    value = JSON.parse(markdown);
  } catch {
    throw new Error('conversation_plan_invalid');
  }
  return ConversationPlanSchema.parse(value);
}

export function conversationPlanningPrompt(message) {
  return `You are resolving one owner message inside the selected workflow conversation. Return ONLY valid JSON in the markdown field, no code fence, using this exact schema:\n${JSON.stringify(
    {
      intent: 'answer | change | clarify',
      reply: 'Useful answer or concise truthful next step',
      request: 'Complete self-contained requested draft change, or null',
      questions: [{ id: 'stable_id', prompt: 'One specific non-secret question' }],
      proposals: [
        {
          id: 'option_1',
          title: 'Choice title',
          request: 'Complete implementation request; do not use Option 1/2 shorthand',
          requirements: {
            nodeTypes: ['n8n-nodes-base.set'],
            newConnection: false,
            separateWorkflow: false,
          },
        },
      ],
    }
  )}\nUse empty arrays when unnecessary. Clear requests to implement/change/fix select change, even when phrased conversationally. Asking for suggestions selects answer and returns complete selectable proposals. If an option reference is missing, ask a clarification rather than inventing it. A suggestion containing 'implement it' may be change only when the intended behavior is clear. Never claim tests or actions happened. Only an unapproved draft is allowed. Preserve unaffected behavior. Do not promise supported execution for unavailable capabilities. This capability description is authoritative:\n${JSON.stringify(conversationCapabilities)}\nLatest owner message:\n${message}`;
}

export function boundedConversationHistory(history, command) {
  let remaining = 18000;
  const selected = [];
  for (const turn of history.slice(-8).reverse()) {
    if (
      turn.command?.workflowHash !== command.workflowHash ||
      (turn.command?.draft?.id ?? null) !== (command.draft?.id ?? null) ||
      (turn.command?.includeInvocation &&
        turn.command.includeInvocation.id !== command.includeInvocation?.id)
    )
      continue;
    const entry = {
      mode: turn.lifecycle?.resolvedMode ?? turn.mode,
      request: turn.message,
      response: turn.reply?.markdown ?? null,
      questions: turn.reply?.questions ?? [],
      proposals: turn.reply?.proposals ?? [],
      dependencies: (turn.reply?.dependencies ?? []).slice(0, 4),
      status: turn.status,
      authority: 'earlier_scoped_conversation_reference_not_execution_permission',
    };
    const size = JSON.stringify(entry).length;
    if (size > remaining) {
      selected.push({
        request: turn.message.slice(0, 1000),
        response: null,
        unavailable:
          'Earlier response omitted by context budget. Do not infer option contents; request a saved proposal selection.',
      });
      break;
    }
    selected.push(entry);
    remaining -= size;
  }
  return selected.reverse();
}
