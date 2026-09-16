import { useRef } from 'react';
import { Box, IconButton, InputBase, Tooltip, Typography, alpha, useTheme } from '@mui/material';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { composerCopy } from './newGoalTranscript';

/**
 * The one input in Simple mode, pinned below the thread.
 *
 * Deliberately stateless. `value` is the same simpleInput the analyze and
 * submit paths read, so seeding it from a hero prompt reaches the box and the
 * Start gate sees what the user typed. Giving it local state instead would
 * silently break both.
 *
 * `voice` is passed in rather than created here. useVoiceControl constructs a
 * SpeechRecognition per instance, so a second one would put two mic buttons on
 * screen and throw InvalidStateError if both started listening.
 *
 * The composer never becomes a box with nowhere to send: `role` decides what it
 * does at the current goal status, and the state line above says so.
 *
 * `onOpenSetup` mirrors the Assistant composer's sliders icon: it opens the goal
 * setup drawer (workspace, board, team or agent, AxWise). Passed only where a
 * drawer is actually mounted, the same way `onAttach` gates the paperclip.
 *
 * `topSlot` and `topRight` are the two ends of the row above the input: the
 * category pills on the left, the run controls on the right. Both are nodes -
 * the composer does not know what a goal is, and adding that knowledge here is
 * what would make it stateful.
 */
export default function GoalComposer({
  value,
  onChange,
  onSubmit,
  role = 'describe',
  canSubmit = false,
  blockedReason = '',
  busy = false,
  voice = null,
  onAttach = null,
  onOpenSetup = null,
  setupScoped = false,
  remainingSlots = null,
  topSlot = null,
  topRight = null,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const fileRef = useRef(null);
  const copy = composerCopy(role);
  const listening = voice?.state === 'listening';
  const attachFull = remainingSlots !== null && remainingSlots <= 0;

  const submit = () => {
    if (!canSubmit || busy) return;
    onSubmit?.();
  };

  // Enter sends, Shift+Enter breaks a line. IME composition must never submit:
  // pressing Enter to accept a candidate would otherwise fire the goal.
  const handleKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (event.nativeEvent?.isComposing) return;
    event.preventDefault();
    submit();
  };

  return (
    <Box
      data-composer-text-entry=""
      sx={{
        borderRadius: 3,
        border: '1px solid',
        borderColor: isDark ? alpha('#fff', 0.12) : 'divider',
        bgcolor: isDark ? alpha('#000', 0.3) : 'background.paper',
        px: 1,
        pt: 0.75,
        pb: 0.75,
        transition: 'border-color .18s, box-shadow .18s',
        '&:focus-within': {
          borderColor: alpha(theme.palette.primary.main, 0.5),
          boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}`,
        },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {/* What this box does right now, so it is never ambiguous - for the
          states where that is not already obvious from the thread above it. */}
      {copy.line && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 0.75, pb: 0.25 }}>
          <Box
            sx={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              flexShrink: 0,
              bgcolor: 'primary.main',
            }}
          />
          <Typography
            variant="caption"
            sx={{ fontSize: '0.66rem', fontWeight: 600, color: 'text.secondary' }}
          >
            {copy.line}
          </Typography>
        </Box>
      )}

      {(topSlot || topRight) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 0.75,
            px: 0.5,
            pb: 0.5,
          }}
        >
          {topSlot}
          {/* Opposite the pills, in the card's own top-right corner. `ml: auto`
              rather than a spacer so the row still reads right when there are
              no pills at all - the dialog variant passes none. */}
          {topRight && <Box sx={{ ml: 'auto', display: 'flex' }}>{topRight}</Box>}
        </Box>
      )}

      <Box sx={{ px: 0.75, pt: 0.5 }}>
        <InputBase
          fullWidth
          multiline
          minRows={2}
          maxRows={10}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={copy.placeholder}
          disabled={busy}
          inputProps={{
            'aria-label': copy.state,
            enterKeyHint: 'send',
            // The label changes with the role; this does not, so a test can
            // find the box before and after a send.
            'data-testid': 'goal-composer-input',
          }}
          sx={{
            fontSize: '0.95rem',
            lineHeight: 1.55,
            '& textarea': { resize: 'none' },
          }}
        />
      </Box>

      {/* Plain MUI glyphs, at the size and weight the Assistant composer draws
          them. These were GlassIcon, which resolves to the Liquid Glass set in
          simple mode - so the same row of controls came out frosted on the Goal
          tab and flat on the Assistant tab, one pill apart. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, px: 0.25, pt: 0.25 }}>
        {voice?.isSupported && (
          <Tooltip title={listening ? 'Stop dictating' : 'Dictate'}>
            <IconButton
              size="small"
              onClick={() => (listening ? voice.stopListening?.() : voice.startListening?.())}
              aria-label={listening ? 'Stop dictating' : 'Dictate'}
              sx={{ color: listening ? 'error.main' : 'text.secondary' }}
            >
              {listening ? (
                <StopCircleOutlinedIcon sx={{ fontSize: 20 }} />
              ) : (
                <MicNoneOutlinedIcon sx={{ fontSize: 20 }} />
              )}
            </IconButton>
          </Tooltip>
        )}

        {onAttach && (
          <>
            <Tooltip
              title={attachFull ? 'You have attached the maximum of 20 items' : 'Attach a file'}
            >
              {/* span keeps the tooltip working while the button is disabled */}
              <span>
                <IconButton
                  size="small"
                  disabled={attachFull}
                  onClick={() => fileRef.current?.click()}
                  aria-label="Attach a file"
                  sx={{ color: 'text.secondary' }}
                >
                  <AttachFileOutlinedIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </span>
            </Tooltip>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={onAttach}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.gif,.webp,.svg"
            />
          </>
        )}

        {onOpenSetup && (
          <Tooltip title="Goal setup - organization, consilium, teams, AxWise">
            <IconButton
              size="small"
              onClick={onOpenSetup}
              aria-label="Goal setup"
              // Tinted once the goal is aimed at something narrower than the
              // whole workspace, so a non-default destination is visible without
              // reopening the drawer.
              sx={{ color: setupScoped ? 'primary.main' : 'text.secondary' }}
            >
              <TuneOutlinedIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        )}

        <Typography
          variant="caption"
          sx={{ ml: 0.5, fontSize: '0.65rem', color: 'text.disabled', flex: 1, minWidth: 0 }}
        >
          {blockedReason || 'Shift + Enter for a new line'}
        </Typography>

        <Tooltip title={blockedReason || 'Send'}>
          <span>
            <IconButton
              size="small"
              onClick={submit}
              disabled={!canSubmit || busy}
              aria-label="Send"
              sx={{
                bgcolor: alpha(theme.palette.primary.main, 0.14),
                color: 'primary.main',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.24) },
                '&.Mui-disabled': { bgcolor: 'transparent', color: 'text.disabled' },
              }}
            >
              <ArrowForwardOutlinedIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
