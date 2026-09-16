import { useState } from 'react';
import { Alert, Box, Button, Typography, alpha, useTheme } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import AppIcon from '../../components/icons/AppIcon';
import { usePulseBarPref } from '../../hooks/usePulseBarPref';
import { useAxwise } from '../../hooks/useAxwise';

/**
 * The AxWise overlay controls: a master On/Off switch for all AxWise surfaces
 * (PulseBar, /axwise-analytics route, Audit Log tab) plus a sub-toggle for just
 * the status bar.
 *
 * Always rendered, including where the backend integration is off - the status
 * pill says which of the two gates is closed, because "AxWise was never enabled
 * on this server" and "you turned AxWise off" are very different facts and the
 * card used to show both as a bare "Disconnected".
 */
export default function AxwiseOverlayControls() {
  const theme = useTheme();
  const {
    hidden: pulseBarHidden,
    setHidden: setPulseBarHidden,
    setView: setPulseBarView,
  } = usePulseBarPref();
  // The AxWise master switch is the per-user KILL SWITCH (userEnabled), persisted
  // server-side: Off tells the backend to skip AxWise for this user (pre-integration
  // behavior) and hides every surface. serverEnabled = env AXWISE_ENABLE (hard
  // global gate). Effective on = both.
  const { serverEnabled, userEnabled, enforce, loaded, setUserEnabled } = useAxwise();
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  // The hook reverts its own state when the persist fails, so all this has to do
  // is surface the failure.
  const toggleOverlay = async () => {
    setSaveError('');
    setSaving(true);
    try {
      await setUserEnabled(!userEnabled);
    } catch {
      setSaveError('Could not save that change - your AxWise setting is unchanged. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  // Two independent gates, reported separately. `shadow` still counts as
  // connected: AxWise IS called and logged, it just doesn't change outcomes yet,
  // which is worth saying out loud rather than showing a bare green "Connected".
  const status = !loaded
    ? { text: 'Connecting…', color: theme.palette.text.secondary }
    : !serverEnabled
      ? {
          text: 'Backend off',
          color: theme.palette.text.secondary,
          hint: 'AXWISE_ENABLE is not set on this server, so no AxWise call is made.',
        }
      : !userEnabled
        ? {
            text: 'Disconnected',
            color: theme.palette.error.main,
            hint: 'You turned the AxWise overlay off for your account.',
          }
        : enforce === 'authoritative'
          ? { text: 'Connected', color: theme.palette.success.main }
          : {
              text: 'Connected (shadow)',
              color: theme.palette.warning?.main || theme.palette.success.main,
              hint: 'AxWise is called and logged, but its decisions are not applied yet.',
            };

  // Nothing to persist when the server gate is closed, so the switch must not be
  // live - a click would only ever produce a save error.
  const toggleDisabled = !loaded || saving || !serverEnabled;
  // The strip only appears when AxWise actually runs, so its sub-toggle follows
  // the effective state, not just the user's own switch.
  const effectiveOn = serverEnabled && userEnabled;

  // Revealing the strip must produce a clearly visible bar: if it was left in
  // the minimized corner-pill view, "Show" would technically un-hide it but the
  // user would see almost nothing. So on show we also reset the view to
  // collapsed (the one-line bar).
  const showStatusBar = () => {
    const nextHidden = !pulseBarHidden;
    setPulseBarHidden(nextHidden);
    if (!nextHidden) setPulseBarView('collapsed');
  };

  return (
    <Box role="list" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      {/* Backend integration status - which of the two gates is closed, and why. */}
      <Box
        role="listitem"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.25,
          py: 0.85,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.secondary' }}>
            Backend integration
          </Typography>
          {status.hint ? (
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', opacity: 0.8 }}>
              {status.hint}
            </Typography>
          ) : null}
        </Box>
        <Box
          aria-label={`AxWise backend status: ${status.text}`}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.7,
            px: 1.25,
            py: 0.5,
            borderRadius: '999px',
            border: '1px solid',
            flexShrink: 0,
            borderColor: alpha(status.color, 0.4),
            bgcolor: alpha(status.color, 0.12),
          }}
        >
          <Box
            aria-hidden
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              bgcolor: status.color,
            }}
          />
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: status.color }}>
            {status.text}
          </Typography>
        </Box>
      </Box>

      {/* Master switch: turns ALL AxWise surfaces on/off for this device. */}
      <Box
        role="listitem"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1,
          py: 1.25,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box
          aria-hidden
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            flexShrink: 0,
            color: userEnabled ? 'text.secondary' : 'text.disabled',
            opacity: userEnabled ? 1 : 0.6,
          }}
        >
          <AppIcon name="Insights" fallback={VisibilityIcon} fontSize="small" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.92rem', fontWeight: 600, color: userEnabled ? 'text.primary' : 'text.disabled' }}>
            AxWise overlay
          </Typography>
          <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>
            Cognition overlay: status bar, analytics page and the Audit Log tab.
          </Typography>
        </Box>
        <Button
          size="small"
          disabled={toggleDisabled}
          onClick={toggleOverlay}
          aria-label={`Turn AxWise overlay ${userEnabled ? 'off' : 'on'}`}
          aria-pressed={userEnabled}
          variant={userEnabled ? 'contained' : 'outlined'}
          disableElevation
          sx={{ textTransform: 'none', fontWeight: 700, minWidth: 76, borderRadius: 2 }}
        >
          {userEnabled ? 'On' : 'Off'}
        </Button>
      </Box>

      {saveError ? (
        <Alert severity="error" sx={{ mx: 1, mb: 1, borderRadius: 2 }} onClose={() => setSaveError('')}>
          {saveError}
        </Alert>
      ) : null}

      {/* Sub-toggle: the status bar strip only. Disabled whenever AxWise is not
          effectively running (either gate closed) - there'd be no strip to show. */}
      <Box
        role="listitem"
        sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 1.25, opacity: effectiveOn ? 1 : 0.5 }}
      >
        <Box
          aria-hidden
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            flexShrink: 0,
            color: pulseBarHidden ? 'text.disabled' : 'text.secondary',
            opacity: pulseBarHidden ? 0.6 : 1,
          }}
        >
          <AppIcon name="Insights" fallback={VisibilityIcon} fontSize="small" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.92rem', fontWeight: 600, color: pulseBarHidden ? 'text.disabled' : 'text.primary' }}>
            AxWise status bar
          </Typography>
          <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>
            Live cognition activity strip at the top of every page.
          </Typography>
        </Box>
        <Button
          size="small"
          disabled={!effectiveOn}
          onClick={showStatusBar}
          startIcon={
            pulseBarHidden ? (
              <AppIcon name="VisibilityOff" fallback={VisibilityOffIcon} fontSize="small" />
            ) : (
              <AppIcon name="Visibility" fallback={VisibilityIcon} fontSize="small" />
            )
          }
          aria-label={`${pulseBarHidden ? 'Show' : 'Hide'} AxWise status bar`}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            minWidth: 76,
            borderRadius: 2,
            color: pulseBarHidden ? 'primary.main' : 'text.secondary',
            '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.04) },
          }}
        >
          {pulseBarHidden ? 'Show' : 'Hide'}
        </Button>
      </Box>
    </Box>
  );
}
