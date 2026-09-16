/**
 * [module: design-system + connection-hub]
 * SettingsTab - single home for every bot config.
 *
 * Four cards:
 *  1. Personality (per active Telegram channel)
 *  2. Notification preferences (per-event toggles)
 *  3. Daily LLM spend cap (USD)
 *  4. Reply templates (which inline buttons attach to each message type)
 *
 * Follows DESIGN_SYSTEM.md: MUI 7 dark theme, rounded cards, brand colors,
 * mobile-first, generous whitespace, optimistic save with snackbar feedback.
 */
import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Switch,
  FormControlLabel,
  TextField,
  Button,
  Divider,
  CircularProgress,
  Alert,
  Snackbar,
  Skeleton,
  Chip,
  Stack,
  useTheme,
  alpha,
} from '@mui/material';
import RecordVoiceOverOutlinedIcon from '@mui/icons-material/RecordVoiceOverOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import TouchAppOutlinedIcon from '@mui/icons-material/TouchAppOutlined';
import TelegramIcon from '@mui/icons-material/Telegram';
import { supabase, hasSupabase } from '../../../lib/supabase';
import PersonalityPicker from '../components/PersonalityPicker';
import PaneStatusStrip from '../components/PaneStatusStrip';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import {
  NOTIFICATION_EVENTS,
  getNotificationPrefs,
  setNotificationPrefs,
  getSpendCap,
  setSpendCap,
  REPLY_TEMPLATE_TYPES,
  REPLY_BUTTONS,
  getReplyTemplates,
  setReplyTemplates,
  getUserRole,
} from '../../../services/communicatorService';

export default function SettingsTab() {
  const [spent, setSpent] = useState(null);
  const [cap, setCap] = useState(null);

  useEffect(() => {
    Promise.all([
      getSpendCap().catch(() => null),
      // best-effort: today's spend from command_history
      (async () => {
        if (!hasSupabase()) return 0;
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) return 0;
          const since = new Date();
          since.setHours(0, 0, 0, 0);
          const { data } = await supabase
            .from('command_history')
            .select('metadata, created_at')
            .eq('user_id', user.id)
            .gte('created_at', since.toISOString());
          return (data || []).reduce((a, r) => a + (Number(r.metadata?.cost) || 0), 0);
        } catch {
          return 0;
        }
      })(),
    ]).then(([c, s]) => {
      setCap(c);
      setSpent(s);
    });
  }, []);

  const effectiveCap = cap != null ? cap : 5;
  const remaining = Math.max(0, effectiveCap - (spent || 0));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 1.5, sm: 2 } }}>
      <PaneStatusStrip
        stats={[
          {
            value: spent != null ? `$${spent.toFixed(2)}` : '-',
            label: 'Today cost',
            color: 'primary',
            icon: PaidOutlinedIcon,
          },
          {
            value: `$${remaining.toFixed(2)}`,
            label: 'Cap remaining',
            color: remaining < 1 ? 'warning' : 'success',
            icon: GpsFixedIcon,
          },
          {
            value: `$${effectiveCap.toFixed(2)}`,
            label: 'Daily cap',
            color: 'info',
            icon: ShieldOutlinedIcon,
          },
        ]}
      />
      <PersonalityCard />
      <NotificationsCard />
      <SpendCapCard />
      <ReplyTemplatesCard />
    </Box>
  );
}

// ── Reusable card frame ────────────────────────────────────────────────────

function SectionCard({ Icon, title, subtitle, color = 'primary.main', children }) {
  const theme = useTheme();
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Box sx={{ p: { xs: 1.5, sm: 2 }, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            flexShrink: 0,
            bgcolor: alpha(
              theme.palette[color.split('.')[0]]?.main || theme.palette.primary.main,
              0.12
            ),
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.88rem' }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontSize: '0.72rem', display: 'block', mt: 0.25 }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
      <Divider />
      <Box sx={{ p: { xs: 1.5, sm: 2 } }}>{children}</Box>
    </Paper>
  );
}

// ── 1. Personality (per channel) ───────────────────────────────────────────

function PersonalityCard() {
  const [channels, setChannels] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      if (!hasSupabase()) {
        setChannels([]);
        return;
      }
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setChannels([]);
          return;
        }
        const { data } = await supabase
          .from('communication_channels')
          .select('id, config, status, last_active, platform')
          .eq('connected_by', user.id)
          .eq('platform', 'telegram')
          .order('created_at', { ascending: false });
        setChannels(data || []);
      } catch (e) {
        setErr(e.message);
        setChannels([]);
      }
    })();
  }, []);

  return (
    <SectionCard
      Icon={RecordVoiceOverOutlinedIcon}
      title="Bot personality"
      subtitle="Pick the tone your bot uses when replying in Telegram. You can change anytime."
    >
      {err && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 1.5 }}>
          {err}
        </Alert>
      )}
      {channels === null && <Skeleton height={64} sx={{ borderRadius: 2 }} />}
      {channels?.length === 0 && (
        <EmptyState
          icon={TelegramIcon}
          title="No Telegram channels yet"
          body="Connect Telegram first - then come back to pick your bot's personality."
          ctaLabel="Connect Telegram"
          ctaHref="/communicator/connect-telegram"
        />
      )}
      {channels?.map((ch) => (
        <Box key={ch.id} sx={{ '&:not(:last-child)': { mb: 1.5 } }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
            @{ch.config?.telegram_username || 'channel'}
          </Typography>
          <PersonalityPicker channelId={ch.id} value={ch.config?.personality || 'professional'} />
        </Box>
      ))}
    </SectionCard>
  );
}

// ── 2. Notification prefs ──────────────────────────────────────────────────

function NotificationsCard() {
  const [prefs, setPrefs] = useState(null);
  const [role, setRole] = useState('member');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    Promise.all([getNotificationPrefs(), getUserRole()])
      .then(([p, r]) => {
        setPrefs(p);
        setRole(r);
      })
      .catch(() => setPrefs({}));
  }, []);

  async function toggle(key, on) {
    const next = { ...(prefs || {}), [key]: on };
    setPrefs(next);
    setSaving(true);
    try {
      await setNotificationPrefs(next);
      setToast(`✓ Saved`);
    } catch (e) {
      setToast(`✕ ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      Icon={NotificationsActiveOutlinedIcon}
      title="Notification preferences"
      subtitle="Pick which events ping you on Telegram. Missing = enabled by default."
      color="info.main"
    >
      {prefs === null && <Skeleton height={120} sx={{ borderRadius: 2 }} />}
      {prefs && (
        <Stack spacing={0.5}>
          {NOTIFICATION_EVENTS.filter((e) => !e.adminOnly || role === 'admin').map((e) => {
            const enabled = prefs[e.key] !== false;
            return (
              <Box
                key={e.key}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                  p: 1,
                  borderRadius: 2,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.84rem' }}>
                    {e.label}
                    {e.adminOnly && (
                      <Chip
                        size="small"
                        label="admin"
                        sx={{ ml: 1, height: 16, fontSize: '0.6rem' }}
                      />
                    )}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', fontSize: '0.72rem', display: 'block' }}
                  >
                    {e.description}
                  </Typography>
                </Box>
                <Switch
                  size="small"
                  checked={enabled}
                  onChange={(ev) => toggle(e.key, ev.target.checked)}
                  disabled={saving}
                />
              </Box>
            );
          })}
        </Stack>
      )}
      <Snackbar
        open={!!toast}
        autoHideDuration={1800}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </SectionCard>
  );
}

// ── 3. Spend cap ───────────────────────────────────────────────────────────

function SpendCapCard() {
  const [cap, setCap] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    getSpendCap()
      .then((v) => {
        setCap(v);
        setDraft(v == null ? '' : String(v));
      })
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      await setSpendCap(draft);
      setCap(draft === '' ? null : Number(draft));
      setToast('✓ Saved');
    } catch (e) {
      setToast(`✕ ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      Icon={PaidOutlinedIcon}
      title="Daily LLM spend cap"
      subtitle="USD per day. Stops accidental cost runaway. Leave empty for the $5 default."
      color="warning.main"
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          type="number"
          placeholder="5.00"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <Typography component="span" sx={{ pr: 0.5, color: 'text.secondary' }}>
                  $
                </Typography>
              ),
            },
            htmlInput: { step: '0.5', min: '0' },
          }}
          sx={{ width: { xs: '100%', sm: 140 }, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <Button
          variant="contained"
          size="small"
          onClick={save}
          disabled={saving || draft === String(cap ?? '')}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          {saving ? <CircularProgress size={14} /> : 'Save'}
        </Button>
        {cap != null && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Current: ${Number(cap).toFixed(2)}/day
          </Typography>
        )}
      </Box>
      <Snackbar
        open={!!toast}
        autoHideDuration={1800}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </SectionCard>
  );
}

// ── 4. Reply templates ─────────────────────────────────────────────────────

function ReplyTemplatesCard() {
  const [tpl, setTpl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    getReplyTemplates()
      .then(setTpl)
      .catch(() => setTpl({}));
  }, []);

  async function toggleBtn(msgType, btnKey) {
    const current =
      tpl?.[msgType] ?? REPLY_TEMPLATE_TYPES.find((t) => t.key === msgType)?.buttons ?? [];
    const next = current.includes(btnKey)
      ? current.filter((b) => b !== btnKey)
      : [...current, btnKey];
    const nextTpl = { ...(tpl || {}), [msgType]: next };
    setTpl(nextTpl);
    setSaving(true);
    try {
      await setReplyTemplates(nextTpl);
      setToast('✓ Saved');
    } catch (e) {
      setToast(`✕ ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      Icon={TouchAppOutlinedIcon}
      title="Reply templates"
      subtitle="Choose which inline buttons the bot attaches to each message type."
      color="secondary.main"
    >
      {tpl === null && <Skeleton height={160} sx={{ borderRadius: 2 }} />}
      {tpl && (
        <Stack spacing={1.25}>
          {REPLY_TEMPLATE_TYPES.map((t) => {
            const enabled = tpl[t.key] ?? t.buttons;
            return (
              <Box
                key={t.key}
                sx={{
                  p: 1,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'text.secondary',
                    display: 'block',
                    mb: 0.75,
                  }}
                >
                  {t.label}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {t.buttons.map((b) => {
                    const meta = REPLY_BUTTONS[b];
                    const isOn = enabled.includes(b);
                    return (
                      <Chip
                        key={b}
                        label={meta?.label || b}
                        size="small"
                        clickable
                        color={isOn ? 'primary' : 'default'}
                        variant={isOn ? 'filled' : 'outlined'}
                        onClick={() => toggleBtn(t.key, b)}
                        sx={{ borderRadius: 2, height: 26, fontSize: '0.74rem' }}
                      />
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </Stack>
      )}
      <Snackbar
        open={!!toast}
        autoHideDuration={1800}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </SectionCard>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, body, ctaLabel, ctaHref }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        py: 3,
        px: 2,
        textAlign: 'center',
        borderRadius: 2,
        bgcolor: alpha(theme.palette.primary.main, 0.04),
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          mx: 'auto',
          mb: 1.5,
          bgcolor: alpha(theme.palette.primary.main, 0.12),
          color: 'primary.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon sx={{ fontSize: 22 }} />
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.88rem', mb: 0.5 }}>
        {title}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', display: 'block', mb: 2, fontSize: '0.78rem' }}
      >
        {body}
      </Typography>
      {ctaLabel && (
        <Button
          variant="contained"
          size="small"
          href={ctaHref}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          {ctaLabel}
        </Button>
      )}
    </Box>
  );
}
