import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Paper,
  Stack,
  Typography,
  alpha,
  useTheme,
  Fade,
  Zoom,
  Dialog,
} from '@mui/material';
import BackspaceRoundedIcon from '@mui/icons-material/BackspaceRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import LockOpenRoundedIcon from '@mui/icons-material/LockOpenRounded';
import { deleteGoal } from '../../services/goalService';
import {
  PIN_LENGTH,
  AUTH_PIN_STORAGE_KEY,
  PERMISSIONS_PIN_STORAGE_KEY,
  DOCUMENTATION_PIN_STORAGE_KEY,
  verifyPinRemote,
} from '../../config/pinAccess';
import { createHoverGlowShadow } from '../../theme/hoverGlow';

import AppIcon from '../../components/icons/AppIcon';

const PIN_MODE_CONFIG = {
  auth: {
    storageKey: AUTH_PIN_STORAGE_KEY,
    defaultNext: '/login',
    title: 'Enter PIN',
    subtitle: '',
  },
  permissions: {
    storageKey: PERMISSIONS_PIN_STORAGE_KEY,
    defaultNext: '/roles',
    title: 'Enter PIN',
    subtitle: 'Enter PIN',
  },
  documentation: {
    storageKey: DOCUMENTATION_PIN_STORAGE_KEY,
    defaultNext: '/documentation',
    title: 'Enter PIN',
    subtitle: 'Enter PIN',
  },
  delete: {
    storageKey: 'orch_delete_granted',
    defaultNext: '/dashboard',
    title: 'Verify Identity',
    subtitle: 'Enter 4-digit PIN to confirm deletion',
  },
};

/* Standard keypad layout for familiar UX (phone/calculator style) */
const STANDARD_KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['C', '0', 'D'],
];

/* ─────────────────────────────────────────────────────────────────────────────
   ANIMATED ICONS (Face, Voice, AI)
───────────────────────────────────────────────────────────────────────────── */
const FaceScanIcon = ({ color }) => (
  <Box sx={{ position: 'relative', width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <path d="M9 4.5C8 4.5 7 5 7 6M15 4.5C16 4.5 17 5 17 6" strokeLinecap="round" />
      <path d="M8 14C8.5 15.5 10 16.5 12 16.5C14 16.5 15.5 15.5 16 14" strokeLinecap="round" />
      <rect x="4" y="3" width="16" height="18" rx="5" strokeOpacity="0.5" />
    </svg>
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        background: color,
        boxShadow: `0 0 8px ${color}`,
        opacity: 0.8,
        animation: 'faceScan 2s linear infinite',
        '@keyframes faceScan': {
          '0%': { transform: 'translateY(4px)', opacity: 0 },
          '10%': { opacity: 1 },
          '90%': { opacity: 1 },
          '100%': { transform: 'translateY(36px)', opacity: 0 },
        },
      }}
    />
  </Box>
);

const VoiceAnalysisIcon = ({ color }) => (
  <Box sx={{ position: 'relative', width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h1a4 4 0 0 0 4-4v-1" />
      <path d="M12 4a3 3 0 0 1 2.8 4" />
      <path d="M12 20a3 3 0 0 0 2.8-4" />
    </svg>
    {[1, 2, 3].map((i) => (
      <Box
        key={i}
        component="span"
        sx={{
          position: 'absolute',
          right: 2 - i * 4,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 4,
          height: 12 + i * 6,
          borderRadius: 2,
          bgcolor: color,
          opacity: 0.6,
          animation: `soundWave 1.2s ease-in-out infinite`,
          animationDelay: `${i * 0.15}s`,
          '@keyframes soundWave': {
            '0%, 100%': { height: 8 + i * 4, opacity: 0.3 },
            '50%': { height: 16 + i * 8, opacity: 1 },
          },
        }}
      />
    ))}
  </Box>
);

const AiBrainIcon = ({ color }) => (
  <Box sx={{ position: 'relative', width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
    {[
      { top: '30%', left: '30%' },
      { top: '40%', left: '70%' },
      { top: '65%', left: '40%' },
      { top: '60%', left: '60%' },
    ].map((pos, i) => (
      <Box
        key={i}
        sx={{
          position: 'absolute',
          ...pos,
          width: 4,
          height: 4,
          borderRadius: '50%',
          bgcolor: color,
          boxShadow: `0 0 6px ${color}`,
          animation: `nodePulse 2s ease-in-out infinite`,
          animationDelay: `${i * 0.5}s`,
          '@keyframes nodePulse': {
            '0%, 100%': { transform: 'scale(1)', opacity: 0.4 },
            '50%': { transform: 'scale(2)', opacity: 1 },
          },
        }}
      />
    ))}
  </Box>
);

const ProcessingIcon = ({ color }) => (
  <Box sx={{ position: 'relative', width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M4.93 4.93l2.83 2.83" />
      <path d="M16.24 16.24l2.83 2.83" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="M4.93 19.07l2.83-2.83" />
      <path d="M16.24 7.76l2.83-2.83" />
    </svg>
    <Box
      sx={{
        position: 'absolute',
        inset: -4,
        border: `2px dashed ${color}`,
        borderRadius: '50%',
        opacity: 0.5,
        animation: 'spinSlow 4s linear infinite',
        '@keyframes spinSlow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      }}
    />
  </Box>
);

const ScanCompleteIcon = ({ color }) => (
  <Box sx={{ position: 'relative', width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        boxShadow: `0 0 15px ${color}`,
        animation: 'pulseSuccess 2s infinite',
        '@keyframes pulseSuccess': {
          '0%': { opacity: 0.2, transform: 'scale(0.8)' },
          '50%': { opacity: 0.6, transform: 'scale(1.1)' },
          '100%': { opacity: 0.2, transform: 'scale(0.8)' },
        },
      }}
    />
  </Box>
);

const IdentityKnownIcon = ({ color }) => (
  <Box sx={{ position: 'relative', width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
    <Box
      sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 6,
        height: 6,
        bgcolor: color,
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
        boxShadow: `0 0 12px ${color}`,
        animation: 'eyeScan 3s infinite',
        '@keyframes eyeScan': {
          '0%, 100%': { boxShadow: `0 0 5px ${color}` },
          '50%': { boxShadow: `0 0 20px ${color}, 0 0 40px ${color}` },
        },
      }}
    />
  </Box>
);

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function PinGate() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const requestedMode = searchParams.get('mode');
  const mode = PIN_MODE_CONFIG[requestedMode] ? requestedMode : 'auth';
  const config = PIN_MODE_CONFIG[mode];
  const nextPathParam = searchParams.get('next');
  const nextPath =
    nextPathParam && nextPathParam.startsWith('/') ? nextPathParam : config.defaultNext;

  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const keypadRows = STANDARD_KEYPAD;
  const [activeIconIndex, setActiveIconIndex] = useState(0);
  const [deleteSuccessOpen, setDeleteSuccessOpen] = useState(false);

  useEffect(() => {
    if (mode === 'delete') return;
    try {
      if (window.sessionStorage.getItem(config.storageKey) === '1') {
        navigate(nextPath, { replace: true });
      }
    } catch {
      // Ignore
    }
  }, [config.storageKey, navigate, nextPath, mode]);

  useEffect(() => {
    // Sequence: 0: Biometric, 1: Voice, 2: Neural, 3: Processing, 4: Complete, 5: Identity
    const maxSteps = 5;
    const interval = setInterval(() => {
      setActiveIconIndex((prev) => {
        if (prev < maxSteps) return prev + 1;
        clearInterval(interval);
        return prev;
      });
    }, 2500); // Slightly faster for better flow
    return () => clearInterval(interval);
  }, []);

  const appendDigit = (digit) => {
    if (unlocking) return;
    setValue((prev) => {
      const newVal = prev.length < PIN_LENGTH ? `${prev}${digit}` : prev;
      return newVal;
    });
    setError('');
  };

  const clearValue = () => {
    setValue('');
    setError('');
  };

  const deleteDigit = () => {
    setValue((prev) => prev.slice(0, -1));
  };

  const validatePin = useCallback(async () => {
    if (unlocking || value.length !== PIN_LENGTH) return;

    const valid = await verifyPinRemote(value);
    if (valid) {
      setUnlocking(true);
      setError('');
      try {
        window.sessionStorage.setItem(config.storageKey, '1');
      } catch {
        // Ignore storage failures
      }

      if (mode === 'delete') {
        try {
          const goalId = searchParams.get('goalId');
          if (goalId) {
            await deleteGoal(goalId);
          }
          setDeleteSuccessOpen(true);
        } catch (err) {
          setError(err.message || 'Failed to delete goal');
          setUnlocking(false);
        }
      } else {
        setTimeout(() => {
          navigate(nextPath, { replace: true });
        }, 1000);
      }
      return;
    }

    setError('ACCESS DENIED');
    setShake(true);
    setValue('');
    if (mode === 'delete') {
      navigate(nextPath, { replace: true, state: { showPinError: true } });
    }
    setTimeout(() => setShake(false), 500);
  }, [config.storageKey, navigate, nextPath, unlocking, value, mode, searchParams]);

  useEffect(() => {
    if (value.length === PIN_LENGTH) {
      void validatePin();
    }
  }, [value, validatePin]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (unlocking) return;
      if (/^\d$/.test(event.key)) {
        appendDigit(event.key);
        return;
      }
      if (event.key === 'Backspace') {
        deleteDigit();
        return;
      }
      if (event.key === 'Escape') {
        clearValue();
        return;
      }
      if (event.key === 'Enter' && value.length === PIN_LENGTH) {
        void validatePin();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [unlocking, value]);

  const primaryColor = theme.palette.primary.main;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#050505',
        backgroundImage: `
          radial-gradient(circle at 50% 0%, ${alpha(theme.palette.primary.main, 0.15)} 0%, transparent 50%),
          linear-gradient(0deg, transparent 24%, ${alpha(theme.palette.primary.main, 0.03)} 25%, ${alpha(theme.palette.primary.main, 0.03)} 26%, transparent 27%, transparent 74%, ${alpha(theme.palette.primary.main, 0.03)} 75%, ${alpha(theme.palette.primary.main, 0.03)} 76%, transparent 77%, transparent),
          linear-gradient(90deg, transparent 24%, ${alpha(theme.palette.primary.main, 0.03)} 25%, ${alpha(theme.palette.primary.main, 0.03)} 26%, transparent 27%, transparent 74%, ${alpha(theme.palette.primary.main, 0.03)} 75%, ${alpha(theme.palette.primary.main, 0.03)} 76%, transparent 77%, transparent)
        `,
        backgroundSize: '100% 100%, 60px 60px, 60px 60px',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: "'Inter', sans-serif",
        '@keyframes shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
        },
        '@keyframes pulseGlow': {
          '0%, 100%': {
            opacity: 0.5,
            boxShadow: `0 0 10px ${alpha(theme.palette.primary.main, 0.2)}`,
          },
          '50%': { opacity: 1, boxShadow: `0 0 20px ${alpha(theme.palette.primary.main, 0.5)}` },
        },
        '@keyframes successExpand': {
          '0%': { width: '0%' },
          '100%': { width: '100%' },
        },
      }}
    >
      <Zoom in style={{ transitionDelay: '100ms' }}>
        <Paper
          elevation={24}
          sx={{
            p: { xs: 4, sm: 6 },
            width: '100%',
            maxWidth: 440,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            borderRadius: 0,
            border: '1px solid',
            borderColor: alpha(theme.palette.primary.main, 0.2),
            bgcolor: alpha('#0A0A0A', 0.8),
            backdropFilter: 'blur(20px)',
            animation: shake ? 'shake 0.4s cubic-bezier(.36,.07,.19,.97) both' : 'none',
            boxShadow: `0 0 40px ${alpha('#000', 0.8)}, inset 0 0 0 1px ${alpha(theme.palette.primary.main, 0.1)}`,
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: theme.palette.primary.main,
              boxShadow: `0 0 10px ${theme.palette.primary.main}`,
              transition: 'background 0.3s ease',
              animation: unlocking ? 'successExpand 1s ease-out forwards' : 'none',
            },
          }}
        >
          {/* Back Button */}
          <Button
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate(nextPath);
              }
            }}
            startIcon={<AppIcon name="ArrowBackRounded" fallback={ArrowBackRoundedIcon} />}
            sx={{
              position: 'absolute',
              top: 16,
              left: 16,
              color: alpha('#fff', 0.5),
              textTransform: 'none',
              fontSize: '0.8rem',
              fontWeight: 600,
              padding: '4px 12px',
              borderRadius: 2,
              border: '1px solid transparent',
              transition: 'all 0.2s ease',
              zIndex: 10,
              '&:hover': {
                color: '#fff',
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                borderColor: alpha(theme.palette.primary.main, 0.3),
              },
            }}
          >
            Back
          </Button>

          {/* Header */}
          <Box sx={{ mb: 5, textAlign: 'center', width: '100%' }}>
            <Box
              sx={{
                height: 60,
                mb: 2,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: '50%',
                  bgcolor: alpha(primaryColor, 0.1),
                  border: `1px solid ${alpha(primaryColor, 0.2)}`,
                  display: 'grid',
                  placeItems: 'center',
                  position: 'relative',
                  width: 64,
                  height: 64,
                }}
              >
                {unlocking ? (
                  <AppIcon
                    name="LockOpenRounded"
                    fallback={LockOpenRoundedIcon}
                    sx={{ fontSize: 32, color: theme.palette.primary.main }}
                  />
                ) : (
                  <>
                    <Box
                      sx={{
                        position: 'absolute',
                        opacity: activeIconIndex === 0 ? 1 : 0,
                        transition: 'opacity 0.5s',
                      }}
                    >
                      <FaceScanIcon color={primaryColor} />
                    </Box>
                    <Box
                      sx={{
                        position: 'absolute',
                        opacity: activeIconIndex === 1 ? 1 : 0,
                        transition: 'opacity 0.5s',
                      }}
                    >
                      <VoiceAnalysisIcon color={primaryColor} />
                    </Box>
                    <Box
                      sx={{
                        position: 'absolute',
                        opacity: activeIconIndex === 2 ? 1 : 0,
                        transition: 'opacity 0.5s',
                      }}
                    >
                      <AiBrainIcon color={primaryColor} />
                    </Box>
                    <Box
                      sx={{
                        position: 'absolute',
                        opacity: activeIconIndex === 3 ? 1 : 0,
                        transition: 'opacity 0.5s',
                      }}
                    >
                      <ProcessingIcon color={primaryColor} />
                    </Box>
                    <Box
                      sx={{
                        position: 'absolute',
                        opacity: activeIconIndex === 4 ? 1 : 0,
                        transition: 'opacity 0.5s',
                      }}
                    >
                      <ScanCompleteIcon color={primaryColor} />
                    </Box>
                    <Box
                      sx={{
                        position: 'absolute',
                        opacity: activeIconIndex === 5 ? 1 : 0,
                        transition: 'opacity 0.5s',
                      }}
                    >
                      <IdentityKnownIcon color={primaryColor} />
                    </Box>
                  </>
                )}

                {!unlocking && (
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: -2,
                      borderRadius: '50%',
                      borderTop: `2px solid ${primaryColor}`,
                      borderRight: `2px solid transparent`,
                      animation: 'spin 2s linear infinite',
                      '@keyframes spin': {
                        from: { transform: 'rotate(0deg)' },
                        to: { transform: 'rotate(360deg)' },
                      },
                    }}
                  />
                )}
              </Box>
            </Box>

            <Typography
              variant="overline"
              sx={{
                color: alpha(theme.palette.primary.main, 0.7),
                letterSpacing: '0.2em',
                display: 'block',
                mb: activeIconIndex === 5 ? 0.5 : 1,
              }}
            >
              {activeIconIndex === 0 && 'BIOMETRIC SCAN'}
              {activeIconIndex === 1 && 'VOICE ANALYSIS'}
              {activeIconIndex === 2 && 'NEURAL SYNC'}
              {activeIconIndex === 3 && 'PROCESSING DATA'}
              {activeIconIndex === 4 && 'SCAN IS COMPLETE'}
              {activeIconIndex === 5 && 'I know who you are'}
            </Typography>
            {activeIconIndex === 5 && (
              <Box
                component="span"
                sx={{
                  display: 'inline-block',
                  mt: 0.25,
                  mb: 0,
                  px: 1.5,
                  py: 0.5,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: theme.palette.primary.main,
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  border: '1px solid',
                  borderColor: alpha(theme.palette.primary.main, 0.35),
                  borderRadius: 2,
                  boxShadow: `0 0 12px ${alpha(theme.palette.primary.main, 0.15)}`,
                }}
              >
                Biometrics Accepted
              </Box>
            )}
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                color: '#fff',
                letterSpacing: '-1px',
                textTransform: 'uppercase',
                textShadow: unlocking
                  ? `0 0 20px ${alpha(theme.palette.primary.main, 0.5)}`
                  : 'none',
                transition: 'all 0.3s ease',
              }}
            >
              {unlocking ? 'ACCESS GRANTED' : config.title}
            </Typography>
            {(unlocking || (config.subtitle && config.subtitle !== config.title)) && (
              <Typography variant="body2" sx={{ color: alpha('#fff', 0.6), mt: 1, maxWidth: 320 }}>
                {unlocking ? 'Initializing secure session...' : config.subtitle}
              </Typography>
            )}
          </Box>

          {/* PIN Display (Slots) */}
          <Stack direction="row" spacing={2.5} sx={{ mb: 5, justifyContent: 'center' }}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => {
              const isActive = i < value.length;
              return (
                <Box
                  key={i}
                  sx={{
                    width: 28,
                    height: 5,
                    bgcolor: isActive ? theme.palette.primary.main : alpha('#fff', 0.1),
                    borderRadius: 1,
                    boxShadow: isActive ? `0 0 10px ${theme.palette.primary.main}` : 'none',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: isActive ? 'scaleX(1.5)' : 'scaleX(1)',
                  }}
                />
              );
            })}
          </Stack>

          {/* Error Message */}
          <Box sx={{ minHeight: 24, mb: 3 }}>
            {error && (
              <Fade in>
                <Typography
                  sx={{
                    color: theme.palette.error.main,
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    textShadow: `0 0 10px ${alpha(theme.palette.error.main, 0.5)}`,
                  }}
                >
                  {error}
                </Typography>
              </Fade>
            )}
          </Box>

          {/* Keypad */}
          <Box sx={{ width: '100%' }}>
            {keypadRows.map((row, rowIndex) => (
              <Stack
                key={rowIndex}
                direction="row"
                spacing={2}
                justifyContent="center"
                sx={{ mb: 2 }}
              >
                {row.map((cell) => {
                  const isClear = cell === 'C';
                  const isDelete = cell === 'D';

                  return (
                    <Button
                      key={cell}
                      disableElevation
                      variant="outlined"
                      onClick={() => {
                        if (isClear) return clearValue();
                        if (isDelete) return deleteDigit();
                        appendDigit(cell);
                      }}
                      disabled={unlocking}
                      sx={{
                        width: 72,
                        height: 72,
                        borderRadius: 2,
                        borderWidth: '1px',
                        borderColor: alpha('#fff', 0.1),
                        color: '#fff',
                        fontSize: '1.25rem',
                        fontWeight: 400,
                        fontFamily: 'monospace',
                        bgcolor: 'transparent',
                        backdropFilter: 'blur(4px)',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          bgcolor: alpha(theme.palette.primary.main, 0.1),
                          borderColor: theme.palette.primary.main,
                          boxShadow: createHoverGlowShadow(theme),
                          transform: 'translateY(-2px)',
                        },
                        '&:active': {
                          transform: 'translateY(1px)',
                        },
                        ...(isClear && {
                          fontSize: '0.75rem',
                          color: alpha('#fff', 0.5),
                          borderColor: 'transparent',
                          '&:hover': { color: '#fff', borderColor: alpha('#fff', 0.3) },
                        }),
                        ...(isDelete && {
                          color: alpha('#fff', 0.5),
                          borderColor: 'transparent',
                          '&:hover': {
                            color: theme.palette.error.main,
                            borderColor: alpha(theme.palette.error.main, 0.3),
                          },
                        }),
                      }}
                    >
                      {isClear ? (
                        'CLR'
                      ) : isDelete ? (
                        <AppIcon
                          name="BackspaceRounded"
                          fallback={BackspaceRoundedIcon}
                          fontSize="small"
                        />
                      ) : (
                        cell
                      )}
                    </Button>
                  );
                })}
              </Stack>
            ))}
          </Box>

          {/* Footer ID */}
          <Typography
            variant="caption"
            sx={{
              mt: 4,
              color: alpha('#fff', 0.2),
              fontFamily: 'monospace',
              letterSpacing: '0.1em',
            }}
          >
            ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}
          </Typography>
        </Paper>
      </Zoom>
      {/* Delete success confirmation dialog */}
      <Dialog
        open={deleteSuccessOpen}
        onClose={() => {
          setDeleteSuccessOpen(false);
          navigate(nextPath, { replace: true });
        }}
        slotProps={{
          backdrop: { sx: { backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' } },
          paper: {
            sx: {
              borderRadius: 4,
              maxWidth: 360,
              mx: 2,
              background:
                theme.palette.mode === 'dark'
                  ? 'rgba(30, 41, 59, 0.75)'
                  : 'rgba(255, 255, 255, 0.75)',
              backdropFilter: 'blur(20px)',
              border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
              boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
            },
          },
        }}
      >
        <Box
          sx={{
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)',
              mb: 3,
              '@keyframes scaleIn': {
                '0%': { transform: 'scale(0.3)', opacity: 0 },
                '50%': { transform: 'scale(1.1)' },
                '100%': { transform: 'scale(1)', opacity: 1 },
              },
              animation: 'scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </Box>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: '1.25rem',
              color: theme.palette.mode === 'dark' ? '#f8fafc' : '#0f172a',
              mb: 1,
              letterSpacing: '-0.02em',
            }}
          >
            Goal Deleted
          </Typography>
          <Typography
            sx={{
              fontSize: '0.85rem',
              color: theme.palette.mode === 'dark' ? '#94a3b8' : '#64748b',
              mb: 3.5,
              lineHeight: 1.5,
            }}
          >
            The goal has been permanently removed from the system and database.
          </Typography>
          <Button
            fullWidth
            variant="contained"
            onClick={() => {
              setDeleteSuccessOpen(false);
              navigate(nextPath, { replace: true });
            }}
            sx={{
              textTransform: 'none',
              fontSize: '0.85rem',
              fontWeight: 700,
              borderRadius: 2.5,
              py: 1.2,
              background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
              },
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
            }}
          >
            Okay
          </Button>
        </Box>
      </Dialog>
    </Box>
  );
}
