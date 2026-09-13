/**
 * SetupCardShell — consistent framing for the inline setup action cards
 * rendered inside the assistant conversation. Title + body + a primary action
 * and an optional "skip" link, plus inline error display.
 */
import { Box, Typography, Button, Alert, alpha, useTheme } from '@mui/material';
import { cardHoverGlowSx } from '../../../theme/wizardGlow';

export default function SetupCardShell({
  title,
  icon: Icon,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  busy,
  onSkip,
  error,
  embedded = false,
}) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: alpha(theme.palette.primary.main, 0.25),
        borderRadius: 2.5,
        p: 1.75,
        bgcolor: alpha(theme.palette.primary.main, 0.04),
        ...cardHoverGlowSx(theme),
      }}
    >
      {/* In the wizard the section header (icon + title + description) is rendered
          above the card, so the card's own header is hidden via `embedded`. */}
      {!embedded && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
          {Icon && <Icon sx={{ fontSize: 20, color: 'primary.main' }} />}
          <Typography sx={{ fontWeight: 700, fontSize: '0.92rem' }}>{title}</Typography>
        </Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>{children}</Box>

      {error && (
        <Alert severity="error" sx={{ mt: 1.25, py: 0 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
        <Button
          variant="contained"
          size="small"
          onClick={onPrimary}
          disabled={primaryDisabled || busy}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
        >
          {busy ? 'Working…' : primaryLabel}
        </Button>
        {onSkip && (
          <Button
            size="small"
            onClick={onSkip}
            disabled={busy}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            Skip for now
          </Button>
        )}
      </Box>
    </Box>
  );
}
