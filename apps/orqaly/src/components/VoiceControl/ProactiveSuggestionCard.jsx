/**
 * ProactiveSuggestionCard — a single proactive suggestion with quick-action buttons.
 * Button kinds: 'navigate' | 'prefill' | 'propose' (handled by the parent via onAction).
 */
import { Box, Button, Typography, IconButton, useTheme, alpha } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

const SEVERITY_COLOR = { error: 'error', warning: 'warning', info: 'info' };

export default function ProactiveSuggestionCard({ suggestion, onAction, onDismiss }) {
  const theme = useTheme();
  const paletteKey = SEVERITY_COLOR[suggestion?.severity] || 'primary';
  const color = theme.palette[paletteKey] || theme.palette.primary;

  return (
    <Box
      sx={{
        minWidth: 220,
        maxWidth: 300,
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(color.main, 0.3),
        bgcolor: alpha(color.main, 0.08),
        p: 1.25,
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600, fontSize: '0.82rem' }}>
            {suggestion?.title}
          </Typography>
          {suggestion?.detail && (
            <Typography variant="caption" sx={{ color: alpha('#fff', 0.5), display: 'block' }}>
              {suggestion.detail}
            </Typography>
          )}
        </Box>
        {onDismiss && (
          <IconButton size="small" onClick={() => onDismiss(suggestion)} sx={{ color: alpha('#fff', 0.4), p: 0.25 }} aria-label="Dismiss">
            <CloseRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
        {(suggestion?.actions || []).map((a, i) => (
          <Button
            key={`sa-${i}`}
            size="small"
            onClick={() => onAction?.(a, suggestion)}
            sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.15, px: 1, minWidth: 0, color: color.light, bgcolor: alpha(color.main, 0.12), '&:hover': { bgcolor: alpha(color.main, 0.2) } }}
          >
            {a.label}
          </Button>
        ))}
      </Box>
    </Box>
  );
}
