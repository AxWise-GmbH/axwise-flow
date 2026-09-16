import { useEffect, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import ThreadMessage, { ThreadBubble, ThreadFacts } from './ThreadMessage';
import { THREAD_GLYPH } from './threadIcons';
import { THREAD_TYPE } from './threadTokens';
import SetupSwitch from './blocks/SetupSwitch';
import HumanApproveSwitch from './blocks/HumanApproveSwitch';
import Step1Blocks from './Step1Blocks';
import { buildTranscript } from './newGoalTranscript';
import { buildRunTranscript } from './goalRunTranscript';
import GoalRunMessage from './GoalRunMessages';
import { ActionChips } from '../../Goals/GoalLeadChatDialog';
import { DeliverableViewerProvider } from '../../Goals/deliverables/DeliverableViewer';
import { THREAD_MEASURE_PX, THREAD_WIDE_MEASURE_PX } from '../../../theme/measures';
import AxwiseScopeConfirmationPanel, {
  isAxwiseScopeClarification,
} from '../../Goals/AxwiseScopeConfirmationPanel';
import GoalContextApprovalDialog from '../../Goals/GoalContextApprovalDialog';

/** Distance from the bottom that still counts as "following along". */
const PINNED_SLACK_PX = 72;

// Re-exported so the thread, its footer and every existing consumer keep
// importing these from here; the numbers themselves are shared with the
// assistant composer and live in the theme.
export { THREAD_MEASURE_PX, THREAD_WIDE_MEASURE_PX };

/**
 * The wait, made legible.
 *
 * Analysis runs inline on the enqueue request and can legitimately take tens of
 * seconds. Showing three dots and nothing else makes a slow model and a dead
 * worker look identical, which is how a working system reads as a broken one.
 * So: elapsed time once it stops being instant, a plainer explanation once it
 * gets long, and a way out that does not require abandoning the goal.
 */
function Thinking({ startedAt, onSkip }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const seconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const slow = seconds >= 15;

  return (
    <Box
      role="status"
      aria-label="Analysing your request"
      sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, flexWrap: 'wrap' }}
    >
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          aria-hidden="true"
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            animation: 'goalThink 1.15s ease-in-out infinite',
            animationDelay: `${i * 0.15}s`,
            '@keyframes goalThink': {
              '0%, 100%': { opacity: 0.28, transform: 'translateY(0)' },
              '50%': { opacity: 1, transform: 'translateY(-3px)' },
            },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.6 },
          }}
        />
      ))}
      <Typography variant="caption" sx={{ ml: 0.5, color: 'text.secondary' }}>
        {slow ? 'Still working on your brief' : 'Reading your request'}
      </Typography>
      {startedAt && seconds > 2 && (
        <Typography
          variant="caption"
          sx={{ color: 'text.disabled', fontVariantNumeric: 'tabular-nums' }}
        >
          {seconds}s
        </Typography>
      )}
      {slow && onSkip && (
        <Button
          size="small"
          onClick={onSkip}
          sx={{ textTransform: 'none', fontSize: '0.7rem', minWidth: 0, py: 0, ml: 0.5 }}
        >
          Start without it
        </Button>
      )}
    </Box>
  );
}

function BriefCard({ message }) {
  const facts = [
    { label: 'Category', value: message.category },
    { label: 'Priority', value: message.priority },
    { label: 'Complexity', value: message.complexity },
    { label: 'Budget', value: `$${Number(message.budgetUsd || 0).toFixed(2)}` },
  ];
  return (
    <ThreadMessage
      card
      tone="ok"
      title="Brief ready"
      detail={message.title || null}
      meta={<ThreadFacts facts={facts} />}
    >
      {message.expectedResults && (
        <Typography
          variant="body2"
          sx={{ mt: 1.25, fontSize: THREAD_TYPE.detail, color: 'text.secondary' }}
        >
          <Box component="strong" sx={{ color: 'text.primary' }}>
            Expected:{' '}
          </Box>
          {message.expectedResults}
        </Typography>
      )}
    </ThreadMessage>
  );
}

/**
 * The viewer, where the thread can host one.
 *
 * A component rather than a ternary at the call site so the children keep the
 * same element identity either way - swapping a wrapper mid-run would remount
 * the whole conversation.
 */
function ThreadViewerHost({ enabled, children }) {
  if (!enabled) return children;
  return <DeliverableViewerProvider>{children}</DeliverableViewerProvider>;
}

/**
 * The Simple-mode goal, as one thread.

 * It covers both halves. Before the goal exists it is the form: the messages
 * carry the Setup switch, the blocks and Human Approve, live. Once it exists
 * the run reports into the same thread rather than swapping the screen for a
 * dashboard, so nothing the user wrote is left behind.
 *
 * Every message is derived by buildTranscript, so this component only decides
 * how a kind looks. The setup, blocks and approve messages host the same live
 * controls the old stacked form used, unchanged — dropping them into the thread
 * rather than reimplementing them is what keeps their behaviour and their tests.
 */
export default function GoalThread({
  form,
  transcriptState,
  run = null,
  onOpenReport = null,
  onSkipAnalysis = null,
  header = null,
  footer,
  // Widen the conversation to the full surface. Set from the send onward: the
  // empty greeting stays a column, everything after it is a screen.
  wide = false,
  // What the user and the team lead have said to each other since the goal
  // started, in order. Not persisted: the lead endpoint answers from the goal's
  // live state and the history the client sends back, so the thread is the
  // record. Each entry is { id, sender: 'user'|'lead'|'system', text, actions }.
  chat = [],
  // True while a message to the team lead is waiting on a reply.
  chatBusy = false,
  // Called with a line of text when a proposed action runs, so the outcome
  // lands in the conversation rather than vanishing.
  onChatNote = null,
  onScopeAnswered = null,
  fill = false,
  // This conversation is being reopened, not watched. It opens at its first
  // message rather than its last.
  openAtTop = false,
  // The sticky footer needs an opaque backing so messages scroll under it
  // rather than through it, and that backing has to match whatever surface
  // the host sits on: paper in the dialog, the page itself in the hero.
  surface = 'background.paper',
}) {
  // One expression for the column, published as an attribute too so a test can
  // read the measure the layout actually used rather than guessing at a class.
  const measure = wide ? THREAD_WIDE_MEASURE_PX : THREAD_MEASURE_PX;
  const scrollRef = useRef(null);
  const pinnedRef = useRef(true);
  const [contextReviewOpen, setContextReviewOpen] = useState(false);
  const setupMessages = buildTranscript(transcriptState);
  const runMessages = run ? buildRunTranscript(run) : [];
  const chatMessages = Array.isArray(chat) ? chat : [];
  const total =
    setupMessages.length + runMessages.length + chatMessages.length + (chatBusy ? 1 : 0);

  // Follow the thread only while the user is already at the bottom. These
  // messages carry switches and pickers; yanking the view mid-toggle because a
  // new message arrived would move the control out from under the pointer.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < PINNED_SLACK_PX;
  };

  // Follow new messages, but never on the first paint. The hero enters with
  // initialPrompt already set, so the transcript is several messages deep
  // before anything renders — scrolling then jumped straight past the intro,
  // the user's own request and the Setup card. A form has no business scrolling
  // itself; a live feed does, so only follow once the run is producing.
  const mountedRef = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (!pinnedRef.current || (runMessages.length === 0 && chatMessages.length === 0)) return;
    el.scrollTop = el.scrollHeight;
  }, [total, runMessages.length, chatMessages.length]);

  // A conversation reopened from History opens where it starts.
  //
  // Following the bottom is right for a run you are watching happen and wrong
  // for one you came back to read. A resumed goal loads its log asynchronously,
  // so the effect above fired on the first batch of messages with the scroller
  // still counted as pinned - and dropped the user at the last line of a run
  // that had already finished, past everything they clicked the row to see.
  //
  // Unpinning rather than scrolling is the whole fix: the box is already at the
  // top, and new messages append below it. Once the user scrolls down to the
  // live end themselves, handleScroll pins it again and a still-running goal
  // follows along as before.
  //
  // Keyed on the goal so opening a second row from History repositions. The
  // host swaps this component's props rather than remounting it.
  const resumeKey = openAtTop ? run?.goal?.id || 'pending' : null;
  useEffect(() => {
    if (!resumeKey) return;
    pinnedRef.current = false;
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [resumeKey]);

  // A turn with the team lead. The user's line is the same bubble as the
  // request, so asking reads as one conversation rather than a second chat
  // bolted under the first; the lead answers in the same bubble the intro
  // used, with any proposed actions under the reply.
  const renderChat = (message) => {
    if (message.sender === 'user') {
      return (
        <ThreadBubble mine enter copyText={message.text} at={message.at || null}>
          {message.text}
        </ThreadBubble>
      );
    }
    if (message.sender === 'system') {
      const warn = /^[⚠!]/.test(String(message.text || ''));
      const title = String(message.text || '')
        .replace(/^[✓⚠!]\s*/, '')
        .trim();
      return <ThreadMessage tone={warn ? 'warn' : 'ok'} title={title} at={message.at || null} />;
    }
    return (
      <ThreadBubble who="Team lead" enter copyText={message.text} at={message.at || null}>
        <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>
          {message.text}
        </Box>
        {message.actions?.length > 0 && (
          <ActionChips actions={message.actions} goal={run?.goal || null} onResult={onChatNote} />
        )}
      </ThreadBubble>
    );
  };

  const render = (message) => {
    switch (message.kind) {
      case 'intro':
        return <ThreadBubble>{message.text}</ThreadBubble>;

      case 'request':
        return (
          <ThreadBubble mine enter={message.sent}>
            {message.text}
          </ThreadBubble>
        );

      case 'setup':
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <SetupSwitch manual={form.setupManual} onChange={form.onSetupManualChange} />
            {/* Three across, not three stacked. Full-width banners were taking
                236px of a ~500px thread and pushing the conversation off the
                top of the screen. */}
            <Step1Blocks
              manual={form.setupManual || message.forced}
              form={form}
              layout="row"
              numbered={false}
            />
          </Box>
        );

      case 'approve':
        return (
          <HumanApproveSwitch
            enabled={form.humanApprove}
            onChange={form.onHumanApproveChange}
            label="Execution approval"
          />
        );

      case 'thinking':
        return <Thinking startedAt={message.startedAt} onSkip={onSkipAnalysis} />;

      case 'brief':
        return <BriefCard message={message} />;

      case 'error':
        // An error is a message in the conversation, not a banner bolted to the
        // top of it: same card, same slots, warning tone.
        return (
          <ThreadMessage card tone="warn" title="That did not work" detail={message.message} />
        );

      case 'launched':
        return (
          <ThreadMessage
            card
            tone="accent"
            title="Started"
            // SmartRequestDialog already puts the goal title in its run bar.
            // Repeat it only when GoalThread is embedded without a header.
            detail={header ? null : message.title}
            glyph={THREAD_GLYPH.launched}
            titleAdornment={
              onOpenReport ? (
                <Button
                  size="small"
                  onClick={() => onOpenReport(message.goalId)}
                  sx={{ flexShrink: 0, textTransform: 'none', fontSize: '0.72rem', minHeight: 0 }}
                >
                  Full detail
                </Button>
              ) : null
            }
          />
        );

      default:
        return null;
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        // The deliverable viewer rises over this box, absolutely positioned
        // against it, so a result file is read where it was found rather than
        // in a new tab. Deliberately no `overflow: hidden` alongside it: the
        // non-fill footer is sticky, and an overflow ancestor would change its
        // containing block.
        ...(fill ? { position: 'relative' } : {}),
        // `fill` bounds the thread and scrolls it internally, for a host that
        // gives this a definite height. Without it the thread grows naturally
        // and the host scrolls, which is what a dialog wants — nesting a second
        // scroller inside DialogContent would trap the wheel.
        ...(fill ? { flex: 1, minHeight: 0 } : {}),
      }}
    >
      {/* Only where the thread is a bounded box. The viewer covers its
          positioned ancestor edge to edge, which is right for a thread that
          owns a definite height and scrolls inside it. Where the host scrolls
          instead, the thread is as tall as its content - a long run put the
          viewer's own header, and its close button, thousands of pixels above
          the viewport. The deliverable groups already treat a missing viewer
          as "offer Download and Open, not View", so that surface simply keeps
          the behaviour it has today.

          Mounted for every bounded thread, not only finished ones: swapping
          the element at this position when a goal completes would remount the
          conversation and take the scroll position and the composer's focus
          with it. */}
      <ThreadViewerHost enabled={fill}>
        <Box
          ref={scrollRef}
          onScroll={handleScroll}
          data-testid="goal-thread"
          data-measure={measure}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            pb: 2,
            px: { xs: 0, sm: 0.5 },
            textAlign: 'left',
            // A wide surface should not stretch a sentence across 1180px. The
            // column reads at a comfortable measure and stays centred; the cards
            // inside it take the full column width.
            width: '100%',
            maxWidth: measure,
            mx: 'auto',
            // Matches the hero's own 320ms max-width transition, so the surface
            // and the thread inside it open as one movement.
            transition: 'max-width 320ms cubic-bezier(.22,1,.36,1)',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            ...(fill
              ? {
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  // Stop the wheel chaining into the page behind the thread once
                  // it reaches either end.
                  overscrollBehavior: 'contain',
                }
              : {}),
          }}
        >
          {/* The run header scrolls with the conversation rather than hovering
            over it, and sits in the same column as everything else. The view
            switch does not live here: a long run would scroll it out of reach,
            so it rides the pinned composer instead. */}
          {header && <Box sx={{ mb: 0.5 }}>{header}</Box>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {setupMessages.map((message) => (
              <Box key={message.id}>{render(message)}</Box>
            ))}
            {runMessages.map((message) => (
              <Box key={message.id}>
                <GoalRunMessage
                  message={message}
                  goal={run?.goal || null}
                  onOpenDetails={onOpenReport}
                  onReviewContext={() => setContextReviewOpen(true)}
                />
              </Box>
            ))}
            {isAxwiseScopeClarification(run?.goal) && (
              <Box key="axwise-scope-confirmation">
                <AxwiseScopeConfirmationPanel goal={run.goal} onAnswered={onScopeAnswered} />
              </Box>
            )}
            {chatMessages.map((message, index) => (
              <Box key={message.id || `chat-${index}`}>{renderChat(message)}</Box>
            ))}
            {chatBusy && (
              <Box role="status" aria-label="Team lead is replying">
                <ThreadBubble who="Team lead">
                  <Box
                    component="span"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, py: 0.25 }}
                  >
                    {[0, 1, 2].map((i) => (
                      <Box
                        key={i}
                        aria-hidden="true"
                        sx={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          bgcolor: 'text.secondary',
                          animation: 'goalThink 1.15s ease-in-out infinite',
                          animationDelay: `${i * 0.15}s`,
                          '@keyframes goalThink': {
                            '0%, 100%': { opacity: 0.28, transform: 'translateY(0)' },
                            '50%': { opacity: 1, transform: 'translateY(-3px)' },
                          },
                          '@media (prefers-reduced-motion: reduce)': {
                            animation: 'none',
                            opacity: 0.6,
                          },
                        }}
                      />
                    ))}
                  </Box>
                </ThreadBubble>
              </Box>
            )}
          </Box>
        </Box>
        {footer && (
          <Box
            sx={{
              flexShrink: 0,
              pt: 1,
              pb: 0.5,
              ...(fill ? {} : { position: 'sticky', bottom: 0, bgcolor: surface }),
            }}
          >
            {/* No status line above the composer. It restated, in two shorter
              sentences, whatever the newest stage message in the thread had
              just said - and it said it in the one place the eye lands before
              typing. The thread is the status; a second copy of it pinned over
              the composer was only pushing the conversation up a row.

              The composer keeps the reading measure whatever the thread above
              it does. Widening the box you type one sentence into buys nothing
              and costs the line length that makes it readable. */}
            <Box
              data-testid="goal-thread-footer"
              data-measure={THREAD_MEASURE_PX}
              sx={{ width: '100%', maxWidth: THREAD_MEASURE_PX, mx: 'auto' }}
            >
              {footer}
            </Box>
          </Box>
        )}
        {run?.goal?.status === 'awaiting_context_approval' && (
          <GoalContextApprovalDialog
            open={contextReviewOpen}
            onClose={() => setContextReviewOpen(false)}
            goal={run.goal}
            onAction={() => {
              setContextReviewOpen(false);
              onScopeAnswered?.();
            }}
          />
        )}
      </ThreadViewerHost>
    </Box>
  );
}
