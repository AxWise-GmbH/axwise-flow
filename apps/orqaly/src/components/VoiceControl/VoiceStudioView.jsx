import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Tooltip,
  Fade,
  Chip,
  Badge,
  Paper,
  Skeleton,
  useTheme,
  alpha,
  keyframes,
} from '@mui/material';
import MicOutlinedIcon from '@mui/icons-material/MicOutlined';
import StopOutlinedIcon from '@mui/icons-material/StopOutlined';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import AddTaskRoundedIcon from '@mui/icons-material/AddTaskRounded';
import WbSunnyRoundedIcon from '@mui/icons-material/WbSunnyRounded';
import BalanceRoundedIcon from '@mui/icons-material/BalanceRounded';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import AiOrb from './AiOrb';
import ModePill from './ModePill';
import CommandPalette from './CommandPalette';
import ChatBlock from './chat-blocks/index.jsx';
import ActionCard from './ActionCard.jsx';
import ModelSwitcher from './ModelSwitcher.jsx';
import AttachButton from './AttachButton.jsx';
import { HOME_TILES } from './capabilities.js';

import AppIcon from '../icons/AppIcon';

/**
 * Map server-returned icon name strings → MUI icon components.
 * Unknown names fall back to BoltRoundedIcon.
 */
const ICON_MAP = {
  AddTaskRounded: AddTaskRoundedIcon,
  WbSunnyRounded: WbSunnyRoundedIcon,
  BalanceRounded: BalanceRoundedIcon,
  AssessmentRounded: AssessmentRoundedIcon,
  ChatBubbleOutlineRounded: ChatBubbleOutlineRoundedIcon,
  StorefrontRounded: StorefrontRoundedIcon,
  HourglassEmptyRounded: HourglassEmptyRoundedIcon,
  AssignmentTurnedInRounded: AssignmentTurnedInRoundedIcon,
  CalendarMonthOutlined: CalendarMonthOutlinedIcon,
  AccountTreeOutlined: AccountTreeOutlinedIcon,
  ReplayRounded: ReplayRoundedIcon,
  BoltRounded: BoltRoundedIcon,
};

function resolveIcon(name) {
  return ICON_MAP[name] || BoltRoundedIcon;
}

/** Local fallback banner set — rendered when the server fetch fails so the
 *  home screen stays usable even when the API is down. */
const FALLBACK_BANNERS = [
  {
    id: 'fb-goal',
    title: 'CREATE A GOAL',
    description: 'Start the autonomous pipeline.',
    icon: 'AddTaskRounded',
    text: 'I want to create a new goal',
  },
  {
    id: 'fb-briefing',
    title: 'DAILY BRIEFING',
    description: 'Tasks, goals, alerts at a glance.',
    icon: 'WbSunnyRounded',
    text: 'Give me my daily briefing',
  },
  {
    id: 'fb-consilium',
    title: 'ASK THE CONSILIUM',
    description: 'Multi-perspective AI board discussion.',
    icon: 'BalanceRounded',
    text: "Let's discuss with the consilium",
  },
  {
    id: 'fb-report',
    title: 'GENERATE A REPORT',
    description: 'Finance, partner perf, ops, executive.',
    icon: 'AssessmentRounded',
    text: 'Generate a smart report',
  },
  {
    id: 'fb-talk',
    title: "LET'S TALK",
    description: 'Brainstorm — no actions taken.',
    icon: 'ChatBubbleOutlineRounded',
    text: "Let's just think through something together",
  },
  {
    id: 'fb-marketplace',
    title: 'BROWSE THE MARKETPLACE',
    description: 'Skills, tools, replicators.',
    icon: 'StorefrontRounded',
    text: "Show me what's on the marketplace",
  },
];

/* ── Animations ── */

const dotsWave = keyframes`
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.6); }
  40%            { opacity: 1;   transform: scale(1); }
`;

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
`;

/* Capability tiles are sourced from ./capabilities.js so the same catalog
 * powers both the home tiles and the slash-command palette. */

/**
 * Voice Studio View — immersive full-screen voice AI interface with full conversation.
 *
 * When there's no chat history → shows the AI orb greeting.
 * When conversation starts   → scrolls up the orb and shows a beautiful
 *                               dark-themed chat thread below it with all
 *                               the same capability as the classic view.
 */
export default function VoiceStudioView({
  userName = '',
  isRecording = false,
  isPaused = false,
  isProcessing = false,
  isAssistantSpeaking = false,
  transcript = '',
  chatHistory = [],
  error = null,
  actions = [],
  executableActions = [],
  onToggleMic,
  onSubmitText,
  onParseText,
  isSupported = true,
  renderFormattedAssistantText,
  formatMessageTime,
  // Mobile actions
  onOpenMobileActions,
  isMobile = false,
  // Mode (Do / Talk) + home summary
  mode = 'execute',
  onModeChange,
  homeSummary = null,
  homeSummaryLoading = false,
  // Dynamic banner data (server-driven). When provided, replaces HOME_TILES.
  banners = null,
  bannersLoading = false,
  bannersError = false,
  // Greeting (server-driven; falls back to derived firstName from userName).
  greeting = null,
  // Open-entity callback for inline chat blocks ({ type, entityId, ... }).
  onOpenEntity,
  // Copilot: confirm a proposed action, and switch LLM provider/model.
  onConfirmAction,
  copilotProvider,
  copilotModel,
  onCopilotModelChange,
  // Prefill the input with text (used by the ToolCatalogBrowser picks).
  // prefillNonce changes on each pick so identical templates retrigger the effect.
  prefillText = '',
  prefillNonce = 0,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { main, light, dark } = theme.palette.primary;

  const [localText, setLocalText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  // Callback ref for the input wrapper — React schedules a render after the
  // DOM node is attached, so reading this in render (e.g. as Popper anchor)
  // is safe. A plain useRef would read .current during render, which lint
  // (and React 19) flag.
  const [inputAnchorEl, setInputAnchorEl] = useState(null);
  const inputRef = useRef(null);
  const paletteKeyHandlerRef = useRef(null);
  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Sync external transcript into local text
  useEffect(() => {
    if (transcript) setLocalText(transcript);
  }, [transcript]);

  // Apply prefill (from catalog picks) — nonce changes drive re-application.
  useEffect(() => {
    if (!prefillNonce) return;
    setLocalText(prefillText || '');
    setPaletteOpen(false);
    setTimeout(() => {
      const input = inputRef.current?.querySelector('textarea, input');
      if (input) {
        input.focus();
        try {
          const len = (prefillText || '').length;
          input.setSelectionRange(len, len);
        } catch {
          /* no-op */
        }
      }
    }, 50);
  }, [prefillNonce, prefillText]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatHistory.length > 0) {
      const t = setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 120);
      return () => clearTimeout(t);
    }
  }, [chatHistory.length, isAssistantSpeaking]);

  const handleSend = () => {
    const text = localText.trim();
    if (!text) return;
    const attachmentFiles = attachments.map((a) => a.file);
    if (onSubmitText) onSubmitText(text, { attachmentFiles });
    else if (onParseText) onParseText(text);
    setLocalText('');
    setAttachments([]);
    setPaletteOpen(false);
  };

  const handleTileClick = (tile) => {
    if (tile.mode && onModeChange) onModeChange(tile.mode);
    if (onSubmitText) onSubmitText(tile.text);
    else if (onParseText) onParseText(tile.text);
  };

  /* ── Slash-command palette wiring ── */
  const handleTextChange = (e) => {
    const v = e.target.value;
    setLocalText(v);
    // Open palette when input starts with '/' and contains no spaces yet
    if (v.startsWith('/') && !v.includes(' ')) {
      setPaletteOpen(true);
      setPaletteQuery(v.slice(1));
    } else {
      setPaletteOpen(false);
    }
  };

  const handlePaletteSelect = (cmd) => {
    setPaletteOpen(false);
    setLocalText(cmd.template);
    // Focus + place caret at first placeholder
    setTimeout(() => {
      const input = inputRef.current?.querySelector('textarea, input');
      if (!input) return;
      input.focus();
      const idx = cmd.template.indexOf('[');
      const end = cmd.template.indexOf(']', idx);
      if (idx >= 0 && end > idx) {
        try {
          input.setSelectionRange(idx, end + 1);
        } catch {
          /* not all inputs support setSelectionRange */
        }
      }
    }, 0);
  };

  const handleInputKeyDown = (e) => {
    // Forward to palette first if open
    if (paletteOpen && paletteKeyHandlerRef.current) {
      const handled = paletteKeyHandlerRef.current(e);
      if (handled) return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      setPaletteOpen(false);
    }
  };

  const placeholder = useMemo(() => {
    if (isRecording) return 'Listening...';
    if (isProcessing) return 'Searching...';
    if (mode === 'talk') return 'Think out loud…';
    return 'Ask anything…  or type / for commands';
  }, [isRecording, isProcessing, mode]);

  // Derive orb state
  const orbState = isRecording
    ? 'listening'
    : isProcessing
      ? 'searching'
      : isAssistantSpeaking
        ? 'speaking'
        : 'idle';

  const firstName = greeting?.firstName || (userName ? userName.split(' ')[0] : '');
  const hasChat = chatHistory.length > 0;

  /* Resolve the banner list to render. Priority:
   *   1) banners prop (server-driven, includes count chips + showProgress)
   *   2) FALLBACK_BANNERS when bannersError is true (fetch failed)
   *   3) Static HOME_TILES (back-compat, used when no server data attempted)
   * isLoadingHome causes 5 skeleton placeholders to render instead. */
  const isLoadingHome = bannersLoading && !banners;
  const usingDynamic = !!banners;
  const usingFallback = bannersError && !banners;
  const tilesToRender = usingDynamic ? banners : usingFallback ? FALLBACK_BANNERS : HOME_TILES;

  /* ── Glass card styling for messages ── */
  const glassCard = (isUser) => ({
    p: { xs: 1.5, sm: 2 },
    borderRadius: 3,
    borderTopRightRadius: isUser ? 6 : 16,
    borderTopLeftRadius: isUser ? 16 : 6,
    bgcolor: isUser
      ? alpha(main, isDark ? 0.25 : 0.3)
      : alpha(isDark ? '#ffffff' : '#000000', isDark ? 0.07 : 0.06),
    color: '#fff',
    border: '1px solid',
    borderColor: isUser ? alpha(main, 0.35) : alpha('#ffffff', isDark ? 0.08 : 0.1),
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    boxShadow: isUser ? `0 4px 20px ${alpha(main, 0.2)}` : `0 2px 12px ${alpha('#000000', 0.15)}`,
    '& pre': { maxWidth: '100%', overflowX: 'auto' },
    /* Override text colours for dark-on-dark readability */
    '& .MuiTypography-root': { color: '#fff' },
    '& pre, & code': {
      color: alpha('#ffffff', 0.9),
      bgcolor: alpha('#000000', 0.25),
      borderColor: alpha('#ffffff', 0.1),
    },
  });

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        /* Background: deep dark → primary glow at bottom */
        background: isDark
          ? `linear-gradient(180deg, #050810 0%, ${alpha(dark, 0.2)} 60%, ${alpha(main, 0.15)} 100%)`
          : `linear-gradient(180deg, ${alpha(dark, 0.92)} 0%, ${alpha(dark, 0.6)} 50%, ${alpha(main, 0.3)} 100%)`,
        minHeight: 0,
      }}
    >
      {/* ── Scrollable content area ── */}
      <Box
        ref={chatContainerRef}
        sx={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          /* Scrollbar styling for dark bg */
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: alpha('#ffffff', 0.15),
            borderRadius: 3,
          },
        }}
      >
        {/* ── Orb Section ── */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pt: hasChat ? { xs: 3, sm: 4 } : { xs: 6, sm: 10 },
            pb: hasChat ? { xs: 2, sm: 3 } : { xs: 4, sm: 6 },
            px: 3,
            flexShrink: 0,
            transition: 'padding 0.5s ease',
          }}
        >
          <AiOrb state={orbState} size={hasChat ? (isMobile ? 80 : 100) : isMobile ? 140 : 180} />

          {/* Greeting — only when empty */}
          {!hasChat && (
            <Fade in timeout={600}>
              <Box
                sx={{
                  textAlign: 'center',
                  mt: { xs: 3, sm: 4 },
                  animation: `${fadeInUp} 0.6s ease-out`,
                }}
              >
                {firstName && (
                  <Typography
                    variant="body1"
                    sx={{
                      color: alpha('#ffffff', 0.5),
                      fontSize: { xs: '0.9rem', sm: '1rem' },
                      mb: 1,
                      letterSpacing: 0.3,
                    }}
                  >
                    Hello {firstName}
                  </Typography>
                )}
                <Typography
                  variant="h4"
                  sx={{
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: { xs: '1.5rem', sm: '2rem', md: '2.25rem' },
                    lineHeight: 1.25,
                    letterSpacing: '-0.02em',
                  }}
                >
                  How can I help
                  <br />
                  you today?
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: alpha('#ffffff', 0.4),
                    mt: 2,
                    maxWidth: 380,
                    mx: 'auto',
                    fontSize: { xs: '0.8rem', sm: '0.875rem' },
                  }}
                >
                  Ask me to analyze data, create projects, manage partners, or just chat about your
                  business.
                </Typography>

                {/* Vertical banners 1:1 with example */}
                <Tooltip
                  title={usingFallback ? 'Showing default suggestions (live data unavailable)' : ''}
                  arrow
                  placement="top"
                  disableHoverListener={!usingFallback}
                  disableFocusListener={!usingFallback}
                  disableTouchListener={!usingFallback}
                >
                  <Typography
                    variant="overline"
                    sx={{
                      display: 'inline-block',
                      mt: 4,
                      mb: 2,
                      color: usingFallback
                        ? alpha(theme.palette.warning.light, 0.85)
                        : alpha('#ffffff', 0.6),
                      fontSize: { xs: '0.7rem', sm: '0.75rem' },
                      letterSpacing: '0.2em',
                      fontWeight: 700,
                      cursor: usingFallback ? 'help' : 'default',
                    }}
                  >
                    What&apos;s on your mind?
                  </Typography>
                </Tooltip>
                <Box
                  sx={{
                    width: '100%',
                    maxWidth: 420,
                    mx: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.25,
                  }}
                >
                  {/* Loading skeletons preserve layout while banners are fetched */}
                  {isLoadingHome &&
                    [0, 1, 2, 3, 4].map((i) => (
                      <Skeleton
                        key={`bskel-${i}`}
                        variant="rounded"
                        width="100%"
                        height={80}
                        sx={{ bgcolor: alpha('#ffffff', 0.05), borderRadius: 2.5 }}
                      />
                    ))}

                  {!isLoadingHome &&
                    tilesToRender.map((tile) => {
                      // Dynamic banners use string icon names; legacy HOME_TILES use component refs.
                      const Icon =
                        typeof tile.icon === 'string'
                          ? resolveIcon(tile.icon)
                          : tile.icon || BoltRoundedIcon;
                      // Live count: prefer banner-supplied count, then map legacy liveCountKey.
                      const liveCount =
                        typeof tile.count === 'number'
                          ? tile.count
                          : tile.liveCountKey && homeSummary
                            ? homeSummary[tile.liveCountKey]
                            : undefined;
                      const showCount = typeof liveCount === 'number';
                      const showSkeleton =
                        !usingDynamic && tile.liveCountKey && homeSummaryLoading && !homeSummary;
                      return (
                        <Paper
                          key={tile.id}
                          elevation={0}
                          role="button"
                          aria-label={`${tile.title} — ${tile.description}`}
                          tabIndex={0}
                          onClick={() => handleTileClick(tile)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleTileClick(tile);
                            }
                          }}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            p: 1.5,
                            borderRadius: 2.5,
                            minHeight: 80,
                            bgcolor: alpha('#000000', 0.35),
                            backdropFilter: 'blur(12px)',
                            border: '1px solid',
                            borderColor: alpha(main, 0.2),
                            boxShadow: `-4px 0 20px ${alpha(main, 0.15)}, 0 2px 12px ${alpha('#000000', 0.3)}, inset 0 1px 0 ${alpha('#ffffff', 0.04)}`,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            outline: 'none',
                            '&:hover, &:focus-visible': {
                              bgcolor: alpha('#000000', 0.45),
                              borderColor: alpha(main, 0.4),
                              boxShadow: `-6px 0 28px ${alpha(main, 0.25)}, 0 4px 16px ${alpha('#000000', 0.4)}`,
                              transform: 'translateX(2px)',
                            },
                            '&:active': { transform: 'translateX(0)' },
                          }}
                        >
                          {/* Left icon */}
                          <Box
                            sx={{
                              flexShrink: 0,
                              width: 56,
                              height: 56,
                              borderRadius: 2,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              bgcolor: alpha(main, 0.12),
                              color: light,
                            }}
                          >
                            <AppIcon fallback={Icon} sx={{ fontSize: 28 }} />
                          </Box>
                          {/* Right: title, description, live count chip */}
                          <Box
                            sx={{
                              flex: 1,
                              minWidth: 0,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              position: 'relative',
                              pr: 3,
                            }}
                          >
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                flexWrap: 'wrap',
                              }}
                            >
                              <Typography
                                variant="body2"
                                sx={{
                                  color: '#fff',
                                  fontWeight: 700,
                                  fontSize: { xs: '0.7rem', sm: '0.75rem' },
                                  letterSpacing: '0.06em',
                                  lineHeight: 1.3,
                                  textTransform: 'uppercase',
                                }}
                              >
                                {tile.title}
                              </Typography>
                              {showSkeleton && (
                                <Skeleton
                                  variant="rounded"
                                  width={42}
                                  height={16}
                                  sx={{ bgcolor: alpha('#ffffff', 0.08) }}
                                />
                              )}
                              {showCount && (
                                <Chip
                                  size="small"
                                  label={`${liveCount} ${tile.liveCountLabel || ''}`.trim()}
                                  sx={{
                                    height: 18,
                                    fontSize: '0.62rem',
                                    fontWeight: 700,
                                    bgcolor: alpha(light, 0.18),
                                    color: light,
                                    border: '1px solid',
                                    borderColor: alpha(light, 0.3),
                                    '& .MuiChip-label': { px: 0.75 },
                                  }}
                                />
                              )}
                            </Box>
                            <Typography
                              variant="caption"
                              sx={{
                                color: alpha('#ffffff', 0.5),
                                fontSize: { xs: '0.7rem', sm: '0.75rem' },
                                mt: 0.25,
                                lineHeight: 1.35,
                              }}
                            >
                              {tile.description}
                            </Typography>
                            <Box
                              sx={{
                                position: 'absolute',
                                right: 0,
                                bottom: 0,
                                color: light,
                                opacity: 0.9,
                              }}
                            >
                              <AppIcon
                                name="GraphicEq"
                                fallback={GraphicEqIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </Box>
                          </Box>
                        </Paper>
                      );
                    })}
                </Box>
              </Box>
            </Fade>
          )}

          {/* Status text when processing/speaking but no chat yet */}
          {!hasChat && (isProcessing || isRecording) && (
            <Fade in timeout={300}>
              <Typography
                variant="body1"
                sx={{
                  color: alpha('#ffffff', 0.7),
                  mt: 2,
                  fontStyle: isRecording ? 'italic' : 'normal',
                  fontSize: { xs: '0.95rem', sm: '1.1rem' },
                }}
              >
                {isRecording ? transcript || 'Listening...' : 'Searching...'}
              </Typography>
            </Fade>
          )}
        </Box>

        {/* ── Error ── */}
        {error && (
          <Box
            sx={{
              mx: { xs: 2, sm: 4 },
              mb: 1.5,
              p: 1.5,
              borderRadius: 2.5,
              bgcolor: alpha(theme.palette.error.main, 0.15),
              border: '1px solid',
              borderColor: alpha(theme.palette.error.main, 0.4),
              color: theme.palette.error.light,
              fontSize: { xs: '0.78rem', sm: '0.85rem' },
              fontWeight: 500,
              textAlign: 'center',
              backdropFilter: 'blur(8px)',
            }}
          >
            {error}
          </Box>
        )}

        {/* ── Chat Messages ── */}
        {hasChat && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: { xs: 1.5, sm: 2 },
              px: { xs: 1.5, sm: 4, md: 6 },
              pb: 2,
            }}
          >
            {chatHistory.map((msg) => {
              const isUser = msg.role === 'user';
              const hasStoredActions =
                msg.role === 'assistant' && Array.isArray(msg.actions) && msg.actions.length > 0;

              return (
                <Fade in key={msg.id} timeout={400}>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isUser ? 'flex-end' : 'flex-start',
                      maxWidth: { xs: '92%', sm: '80%', md: '70%' },
                      alignSelf: isUser ? 'flex-end' : 'flex-start',
                    }}
                  >
                    {/* Message bubble */}
                    <Box sx={glassCard(isUser)}>
                      {isUser ? (
                        <Typography
                          variant="body1"
                          sx={{
                            whiteSpace: 'pre-wrap',
                            fontSize: { xs: '0.875rem', sm: '1rem' },
                            wordBreak: 'break-word',
                            color: '#fff',
                          }}
                        >
                          {msg.message}
                        </Typography>
                      ) : renderFormattedAssistantText ? (
                        renderFormattedAssistantText(msg.message)
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{
                            lineHeight: 1.65,
                            whiteSpace: 'pre-wrap',
                            fontSize: { xs: '0.875rem', sm: '0.95rem' },
                            wordBreak: 'break-word',
                            color: '#fff',
                          }}
                        >
                          {msg.message}
                        </Typography>
                      )}

                      {/* Inline entity blocks (goal/task/workflow/report/…) */}
                      {!isUser && Array.isArray(msg.blocks) && msg.blocks.length > 0 && (
                        <Box
                          sx={{
                            mt: 1.25,
                            pt: 1.25,
                            borderTop: '1px solid',
                            borderColor: alpha('#ffffff', 0.08),
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 0.75,
                          }}
                        >
                          {msg.blocks.map((block, idx) => (
                            <ChatBlock
                              key={block.id || `block-${idx}`}
                              block={block}
                              onOpen={onOpenEntity}
                              surfaceTone="dark"
                            />
                          ))}
                        </Box>
                      )}

                      {/* Confirmation-gated proposed actions (Create Goal / Retry / …) */}
                      {!isUser &&
                        Array.isArray(msg.pendingCalls) &&
                        msg.pendingCalls.length > 0 && (
                          <Box sx={{ mt: 0.5 }}>
                            {msg.pendingCalls.map((pc) => (
                              <ActionCard key={pc.id} proposal={pc} onConfirm={onConfirmAction} />
                            ))}
                          </Box>
                        )}
                    </Box>

                    {/* Meta row: sender + time + action chips */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        mt: 0.5,
                        px: 0.5,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 500,
                          fontSize: { xs: '0.65rem', sm: '0.72rem' },
                          color: alpha('#ffffff', 0.4),
                        }}
                      >
                        {isUser ? 'You' : 'AI Assistant'}
                        {formatMessageTime ? ` \u2022 ${formatMessageTime(msg.time)}` : ''}
                      </Typography>
                      {hasStoredActions && (
                        <Chip
                          size="small"
                          label="View actions"
                          icon={
                            <AppIcon
                              name="BoltRounded"
                              fallback={BoltRoundedIcon}
                              sx={{
                                fontSize: '14px !important',
                                color: `${alpha('#ffffff', 0.7)} !important`,
                              }}
                            />
                          }
                          onClick={() => onParseText && onParseText('', msg.actions)}
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            cursor: 'pointer',
                            bgcolor: alpha('#ffffff', 0.1),
                            color: '#fff',
                            borderColor: alpha('#ffffff', 0.15),
                            '&:hover': { bgcolor: alpha('#ffffff', 0.18) },
                          }}
                          variant="outlined"
                        />
                      )}
                      {!isUser && msg.message && (
                        <Tooltip title="Copy">
                          <IconButton
                            size="small"
                            onClick={() => navigator.clipboard?.writeText(msg.message)}
                            sx={{
                              p: 0.25,
                              color: alpha('#ffffff', 0.3),
                              '&:hover': { color: alpha('#ffffff', 0.7) },
                            }}
                          >
                            <AppIcon
                              name="ContentCopyRounded"
                              fallback={ContentCopyRoundedIcon}
                              sx={{ fontSize: 13 }}
                            />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                </Fade>
              );
            })}

            {/* Typing / processing indicator */}
            {(isAssistantSpeaking || isProcessing) &&
              chatHistory[chatHistory.length - 1]?.role === 'user' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1 }}>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {[0, 1, 2].map((i) => (
                      <Box
                        key={i}
                        sx={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          bgcolor: alpha(light, 0.6),
                          animation: `${dotsWave} 1.4s ease-in-out ${i * 0.16}s infinite`,
                        }}
                      />
                    ))}
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{ color: alpha('#ffffff', 0.4), fontSize: '0.75rem' }}
                  >
                    {isProcessing ? 'Thinking...' : 'Speaking...'}
                  </Typography>
                </Box>
              )}

            <div ref={chatEndRef} />
          </Box>
        )}
      </Box>
      {/* ── View Actions bar — hidden in Talk mode ── */}
      {mode !== 'talk' && (
        <Box
          onClick={onOpenMobileActions}
          role="button"
          aria-label={`View ${executableActions.length} pending action${executableActions.length === 1 ? '' : 's'}`}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            py: 0.6,
            px: 2,
            bgcolor: alpha(main, 0.15),
            borderTop: '1px solid',
            borderColor: alpha(main, 0.25),
            cursor: 'pointer',
            transition: 'all 0.2s',
            flexShrink: 0,
            '&:active': { bgcolor: alpha(main, 0.25) },
          }}
        >
          <Badge
            badgeContent={executableActions.length}
            sx={{
              '& .MuiBadge-badge': {
                fontSize: '0.65rem',
                minWidth: 18,
                height: 18,
                bgcolor: main,
                color: '#fff',
              },
            }}
          >
            <AppIcon
              name="BoltRounded"
              fallback={BoltRoundedIcon}
              sx={{ fontSize: 18, color: light }}
            />
          </Badge>
          <Typography variant="caption" sx={{ fontWeight: 700, color: light, fontSize: '0.75rem' }}>
            View Actions
          </Typography>
          <AppIcon
            name="ExpandMoreRounded"
            fallback={ExpandMoreRoundedIcon}
            sx={{ fontSize: 16, color: light, transform: 'rotate(180deg)' }}
          />
        </Box>
      )}
      {/* ── Bottom: Mode pill + Input bar ── */}
      <Box
        sx={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pb: { xs: 'calc(10px + env(safe-area-inset-bottom, 0px))', sm: 3 },
          pt: 1.5,
          px: { xs: 1.5, sm: 3 },
          zIndex: 2,
          flexShrink: 0,
        }}
      >
        {onModeChange && (
          <Box sx={{ width: '100%', maxWidth: 640 }}>
            <ModePill mode={mode} onChange={onModeChange} />
          </Box>
        )}
        <Box
          ref={setInputAnchorEl}
          sx={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            maxWidth: 640,
            minHeight: { xs: 48, sm: 54 },
            borderRadius: 100,
            /* Frosted glass pill */
            bgcolor: alpha(isDark ? '#ffffff' : main, isDark ? 0.08 : 0.12),
            border: '1px solid',
            borderColor: alpha(isDark ? '#ffffff' : light, isDark ? 0.12 : 0.25),
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: `0 4px 30px ${alpha(main, 0.12)}, inset 0 1px 0 ${alpha('#ffffff', isDark ? 0.06 : 0.15)}`,
            px: { xs: 0.5, sm: 1 },
            gap: 0.5,
            transition: 'all 0.3s ease',
            '&:focus-within': {
              borderColor: alpha(light, 0.4),
              boxShadow: `0 4px 30px ${alpha(main, 0.2)}, inset 0 1px 0 ${alpha('#ffffff', 0.1)}, 0 0 0 2px ${alpha(main, 0.12)}`,
            },
          }}
        >
          {/* Left: mic / stop / dots */}
          {isProcessing ? (
            <Box sx={{ display: 'flex', gap: 0.5, px: 1.5, alignItems: 'center' }}>
              {[0, 1, 2].map((i) => (
                <Box
                  key={i}
                  sx={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    bgcolor: '#fff',
                    animation: `${dotsWave} 1.4s ease-in-out ${i * 0.16}s infinite`,
                  }}
                />
              ))}
            </Box>
          ) : (
            <Tooltip title={isRecording ? 'Stop Recording' : 'Start Voice Input'}>
              <IconButton
                onClick={onToggleMic}
                disabled={!isSupported}
                size="small"
                sx={{
                  color: isRecording ? theme.palette.error.light : alpha('#ffffff', 0.7),
                  p: { xs: 0.75, sm: 1 },
                  '&:hover': { bgcolor: alpha('#ffffff', 0.1) },
                }}
              >
                {isRecording ? (
                  <AppIcon
                    name="StopOutlined"
                    fallback={StopOutlinedIcon}
                    sx={{ fontSize: { xs: 20, sm: 22 } }}
                  />
                ) : (
                  <AppIcon
                    name="MicOutlined"
                    fallback={MicOutlinedIcon}
                    sx={{ fontSize: { xs: 20, sm: 22 } }}
                  />
                )}
              </IconButton>
            </Tooltip>
          )}

          {/* Copilot controls: model switcher + attach */}
          {onCopilotModelChange && (
            <ModelSwitcher
              provider={copilotProvider}
              model={copilotModel}
              onChange={onCopilotModelChange}
              surfaceTone="dark"
            />
          )}
          <AttachButton
            onAdd={(a) => setAttachments((p) => [...p, a])}
            onError={() => {}}
            surfaceTone="dark"
          />
          {attachments.map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              size="small"
              onDelete={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}
              sx={{ maxWidth: 130, height: 24, '& .MuiChip-label': { fontSize: '0.68rem' } }}
            />
          ))}

          {/* Text input */}
          <TextField
            ref={inputRef}
            fullWidth
            placeholder={placeholder}
            value={localText}
            onChange={handleTextChange}
            variant="standard"
            multiline
            maxRows={3}
            InputProps={{
              disableUnderline: true,
              sx: {
                fontSize: { xs: '0.875rem', sm: '0.95rem' },
                color: '#fff',
                '& input::placeholder, & textarea::placeholder': {
                  color: alpha('#ffffff', 0.4),
                  opacity: 1,
                },
              },
              inputProps: { 'aria-label': 'Ask the assistant anything' },
            }}
            disabled={isProcessing}
            onKeyDown={handleInputKeyDown}
            sx={{ flex: 1, px: 0.5 }}
          />

          {/* Right: send button (always visible, enabled when there is text) */}
          <Tooltip title={localText.trim() ? 'Send' : 'Type a message to send'}>
            <span>
              <IconButton
                onClick={handleSend}
                disabled={!localText.trim()}
                size="small"
                sx={{
                  bgcolor: localText.trim() ? alpha(main, 0.35) : alpha('#ffffff', 0.12),
                  color: localText.trim() ? '#fff' : alpha('#ffffff', 0.4),
                  '&:hover': {
                    bgcolor: localText.trim() ? alpha(main, 0.55) : alpha('#ffffff', 0.18),
                  },
                  '&.Mui-disabled': {
                    bgcolor: alpha('#ffffff', 0.08),
                    color: alpha('#ffffff', 0.25),
                  },
                  width: { xs: 34, sm: 38 },
                  height: { xs: 34, sm: 38 },
                }}
              >
                <AppIcon
                  name="SendRounded"
                  fallback={SendRoundedIcon}
                  sx={{ fontSize: { xs: 16, sm: 18 } }}
                />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>
      {/* ── Slash-command palette (anchored above input) ── */}
      <CommandPalette
        open={paletteOpen}
        anchorEl={inputAnchorEl}
        query={paletteQuery}
        onSelect={handlePaletteSelect}
        onClose={() => setPaletteOpen(false)}
        keyHandlerRef={paletteKeyHandlerRef}
      />
      {/* ── Bottom ambient glow ── */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40%',
          background: `radial-gradient(ellipse 80% 50% at 50% 100%, ${alpha(main, isDark ? 0.18 : 0.12)} 0%, transparent 70%)`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
    </Box>
  );
}
