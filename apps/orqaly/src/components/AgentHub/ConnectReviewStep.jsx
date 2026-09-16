/**
 * ConnectReviewStep — risk-tier review screen shown after picking a catalog
 * library, before initiating the OAuth connection.
 *
 * - Shows risk-tier badge, description, default-allowed actions.
 * - Lets the user opt into individual sensitive actions.
 * - High-risk libraries require typing the integration name to confirm.
 */
import { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Stack,
  Paper,
  Checkbox,
  FormControlLabel,
  Button,
  TextField,
  Divider,
  alpha,
} from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import GppGoodOutlinedIcon from '@mui/icons-material/GppGoodOutlined';
import GppMaybeOutlinedIcon from '@mui/icons-material/GppMaybeOutlined';

import AppIcon from '../icons/AppIcon';

const RISK_META = {
  low: {
    label: 'Low risk',
    color: '#16A34A',
    Icon: GppGoodOutlinedIcon,
    helper: 'Read-only or harmless operations.',
  },
  medium: {
    label: 'Medium risk',
    color: '#D97706',
    Icon: GppMaybeOutlinedIcon,
    helper: 'Writes to user-owned data or services.',
  },
  high: {
    label: 'High risk',
    color: '#DC2626',
    Icon: WarningAmberIcon,
    helper:
      'Financial, destructive, or publicly visible actions. Type the integration name to confirm.',
  },
};

export default function ConnectReviewStep({ entry, busy, onCancel, onConfirm }) {
  const [optedIn, setOptedIn] = useState(() => new Set());
  const [confirmText, setConfirmText] = useState('');

  const risk = entry?.riskTier || 'medium';
  const meta = RISK_META[risk] || RISK_META.medium;
  const RiskIcon = meta.Icon;

  const safeActions = entry?.actionsSafe || [];
  const sensitiveActions = entry?.actionsSensitive || [];

  const requiresTypedConfirm = risk === 'high';
  const typedOk =
    !requiresTypedConfirm || confirmText.trim().toLowerCase() === (entry?.name || '').toLowerCase();

  const canConfirm = !busy && typedOk;

  const opted = useMemo(() => [...optedIn], [optedIn]);

  const toggle = (action) => {
    setOptedIn((prev) => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action);
      else next.add(action);
      return next;
    });
  };

  if (!entry) return null;

  return (
    <Box sx={{ p: 2.5 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
          Connect {entry.name}
        </Typography>
        <Chip
          icon={<AppIcon fallback={RiskIcon} sx={{ fontSize: 14, color: 'inherit !important' }} />}
          label={meta.label}
          size="small"
          sx={{
            bgcolor: alpha(meta.color, 0.12),
            color: meta.color,
            fontWeight: 700,
            fontSize: '0.68rem',
            height: 22,
            '& .MuiChip-icon': { color: meta.color },
          }}
        />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '0.82rem' }}>
        {entry.description}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: meta.color, fontWeight: 600, display: 'block', mb: 2 }}
      >
        {meta.helper}
      </Typography>
      <Divider sx={{ my: 1.5 }} />
      {/* Default-allowed actions */}
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <AppIcon
            name="ShieldOutlined"
            fallback={ShieldOutlinedIcon}
            sx={{ fontSize: 16, color: 'success.main' }}
          />
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Enabled by default ({safeActions.length})
          </Typography>
        </Stack>
        {safeActions.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
            None — every action on this library is sensitive and requires opt-in.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {safeActions.map((a) => (
              <Chip
                key={a}
                label={prettyAction(a)}
                size="small"
                sx={{
                  fontSize: '0.65rem',
                  height: 22,
                  bgcolor: alpha('#16A34A', 0.08),
                  color: '#15803D',
                  fontWeight: 600,
                }}
              />
            ))}
          </Box>
        )}
      </Box>
      {/* Sensitive opt-in */}
      {sensitiveActions.length > 0 && (
        <Paper
          variant="outlined"
          sx={{ p: 1.5, borderRadius: 2, mb: 2, bgcolor: alpha('#D97706', 0.04) }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <AppIcon
              name="WarningAmber"
              fallback={WarningAmberIcon}
              sx={{ fontSize: 16, color: 'warning.main' }}
            />
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Sensitive actions ({sensitiveActions.length})
            </Typography>
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mb: 1, fontSize: '0.7rem' }}
          >
            Off by default. Toggle on only what this agent needs.
          </Typography>
          <Stack spacing={0.25}>
            {sensitiveActions.map((a) => (
              <FormControlLabel
                key={a}
                control={
                  <Checkbox
                    size="small"
                    checked={optedIn.has(a)}
                    onChange={() => toggle(a)}
                    sx={{ py: 0.25 }}
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontSize: '0.78rem', fontFamily: 'monospace' }}>
                    {prettyAction(a)}
                  </Typography>
                }
                sx={{ ml: 0 }}
              />
            ))}
          </Stack>
        </Paper>
      )}
      {/* High-risk typed confirm */}
      {requiresTypedConfirm && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, color: 'error.main', display: 'block', mb: 0.5 }}
          >
            Type <strong>{entry.name}</strong> to confirm:
          </Typography>
          <TextField
            size="small"
            fullWidth
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={entry.name}
          />
        </Box>
      )}
      {/* Actions */}
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button onClick={onCancel} size="small" disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          size="small"
          disabled={!canConfirm}
          onClick={() => onConfirm({ optedInSensitive: opted })}
          sx={{
            bgcolor: meta.color,
            '&:hover': { bgcolor: meta.color, filter: 'brightness(0.92)' },
          }}
        >
          {busy ? 'Connecting…' : 'Connect'}
        </Button>
      </Stack>
    </Box>
  );
}

/** GITHUB_CREATE_ISSUE → "Create Issue" — strip the app prefix. */
function prettyAction(action) {
  if (typeof action !== 'string' || !action) return action;
  const parts = action.split('_');
  if (parts.length <= 1) return action;
  return parts
    .slice(1)
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(' ');
}
