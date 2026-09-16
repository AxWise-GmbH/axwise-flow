import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import VoiceCommandDialog from '../../../components/VoiceControl/VoiceCommandDialog';
import { useVoiceControl } from '../../../hooks/useVoiceControl';
import {
  addConversation,
  appendConversationMessage,
  createInitialChatState,
  deleteConversation,
  loadChatState,
  renameConversation,
  saveChatState,
  setActiveConversation,
} from '../../../services/chatSessionService';
import {
  buildActionSummaryReply,
  buildConversationalReply,
} from '../../../services/assistantConversationService';
import { BlockRegistry } from '../../../features/voiceWorkflow/registry/blockRegistry';
import { parseTranscriptDeterministic } from '../../../features/voiceWorkflow/intent/parser';

function normalizeTranscript(raw = '') {
  let t = String(raw || '').trim();
  if (!t) return '';
  // Remove common filler prefixes that come from speech transcripts.
  t = t.replace(/^(and\s+)?(this\s+workflow\s+called|workflow\s+called)\b/i, '').trim();
  // Remove leading workflow name clause: "workflow called X, add landing page..."
  t = t.replace(/^(?:["']?[^,"']+["']?)\s*,\s*/i, '').trim();
  // Normalize spacing
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function buildFunnelRegistry(funnelBlocks = []) {
  const defs = (funnelBlocks || []).map((b) => ({
    type: String(b.id),
    displayName: String(b.label || b.id),
    category: 'workflow',
    inputs: [{ id: 'in', direction: 'input', portType: 'any', displayName: 'In' }],
    outputs: [{ id: 'out', direction: 'output', portType: 'any', displayName: 'Out' }],
    configurableProperties: [],
    allowCircularDependencies: false,
  }));
  const aliases = {};
  (funnelBlocks || []).forEach((b) => {
    const label = String(b.label || '')
      .trim()
      .toLowerCase();
    if (label) aliases[label] = String(b.id);
    // Also allow "landing page" -> "landing-page" style
    if (label) aliases[label.replace(/\s+/g, '-')] = String(b.id);
  });
  return new BlockRegistry(defs, { aliases });
}

function nowIso() {
  return new Date().toISOString();
}

function toActionFromCommand(cmd) {
  const action = cmd?.action || 'command';
  const label =
    action === 'add_block'
      ? `Add block: ${cmd.blockType || ''}`.trim()
      : action === 'connect_blocks'
        ? `Connect blocks`
        : action === 'delete_block'
          ? `Delete block`
          : action === 'move_block'
            ? `Move block`
            : action === 'edit_block'
              ? `Edit block`
              : action === 'create_custom_block'
                ? `Create custom block`
                : `Workflow command: ${String(action)}`;
  return {
    id: `wfvc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'workflow_editor',
    label,
    command: cmd,
    requiresConfirmation: action === 'delete_block',
    riskLevel: action === 'delete_block' ? 'high' : undefined,
  };
}

function toActionFromStep(step) {
  const kind = step?.kind;
  const label =
    kind === 'add'
      ? `Add block: ${step.blockTypeLabel || step.blockType}`
      : kind === 'connectByType'
        ? `Connect: ${step.sourceLabel || step.sourceType} → ${step.targetLabel || step.targetType}`
        : kind === 'disconnect'
          ? `Disconnect ${step.direction}: ${step.blockLabel || step.blockType}`
          : 'Workflow step';
  return {
    id: `wfvc-step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'workflow_editor',
    label,
    command: { _kind: 'workflow_step', ...step },
    requiresConfirmation: false,
  };
}

function buildBlockLookup(funnelBlocks = []) {
  const byToken = new Map();
  const add = (key, id) => {
    const k = String(key || '')
      .trim()
      .toLowerCase();
    if (!k) return;
    byToken.set(k, String(id));
  };
  funnelBlocks.forEach((b) => {
    add(b.id, b.id);
    add(String(b.id).replace(/-/g, ' '), b.id);
    add(b.label, b.id);
    add(String(b.label || '').replace(/\s+/g, '-'), b.id);
  });
  return byToken;
}

function parseCompoundWorkflowSteps(textRaw, funnelBlocks = []) {
  const text = normalizeTranscript(textRaw);
  if (!text) return [];

  const lookup = buildBlockLookup(funnelBlocks);
  const tokens = Array.from(lookup.keys()).sort((a, b) => b.length - a.length); // longest match first

  const steps = [];
  const lower = text.toLowerCase();

  // Very small heuristic "planner" for compound requests like:
  // "add landing page and connect it to a campaign and connect the campaign to the database"
  const clauses = text
    .split(/\s+(?:and then|then|and)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  let lastAddedType = null;

  const findTypeInClause = (clause) => {
    const c = String(clause || '').toLowerCase();
    for (const tok of tokens) {
      if (c.includes(tok)) return lookup.get(tok) || null;
    }
    return null;
  };

  for (const clause of clauses) {
    const c = clause.toLowerCase();

    // add
    if (/\badd\b|\bcreate\b|\binsert\b/.test(c)) {
      const t = findTypeInClause(clause);
      if (t) {
        const b = funnelBlocks.find((x) => x.id === t);
        steps.push({ kind: 'add', blockType: t, blockTypeLabel: b?.label || t });
        lastAddedType = t;
        continue;
      }
    }

    // connect patterns
    if (/\bconnect\b/.test(c)) {
      // "connect it to X"
      const toMatch = c.match(/\bto\s+(.+)$/i);
      const targetType = toMatch ? findTypeInClause(toMatch[1]) : findTypeInClause(clause);
      const sourceType = /\bit\b/.test(c) ? lastAddedType : findTypeInClause(clause);
      if (sourceType && targetType) {
        const sB = funnelBlocks.find((x) => x.id === sourceType);
        const tB = funnelBlocks.find((x) => x.id === targetType);
        steps.push({
          kind: 'connectByType',
          sourceType,
          targetType,
          sourceLabel: sB?.label || sourceType,
          targetLabel: tB?.label || targetType,
        });
        continue;
      }
    }
  }

  // As a fallback: if user wrote a single long sentence that contains multiple "connect ... to ..."
  // but didn't split cleanly, still attempt to extract add+connect from the whole text.
  if (steps.length === 0 && (/\badd\b/.test(lower) || /\bconnect\b/.test(lower))) {
    const inferredAdds = [];
    for (const tok of tokens) {
      if (
        lower.includes(`add ${tok}`) ||
        lower.includes(`add a ${tok}`) ||
        lower.includes(`add the ${tok}`)
      ) {
        inferredAdds.push(lookup.get(tok));
      }
    }
    [...new Set(inferredAdds.filter(Boolean))].forEach((t) => {
      const b = funnelBlocks.find((x) => x.id === t);
      steps.push({ kind: 'add', blockType: t, blockTypeLabel: b?.label || t });
    });
  }

  return steps;
}

export default function WorkflowLetsTalkDialog({
  open,
  onClose,
  funnelBlocks = [],
  workflowCustomBlocks = [],
  voiceApiRef,
  userScope = 'anonymous',
}) {
  const registry = useMemo(() => buildFunnelRegistry(funnelBlocks), [funnelBlocks]);
  const [parserCtx, setParserCtx] = useState({ mode: 'workflow' });
  const [actions, setActions] = useState([]);

  // Persisted chat per-workflow scope (same service as Let's Talk)
  const chatScope = `workflow:${String(userScope || 'anonymous')}`;
  const [chatState, setChatState] = useState(() => createInitialChatState());
  useEffect(() => setChatState(loadChatState(chatScope)), [chatScope]);
  useEffect(() => saveChatState(chatScope, chatState), [chatScope, chatState]);

  const activeConversation =
    chatState.conversations.find((c) => c.id === chatState.activeConversationId) ||
    chatState.conversations[0];
  const activeConversationId = activeConversation?.id || '';
  const chatHistory = activeConversation?.messages || [];

  // Restore last stored actions when switching conversations / reopening.
  useEffect(() => {
    if (!open) return;
    for (let i = (chatHistory || []).length - 1; i >= 0; i -= 1) {
      const msg = chatHistory[i];
      if (msg?.role === 'assistant' && Array.isArray(msg.actions) && msg.actions.length > 0) {
        setActions(msg.actions);
        return;
      }
    }
    // keep current actions, don't force clear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeConversationId]);

  const appendChat = useCallback(
    (role, message, meta = {}) => {
      if (!activeConversationId) return;
      const payload = { role, message: String(message || '').trim(), time: nowIso(), ...meta };
      if (!payload.message) return;
      if (meta.actions && Array.isArray(meta.actions) && meta.actions.length > 0)
        payload.actions = meta.actions;
      setChatState((prev) => appendConversationMessage(prev, activeConversationId, payload));
    },
    [activeConversationId]
  );

  const getActionsFromTranscript = useCallback(
    (text) => {
      const cleaned = normalizeTranscript(text);
      const nodes = voiceApiRef?.current?.getNodes?.() || [];
      const edges = voiceApiRef?.current?.getEdges?.() || [];

      const parsed = parseTranscriptDeterministic({
        transcript: cleaned,
        ctx: parserCtx,
        registry,
        blocks: (nodes || []).map((n) => ({
          id: n.id,
          label: n.data?.label || 'Block',
          type: n.data?.blockId,
        })),
        connections: (edges || []).map((e) => ({ id: e.id, connectionId: e.data?.connectionId })),
        customBlockDefs: (workflowCustomBlocks || []).map((b) => ({
          id: b.id,
          label: b.label,
          description: b.description || '',
          iconId: b.iconId || 'extension',
        })),
      });

      if (!parsed.ok || !parsed.command) {
        const compound = parseCompoundWorkflowSteps(cleaned, funnelBlocks);
        if (compound.length > 0) {
          const acts = compound.map(toActionFromStep);
          const summary = buildActionSummaryReply(acts, 'Executive Insight Mode');
          return [
            {
              id: `wfvc-summary-${Date.now()}`,
              type: 'assistant_reply',
              label: 'AI summary',
              message: summary,
            },
            ...acts,
          ];
        }

        return [
          {
            id: `wfvc-reply-${Date.now()}`,
            type: 'assistant_reply',
            label: 'AI reply',
            message: buildConversationalReply({
              text: cleaned || text,
              chatHistory,
              mode: 'Executive Insight Mode',
            }),
          },
        ];
      }

      if (parsed.nextContext) setParserCtx(parsed.nextContext);
      const act = toActionFromCommand(parsed.command);
      const summary = buildActionSummaryReply([act], 'Executive Insight Mode');
      return [
        {
          id: `wfvc-summary-${Date.now()}`,
          type: 'assistant_reply',
          label: 'AI summary',
          message: summary,
        },
        act,
      ];
    },
    [chatHistory, parserCtx, registry, voiceApiRef, workflowCustomBlocks, funnelBlocks]
  );

  const handleParseText = useCallback(
    (text, storedActions) => {
      if (Array.isArray(storedActions) && storedActions.length > 0) {
        setActions(storedActions);
        return;
      }
      const next = getActionsFromTranscript(String(text || '').trim());
      setActions(next);
      const summary = next.find((a) => a.type === 'assistant_reply')?.message || '';
      if (summary)
        appendChat('assistant', summary, {
          source: 'assistant',
          actions: next.filter((a) => a.type !== 'assistant_reply'),
        });
    },
    [appendChat, getActionsFromTranscript]
  );

  const handleSubmitText = useCallback(
    (text) => {
      const t = String(text || '').trim();
      if (!t) return;
      appendChat('user', t, { source: 'text' });
      handleParseText(t);
    },
    [appendChat, handleParseText]
  );

  const handleExecuteAction = useCallback(
    async (action) => {
      if (!action) return;
      if (action.type === 'assistant_reply') return;
      if (action.requiresConfirmation) {
        const ok = window.confirm('This action will modify your workflow. Continue?');
        if (!ok) return;
      }
      if (
        action.type === 'workflow_editor' &&
        action.command &&
        voiceApiRef?.current?.applyIntent
      ) {
        // Support both direct IntentCommand and higher-level planned steps.
        const cmd = action.command;
        if (cmd?._kind === 'workflow_step') {
          const nodes = voiceApiRef?.current?.getNodes?.() || [];
          const findLastNodeIdByBlockId = (blockId) => {
            const matches = (nodes || []).filter(
              (n) => n?.data?.blockId === blockId || n?.data?.blockType === blockId
            );
            return matches.length ? matches[matches.length - 1].id : null;
          };

          if (cmd.kind === 'add') {
            const res = await voiceApiRef.current.applyIntent({
              registry,
              ctx: parserCtx,
              command: { mode: 'workflow', action: 'add_block', blockType: cmd.blockType },
            });
            if (!res?.ok) {
              appendChat('assistant', (res?.errors || ['Command failed'])[0], {
                source: 'assistant',
              });
              return;
            }
            if (res.nextContext) setParserCtx(res.nextContext);
            appendChat('assistant', `Added "${cmd.blockTypeLabel || cmd.blockType}".`, {
              source: 'assistant',
            });
            return;
          }

          if (cmd.kind === 'connectByType') {
            const sourceId = findLastNodeIdByBlockId(cmd.sourceType);
            const targetId = findLastNodeIdByBlockId(cmd.targetType);
            if (!sourceId || !targetId) {
              appendChat(
                'assistant',
                `Can't connect: missing block(s) on canvas (${cmd.sourceLabel} → ${cmd.targetLabel}).`,
                { source: 'assistant' }
              );
              return;
            }
            const res = await voiceApiRef.current.applyIntent({
              registry,
              ctx: parserCtx,
              command: {
                mode: 'workflow',
                action: 'connect_blocks',
                sourceBlockId: sourceId,
                targetBlockId: targetId,
              },
            });
            if (!res?.ok) {
              appendChat('assistant', (res?.errors || ['Command failed'])[0], {
                source: 'assistant',
              });
              return;
            }
            if (res.nextContext) setParserCtx(res.nextContext);
            appendChat('assistant', `Connected ${cmd.sourceLabel} → ${cmd.targetLabel}.`, {
              source: 'assistant',
            });
            return;
          }
        }

        const res = await voiceApiRef.current.applyIntent({
          registry,
          ctx: parserCtx,
          command: cmd,
        });
        if (!res?.ok) {
          appendChat('assistant', (res?.errors || ['Command failed'])[0], { source: 'assistant' });
          return;
        }
        if (res.nextContext) setParserCtx(res.nextContext);
        appendChat('assistant', 'Done.', { source: 'assistant' });
      }
    },
    [appendChat, parserCtx, registry, voiceApiRef]
  );

  const handleExecuteAll = useCallback(() => {
    const exec = (actions || []).filter((a) => a.type !== 'assistant_reply');
    (async () => {
      for (const a of exec) {
        // Run sequentially so "add" happens before "connect".
        // eslint-disable-next-line no-await-in-loop
        await handleExecuteAction(a);
      }
    })();
  }, [actions, handleExecuteAction]);

  // Voice connection (same as Let's Talk)
  const voice = useVoiceControl({
    language: 'en-US',
    onListeningEnd: (t) => handleSubmitText(t),
  });

  return (
    <VoiceCommandDialog
      open={open}
      onClose={onClose}
      transcript={voice.transcript}
      isRecording={voice.state === 'listening'}
      isPaused={voice.state === 'paused'}
      error={voice.error}
      isSupported={voice.isSupported}
      actions={actions}
      operatorMode="Workflow Builder Mode"
      executionPlan={null}
      partners={[]}
      onExecuteAction={handleExecuteAction}
      onExecuteAll={handleExecuteAll}
      onParseText={handleParseText}
      onSubmitText={handleSubmitText}
      onToggleMic={() => {
        if (voice.state === 'listening') voice.stopListening();
        else if (voice.state === 'paused') voice.resumeListening();
        else voice.startListening(false, true);
      }}
      chatHistory={chatHistory}
      conversations={chatState.conversations}
      activeConversationId={activeConversationId}
      onCreateConversation={() => setChatState((prev) => addConversation(prev, 'New conversation'))}
      onSelectConversation={(id) => setChatState((prev) => setActiveConversation(prev, id))}
      onRenameConversation={(id, title) =>
        setChatState((prev) => renameConversation(prev, id, title))
      }
      onDeleteConversation={(id) => setChatState((prev) => deleteConversation(prev, id))}
      isAssistantSpeaking={false}
      voiceSettings={{
        enabled: true,
        muted: true,
        language: 'en-US',
        rate: 1,
        pitch: 1,
        tone: 'professional',
      }}
      onVoiceSettingsChange={() => {}}
    />
  );
}
