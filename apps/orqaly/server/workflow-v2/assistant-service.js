import { canonicalHash, sha256Hex } from '../../lib/workflow-v2/canonical.js';
import {
  AssistantMessageSchema,
  AssistantRetryCommandSchema,
  AssistantTurnCommandSchema,
  assistantThreadTitle,
  executionAgentPresentation,
  responseModeForRoute,
  resolveAssistantTurnRoute,
} from '../../shared/workflow-v2/assistant.js';
import {
  AxWiseOperationEnvelopeSchema,
  ExecutionAgentContractV1Schema,
  ExecutionAgentProfileSnapshotV1Schema,
} from '../../shared/workflow-v2/contracts.js';
import {
  AssistantTurnEventInputSchema,
  AssistantTurnEventSchema,
} from '../../shared/workflow-v2/assistant-events.js';
import { WorkflowCommandError } from './command-service.js';
import { AxWiseDispatchError } from './axwise-client.js';
import { compileAssistantContext, compileAssistantGoalContext } from './assistant-context.js';
import { deterministicUuid, workflowIds } from './ids.js';

function sameMessage(actual, expected) {
  return canonicalHash(actual) === canonicalHash(expected);
}

function textPart(markdown) {
  return { type: 'text', markdown };
}

function delegationRequestPart(lifetime = 'temporary', agentId) {
  return {
    type: 'delegation_request',
    lifetime,
    ...(agentId ? { agentId } : {}),
  };
}

function agentFromControlPlaneResponse(response) {
  return response?.body?.agent || response?.agent || null;
}

function delegatedAgentName(task, agent) {
  return (
    agent?.profile?.profile?.displayName ||
    agent?.display_name ||
    agent?.displayName ||
    `${assistantThreadTitle(task)} Agent`
  );
}

function executionProfileSnapshot(agent) {
  if (!agent) return undefined;
  const record = agent?.profile;
  if (!record?.profile || !record.id || !record.contentHash) {
    throw new WorkflowCommandError(
      'AGENT_PROFILE_BINDING_MISSING',
      'the selected Agent has no exact profile version to bind to this Goal',
      502
    );
  }
  try {
    return ExecutionAgentProfileSnapshotV1Schema.parse({
      version: 'orqaly_execution_agent_profile_snapshot_v1',
      profileVersion: {
        version: record.version,
        id: record.id,
        agentId: record.agentId,
        versionNumber: record.versionNumber,
        contentHash: record.contentHash,
      },
      profile: record.profile,
    });
  } catch {
    throw new WorkflowCommandError(
      'AGENT_PROFILE_BINDING_INVALID',
      'the selected Agent profile version failed integrity validation',
      502
    );
  }
}

function executionAgentContract(owner, threadId, user, task, runId, agent) {
  const lifetime =
    user.parts.find((part) => part.type === 'delegation_request')?.lifetime || 'temporary';
  const profileSnapshot = executionProfileSnapshot(agent);
  return ExecutionAgentContractV1Schema.parse({
    schemaVersion: 'orqaly.execution-agent.v1',
    id: agent?.id || deterministicUuid(owner.tenantId, threadId, user.turnId, 'delegated-agent'),
    runId,
    owner: {
      tenantId: owner.tenantId,
      userId: owner.userId,
    },
    lifetime,
    source: {
      threadId,
      turnId: user.turnId,
      taskHash: sha256Hex(task),
    },
    executorPersona: {
      role: 'task_executor',
      profileVersion: 'axwise_executor_persona_v1',
      provider: 'axwise',
      binding: 'fixed_profile_contract',
    },
    memory: {
      scope: 'thread_and_goal',
      crossThread: false,
    },
    runtime: {
      provider: 'orqaly_workflow_v2',
      isolation: 'tenant_user',
    },
    capabilities: {
      research: true,
      planning: true,
      artifactProduction: true,
      approvalGates: true,
    },
    tools: {
      externalActions: false,
      executionProvider: null,
    },
    ...(profileSnapshot ? { profileSnapshot } : {}),
  });
}

function delegatedAgentPart(executionAgent, threadId, task, run, createdAt, agent) {
  const presentation = executionAgentPresentation(executionAgent);
  return {
    type: 'delegated_agent',
    id: executionAgent.id,
    runId: run.id,
    threadId,
    name: delegatedAgentName(task, agent),
    task,
    lifetime: executionAgent.lifetime,
    status: run.status,
    ...presentation,
    executionAgent,
    createdAt,
    updatedAt: createdAt,
  };
}

function hasSourceLinkedResearchFact(response) {
  const sourceUrls = new Set(response.sources.map((source) => source.canonicalUrl));
  return response.facts.some((fact) => fact.sourceUrls.some((url) => sourceUrls.has(url)));
}

function approvedGoalRequest(message) {
  return message.replace(/^start a goal:\s*/iu, '').trim() || message;
}

function orderedMessages(messages) {
  const roleOrder = { user: 0, assistant: 1 };
  return [...messages].sort((left, right) => {
    const createdAt = left.createdAt.localeCompare(right.createdAt);
    if (createdAt) return createdAt;
    const turnId = left.turnId.localeCompare(right.turnId);
    if (turnId) return turnId;
    const role = roleOrder[left.role] - roleOrder[right.role];
    return role || left.id.localeCompare(right.id);
  });
}

function publicMessage(message) {
  const { contentHash: _contentHash, ...value } = message;
  return AssistantMessageSchema.parse(value);
}

function persistedRouteProvenance(message) {
  if (message.requestedIntent === undefined) return {};
  return {
    requestedIntent: message.requestedIntent,
    resolvedRoute: message.resolvedRoute,
    routePolicyVersion: message.routePolicyVersion,
    routeReasonCode: message.routeReasonCode,
  };
}

export function createAssistantService({
  repository,
  workflowCommandService,
  axwiseClient,
  agentService = null,
}) {
  async function identity(auth) {
    if (!auth?.userId) throw new WorkflowCommandError('UNAUTHENTICATED', 'sign-in required', 401);
    const tenantId = await repository.resolveTenant({ userId: auth.userId });
    if (!tenantId)
      throw new WorkflowCommandError('TENANT_NOT_BOUND', 'identity has no tenant', 403);
    return { tenantId, userId: auth.userId };
  }

  function messageRecord({
    owner,
    threadId,
    turnId,
    role,
    route,
    parts,
    operationId,
    runId,
    retryOfTurnId = null,
    requestedIntent,
    resolvedRoute,
    routePolicyVersion,
    routeReasonCode,
    model,
    modelVersion,
    createdAt,
  }) {
    const message = publicMessage({
      id: deterministicUuid(owner.tenantId, threadId, turnId, role, 'assistant-message'),
      threadId,
      turnId,
      role,
      route,
      parts,
      axwiseOperationId: operationId || null,
      workflowRunId: runId || null,
      retryOfTurnId,
      ...(requestedIntent === undefined
        ? {}
        : { requestedIntent, resolvedRoute, routePolicyVersion, routeReasonCode }),
      ...(model === undefined ? {} : { model }),
      ...(modelVersion === undefined ? {} : { modelVersion }),
      createdAt,
    });
    return { ...message, contentHash: canonicalHash(message) };
  }

  async function append(owner, message) {
    const stored = await repository.appendAssistantMessage(owner.tenantId, owner.userId, message);
    if (!sameMessage(stored, publicMessage(message))) {
      throw new WorkflowCommandError(
        'IDEMPOTENCY_CONFLICT',
        'assistant turn ID was reused with a changed response',
        409
      );
    }
    return stored;
  }

  async function emitEvent(owner, threadId, user, type, options = {}) {
    // node-postgres materializes timestamptz values as millisecond-precision Date objects.
    // Normalize provider timestamps before hashing so an exact database replay preserves the
    // same canonical event even when AxWise supplied microseconds.
    const sourceOccurredAt = options.occurredAt || user.createdAt;
    const occurredAt = new Date(sourceOccurredAt).toISOString();
    const event = AssistantTurnEventInputSchema.parse({
      id: deterministicUuid(
        owner.tenantId,
        threadId,
        user.turnId,
        'assistant-event',
        options.identityKey || type
      ),
      threadId,
      turnId: user.turnId,
      type,
      route: user.route,
      operationId: user.axwiseOperationId,
      retryOfTurnId: user.retryOfTurnId,
      taskId: options.taskId || null,
      attemptId: options.attemptId || null,
      payload: options.payload || {},
      occurredAt,
    });
    const stored = await repository.appendAssistantTurnEvent(owner.tenantId, owner.userId, {
      ...event,
      contentHash: canonicalHash(event),
    });
    if (!stored) {
      throw new WorkflowCommandError(
        'ASSISTANT_EVENT_IDEMPOTENCY_CONFLICT',
        'assistant event ID was reused by another thread',
        409
      );
    }
    const { contentHash, sequence, ...storedInput } = stored;
    const acceptedHashes = new Set([canonicalHash(event)]);
    if (sourceOccurredAt !== occurredAt) {
      // Compatibility for lifecycle rows written before provider timestamps were normalized.
      // The immutable row already contains the millisecond DB projection, so accept the old
      // hash only when AxWise replays the exact original timestamp and every stored field still
      // matches the normalized event.
      acceptedHashes.add(canonicalHash({ ...event, occurredAt: sourceOccurredAt }));
    }
    if (!acceptedHashes.has(contentHash) || !sameMessage(storedInput, event)) {
      throw new WorkflowCommandError(
        'ASSISTANT_EVENT_IDEMPOTENCY_CONFLICT',
        'assistant event ID was reused with changed lifecycle state',
        409
      );
    }
    return AssistantTurnEventSchema.parse({ ...storedInput, sequence });
  }

  async function emitTerminalEvent(owner, threadId, user, assistant) {
    const terminalStatus = assistant.parts.find(
      (part) => part.type === 'operation_status' && ['failed', 'cancelled'].includes(part.status)
    );
    return emitEvent(owner, threadId, user, terminalStatus?.status || 'completed');
  }

  async function loadOwned(owner, threadId) {
    const result = await repository.loadAssistantThread(owner.tenantId, threadId, owner.userId);
    if (!result) {
      throw new WorkflowCommandError(
        'ASSISTANT_THREAD_NOT_FOUND',
        'assistant thread not found',
        404
      );
    }
    return { ...result, messages: orderedMessages(result.messages) };
  }

  function userText(message) {
    return message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.markdown)
      .join('\n\n')
      .trim();
  }

  function userByTurn(messages, turnId) {
    return messages.find((message) => message.turnId === turnId && message.role === 'user');
  }

  function rootUser(messages, user) {
    let current = user;
    const seen = new Set();
    while (current.retryOfTurnId) {
      if (seen.has(current.turnId)) {
        throw new WorkflowCommandError(
          'ASSISTANT_RETRY_LINEAGE_INVALID',
          'assistant retry lineage is cyclic',
          409
        );
      }
      seen.add(current.turnId);
      const parent = userByTurn(messages, current.retryOfTurnId);
      if (!parent) {
        throw new WorkflowCommandError(
          'ASSISTANT_RETRY_LINEAGE_INVALID',
          'assistant retry parent is missing',
          409
        );
      }
      current = parent;
    }
    return current;
  }

  function priorConversation(messages, rootTurnId) {
    const compiled = compileAssistantContext(messages, rootTurnId);
    if (!compiled) {
      throw new WorkflowCommandError(
        'ASSISTANT_RETRY_LINEAGE_INVALID',
        'assistant root turn is missing',
        409
      );
    }
    return compiled.conversation;
  }

  function initialAttemptIdentity(owner, threadId, turnId) {
    const seed = deterministicUuid(owner.tenantId, threadId, turnId, 'assistant-turn');
    return {
      operationId: deterministicUuid(seed, 'axwise-operation'),
      stageAttemptId: deterministicUuid(seed, 'attempt'),
      seed,
    };
  }

  function attemptIdentity(owner, threadId, user, messages) {
    const root = rootUser(messages, user);
    const initial = initialAttemptIdentity(owner, threadId, root.turnId);
    if (!user.retryOfTurnId) return { ...initial, root };
    const parent = userByTurn(messages, user.retryOfTurnId);
    if (!parent?.axwiseOperationId) {
      throw new WorkflowCommandError(
        'ASSISTANT_RETRY_LINEAGE_INVALID',
        'assistant retry parent has no AxWise operation',
        409
      );
    }
    return {
      root,
      seed: initial.seed,
      stageAttemptId: deterministicUuid(parent.axwiseOperationId, 'retry', 'attempt'),
      operationId: deterministicUuid(parent.axwiseOperationId, 'retry', 'operation'),
    };
  }

  function axwiseEnvelope(owner, threadId, user, messages) {
    const identity = attemptIdentity(owner, threadId, user, messages);
    const input = {
      type: 'AssistantTurnV1',
      responseMode: responseModeForRoute(user.route),
      message: userText(identity.root),
      conversation: priorConversation(messages, identity.root.turnId),
    };
    return AxWiseOperationEnvelopeSchema.parse({
      operationId: identity.operationId,
      operationType: 'AssistantTurnV1',
      owner: {
        tenantId: owner.tenantId,
        organizationId: null,
        userId: owner.userId,
      },
      workflow: {
        runId: deterministicUuid(owner.tenantId, threadId, 'assistant-session'),
        stageId: deterministicUuid(identity.seed, 'stage'),
        stageAttemptId: identity.stageAttemptId,
      },
      contractVersion: 'axwise.operation.v2',
      canonicalInputHash: canonicalHash(input),
      input,
    });
  }

  function pendingMessage(owner, threadId, user, response) {
    return publicMessage({
      id: deterministicUuid(owner.tenantId, threadId, user.turnId, 'assistant', 'pending'),
      threadId,
      turnId: user.turnId,
      role: 'assistant',
      route: user.route,
      parts: [
        {
          type: 'operation_status',
          operationId: user.axwiseOperationId,
          status: response.status,
          retryAfterSeconds: response.retryAfterSeconds,
        },
      ],
      axwiseOperationId: user.axwiseOperationId,
      workflowRunId: null,
      createdAt: new Date().toISOString(),
    });
  }

  async function finishAxwise(owner, threadId, user, response) {
    if (['accepted', 'running', 'cancel_requested'].includes(response.status)) {
      await emitEvent(
        owner,
        threadId,
        user,
        response.status === 'cancel_requested' ? 'cancel_requested' : 'running'
      );
      return { message: pendingMessage(owner, threadId, user, response), persisted: false };
    }
    if (response.status === 'cancelled') {
      const message = await append(
        owner,
        messageRecord({
          owner,
          threadId,
          turnId: user.turnId,
          role: 'assistant',
          route: user.route,
          parts: [
            {
              type: 'operation_status',
              operationId: user.axwiseOperationId,
              status: 'cancelled',
              retryMode: 'none',
            },
          ],
          operationId: user.axwiseOperationId,
          createdAt: user.createdAt,
        })
      );
      await emitEvent(owner, threadId, user, 'cancelled');
      return { message, persisted: true };
    }
    if (response.status === 'failed') {
      const message = await append(
        owner,
        messageRecord({
          owner,
          threadId,
          turnId: user.turnId,
          role: 'assistant',
          route: user.route,
          parts: [
            {
              type: 'operation_status',
              operationId: user.axwiseOperationId,
              status: 'failed',
              retryMode: response.retryable ? 'new_attempt' : 'none',
              errorClass: response.errorClass,
              ...(response.retryAt ? { retryAt: response.retryAt } : {}),
              ...(response.retryAfterSeconds
                ? { retryAfterSeconds: response.retryAfterSeconds }
                : {}),
              ...(response.diagnostics ? { diagnostics: response.diagnostics } : {}),
            },
          ],
          operationId: user.axwiseOperationId,
          createdAt: user.createdAt,
        })
      );
      await emitEvent(owner, threadId, user, 'failed');
      return {
        message,
        persisted: true,
      };
    }
    if (response.result.resultType !== 'assistant_turn_completed') {
      throw new WorkflowCommandError(
        'AXWISE_RESULT_MISMATCH',
        'AxWise returned a non-assistant result',
        502
      );
    }
    const result = response.result.response;
    const primary =
      user.route === 'AXWISE_ONE_SHOT'
        ? {
            type: 'artifact',
            title: 'Research result',
            contentType: 'text/markdown',
            markdown: result.markdown,
          }
        : textPart(result.markdown);
    const parts = [
      primary,
      ...result.facts.map((fact) => ({
        type: 'fact',
        statement: fact.statement,
        sourceUrls: fact.sourceUrls,
      })),
      ...result.recommendations.map((recommendation) => ({
        type: 'recommendation',
        kind: recommendation.kind,
        summary: recommendation.summary,
      })),
      ...result.sources.map((source) => ({
        type: 'source',
        title: source.title,
        url: source.canonicalUrl,
        sourceTypes: source.sourceTypes,
      })),
    ];
    const message = await append(
      owner,
      messageRecord({
        owner,
        threadId,
        turnId: user.turnId,
        role: 'assistant',
        route: user.route,
        parts,
        operationId: user.axwiseOperationId,
        model: response.result.metrics?.model,
        modelVersion: response.result.metrics?.modelVersion,
        createdAt: user.createdAt,
      })
    );
    await emitEvent(owner, threadId, user, 'completed');
    return { message, persisted: true };
  }

  function validateAxwiseResponse(envelope, response) {
    if (response.operationId !== envelope.operationId) {
      throw new AxWiseDispatchError('AxWise operation identity changed', {
        retryable: false,
        errorClass: 'AXWISE_OPERATION_ID_MISMATCH',
      });
    }
    if (response.canonicalInputHash !== envelope.canonicalInputHash) {
      throw new AxWiseDispatchError('AxWise operation input hash changed', {
        retryable: false,
        errorClass: 'AXWISE_INPUT_HASH_MISMATCH',
      });
    }
    if (
      envelope.input.responseMode === 'one_shot' &&
      response.status === 'completed' &&
      response.result.resultType === 'assistant_turn_completed' &&
      !hasSourceLinkedResearchFact(response.result.response)
    ) {
      throw new AxWiseDispatchError('AxWise returned research without source-linked evidence', {
        retryable: true,
        errorClass: 'AXWISE_UNGROUNDED_RESEARCH_RESULT',
      });
    }
    return response;
  }

  async function cancellationRequested(owner, threadId, turnId) {
    return typeof repository.hasAssistantTurnEvent === 'function'
      ? repository.hasAssistantTurnEvent(
          owner.tenantId,
          owner.userId,
          threadId,
          turnId,
          'cancel_requested'
        )
      : false;
  }

  async function requestCancellation(owner, user, envelope) {
    try {
      return validateAxwiseResponse(
        envelope,
        await axwiseClient.cancel(user.axwiseOperationId, owner.tenantId)
      );
    } catch (error) {
      if (error instanceof AxWiseDispatchError && error.disposition === 'not_found') {
        return {
          operationId: envelope.operationId,
          status: 'cancelled',
          canonicalInputHash: envelope.canonicalInputHash,
        };
      }
      throw error;
    }
  }

  async function executeAxwise(owner, threadId, user, messages, { poll = false } = {}) {
    const envelope = axwiseEnvelope(owner, threadId, user, messages);
    if (envelope.operationId !== user.axwiseOperationId) {
      throw new WorkflowCommandError(
        'ASSISTANT_RETRY_LINEAGE_INVALID',
        'assistant operation identity does not match its immutable attempt',
        409
      );
    }
    const request = async (isPoll) => {
      try {
        if (!isPoll) await emitEvent(owner, threadId, user, 'submitted');
        const stopping = isPoll && (await cancellationRequested(owner, threadId, user.turnId));
        const response = stopping
          ? await requestCancellation(owner, user, envelope)
          : isPoll
            ? await axwiseClient.poll(
                axwiseClient.deterministicStatusUrl(user.axwiseOperationId, owner.tenantId),
                user.axwiseOperationId,
                owner.tenantId
              )
            : await axwiseClient.submit(envelope);
        return finishAxwise(owner, threadId, user, validateAxwiseResponse(envelope, response));
      } catch (error) {
        if (!(error instanceof AxWiseDispatchError)) throw error;
        if (error.disposition === 'ambiguous') {
          return {
            message: pendingMessage(owner, threadId, user, {
              status: 'running',
              retryAfterSeconds: 2,
            }),
            persisted: false,
          };
        }
        if (isPoll && error.disposition === 'not_found') {
          if (await cancellationRequested(owner, threadId, user.turnId)) {
            return finishAxwise(owner, threadId, user, {
              operationId: envelope.operationId,
              status: 'cancelled',
              canonicalInputHash: envelope.canonicalInputHash,
            });
          }
          return request(false);
        }
        return finishAxwise(owner, threadId, user, {
          status: 'failed',
          operationId: envelope.operationId,
          canonicalInputHash: envelope.canonicalInputHash,
          retryable: Boolean(error.retryable),
          errorClass: error.errorClass || 'AXWISE_DISPATCH_FAILED',
        });
      }
    };
    return request(poll);
  }

  async function mirrorAxwiseEvents(owner, threadId, user) {
    if (typeof axwiseClient.events !== 'function') return;
    try {
      let after = 0;
      for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
        const page = await axwiseClient.events(user.axwiseOperationId, owner.tenantId, {
          after,
          limit: 200,
        });
        for (const upstream of page.events) {
          const type = upstream.eventType === 'cancel_requested' ? 'cancel_requested' : 'progress';
          if (['cancelled', 'completed', 'failed'].includes(upstream.eventType)) continue;
          await emitEvent(owner, threadId, user, type, {
            identityKey: `axwise:${upstream.sequence}:${upstream.eventType}`,
            occurredAt: upstream.occurredAt,
            payload: {
              upstreamSequence: upstream.sequence,
              eventType: upstream.eventType,
              status: upstream.status,
            },
          });
        }
        after = page.nextAfter;
        if (!page.hasMore) break;
      }
    } catch (error) {
      // The status endpoint remains authoritative and must keep advancing even when the
      // optional lifecycle projection is temporarily unavailable.
      if (!(error instanceof AxWiseDispatchError)) throw error;
    }
  }

  async function executeLocal(owner, auth, threadId, user, messages) {
    const request = userText(user);
    if (user.route === 'PROPOSE_GOAL') {
      const message = await append(
        owner,
        messageRecord({
          owner,
          threadId,
          turnId: user.turnId,
          role: 'assistant',
          route: user.route,
          parts: [
            textPart('This work has durable or dependent steps. I can run it as a Goal.'),
            {
              type: 'approval',
              action: 'start_goal',
              prompt: 'Start this Goal?',
              request,
            },
          ],
          createdAt: user.createdAt,
        })
      );
      return { message, persisted: true, idempotent: false };
    }

    if (user.route === 'START_GOAL') {
      const goalRequest = approvedGoalRequest(request);
      const trustedContext = compileAssistantGoalContext(messages, user.turnId, goalRequest);
      if (!trustedContext) {
        throw new WorkflowCommandError(
          'ASSISTANT_CONTEXT_INVALID',
          'the persisted Goal instruction could not be resolved',
          409
        );
      }
      const delegation = user.parts.find((part) => part.type === 'delegation_request');
      const startCommandId = deterministicUuid(owner.tenantId, threadId, user.turnId, 'start-goal');
      const assignedRunId = workflowIds(owner.tenantId, startCommandId).runId;
      let boundAgent = null;
      if (agentService) {
        if (delegation?.agentId) {
          boundAgent = agentFromControlPlaneResponse(
            await agentService.read(auth, delegation.agentId)
          );
          if (!boundAgent) {
            throw new WorkflowCommandError(
              'AGENT_RUNTIME_INVALID_RESPONSE',
              'the selected Agent could not be resolved',
              502
            );
          }
        } else {
          const expiresAt =
            delegation?.lifetime === 'temporary'
              ? new Date(new Date(user.createdAt).getTime() + 90 * 86_400_000).toISOString()
              : null;
          const created = await agentService.createFromAssignment(
            auth,
            {
              version: 'orqaly_agent_create_request_v1',
              agentKind: delegation?.lifetime || 'temporary',
              profile: {
                version: 'orqaly_agent_profile_input_v1',
                displayName: delegatedAgentName(goalRequest),
                roleLabel: 'Task executor',
                description: `Works on: ${goalRequest}`.slice(0, 2_000),
                instructions: goalRequest.slice(0, 12_000),
                avatar: { kind: 'icon', value: 'smart_toy', color: '#6750A4' },
              },
              expiresAt,
              idempotencyKey: `assistant-agent-${user.turnId}`,
            },
            {
              kind: 'assistant_goal',
              sourceTaskId: user.turnId,
              conversationId: threadId,
              workflowRunId: assignedRunId,
            }
          );
          boundAgent = agentFromControlPlaneResponse(created);
          if (!boundAgent) {
            throw new WorkflowCommandError(
              'AGENT_RUNTIME_INVALID_RESPONSE',
              'the Agent runtime did not return the created Agent',
              502
            );
          }
        }

        if (boundAgent.agent_kind !== delegation?.lifetime) {
          throw new WorkflowCommandError(
            'AGENT_LIFETIME_MISMATCH',
            'the selected Agent lifetime changed; refresh the Agent and try again',
            409
          );
        }
        if (['paused', 'revoked', 'expired', 'archived'].includes(boundAgent.state)) {
          throw new WorkflowCommandError(
            'AGENT_NOT_ASSIGNABLE',
            `the selected Agent is ${boundAgent.state} and cannot accept work`,
            409
          );
        }
        if (boundAgent.state === 'draft') {
          const proposed = await agentService.lifecycle(
            auth,
            boundAgent.id,
            String(boundAgent.version),
            {
              version: 'orqaly_agent_lifecycle_request_v1',
              action: 'propose',
              reason: 'Assigned work from the Orqaly Assistant',
              idempotencyKey: `assistant-agent-propose-${user.turnId}`,
            }
          );
          boundAgent = agentFromControlPlaneResponse(proposed);
        }
        if (boundAgent?.state === 'proposed') {
          const activated = await agentService.lifecycle(
            auth,
            boundAgent.id,
            String(boundAgent.version),
            {
              version: 'orqaly_agent_lifecycle_request_v1',
              action: 'activate',
              reason: 'Assigned work from the Orqaly Assistant',
              idempotencyKey: `assistant-agent-activate-${user.turnId}`,
            }
          );
          boundAgent = agentFromControlPlaneResponse(activated);
        }
        // Lifecycle mutation responses can be idempotent replays of an older projection. Re-read
        // immediately before assignment so a pause, revocation or expiry that happened after the
        // original attempt cannot be hidden by those stored responses. The separate control-plane
        // and Workflow databases still make this an admission check rather than a cross-DB lock.
        boundAgent = agentFromControlPlaneResponse(
          await agentService.read(auth, boundAgent?.id || delegation?.agentId)
        );
        if (!boundAgent) {
          throw new WorkflowCommandError(
            'AGENT_RUNTIME_INVALID_RESPONSE',
            'the selected Agent could not be revalidated before assignment',
            502
          );
        }
        if (boundAgent.agent_kind !== delegation?.lifetime) {
          throw new WorkflowCommandError(
            'AGENT_LIFETIME_MISMATCH',
            'the selected Agent lifetime changed; refresh the Agent and try again',
            409
          );
        }
        if (boundAgent?.state !== 'active') {
          throw new WorkflowCommandError(
            'AGENT_NOT_ASSIGNABLE',
            'the selected Agent is not active and cannot accept work',
            409
          );
        }
      } else if (delegation?.agentId) {
        throw new WorkflowCommandError(
          'AGENT_RUNTIME_NOT_CONFIGURED',
          'the selected Agent runtime is not configured',
          503
        );
      }
      const executionAgent = executionAgentContract(
        owner,
        threadId,
        user,
        goalRequest,
        assignedRunId,
        boundAgent
      );
      const started = await workflowCommandService.startFromAssistant(
        auth,
        {
          commandId: startCommandId,
          issuedAt: user.createdAt,
          mode: 'advanced',
          request: goalRequest,
        },
        { ...trustedContext, executionAgent }
      );
      const persistedExecutionAgent = started.workflow.attempts?.find(
        (attempt) => attempt.inputPayload?.type === 'CompileScopeV3'
      )?.inputPayload?.executionAgent;
      if (
        !persistedExecutionAgent ||
        canonicalHash(persistedExecutionAgent) !== canonicalHash(executionAgent)
      ) {
        throw new WorkflowCommandError(
          'EXECUTION_AGENT_BINDING_MISSING',
          'the Workflow did not retain the delegated Agent execution contract',
          502
        );
      }
      const message = await append(
        owner,
        messageRecord({
          owner,
          threadId,
          turnId: user.turnId,
          role: 'assistant',
          route: user.route,
          parts: [
            textPart('Your Agent is ready. The assignment was accepted as a durable Goal.'),
            delegatedAgentPart(
              persistedExecutionAgent,
              threadId,
              goalRequest,
              started.workflow.run,
              user.createdAt,
              boundAgent
            ),
            {
              type: 'goal_link',
              runId: started.workflow.run.id,
              label: goalRequest.slice(0, 500),
              status: started.workflow.run.status,
            },
          ],
          runId: started.workflow.run.id,
          createdAt: user.createdAt,
        })
      );
      return { message, persisted: true, idempotent: started.receipt.idempotent };
    }

    if (user.route === 'CONTINUE_GOAL') {
      if (!user.workflowRunId) {
        throw new WorkflowCommandError(
          'ASSISTANT_GOAL_NOT_FOUND',
          'the Goal linked to this conversation was not found',
          409
        );
      }
      const workflow = await workflowCommandService.read(auth, user.workflowRunId);
      const message = await append(
        owner,
        messageRecord({
          owner,
          threadId,
          turnId: user.turnId,
          role: 'assistant',
          route: user.route,
          parts: [
            textPart('Continuing with the existing Goal; no duplicate run was created.'),
            {
              type: 'goal_link',
              runId: workflow.run.id,
              label: 'Open Goal',
              status: workflow.run.status,
            },
          ],
          runId: workflow.run.id,
          createdAt: user.createdAt,
        })
      );
      return { message, persisted: true, idempotent: false };
    }

    throw new WorkflowCommandError(
      'ASSISTANT_ROUTE_INVALID',
      'assistant turn has an unsupported persisted route',
      409
    );
  }

  async function send(auth, threadId, rawCommand) {
    const command = AssistantTurnCommandSchema.parse(rawCommand);
    const owner = await identity(auth);
    const [activeGoalRunId, existingThread] = await Promise.all([
      repository.findLatestAssistantGoalRunId(owner.tenantId, threadId, owner.userId),
      repository.loadAssistantThread(owner.tenantId, threadId, owner.userId),
    ]);
    const hasPriorAssistantReply = Boolean(
      existingThread?.messages.some(
        (message) =>
          message.role === 'assistant' &&
          message.parts.some((part) =>
            ['text', 'artifact', 'fact', 'recommendation', 'goal_link', 'approval'].includes(
              part.type
            )
          )
      )
    );
    const requestedIntent = command.intent || 'auto';
    const routeDecision = resolveAssistantTurnRoute(command.message, {
      activeGoalRunId,
      hasPriorAssistantReply,
      intent: requestedIntent,
    });
    let route = routeDecision.route;
    const requestedRoute = routeDecision.route;
    // Lifetime defaults are normalized before persistence and replay comparison,
    // so omission can never silently adopt a previously persistent Agent.
    const normalizedAgentLifetime = command.agentLifetime || 'temporary';
    const initialIdentity = initialAttemptIdentity(owner, threadId, command.turnId);
    let operationId = responseModeForRoute(route) ? initialIdentity.operationId : null;
    const initialParts = [
      textPart(command.message),
      ...(route === 'START_GOAL'
        ? [delegationRequestPart(normalizedAgentLifetime, command.agentId)]
        : []),
    ];
    let user = messageRecord({
      owner,
      threadId,
      turnId: command.turnId,
      role: 'user',
      route,
      parts: initialParts,
      operationId,
      runId: route === 'CONTINUE_GOAL' ? activeGoalRunId : null,
      requestedIntent,
      resolvedRoute: route,
      routePolicyVersion: routeDecision.policyVersion,
      routeReasonCode: routeDecision.reasonCode,
      createdAt: command.issuedAt,
    });
    let created;
    try {
      created = await repository.createAssistantTurn(
        owner.tenantId,
        owner,
        {
          id: threadId,
          title: assistantThreadTitle(command.message),
          createdAt: command.issuedAt,
        },
        user
      );
    } catch (error) {
      if (error?.code === 'ASSISTANT_TURN_PENDING') {
        throw new WorkflowCommandError(
          'ASSISTANT_TURN_PENDING',
          'the previous assistant turn is still pending',
          409
        );
      }
      if (error?.code === 'ASSISTANT_TURN_TIMESTAMP_CONFLICT') {
        throw new WorkflowCommandError(
          'ASSISTANT_TURN_TIMESTAMP_CONFLICT',
          'assistant turn timestamp must be newer than the conversation',
          409
        );
      }
      throw error;
    }
    if (
      created.message.requestedIntent !== undefined
        ? created.message.requestedIntent !== requestedIntent
        : command.intent && command.intent !== 'auto' && created.message.route !== requestedRoute
    ) {
      throw new WorkflowCommandError(
        'IDEMPOTENCY_CONFLICT',
        'assistant turn ID was reused with a changed intent',
        409
      );
    }
    route = created.message.route;
    operationId = responseModeForRoute(route) ? initialIdentity.operationId : null;
    const persistedDelegation = created.message.parts.find(
      (part) => part.type === 'delegation_request'
    );
    if (
      route === 'START_GOAL' &&
      (persistedDelegation
        ? persistedDelegation.lifetime !== normalizedAgentLifetime ||
          persistedDelegation.agentId !== command.agentId
        : normalizedAgentLifetime !== 'temporary' || command.agentId !== undefined)
    ) {
      throw new WorkflowCommandError(
        'IDEMPOTENCY_CONFLICT',
        'assistant turn ID was reused with a changed Agent selection',
        409
      );
    }
    user = messageRecord({
      owner,
      threadId,
      turnId: command.turnId,
      role: 'user',
      route,
      parts: [textPart(command.message), ...(persistedDelegation ? [persistedDelegation] : [])],
      operationId,
      runId: route === 'CONTINUE_GOAL' ? created.message.workflowRunId : null,
      ...persistedRouteProvenance(created.message),
      createdAt: command.issuedAt,
    });
    if (!sameMessage(created.message, publicMessage(user))) {
      throw new WorkflowCommandError(
        'IDEMPOTENCY_CONFLICT',
        'assistant turn ID was reused with changed input',
        409
      );
    }
    await emitEvent(owner, threadId, user, 'routed');
    const loaded = await loadOwned(owner, threadId);
    const existing = loaded.messages.find(
      (message) => message.turnId === command.turnId && message.role === 'assistant'
    );
    if (existing) {
      await emitTerminalEvent(owner, threadId, user, existing);
      return { route, message: existing, persisted: true, idempotent: true };
    }

    if (!responseModeForRoute(route)) {
      const result = await executeLocal(owner, auth, threadId, user, loaded.messages);
      await emitTerminalEvent(owner, threadId, user, result.message);
      return { route, ...result };
    }

    return {
      route,
      ...(await executeAxwise(owner, threadId, user, loaded.messages)),
      idempotent: false,
    };
  }

  async function retry(auth, threadId, failedTurnId, rawCommand) {
    const command = AssistantRetryCommandSchema.parse(rawCommand);
    const owner = await identity(auth);
    const loaded = await loadOwned(owner, threadId);
    const failedUser = userByTurn(loaded.messages, failedTurnId);
    const failedAssistant = loaded.messages.find(
      (message) => message.turnId === failedTurnId && message.role === 'assistant'
    );
    if (!failedUser || !failedAssistant) {
      throw new WorkflowCommandError('ASSISTANT_TURN_NOT_FOUND', 'assistant turn not found', 404);
    }
    const failedStatus = failedAssistant.parts.find(
      (part) => part.type === 'operation_status' && part.status === 'failed'
    );
    const newAttemptAllowed =
      failedStatus?.retryMode === 'new_attempt' ||
      (failedStatus?.retryMode === undefined && failedStatus?.retryable === true);
    if (
      !newAttemptAllowed ||
      !responseModeForRoute(failedUser.route) ||
      !failedUser.axwiseOperationId ||
      failedStatus.operationId !== failedUser.axwiseOperationId
    ) {
      throw new WorkflowCommandError(
        'ASSISTANT_TURN_NOT_RETRYABLE',
        'assistant turn is not retryable',
        409
      );
    }
    if (command.turnId === failedTurnId) {
      throw new WorkflowCommandError(
        'IDEMPOTENCY_CONFLICT',
        'retry requires a new assistant turn ID',
        409
      );
    }
    if (failedStatus.retryAt && Date.parse(failedStatus.retryAt) > Date.now()) {
      throw new WorkflowCommandError(
        'ASSISTANT_RETRY_NOT_READY',
        'assistant retry is not available yet',
        409
      );
    }
    const root = rootUser(loaded.messages, failedUser);
    const retryUser = messageRecord({
      owner,
      threadId,
      turnId: command.turnId,
      role: 'user',
      route: failedUser.route,
      parts: [textPart(userText(root))],
      operationId: deterministicUuid(failedUser.axwiseOperationId, 'retry', 'operation'),
      retryOfTurnId: failedTurnId,
      ...persistedRouteProvenance(failedUser),
      createdAt: command.issuedAt,
    });
    let created;
    try {
      created = await repository.createAssistantRetryTurn(owner.tenantId, owner.userId, retryUser);
    } catch (error) {
      if (error?.code === 'ASSISTANT_TURN_PENDING') {
        throw new WorkflowCommandError(
          'ASSISTANT_TURN_PENDING',
          'the previous assistant turn is still pending',
          409
        );
      }
      if (error?.code === 'ASSISTANT_TURN_TIMESTAMP_CONFLICT') {
        throw new WorkflowCommandError(
          'ASSISTANT_TURN_TIMESTAMP_CONFLICT',
          'assistant retry timestamp must be newer than the conversation',
          409
        );
      }
      throw error;
    }
    if (created.conflictingChild) {
      throw new WorkflowCommandError(
        'ASSISTANT_RETRY_ALREADY_EXISTS',
        'assistant turn already has a retry attempt',
        409
      );
    }
    if (!sameMessage(created.message, publicMessage(retryUser))) {
      throw new WorkflowCommandError(
        'IDEMPOTENCY_CONFLICT',
        'assistant retry turn ID was reused with changed input',
        409
      );
    }
    await emitEvent(owner, threadId, retryUser, 'retry_created');
    await emitEvent(owner, threadId, retryUser, 'routed');
    const withRetry = await loadOwned(owner, threadId);
    const existing = withRetry.messages.find(
      (message) => message.turnId === command.turnId && message.role === 'assistant'
    );
    if (existing) {
      await emitTerminalEvent(owner, threadId, retryUser, existing);
      return { route: retryUser.route, message: existing, persisted: true, idempotent: true };
    }
    return {
      route: retryUser.route,
      ...(await executeAxwise(owner, threadId, retryUser, withRetry.messages)),
      idempotent: false,
    };
  }

  async function resume(auth, threadId, turnId) {
    const owner = await identity(auth);
    const loaded = await loadOwned(owner, threadId);
    const assistant = loaded.messages.find(
      (message) => message.turnId === turnId && message.role === 'assistant'
    );
    if (assistant) {
      const persistedUser = loaded.messages.find(
        (message) => message.turnId === turnId && message.role === 'user'
      );
      if (persistedUser) await emitTerminalEvent(owner, threadId, persistedUser, assistant);
      return { route: assistant.route, message: assistant, persisted: true, idempotent: true };
    }
    const user = loaded.messages.find(
      (message) => message.turnId === turnId && message.role === 'user'
    );
    if (!user)
      throw new WorkflowCommandError('ASSISTANT_TURN_NOT_FOUND', 'assistant turn not found', 404);
    if (!responseModeForRoute(user.route)) {
      const result = {
        route: user.route,
        ...(await executeLocal(owner, auth, threadId, user, loaded.messages)),
      };
      await emitTerminalEvent(owner, threadId, user, result.message);
      return result;
    }
    if (!user.axwiseOperationId) {
      throw new WorkflowCommandError(
        'ASSISTANT_TURN_NOT_RESUMABLE',
        'assistant turn is not resumable',
        409
      );
    }
    await mirrorAxwiseEvents(owner, threadId, user);
    return {
      route: user.route,
      ...(await executeAxwise(owner, threadId, user, loaded.messages, { poll: true })),
      idempotent: false,
    };
  }

  async function cancel(auth, threadId, turnId) {
    const owner = await identity(auth);
    const loaded = await loadOwned(owner, threadId);
    const user = loaded.messages.find(
      (message) => message.turnId === turnId && message.role === 'user'
    );
    if (!user?.axwiseOperationId || !responseModeForRoute(user.route)) {
      throw new WorkflowCommandError(
        'ASSISTANT_TURN_NOT_CANCELLABLE',
        'assistant turn is not cancellable',
        409
      );
    }
    const existing = loaded.messages.find(
      (message) => message.turnId === turnId && message.role === 'assistant'
    );
    if (existing) {
      return { route: user.route, message: existing, persisted: true, idempotent: true };
    }
    if (typeof axwiseClient.cancel !== 'function') {
      throw new WorkflowCommandError(
        'ASSISTANT_CANCEL_UNAVAILABLE',
        'assistant cancellation is unavailable',
        503
      );
    }
    const envelope = axwiseEnvelope(owner, threadId, user, loaded.messages);
    await emitEvent(owner, threadId, user, 'cancel_requested');
    const response = await requestCancellation(owner, user, envelope);
    return {
      route: user.route,
      ...(await finishAxwise(owner, threadId, user, response)),
      idempotent: false,
    };
  }

  async function read(auth, threadId) {
    const owner = await identity(auth);
    return loadOwned(owner, threadId);
  }

  async function list(auth, limit = 25) {
    const owner = await identity(auth);
    return {
      threads: await repository.listAssistantThreads(owner.tenantId, owner.userId, limit),
    };
  }

  async function agents(auth, limit = 100) {
    const owner = await identity(auth);
    return {
      agents: await repository.listDelegatedAgents(owner.tenantId, owner.userId, limit),
    };
  }

  async function events(auth, threadId, afterSequence = 0, limit = 100) {
    const owner = await identity(auth);
    if (!Number.isInteger(afterSequence) || afterSequence < 0) {
      throw new WorkflowCommandError(
        'INVALID_ASSISTANT_EVENT_CURSOR',
        'assistant event cursor must be a nonnegative integer',
        400
      );
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new WorkflowCommandError('INVALID_LIMIT', 'limit must be 1..100', 400);
    }
    return repository.readAssistantTurnEvents(
      owner.tenantId,
      owner.userId,
      threadId,
      afterSequence,
      limit
    );
  }

  return { send, retry, resume, cancel, read, list, agents, events };
}
