import { Alert, AlertTitle, Typography, Box, Chip } from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';

import AppIcon from '../icons/AppIcon';

/**
 * Renders a security-guard verdict (block / warn) as an Alert with flag chips.
 *
 * Props:
 *  - severity: 'high' | 'medium' | 'low' | 'none'
 *  - action:   'block' | 'warn' | 'allow'
 *  - flags:    string[]  (namespaced: 'malware:*', 'injection:*', 'unicode:*')
 *  - onDismiss?: () => void
 */
export default function SecurityFlagAlert({ severity, action, flags = [], onDismiss }) {
  if (!action || action === 'allow') return null;
  if (!flags || flags.length === 0) return null;

  const isBlock = action === 'block';
  const color = isBlock ? 'error' : 'warning';
  const Icon = isBlock ? ShieldOutlinedIcon : WarningAmberOutlinedIcon;

  const headline = isBlock ? 'Blocked by security review' : 'Accepted with warnings';
  const hint = isBlock
    ? 'The content above was flagged as potentially unsafe and was not processed.'
    : 'The content was cleaned and allowed through, but the flags below were recorded.';

  return (
    <Alert severity={color} icon={<AppIcon fallback={Icon} />} onClose={onDismiss} sx={{ mt: 1.5 }}>
      <AlertTitle>{headline}</AlertTitle>
      <Typography variant="body2" sx={{ mb: 1 }}>
        {hint}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {flags.map((f) => (
          <Chip
            key={f}
            size="small"
            label={f}
            color={flagColor(f)}
            variant="outlined"
            sx={{ fontFamily: 'monospace', fontSize: '0.7rem', height: 22 }}
          />
        ))}
      </Box>
      {severity && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Severity: {severity}
        </Typography>
      )}
    </Alert>
  );
}

function flagColor(flag) {
  if (flag.startsWith('malware:')) return 'error';
  if (flag.startsWith('injection:')) return 'error';
  if (flag.startsWith('unicode:')) return 'default';
  return 'default';
}
