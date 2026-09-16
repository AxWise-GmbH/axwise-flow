/**
 * AssistantChat - the ONE shared copilot chat used everywhere (simple home card,
 * advanced "Let's talk", and the Communicator Assistant tab). Same brain, same
 * design; only `variant` ('compact' | 'full') changes the sizing.
 *
 * Self-contained: owns its message thread, talks to the copilot loop
 * (/api/agent?path=copilot) via copilotChatApiService, and renders with the
 * shared pieces (AssistantMarkdown, ChatBlock, ActionCard, ModelSwitcher,
 * AttachButton). Confirmation-gated actions resolve through the same endpoint.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  InputBase,
  Tooltip,
  Chip,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';

import { supabase } from '../../lib/supabase';
import { copilotChat, resolveCopilotAction } from '../../services/copilotChatApiService';
import { logAssistantMessages } from '../../services/assistantHistoryService';
import { bulkUploadFiles } from '../../services/assistantIngestService';
import { safeAssistantReply } from '../../utils/assistantResponseFormat';
import AssistantMarkdown from '../VoiceControl/AssistantMarkdown.jsx';
import ChatBlock from '../VoiceControl/chat-blocks/index.jsx';
import ActionCard from '../VoiceControl/ActionCard.jsx';
import ModelSwitcher from '../VoiceControl/ModelSwitcher.jsx';
import AttachButton from '../VoiceControl/AttachButton.jsx';
import { THREAD_MEASURE_PX, HERO_COMPOSER_MAX_WIDTH } from '../../theme/measures';
import { getHeroInputFontSize } from '../../utils/mobileTouchScroll';
import MessageMeta from '../Common/MessageMeta';
import {
  composerCardSx,
  composerToolIconSx,
  composerSendSx,
  composerChipSx,
  composerBubbleSx,
  composerInk,
  composerInputColor,
  composerShimmerBase,
} from '../../theme/composerSurface';

let mid = 0;
function nextId(role) {
  mid += 1;
  return `${role}-${mid}`;
}

function newConversationId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function getToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

const DEFAULT_SUGGESTIONS = [
  { label: "Today's overview", text: 'Give me an insights overview for today.' },
  { label: 'Show insights', text: 'Show my saved insights and KPIs.' },
  {
    label: 'Create a goal',
    text: 'I want to launch a new goal - help me describe it and set a budget.',
  },
  {
    label: 'Write a brief',
    text: 'Write a short business brief for this organization and save it.',
  },
];

/**
 * ThinkingIndicator - the assistant's "typing" state. A chat bubble (matching
 * the assistant message bubbles) with three brand-green wave dots and a
 * shimmering "Thinking" label. On-brand with the green orb, and it degrades to
 * a static, calm state under `prefers-reduced-motion`. Exported for tests.
 */
export function ThinkingIndicator() {
  const theme = useTheme();
  const accent = theme.palette.primary.main;
  const shimmer = composerShimmerBase(theme);
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 1.25 }}>
      <Box
        role="status"
        aria-live="polite"
        aria-label="Assistant is thinking"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          borderRadius: 2,
          px: 1.5,
          py: 1,
          ...composerBubbleSx(theme),
        }}
      >
        {/* Three dots rising in a staggered wave, like a live typing indicator. */}
        <Box
          aria-hidden
          sx={{
            display: 'inline-flex',
            alignItems: 'flex-end',
            gap: 0.5,
            '@keyframes assistantThinkingWave': {
              '0%, 80%, 100%': { transform: 'translateY(0)', opacity: 0.35 },
              '40%': { transform: 'translateY(-3px)', opacity: 1 },
            },
            '& span': {
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: accent,
              boxShadow: `0 0 6px ${alpha(accent, 0.6)}`,
              animation: 'assistantThinkingWave 1.2s ease-in-out infinite',
            },
            '& span:nth-of-type(2)': { animationDelay: '0.16s' },
            '& span:nth-of-type(3)': { animationDelay: '0.32s' },
            '@media (prefers-reduced-motion: reduce)': {
              '& span': { animation: 'none', opacity: 0.7 },
            },
          }}
        >
          <span />
          <span />
          <span />
        </Box>
        {/* Label with a soft light sweep tinted by the brand accent. */}
        <Typography
          component="span"
          variant="caption"
          sx={{
            fontWeight: 600,
            letterSpacing: '0.01em',
            backgroundImage: `linear-gradient(90deg, ${alpha(shimmer, 0.35)} 0%, ${alpha(shimmer, 0.9)} 25%, ${accent} 50%, ${alpha(shimmer, 0.9)} 75%, ${alpha(shimmer, 0.35)} 100%)`,
            backgroundSize: '200% 100%',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
            animation: 'assistantThinkingShimmer 2.2s linear infinite',
            '@keyframes assistantThinkingShimmer': {
              '0%': { backgroundPosition: '200% 0' },
              '100%': { backgroundPosition: '-200% 0' },
            },
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none',
              backgroundImage: 'none',
              WebkitTextFillColor: alpha(shimmer, 0.6),
              color: alpha(shimmer, 0.6),
            },
          }}
        >
          Thinking
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * Map stored assistant_chat_messages rows onto the shape this component holds.
 *
 * The rename is load-bearing: rows carry `content`, chat messages carry `text`,
 * and the history sent to the model is built from `text`. Seeding without it
 * yields a thread that looks complete but reads as empty to the model.
 */
export function seedMessages(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && (r.role === 'user' || r.role === 'assistant'))
    .map((r, i) => ({
      // Prefixed so a seeded id can never collide with the module-level
      // counter behind nextId().
      id: `seed-${r.id || i}`,
      role: r.role,
      text: r.content || '',
      time: r.created_at || new Date().toISOString(),
    }));
}

/**
 * The entity an approved action just created, in the shape the block cards'
 * Open button already sends to onOpenEntity. Prefers the tool result's id and
 * falls back to the first block the resolver attached.
 */
export function createdEntity(tool, res) {
  const type = String(tool || '').split('.')[0];
  if (!type || !String(tool || '').endsWith('.create')) return null;
  const block = (res?.blocks || []).find((b) => b?.entityId);
  const entityId = res?.result?.created?.id || block?.entityId || null;
  if (!entityId) return null;
  return { type: block?.type || type, entityId, block: block || null, source: 'created' };
}

const AssistantChat = forwardRef(function AssistantChat(
  {
    variant = 'full',
    orgId = null,
    provider,
    model,
    onModelChange,
    useTemplates = false,
    onToggleTemplates,
    personality = 'professional',
    greetingName = '',
    onOpenEntity,
    onToggleDrawer,
    pageContext = null,
    suggestions = DEFAULT_SUGGESTIONS,
    inputTopSlot = null,
    emptyTitle = null,
    emptySubtitle = null,
    emptyOrbSize = null,
    emptyOrb = null,
    // Reopening a past conversation: its stored rows and the id they were filed
    // under. Both are read once, at mount, so the host must remount (change the
    // React key) to switch conversations.
    conversationId = null,
    initialMessages = null,
    onHasChatChange = null,
  },
  ref
) {
  const theme = useTheme();
  const compact = variant === 'compact';
  const [messages, setMessages] = useState(() => seedMessages(initialMessages));
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [attachError, setAttachError] = useState('');
  const scrollRef = useRef(null);
  // Stable per-thread id so this conversation is grouped in the shared
  // assistant history (the store /assistant's Conversation History reads).
  // Seeded when resuming so new turns land in the conversation being continued
  // rather than opening a second one beside it.
  const conversationIdRef = useRef(conversationId || null);

  const hasChat = messages.length > 0;

  // The composer follows the Goal side exactly: the small landing box before
  // there is a conversation, the reading column once there is one. It used to
  // take whatever the hero gave it, which is why picking Assistant grew the
  // input block while picking Goal left it alone.
  const composerMeasure = hasChat ? THREAD_MEASURE_PX : HERO_COMPOSER_MAX_WIDTH;
  const isMobileTouch = useMediaQuery('(pointer: coarse)');

  // The hero sizes itself around this: an empty assistant is a landing page and
  // must stack exactly like the Goal landing, a started one is a full-height
  // conversation. Without it the host had to guess from the activation flag and
  // guessed wide, which is what made the page jump on every tab switch.
  useEffect(() => {
    onHasChatChange?.(hasChat);
  }, [hasChat, onHasChatChange]);

  // Whether the panel follows what is said. A conversation that arrives with
  // history in it was reopened from History to be read, so it opens at its
  // first message; jumping to the bottom put the user at the last thing said,
  // past everything they clicked the row to see. Anything said from here on is
  // live again, so appendMessage turns following back on.
  const followBottomRef = useRef(!(initialMessages?.length > 0));

  const appendMessage = useCallback((msg) => {
    followBottomRef.current = true;
    setMessages((prev) => [
      ...prev,
      { id: nextId(msg.role), time: new Date().toISOString(), ...msg },
    ]);
  }, []);

  useEffect(() => {
    if (!followBottomRef.current) return;
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const handleConfirm = useCallback(
    async (proposal) => {
      const token = await getToken();
      if (!token || !proposal?.pendingCallId)
        return { status: 'error', error: 'This action is no longer available.' };
      try {
        const res = await resolveCopilotAction({
          token,
          pendingCallId: proposal.pendingCallId,
          decision: 'approve',
        });
        if (res?.status === 'approved' && Array.isArray(res.blocks) && res.blocks.length > 0) {
          appendMessage({
            role: 'assistant',
            text: `Done: ${proposal.summary || proposal.tool}`,
            blocks: res.blocks,
          });
        }
        // What was just created opens on its own. Leaving it as a card with an
        // Open link meant agreeing to a goal and then having to go find it.
        if (res?.status === 'approved') {
          const created = createdEntity(proposal.tool, res);
          if (created) onOpenEntity?.(created);
        }
        return res;
      } catch (e) {
        return { status: 'error', error: e?.message || 'Could not complete the action.' };
      }
    },
    [appendMessage, onOpenEntity]
  );

  const send = useCallback(
    async (text) => {
      const content = String(text || '').trim();
      if (!content || loading) return;
      const files = attachments.map((a) => a.file);
      appendMessage({ role: 'user', text: content });
      setInput('');
      setAttachments([]);
      setLoading(true);
      try {
        const token = await getToken();
        let attachmentRefs;
        if (files.length > 0) {
          try {
            const up = await bulkUploadFiles(files);
            attachmentRefs = (up?.docs || [])
              .map((d) => ({ documentId: d.id || d.documentId || d.document_id }))
              .filter((r) => r.documentId);
          } catch {
            /* proceed without attachments */
          }
        }
        // Send the whole current conversation (capped for payload safety) so the
        // model — including a freshly-switched one — has the full context. The
        // backend windows this to a token budget.
        if (!conversationIdRef.current) conversationIdRef.current = newConversationId();
        const history = messages.slice(-50).map((m) => ({ role: m.role, content: m.text || '' }));
        const result = await copilotChat({
          token,
          message: content,
          history,
          personality,
          provider,
          model,
          orgId,
          pageContext,
          attachments: attachmentRefs,
          conversationId: conversationIdRef.current,
        });
        const pendingCalls = Array.isArray(result?.proposedActions)
          ? result.proposedActions.map((p, i) => ({
              ...p,
              id: p.pendingCallId || `pc-${Date.now()}-${i}`,
            }))
          : [];
        const assistantText = result?.message || 'Done.';
        appendMessage({
          role: 'assistant',
          text: assistantText,
          blocks: Array.isArray(result?.blocks) ? result.blocks : undefined,
          pendingCalls: pendingCalls.length ? pendingCalls : undefined,
        });
        // Persist the exchange to the shared assistant history so it shows on
        // /assistant and is identical across surfaces (best-effort, non-blocking).
        logAssistantMessages(
          conversationIdRef.current,
          [
            { role: 'user', content },
            { role: 'assistant', content: assistantText },
          ],
          'assistant'
        ).catch(() => {
          /* history logging is best-effort */
        });
      } catch (e) {
        appendMessage({
          role: 'assistant',
          text: `Error: ${e?.message || 'Failed to get a response.'}`,
        });
      } finally {
        setLoading(false);
      }
    },
    [
      attachments,
      loading,
      messages,
      appendMessage,
      personality,
      provider,
      model,
      orgId,
      pageContext,
    ]
  );

  useImperativeHandle(ref, () => ({ submit: (t) => send(t) }), [send]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* When empty and a custom orb is provided, float it in the upper space so
          the greeting + composer sit near the bottom (matches the Goal hero layout).
          For the default orb (compact surfaces) it stays inline above the text. */}
      {!hasChat && emptyOrb && (
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 0,
          }}
        >
          {emptyOrb}
        </Box>
      )}

      {/* Message stream / empty-state text. When empty it hugs its content so the
          greeting sits directly above the composer; once messages arrive it grows. */}
      <Box
        ref={scrollRef}
        data-testid="assistant-stream"
        sx={{
          flex: hasChat ? 1 : '0 0 auto',
          minHeight: 0,
          overflowY: 'auto',
          px: compact ? 1 : 2,
          // The Goal greeting block carries no vertical padding of its own -
          // its inner pt:1 and the subtitle's mb:2 are the whole spacing. The
          // empty hero matches it so the greeting sits on the same line in
          // both tabs; a real stream still gets its breathing room.
          py: hasChat || compact ? 1.5 : 0,
        }}
      >
        {!hasChat && (
          <Box sx={{ textAlign: 'center', pt: compact ? 2 : 1 }}>
            {!emptyOrb && (
              <Box
                sx={{
                  width: emptyOrbSize || (compact ? 56 : 84),
                  height: emptyOrbSize || (compact ? 56 : 84),
                  mx: 'auto',
                  mb: 1.5,
                  borderRadius: '50%',
                  background: `radial-gradient(circle at 35% 30%, ${alpha(theme.palette.primary.light, 0.9)}, ${alpha(theme.palette.primary.dark, 0.7)})`,
                  boxShadow: `0 0 40px ${alpha(theme.palette.primary.main, 0.5)}`,
                }}
              />
            )}
            {emptyTitle || (
              <Typography
                variant={compact ? 'subtitle1' : 'h5'}
                sx={{ color: composerInk(theme), fontWeight: 700 }}
              >
                {greetingName ? `Hello ${greetingName}` : 'Assistant'}
              </Typography>
            )}
            {emptySubtitle || (
              <Typography
                variant="body2"
                sx={{ color: composerInk(theme, { muted: true }), mb: 2 }}
              >
                How can I help you today?
              </Typography>
            )}
            {suggestions.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, justifyContent: 'center' }}>
                {suggestions.map((s) => (
                  <Chip
                    key={s.label}
                    label={s.label}
                    onClick={() => send(s.text)}
                    sx={composerChipSx(theme, { variant: 'suggestion' })}
                  />
                ))}
              </Box>
            )}
          </Box>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <Box
              key={msg.id}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                // The bubble and the line under it hang off the same edge, so
                // alignItems replaces what justifyContent used to do here.
                alignItems: isUser ? 'flex-end' : 'flex-start',
                mb: 1.25,
              }}
            >
              <Box
                sx={{
                  maxWidth: '86%',
                  borderRadius: 2,
                  px: 1.5,
                  py: 1,
                  ...composerBubbleSx(theme, { isUser }),
                }}
              >
                {isUser ? (
                  <Typography
                    variant="body2"
                    sx={{ color: composerInk(theme), whiteSpace: 'pre-wrap' }}
                  >
                    {msg.text}
                  </Typography>
                ) : (
                  <AssistantMarkdown text={safeAssistantReply(msg.text)} />
                )}

                {!isUser && Array.isArray(msg.blocks) && msg.blocks.length > 0 && (
                  <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {msg.blocks.map((block, idx) => (
                      <ChatBlock key={block.id || `b-${idx}`} block={block} onOpen={onOpenEntity} />
                    ))}
                  </Box>
                )}

                {!isUser && Array.isArray(msg.pendingCalls) && msg.pendingCalls.length > 0 && (
                  <Box sx={{ mt: 0.5 }}>
                    {msg.pendingCalls.map((pc) => (
                      <ActionCard key={pc.id} proposal={pc} onConfirm={handleConfirm} />
                    ))}
                  </Box>
                )}
              </Box>
              <MessageMeta text={msg.text} at={msg.time} align={isUser ? 'right' : 'left'} />
            </Box>
          );
        })}

        {loading && <ThinkingIndicator />}
      </Box>

      {/* Attachment chips */}
      {attachments.length > 0 && (
        <Box sx={{ px: compact ? 1 : 2, pb: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {attachments.map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              size="small"
              onDelete={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}
              sx={{ maxWidth: 160 }}
            />
          ))}
        </Box>
      )}
      {attachError && (
        <Typography
          variant="caption"
          sx={{ color: theme.palette.error.light, px: compact ? 1 : 2 }}
        >
          {attachError}
        </Typography>
      )}

      {/* A max, so narrower hosts (the compact popper) are untouched. */}
      <Box
        data-testid="assistant-composer-measure"
        data-measure={composerMeasure}
        sx={{ width: '100%', maxWidth: composerMeasure, mx: 'auto' }}
      >
        {/* Composer card: optional pills on top, a tall text area, then a
            bottom toolbar (context + attach on the left, model + send on the right). */}
        <Box
          data-composer-text-entry=""
          sx={{
            display: 'flex',
            flexDirection: 'column',
            // Every number here is the Goal composer's (HeroPromptInput in
            // Dashboard.jsx). They are the same control in two tabs, so
            // switching tabs must not resize or reshape the box. The full
            // variant sits flush in its measure wrapper exactly as the Goal
            // card does; only the compact popper keeps an inset from its edges.
            gap: 0.5,
            m: compact ? 1 : 0,
            px: 1,
            pt: 0.75,
            pb: 0.75,
            borderRadius: 3,
            ...composerCardSx(theme),
          }}
        >
          {inputTopSlot && (
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: { xs: 0.75, sm: 1 },
                px: 0.5,
                pb: 0.25,
              }}
            >
              {inputTopSlot}
            </Box>
          )}
          {/* InputBase, not TextField: the Goal composer uses InputBase, and a
              standard-variant TextField wraps its input in a FormControl with
              its own chrome. Same primitive, same props, same height. */}
          <InputBase
            multiline
            minRows={2}
            maxRows={compact ? 6 : 8}
            placeholder="Ask anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            inputProps={{ 'aria-label': 'Ask anything', inputMode: 'text', enterKeyHint: 'send' }}
            sx={{
              width: '100%',
              color: composerInputColor(theme),
              fontSize: getHeroInputFontSize(isMobileTouch),
              px: 0.5,
              alignItems: 'flex-start',
              '& textarea': {
                overflow: 'auto !important',
                resize: 'none',
                lineHeight: 1.45,
              },
            }}
          />
          <Box
            data-testid="assistant-composer-actions"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              flexShrink: 0,
              pt: 0.5,
              px: 0.5,
            }}
          >
            <AttachButton
              onAdd={(a) => setAttachments((p) => [...p, a])}
              onError={(m) => setAttachError(m)}
              sx={composerToolIconSx(theme, { active: attachments.length > 0 })}
            />
            {onToggleDrawer && (
              <Tooltip title="Assistant context (Core, Org, Data, Insights)">
                <IconButton
                  size="small"
                  onClick={onToggleDrawer}
                  sx={composerToolIconSx(theme)}
                  aria-label="Open context"
                >
                  <TuneRoundedIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            )}
            <Box sx={{ flex: 1 }} />
            {onToggleTemplates && (
              <Tooltip
                title={`User templates ${useTemplates ? 'ON' : 'OFF'} — structured, model-independent answers`}
              >
                <Chip
                  size="small"
                  label={`Templates ${useTemplates ? 'On' : 'Off'}`}
                  onClick={() => onToggleTemplates(!useTemplates)}
                  aria-pressed={useTemplates}
                  sx={{
                    height: 24,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    ...composerChipSx(theme, { on: useTemplates }),
                  }}
                />
              </Tooltip>
            )}
            {onModelChange && (
              <ModelSwitcher provider={provider} model={model} onChange={onModelChange} />
            )}
            <Tooltip title="Send">
              <span>
                <IconButton
                  size="small"
                  disabled={!input.trim() || loading}
                  onClick={() => send(input)}
                  sx={composerSendSx(theme)}
                  aria-label="Send"
                >
                  <SendRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
      </Box>
    </Box>
  );
});

export default AssistantChat;
