import { useId, useRef, useState } from 'react';
import { useUser } from '@clerk/react';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { Box, IconButton, InputBase, Stack, Tooltip, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import LineOrb from '../../components/Common/LineOrb.jsx';
import { ASSISTANT_MODES, ASSISTANT_MODE_ORDER } from '../WorkflowV2/assistant-modes.js';

const HOME_DRAFT_MAX_LENGTH = 24_000;

function greetingForHour(hour) {
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function privateNameLabel(firstName, lastName = '') {
  const first = firstName?.trim();
  if (!first) return '';

  const titledInitial = /^(mr|mrs|ms|dr)\.?\s*([^\s.])?\.?$/iu.exec(first);
  if (!titledInitial) return first;

  const titles = { mr: 'Mr', mrs: 'Mrs', ms: 'Ms', dr: 'Dr' };
  const title = titles[titledInitial[1].toLocaleLowerCase()];
  const initial = titledInitial[2] || lastName?.trim()?.[0];
  return initial ? `${title}. ${initial.toLocaleUpperCase()}` : first;
}

function userDisplayName(user) {
  const firstName = privateNameLabel(user?.firstName, user?.lastName);
  if (firstName) return firstName;

  const fullName = user?.fullName?.trim();
  if (fullName) {
    const [first, second] = fullName.split(/\s+/u);
    return privateNameLabel(first, second);
  }

  const username = user?.username?.trim();
  if (username) return username;

  const email = user?.primaryEmailAddress?.emailAddress?.trim();
  if (email) return email.split('@')[0];

  return 'there';
}

function draftNonce() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function HomeHero() {
  const navigate = useNavigate();
  const { user } = useUser();
  const modeDescriptionId = useId();
  const modeButtonRefs = useRef({});
  const [mode, setMode] = useState('auto');
  const [text, setText] = useState('');

  const trimmedText = text.trim();
  const draftIsValid = Boolean(trimmedText) && trimmedText.length <= HOME_DRAFT_MAX_LENGTH;
  const greeting = greetingForHour(new Date().getHours());
  const displayName = userDisplayName(user);
  const selectedMode = ASSISTANT_MODES[mode] || ASSISTANT_MODES.auto;
  const sendLabel = mode === 'goal' ? 'Continue to Agent setup' : 'Send';

  const pickMode = (nextMode, { focus = false } = {}) => {
    setMode(nextMode);
    if (focus) modeButtonRefs.current[nextMode]?.focus();
  };

  const moveModeFromKeyboard = (event, currentMode) => {
    const currentIndex = ASSISTANT_MODE_ORDER.indexOf(currentMode);
    let nextIndex;

    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = ASSISTANT_MODE_ORDER.length - 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + ASSISTANT_MODE_ORDER.length) % ASSISTANT_MODE_ORDER.length;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % ASSISTANT_MODE_ORDER.length;
    }
    if (nextIndex === undefined) return;

    event.preventDefault();
    pickMode(ASSISTANT_MODE_ORDER[nextIndex], { focus: true });
  };

  const submit = () => {
    if (!draftIsValid) return;
    navigate('/assistant', {
      state: {
        gcpDraft: {
          mode,
          text: trimmedText,
          nonce: draftNonce(),
        },
      },
    });
  };

  return (
    <Box
      component="section"
      aria-labelledby="gcp-home-greeting"
      sx={{
        width: '100%',
        height: '100dvh',
        mx: 'auto',
        px: { xs: 1.25, md: 1.5 },
        pb: { xs: 1.25, md: 1.5 },
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#0A0A0A',
        '@keyframes gcpHomeFadeUp': {
          from: { opacity: 0, transform: 'translateY(10px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 120,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <LineOrb
          size={252}
          accent="#B7BBC2"
          title="Orqaly assistant"
          sx={{
            width: { xs: 'clamp(132px, 24dvh, 204px)', sm: 252 },
            height: { xs: 'clamp(132px, 24dvh, 204px)', sm: 252 },
          }}
        />
      </Box>

      <Box
        sx={{
          textAlign: 'center',
          px: 2,
          pb: 2,
          flexShrink: 0,
          animation: 'gcpHomeFadeUp 700ms 150ms both cubic-bezier(.22,1,.36,1)',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        <Typography
          id="gcp-home-greeting"
          component="p"
          variant="h4"
          sx={{
            mb: 0.75,
            color: alpha('#F5F5F5', 0.72),
            fontWeight: 800,
            letterSpacing: '-0.025em',
            fontSize: { xs: '1.45rem', sm: '1.9rem', md: '2.2rem' },
          }}
        >
          {greeting}, {displayName}
        </Typography>
        <Typography
          variant="caption"
          sx={{ display: 'block', color: alpha('#F5F5F5', 0.5), fontWeight: 600 }}
        >
          Ask, refine, and keep the conversation going.
        </Typography>
        <Typography
          variant="caption"
          sx={{ display: 'block', color: alpha('#F5F5F5', 0.88), fontWeight: 600 }}
        >
          Delegate complex work to an Agent when you need it.
        </Typography>
      </Box>

      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        sx={{
          minHeight: 144,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          px: 2,
          pt: 1.25,
          pb: 0.75,
          border: 0,
          borderRadius: 3.5,
          bgcolor: '#101010',
          boxShadow: 'none',
          animation: 'gcpHomeFadeUp 700ms 280ms both cubic-bezier(.22,1,.36,1)',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          '&:focus-within': {
            bgcolor: '#111111',
          },
        }}
      >
        <Box
          role="radiogroup"
          aria-label="Conversation mode"
          aria-describedby={modeDescriptionId}
          sx={{
            position: 'relative',
            display: 'inline-grid',
            gridTemplateColumns: `repeat(${ASSISTANT_MODE_ORDER.length}, minmax(0, 1fr))`,
            alignSelf: 'flex-start',
            width: { xs: '100%', sm: 'auto' },
            maxWidth: '100%',
            p: 0.25,
            minHeight: { xs: 48, sm: 30 },
            borderRadius: 999,
            bgcolor: alpha('#FFFFFF', 0.045),
          }}
        >
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              top: 2,
              bottom: 2,
              left: 2,
              width: `calc(${100 / ASSISTANT_MODE_ORDER.length}% - 2px)`,
              borderRadius: 999,
              bgcolor: alpha('#FFFFFF', 0.14),
              transform: `translateX(${ASSISTANT_MODE_ORDER.indexOf(mode) * 100}%)`,
              transition: 'transform 320ms cubic-bezier(.22,1,.36,1)',
              pointerEvents: 'none',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
          {ASSISTANT_MODE_ORDER.map((value) => (
            <Box
              key={value}
              component="button"
              ref={(node) => {
                modeButtonRefs.current[value] = node;
              }}
              type="button"
              role="radio"
              aria-checked={mode === value}
              tabIndex={mode === value ? 0 : -1}
              onClick={() => pickMode(value)}
              onKeyDown={(event) => moveModeFromKeyboard(event, value)}
              sx={{
                position: 'relative',
                zIndex: 1,
                appearance: 'none',
                bgcolor: 'transparent',
                border: 0,
                borderRadius: 999,
                minWidth: 0,
                minHeight: { xs: 44, sm: 26 },
                px: { xs: 0.5, sm: 1.5 },
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: mode === value ? '#F5F5F5' : alpha('#F5F5F5', 0.5),
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.78rem',
                lineHeight: 1.2,
                fontWeight: mode === value ? 700 : 600,
                whiteSpace: 'nowrap',
                transition: 'color 320ms cubic-bezier(.22,1,.36,1)',
                '&:hover': { color: '#F5F5F5' },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: alpha('#FFFFFF', 0.8),
                  outlineOffset: 2,
                },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            >
              {ASSISTANT_MODES[value].label}
            </Box>
          ))}
        </Box>

        <Typography
          id={modeDescriptionId}
          variant="caption"
          aria-live="polite"
          sx={{ display: 'block', mt: 0.5, px: 0.5, color: alpha('#F5F5F5', 0.58) }}
        >
          <Box component="span" sx={{ color: alpha('#F5F5F5', 0.82), fontWeight: 700 }}>
            {selectedMode.label}:
          </Box>{' '}
          {selectedMode.description}
        </Typography>

        {mode === 'goal' ? (
          <Typography
            variant="caption"
            sx={{ display: 'block', mt: 0.25, px: 0.5, color: alpha('#F5F5F5', 0.76) }}
          >
            Next, choose whether this Agent exists only for the task or is retained after it.
          </Typography>
        ) : null}

        <InputBase
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) return;
            event.preventDefault();
            submit();
          }}
          placeholder={selectedMode.placeholder}
          multiline
          minRows={2}
          maxRows={8}
          inputProps={{
            'aria-label': 'Message Orqaly',
            enterKeyHint: 'send',
            maxLength: HOME_DRAFT_MAX_LENGTH,
          }}
          sx={{
            flex: 1,
            width: '100%',
            alignItems: 'flex-start',
            px: 0.5,
            pt: 0.5,
            color: '#F5F5F5',
            fontSize: { xs: '1rem', sm: '1.08rem' },
            '& textarea': { resize: 'none', lineHeight: 1.5 },
            '& textarea::placeholder': { color: alpha('#F5F5F5', 0.82), opacity: 1 },
          }}
        />

        <Stack direction="row" alignItems="center" spacing={0.25}>
          <Tooltip title="File attachments are not available from Home yet">
            <span>
              <IconButton
                disabled
                aria-label="Attach files"
                size="small"
                sx={{
                  color: alpha('#F5F5F5', 0.58),
                  '&.Mui-disabled': { color: alpha('#F5F5F5', 0.48) },
                }}
              >
                <AttachFileRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Goal setup is not available from Home yet">
            <span>
              <IconButton
                disabled
                type="button"
                aria-label="Goal setup unavailable"
                size="small"
                sx={{ '&.Mui-disabled': { color: alpha('#F5F5F5', 0.48) } }}
              >
                <TuneRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Box sx={{ flex: 1 }} />
          <Tooltip title={draftIsValid ? sendLabel : 'Type a request to send'}>
            <span>
              <IconButton
                type="submit"
                aria-label={sendLabel}
                disabled={!draftIsValid}
                size="small"
                sx={{
                  color: alpha('#F5F5F5', 0.7),
                  '&:hover': { color: '#F5F5F5', bgcolor: alpha('#FFFFFF', 0.06) },
                  '&.Mui-disabled': { color: alpha('#F5F5F5', 0.22) },
                }}
              >
                <ArrowUpwardRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        <Typography
          variant="caption"
          sx={{ color: alpha('#F5F5F5', 0.52), px: 0.5, lineHeight: 1.35 }}
        >
          Coming soon: file attachments and advanced Goal setup.
        </Typography>
      </Box>
    </Box>
  );
}
