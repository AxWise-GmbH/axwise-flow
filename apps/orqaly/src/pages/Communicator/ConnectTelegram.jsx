/**
 * [module: connection-hub]
 * ConnectTelegram - visual onboarding wizard for the shared-bot link-code flow.
 *
 * Flow:
 *   1. Click "Generate code" → backend issues 6-char code, 10-min TTL.
 *   2. Page shows QR (desktop → mobile) + tappable t.me deep-link (mobile).
 *   3. User taps deep-link / scans QR → Telegram opens with /start CODE pre-filled.
 *   4. Page polls /api/communicator/link-code?action=status and also subscribes
 *      to communication_channels realtime; first to fire flips us to "Linked ✓".
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  Chip,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Alert,
  IconButton,
  useTheme,
  alpha,
  CircularProgress,
  Divider,
  Tooltip,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import TelegramIcon from '@mui/icons-material/Telegram';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import QRCode from 'qrcode';
import { supabase, hasSupabase } from '../../lib/supabase';
import {
  startTelegramLink,
  pollTelegramLink,
  cancelTelegramLink,
} from '../../services/communicatorService';
import PersonalityPicker from './components/PersonalityPicker';

import AppIcon from '../../components/icons/AppIcon';

const POLL_INTERVAL_MS = 2500;

export default function ConnectTelegram() {
  const theme = useTheme();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [existingChannel, setExistingChannel] = useState(null);
  const [loading, setLoading] = useState(true);

  const [activeStep, setActiveStep] = useState(0);

  const [link, setLink] = useState(null); // { code, deep_link, bot_username, expires_at, ttl_seconds }
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const [linkStatus, setLinkStatus] = useState('idle'); // idle | pending | linked | expired
  const [linkedChannel, setLinkedChannel] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const pollRef = useRef(null);
  const tickRef = useRef(null);
  const channelSubRef = useRef(null);

  // Load current user + existing channel.
  useEffect(() => {
    (async () => {
      if (!hasSupabase()) {
        setLoading(false);
        return;
      }
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setUser(user);
        if (user) {
          const { data: ch } = await supabase
            .from('communication_channels')
            .select('id, status, config, last_active')
            .eq('platform', 'telegram')
            .eq('connected_by', user.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (ch) {
            setExistingChannel(ch);
            setActiveStep(3);
          }
        }
      } catch (_e) {}
      setLoading(false);
    })();
  }, []);

  // Render QR when we have a deep-link.
  useEffect(() => {
    if (!link?.deep_link) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(link.deep_link, {
      width: 260,
      margin: 1,
      color: { dark: '#111', light: '#fff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [link?.deep_link]);

  // Poll backend + run countdown while a code is outstanding.
  useEffect(() => {
    clearInterval(pollRef.current);
    clearInterval(tickRef.current);
    if (!link?.code || linkStatus !== 'pending') return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await pollTelegramLink(link.code);
        if (res.status === 'linked') {
          setLinkStatus('linked');
          setLinkedChannel(res.channel || null);
          setActiveStep(3);
          clearInterval(pollRef.current);
          clearInterval(tickRef.current);
        } else if (res.status === 'expired') {
          setLinkStatus('expired');
          clearInterval(pollRef.current);
          clearInterval(tickRef.current);
        }
      } catch (_e) {
        /* keep polling */
      }
    }, POLL_INTERVAL_MS);

    // Countdown
    const expiresAt = new Date(link.expires_at).getTime();
    tickRef.current = setInterval(() => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        setLinkStatus('expired');
        clearInterval(tickRef.current);
      }
    }, 1000);

    return () => {
      clearInterval(pollRef.current);
      clearInterval(tickRef.current);
    };
  }, [link?.code, linkStatus, link?.expires_at]);

  // Realtime: also catch the channel insert directly.
  useEffect(() => {
    if (!hasSupabase() || !user || linkStatus !== 'pending') return;
    try {
      channelSubRef.current = supabase
        .channel(`comm-channels-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'communication_channels',
            filter: `connected_by=eq.${user.id}`,
          },
          (payload) => {
            if (payload?.new?.platform === 'telegram' && payload?.new?.status === 'active') {
              setLinkStatus('linked');
              setLinkedChannel({
                id: payload.new.id,
                telegram_username: payload.new.config?.telegram_username || null,
              });
              setActiveStep(3);
            }
          }
        )
        .subscribe();
    } catch (_e) {}
    return () => {
      try {
        if (channelSubRef.current) supabase.removeChannel(channelSubRef.current);
      } catch (_e) {}
    };
  }, [user, linkStatus]);

  async function handleGenerate() {
    setLinkErr('');
    setLink(null);
    setLinkStatus('idle');
    setLinkedChannel(null);
    setActiveStep(1);
    try {
      const res = await startTelegramLink();
      setLink(res);
      setSecondsLeft(res.ttl_seconds || 600);
      setLinkStatus('pending');
      // Stay on step 2 so the QR code + 6-char code remain visible while
      // we wait for the user to send /start in Telegram. We only advance
      // to step 3 once linkStatus flips to 'linked' (handled elsewhere).
    } catch (err) {
      setLinkErr(err.message || 'Could not generate code');
      setActiveStep(0);
    }
  }

  async function handleRegenerate() {
    if (link?.code) await cancelTelegramLink(link.code).catch(() => {});
    handleGenerate();
  }

  async function handleDisconnect() {
    if (!existingChannel?.id) return;
    if (!hasSupabase()) return;
    if (!confirm('Disconnect Telegram? You can re-link any time.')) return;
    await supabase
      .from('communication_channels')
      .update({ status: 'inactive' })
      .eq('id', existingChannel.id);
    setExistingChannel(null);
    setActiveStep(0);
  }

  function copyCode() {
    if (!link?.code) return;
    navigator.clipboard?.writeText(link.code).catch(() => {});
  }

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  // ─── Already connected ─────────────────────────────────────────────────
  if (existingChannel && linkStatus !== 'linked') {
    const handle = existingChannel.config?.telegram_username
      ? `@${existingChannel.config.telegram_username}`
      : 'your Telegram account';
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 } }}>
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 3, sm: 4 },
            borderRadius: 3,
            textAlign: 'center',
            background: `linear-gradient(180deg, ${alpha(theme.palette.success.main, 0.06)} 0%, transparent 100%)`,
          }}
        >
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              mx: 'auto',
              mb: 2,
              bgcolor: alpha(theme.palette.success.main, 0.12),
              color: 'success.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon name="CheckCircle" fallback={CheckCircleIcon} sx={{ fontSize: 36 }} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
            Telegram connected
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Linked to {handle}. DM{' '}
            <b>@{import.meta.env.VITE_TELEGRAM_SHARED_BOT_USERNAME || 'orchestratori_bot'}</b>{' '}
            anytime.
          </Typography>
          <Box sx={{ mb: 2.5, textAlign: 'left' }}>
            <PersonalityPicker
              channelId={existingChannel.id}
              value={existingChannel.config?.personality || 'professional'}
            />
          </Box>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 1.5,
              justifyContent: 'center',
            }}
          >
            <Button
              variant="contained"
              onClick={() => navigate('/communicator')}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              Open Communicator
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={
                <AppIcon name="SettingsBackupRestore" fallback={SettingsBackupRestoreIcon} />
              }
              onClick={handleDisconnect}
              sx={{ borderRadius: 2, textTransform: 'none' }}
            >
              Disconnect
            </Button>
          </Box>
        </Paper>
      </Container>
    );
  }

  // ─── Linked just now ──────────────────────────────────────────────────
  if (linkStatus === 'linked') {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 } }}>
        <SuccessCard
          onOpen={() => navigate('/communicator')}
          handle={linkedChannel?.telegram_username}
          channelId={linkedChannel?.id}
        />
      </Container>
    );
  }

  // ─── Wizard ───────────────────────────────────────────────────────────
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2, sm: 5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            bgcolor: alpha('#229ED9', 0.12),
            color: '#229ED9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon name="Telegram" fallback={TelegramIcon} sx={{ fontSize: 22 }} />
        </Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            Connect Telegram
          </Typography>
          <Typography variant="body2" color="text.secondary">
            DM the bot to run Orqaly from anywhere.
          </Typography>
        </Box>
      </Box>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
        <Stepper activeStep={activeStep} orientation="vertical">
          <Step>
            <StepLabel sx={{ '& .MuiStepLabel-label': { fontWeight: 600 } }}>
              Generate your code
            </StepLabel>
            <StepContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Tap to get a one-time 6-character code (valid for 10 minutes).
              </Typography>
              {linkErr && (
                <Alert severity="error" sx={{ mb: 1.5, borderRadius: 2 }}>
                  {linkErr}
                </Alert>
              )}
              <Button
                variant="contained"
                onClick={handleGenerate}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
              >
                Get code
              </Button>
            </StepContent>
          </Step>

          <Step>
            <StepLabel sx={{ '& .MuiStepLabel-label': { fontWeight: 600 } }}>
              Open Telegram & send the code
            </StepLabel>
            <StepContent>
              {!link ? (
                <CircularProgress size={20} />
              ) : (
                <>
                  <CodePanel
                    link={link}
                    qrDataUrl={qrDataUrl}
                    secondsLeft={secondsLeft}
                    linkStatus={linkStatus}
                    onCopy={copyCode}
                    onRegenerate={handleRegenerate}
                  />
                  {linkStatus === 'pending' && (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        mt: 2,
                        p: 1.25,
                        borderRadius: 2,
                        bgcolor: alpha(theme.palette.info.main, 0.06),
                      }}
                    >
                      <PulsingDot />
                      <Typography variant="body2" color="text.secondary">
                        Listening for <code>/start {link?.code}</code> from your Telegram…
                      </Typography>
                    </Box>
                  )}
                </>
              )}
            </StepContent>
          </Step>

          <Step>
            <StepLabel sx={{ '& .MuiStepLabel-label': { fontWeight: 600 } }}>
              {linkStatus === 'expired' ? 'Code expired' : 'Done'}
            </StepLabel>
            <StepContent>
              {linkStatus === 'expired' && (
                <Alert
                  severity="warning"
                  sx={{ borderRadius: 2 }}
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      onClick={handleRegenerate}
                      startIcon={<AppIcon name="Refresh" fallback={RefreshIcon} />}
                    >
                      Regenerate
                    </Button>
                  }
                >
                  This code expired. Generate a new one.
                </Alert>
              )}
            </StepContent>
          </Step>
        </Stepper>
      </Paper>
      <HelpRow theme={theme} />
    </Container>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function CodePanel({ link, qrDataUrl, secondsLeft, linkStatus, onCopy, onRegenerate }) {
  const theme = useTheme();
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 2.5,
        alignItems: { sm: 'flex-start' },
      }}
    >
      {/* QR */}
      <Box
        sx={{
          width: 200,
          height: 200,
          mx: { xs: 'auto', sm: 0 },
          borderRadius: 2,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="QR code"
            width={188}
            height={188}
            style={{ display: 'block' }}
          />
        ) : (
          <AppIcon
            name="QrCode2"
            fallback={QrCode2Icon}
            sx={{ fontSize: 80, color: 'text.disabled' }}
          />
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 700,
            fontSize: '0.66rem',
          }}
        >
          Your code
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 800,
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: 'primary.main',
            }}
          >
            {link.code}
          </Typography>
          <Tooltip title="Copy">
            <IconButton size="small" onClick={onCopy}>
              <AppIcon name="ContentCopy" fallback={ContentCopyIcon} sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Expires in {mins}:{String(secs).padStart(2, '0')}
        </Typography>

        <Button
          fullWidth
          variant="contained"
          size="large"
          href={link.deep_link}
          target="_blank"
          rel="noopener noreferrer"
          startIcon={<AppIcon name="Telegram" fallback={TelegramIcon} />}
          endIcon={<AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 16 }} />}
          sx={{
            mt: 1.5,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 700,
            bgcolor: '#229ED9',
            '&:hover': { bgcolor: '#1a8fc7' },
          }}
        >
          Open Telegram
        </Button>

        <Divider sx={{ my: 1.5 }}>or</Divider>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          DM <b>@{link.bot_username}</b> with:
        </Typography>
        <Box
          sx={{
            mt: 0.5,
            p: 1,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.06),
            fontFamily: 'monospace',
            fontSize: '0.85rem',
          }}
        >
          /start {link.code}
        </Box>

        {linkStatus === 'expired' && (
          <Button
            onClick={onRegenerate}
            startIcon={<AppIcon name="Refresh" fallback={RefreshIcon} />}
            sx={{ mt: 1.5, borderRadius: 2, textTransform: 'none' }}
          >
            Regenerate code
          </Button>
        )}
      </Box>
    </Box>
  );
}

function PulsingDot() {
  const theme = useTheme();
  return (
    <Box
      sx={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        bgcolor: 'info.main',
        boxShadow: `0 0 0 0 ${alpha(theme.palette.info.main, 0.6)}`,
        animation: 'connectPulse 1.6s ease-out infinite',
        '@keyframes connectPulse': {
          '0%': { boxShadow: `0 0 0 0 ${alpha(theme.palette.info.main, 0.6)}` },
          '70%': { boxShadow: `0 0 0 12px ${alpha(theme.palette.info.main, 0)}` },
          '100%': { boxShadow: `0 0 0 0 ${alpha(theme.palette.info.main, 0)}` },
        },
      }}
    />
  );
}

function SuccessCard({ onOpen, handle, channelId }) {
  const theme = useTheme();
  const examples = [
    'list my goals',
    'create a goal: research X, budget 50',
    'send me a partner summary',
  ];
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 3, sm: 4 },
        borderRadius: 3,
        textAlign: 'center',
        background: `linear-gradient(180deg, ${alpha(theme.palette.success.main, 0.06)} 0%, transparent 100%)`,
      }}
    >
      <Box
        sx={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          mx: 'auto',
          mb: 2,
          bgcolor: alpha(theme.palette.success.main, 0.12),
          color: 'success.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppIcon name="CheckCircle" fallback={CheckCircleIcon} sx={{ fontSize: 36 }} />
      </Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        You're linked.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        {handle ? (
          <>
            Connected as <b>@{handle}</b>.
          </>
        ) : (
          'Connection confirmed.'
        )}{' '}
        Try sending one of these in Telegram:
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', justifyContent: 'center', mb: 2.5 }}>
        {examples.map((ex) => (
          <Chip
            key={ex}
            label={ex}
            variant="outlined"
            sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }}
          />
        ))}
      </Box>
      {channelId && (
        <Box sx={{ mb: 2.5, textAlign: 'left' }}>
          <PersonalityPicker channelId={channelId} value="professional" />
        </Box>
      )}
      <Button
        variant="contained"
        onClick={onOpen}
        sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
      >
        Open Communicator
      </Button>
    </Paper>
  );
}

function HelpRow({ theme }) {
  const cards = useMemo(
    () => [
      {
        icon: LockOutlinedIcon,
        title: 'Is this secure?',
        body: 'Only your linked Telegram ID can talk to the bot. Forged webhook calls are rejected at the door. Your data is never visible to other users.',
      },
      {
        icon: TelegramIcon,
        title: "Don't have Telegram?",
        body: 'Install from the App Store / Play Store, sign up with your phone number, then come back and tap "Open Telegram".',
      },
    ],
    []
  );
  return (
    <Box
      sx={{ mt: 3, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}
    >
      {cards.map((c) => (
        <Paper key={c.title} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <AppIcon fallback={c.icon} sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontSize: '0.66rem',
              }}
            >
              {c.title}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
            {c.body}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}
