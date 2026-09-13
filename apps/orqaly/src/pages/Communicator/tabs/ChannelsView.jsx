/**
 * [module: connection-hub]
 * ChannelsView - multi-platform channel manager.
 *
 *   Renders one card per platform (Telegram · Discord · Slack · Webhook).
 *   Each card is either:
 *     • Connected   → details + PersonalityPicker (Telegram) + Test + Disconnect
 *     • Not connected → compact CTA. Telegram routes to the shared-bot wizard;
 *                        the rest open ChannelDialogInline with platform locked.
 *
 *   Rule: ONE active channel per platform per user. Enforced both here (UI
 *   never offers "Add another") and at the backend (link-code.js for telegram,
 *   communicatorService.addChannel for the rest).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  Skeleton,
  Alert,
  Stack,
  Chip,
  CircularProgress,
  useTheme,
  alpha,
} from '@mui/material';
import FormDialog from '../../../components/Common/FormDialog';

import TelegramIcon from '@mui/icons-material/Telegram';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import LinkOffOutlinedIcon from '@mui/icons-material/LinkOffOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import CheckCircleOutlineOutlinedIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import AddIcon from '@mui/icons-material/Add';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';

import { supabase, hasSupabase } from '../../../lib/supabase';
import { updateChannel, addChannel } from '../../../services/communicatorService';
import PersonalityPicker from '../components/PersonalityPicker';
import { ChannelDialogInline, PLATFORM_META } from './ControllerTab';

import AppIcon from '../../../components/icons/AppIcon';

const SHARED_BOT = (
  import.meta.env.VITE_TELEGRAM_SHARED_BOT_USERNAME || 'orchestratori_bot'
).toLowerCase();

// Per-platform copy + capability flags. Truth about what works today,
// rendered into honest UI badges so users know what to expect.
const PLATFORM_CAPS = {
  telegram: {
    Icon: TelegramIcon,
    tint: '#229ED9',
    name: 'Telegram',
    blurb: 'Full two-way bot - DM commands, voice, files, push notifications.',
    inbound: 'live', // works now
    outbound: 'live',
    addMode: 'wizard', // route to /communicator/connect-telegram
    supportsPersonality: true,
  },
  discord: {
    Icon: HubOutlinedIcon,
    tint: '#5865F2',
    name: 'Discord',
    blurb: 'Outbound notifications to your server. Two-way replies coming soon.',
    inbound: 'soon',
    outbound: 'live',
    addMode: 'dialog',
    supportsPersonality: false,
  },
  slack: {
    Icon: HubOutlinedIcon,
    tint: '#4A154B',
    name: 'Slack',
    blurb: 'Outbound notifications to your workspace. Two-way replies coming soon.',
    inbound: 'soon',
    outbound: 'live',
    addMode: 'dialog',
    supportsPersonality: false,
  },
  webhook: {
    Icon: TerminalIcon,
    tint: '#10B981',
    name: 'Webhook',
    blurb: 'Generic inbound endpoint for custom integrations and scripts.',
    inbound: 'live',
    outbound: 'n/a',
    addMode: 'dialog',
    supportsPersonality: false,
  },
};

const PLATFORM_ORDER = ['telegram', 'discord', 'slack', 'webhook'];

export default function ChannelsView() {
  const theme = useTheme();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [channels, setChannels] = useState({}); // { platform: channelRow }
  const [error, setError] = useState('');

  const [confirmTarget, setConfirmTarget] = useState(null); // channel object
  const [disconnecting, setDisconnecting] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [testResults, setTestResults] = useState({}); // { platform: { ok, message } }

  const [addPlatform, setAddPlatform] = useState(null); // 'discord' | 'slack' | 'webhook' | null
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const subRef = useRef(null);

  // ── Initial load + realtime subscription ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!hasSupabase()) {
          setLoading(false);
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }
        setUserId(user.id);

        await fetchChannels(user.id, cancelled);

        try {
          subRef.current = supabase
            .channel(`channels-view-${user.id}`)
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'communication_channels',
                filter: `connected_by=eq.${user.id}`,
              },
              () => fetchChannels(user.id, cancelled)
            )
            .subscribe();
        } catch (_e) {
          /* realtime is best-effort */
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || String(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      try {
        if (subRef.current) supabase.removeChannel(subRef.current);
      } catch (_e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchChannels(uid, cancelled) {
    const { data, error: err } = await supabase
      .from('communication_channels')
      .select('id, platform, status, config, last_active, created_at, name')
      .eq('connected_by', uid)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (cancelled) return;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    // Keep only the most-recent active per platform (UI-level dedupe; backend
    // also enforces this so duplicates should never appear, but it doesn't
    // cost anything to be defensive).
    const byPlatform = {};
    for (const row of data || []) {
      if (!byPlatform[row.platform]) byPlatform[row.platform] = row;
    }
    setChannels(byPlatform);
    setLoading(false);
  }

  async function handleDisconnect() {
    if (!confirmTarget?.id) return;
    setDisconnecting(true);
    try {
      await updateChannel(confirmTarget.id, { status: 'inactive' });
      setConfirmTarget(null);
      // Optimistic: drop the platform from the local map.
      setChannels((prev) => {
        const next = { ...prev };
        delete next[confirmTarget.platform];
        return next;
      });
    } catch (e) {
      setError(e.message || 'Could not disconnect');
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleTest(channel) {
    setTestingId(channel.id);
    setTestResults((prev) => ({ ...prev, [channel.platform]: null }));
    try {
      const since = channel.last_active ? new Date(channel.last_active).getTime() : 0;
      const idleMs = since ? Date.now() - since : null;

      // Honest config-shape check. A real reachability probe needs server
      // endpoints we don't have for Discord/Slack today; deferred.
      const required = (PLATFORM_META[channel.platform]?.fields || []).map((f) => f.key);
      const missing = required.filter((k) => !channel.config?.[k]);
      const ok = channel.status === 'active' && missing.length === 0;

      setTestResults((prev) => ({
        ...prev,
        [channel.platform]: {
          ok,
          message: ok
            ? `Config valid. ${idleMs != null ? `Last activity ${humanAgo(idleMs)} ago.` : 'No activity yet.'}`
            : `Missing required config: ${missing.join(', ')}.`,
        },
      }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [channel.platform]: { ok: false, message: e.message || 'Test failed' },
      }));
    } finally {
      setTestingId(null);
    }
  }

  async function handleAddSave(form) {
    setSaving(true);
    setAddError('');
    try {
      await addChannel({
        platform: form.platform,
        name: form.name || PLATFORM_CAPS[form.platform]?.name || form.platform,
        config: form.config || {},
        status: 'active',
      });
      setAddPlatform(null);
      if (userId) await fetchChannels(userId, false);
    } catch (e) {
      setAddError(e.message || 'Could not add channel');
    } finally {
      setSaving(false);
    }
  }

  function handleAddClick(platform) {
    const cap = PLATFORM_CAPS[platform];
    if (!cap) return;
    if (cap.addMode === 'wizard') {
      navigate('/communicator/connect-telegram');
      return;
    }
    setAddError('');
    setAddPlatform(platform);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={110} />
        ))}
      </Box>
    );
  }

  if (error && Object.keys(channels).length === 0) {
    return (
      <Alert severity="error" sx={{ borderRadius: 2 }}>
        Couldn&apos;t load channels: {error}
      </Alert>
    );
  }

  const connectedCount = Object.keys(channels).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.25 }}>
        <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '0.96rem' }}>
          Channels
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
          {connectedCount}/{PLATFORM_ORDER.length} connected · one per platform
        </Typography>
      </Box>
      <Stack spacing={1.25}>
        {PLATFORM_ORDER.map((platform) => (
          <PlatformChannelCard
            key={platform}
            platform={platform}
            channel={channels[platform] || null}
            testing={testingId && channels[platform]?.id === testingId}
            testResult={testResults[platform]}
            theme={theme}
            onAdd={() => handleAddClick(platform)}
            onDisconnect={(ch) => setConfirmTarget(ch)}
            onTest={(ch) => handleTest(ch)}
          />
        ))}
      </Stack>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.25}
        sx={{ mt: 0.75, '& > *': { flex: 1 } }}
      >
        <InfoCard
          icon={<AppIcon name="LockOutlined" fallback={LockOutlinedIcon} sx={{ fontSize: 18 }} />}
          tint={theme.palette.success.main}
          title="Secure by default"
          body="Channel tokens are owner-scoped via RLS. Only your account can see your channels, your bot tokens, and your message history."
        />
        <InfoCard
          icon={
            <AppIcon
              name="PhoneIphoneOutlined"
              fallback={PhoneIphoneOutlinedIcon}
              sx={{ fontSize: 18 }}
            />
          }
          tint={theme.palette.info.main}
          title="One per platform"
          body="Adding a new channel to a platform you already have connected will deactivate the previous one - no duplicate routing."
        />
      </Stack>
      <ChannelDialogInline
        open={!!addPlatform}
        onClose={() => !saving && setAddPlatform(null)}
        onSave={handleAddSave}
        saving={saving}
        lockedPlatform={addPlatform || undefined}
      />
      {addError && (
        <Alert severity="error" onClose={() => setAddError('')} sx={{ borderRadius: 2 }}>
          {addError}
        </Alert>
      )}
      <FormDialog
        open={!!confirmTarget}
        onClose={() => !disconnecting && setConfirmTarget(null)}
        title={`Disconnect ${PLATFORM_CAPS[confirmTarget?.platform]?.name || 'channel'}?`}
        maxWidth="xs"
        actions={
          <>
            <Button onClick={() => setConfirmTarget(null)} disabled={disconnecting}>
              Cancel
            </Button>
            <Button
              onClick={handleDisconnect}
              color="error"
              variant="contained"
              disabled={disconnecting}
              startIcon={
                disconnecting ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <AppIcon name="LinkOffOutlined" fallback={LinkOffOutlinedIcon} />
                )
              }
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Disconnect
            </Button>
          </>
        }
      >
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          The bot will stop replying on this channel. You can reconnect anytime.
        </Typography>
      </FormDialog>
    </Box>
  );
}

// ── Single platform card ────────────────────────────────────────────────────

function PlatformChannelCard({
  platform,
  channel,
  theme,
  testing,
  testResult,
  onAdd,
  onDisconnect,
  onTest,
}) {
  const cap = PLATFORM_CAPS[platform];
  if (!cap) return null;
  return channel ? (
    <ConnectedCard
      platform={platform}
      cap={cap}
      channel={channel}
      theme={theme}
      testing={testing}
      testResult={testResult}
      onDisconnect={onDisconnect}
      onTest={onTest}
    />
  ) : (
    <EmptyPlatformCard cap={cap} theme={theme} onAdd={onAdd} />
  );
}

function ConnectedCard({
  platform,
  cap,
  channel,
  theme,
  testing,
  testResult,
  onDisconnect,
  onTest,
}) {
  const Icon = cap.Icon;
  const handle =
    channel.config?.telegram_username || channel.config?.guild_id || channel.name || cap.name;
  const botName = channel.config?.bot_username;
  const linkedAt = channel.config?.linked_at || channel.created_at;
  const lastSeen = channel.last_active;
  const personality = channel.config?.personality || 'professional';

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 1.75 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: alpha(theme.palette.success.main, 0.3),
        background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.05)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.25 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2.5,
            flexShrink: 0,
            bgcolor: alpha(cap.tint, 0.14),
            color: cap.tint,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon fallback={Icon} sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            <Typography variant="body1" sx={{ fontWeight: 800, fontSize: '0.95rem' }}>
              {cap.name}
            </Typography>
            <Chip
              size="small"
              label="Connected"
              icon={
                <AppIcon
                  name="CheckCircleOutlineOutlined"
                  fallback={CheckCircleOutlineOutlinedIcon}
                  sx={{ fontSize: 13 }}
                />
              }
              sx={{
                bgcolor: alpha(theme.palette.success.main, 0.12),
                color: 'success.main',
                fontWeight: 700,
                fontSize: '0.68rem',
                height: 20,
                '& .MuiChip-icon': { color: 'success.main', ml: 0.5 },
              }}
            />
            {cap.inbound === 'soon' && (
              <Chip
                size="small"
                icon={
                  <AppIcon
                    name="HourglassEmptyOutlined"
                    fallback={HourglassEmptyOutlinedIcon}
                    sx={{ fontSize: 13 }}
                  />
                }
                label="Inbound coming soon"
                sx={{
                  bgcolor: alpha(theme.palette.warning.main, 0.12),
                  color: 'warning.main',
                  fontWeight: 700,
                  fontSize: '0.65rem',
                  height: 20,
                  '& .MuiChip-icon': { color: 'warning.main', ml: 0.5 },
                }}
              />
            )}
          </Stack>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', display: 'block', mt: 0.15, fontSize: '0.76rem' }}
          >
            {platform === 'telegram' ? (
              <>
                {handle ? `@${handle}` : 'Account linked'}
                {botName ? ` · via @${botName}` : ` · via @${SHARED_BOT}`}
              </>
            ) : platform === 'discord' ? (
              `Guild ${handle}`
            ) : platform === 'slack' ? (
              `Workspace ${handle}`
            ) : (
              `Endpoint: /api/communicator/webhook/webhook`
            )}
          </Typography>
        </Box>
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.25 }}>
        <MiniStat
          icon={<AppIcon name="BoltOutlined" fallback={BoltOutlinedIcon} sx={{ fontSize: 15 }} />}
          label="Last active"
          value={
            lastSeen
              ? humanAgo(Date.now() - new Date(lastSeen).getTime()) + ' ago'
              : 'No activity yet'
          }
          tint={theme.palette.warning.main}
        />
        <MiniStat
          icon={
            <AppIcon name="HistoryOutlined" fallback={HistoryOutlinedIcon} sx={{ fontSize: 15 }} />
          }
          label="Linked"
          value={linkedAt ? humanAgo(Date.now() - new Date(linkedAt).getTime()) + ' ago' : '-'}
          tint={theme.palette.info.main}
        />
      </Stack>
      {cap.supportsPersonality && (
        <PersonalityPicker channelId={channel.id} value={personality} dense />
      )}
      {testResult && (
        <Alert
          severity={testResult.ok ? 'success' : 'warning'}
          sx={{ mt: 1.25, borderRadius: 2, fontSize: '0.78rem', py: 0.5 }}
        >
          {testResult.message}
        </Alert>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.25 }}>
        <Button
          onClick={() => onTest(channel)}
          disabled={testing}
          variant="outlined"
          size="small"
          startIcon={
            testing ? (
              <CircularProgress size={14} />
            ) : (
              <AppIcon
                name="VerifiedOutlined"
                fallback={VerifiedOutlinedIcon}
                sx={{ fontSize: 17 }}
              />
            )
          }
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: 2,
            borderColor: alpha(theme.palette.primary.main, 0.3),
            color: 'primary.main',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: alpha(theme.palette.primary.main, 0.06),
            },
          }}
        >
          {testing ? 'Testing…' : 'Test'}
        </Button>
        <Button
          onClick={() => onDisconnect(channel)}
          size="small"
          startIcon={
            <AppIcon name="LinkOffOutlined" fallback={LinkOffOutlinedIcon} sx={{ fontSize: 17 }} />
          }
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: 2,
            color: 'error.main',
            '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.06) },
          }}
        >
          Disconnect
        </Button>
      </Stack>
    </Paper>
  );
}

function EmptyPlatformCard({ cap, theme, onAdd }) {
  const Icon = cap.Icon;
  const useWizard = cap.addMode === 'wizard';
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 1.75 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.background.paper, 0.6),
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 1.5,
        alignItems: { xs: 'stretch', sm: 'center' },
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2.5,
          flexShrink: 0,
          bgcolor: alpha(cap.tint, 0.12),
          color: cap.tint,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: { xs: 'flex-start', sm: 'center' },
        }}
      >
        <AppIcon fallback={Icon} sx={{ fontSize: 20 }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap' }}>
          <Typography variant="body1" sx={{ fontWeight: 800, fontSize: '0.95rem' }}>
            {cap.name}
          </Typography>
          <CapabilityChips cap={cap} theme={theme} />
        </Stack>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontSize: '0.78rem',
            display: 'block',
            mt: 0.25,
            lineHeight: 1.45,
          }}
        >
          {cap.blurb}
        </Typography>
      </Box>
      <Button
        onClick={onAdd}
        variant={useWizard ? 'contained' : 'outlined'}
        size="small"
        startIcon={
          useWizard ? (
            <AppIcon
              name="RocketLaunchOutlined"
              fallback={RocketLaunchOutlinedIcon}
              sx={{ fontSize: 17 }}
            />
          ) : (
            <AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 17 }} />
          )
        }
        endIcon={
          useWizard ? (
            <AppIcon
              name="ArrowForwardOutlined"
              fallback={ArrowForwardOutlinedIcon}
              sx={{ fontSize: 16 }}
            />
          ) : null
        }
        sx={{
          textTransform: 'none',
          fontWeight: 700,
          borderRadius: 2,
          alignSelf: { xs: 'stretch', sm: 'center' },
          flexShrink: 0,
        }}
      >
        {useWizard ? 'Connect' : 'Add channel'}
      </Button>
    </Paper>
  );
}

function CapabilityChips({ cap, theme }) {
  const items = [];
  if (cap.inbound === 'live') items.push({ label: 'inbound', color: theme.palette.success.main });
  if (cap.inbound === 'soon')
    items.push({ label: 'inbound · soon', color: theme.palette.warning.main });
  if (cap.outbound === 'live') items.push({ label: 'outbound', color: theme.palette.success.main });
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
      {items.map((it) => (
        <Chip
          key={it.label}
          size="small"
          label={it.label}
          sx={{
            bgcolor: alpha(it.color, 0.1),
            color: it.color,
            fontWeight: 700,
            fontSize: '0.62rem',
            height: 18,
            textTransform: 'lowercase',
          }}
        />
      ))}
    </Stack>
  );
}

function MiniStat({ icon, label, value, tint }) {
  return (
    <Box
      sx={{
        flex: 1,
        p: 1,
        borderRadius: 2,
        bgcolor: alpha(tint, 0.05),
        border: '1px solid',
        borderColor: alpha(tint, 0.15),
        display: 'flex',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <Box
        sx={{
          width: 26,
          height: 26,
          borderRadius: 1.5,
          flexShrink: 0,
          bgcolor: alpha(tint, 0.12),
          color: tint,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            fontSize: '0.6rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'text.disabled',
            display: 'block',
          }}
        >
          {label}
        </Typography>
        <Typography
          variant="body2"
          sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'text.primary' }}
        >
          {value}
        </Typography>
      </Box>
    </Box>
  );
}

function InfoCard({ icon, tint, title, body }) {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        borderRadius: 2.5,
        bgcolor: alpha(tint, 0.05),
        border: '1px solid',
        borderColor: alpha(tint, 0.18),
        display: 'flex',
        gap: 1.25,
        alignItems: 'flex-start',
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1.5,
          flexShrink: 0,
          bgcolor: alpha(tint, 0.14),
          color: tint,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.86rem', mb: 0.25 }}>
          {title}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', fontSize: '0.76rem', lineHeight: 1.45, display: 'block' }}
        >
          {body}
        </Typography>
      </Box>
    </Paper>
  );
}

function humanAgo(ms) {
  if (!ms || ms < 0) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
}
