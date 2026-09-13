import { Box, Switch, Typography, alpha, useTheme } from '@mui/material';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import GlassIcon from '../../../icons/GlassIcon';

/**
 * Setup: Auto or Manual. Decides who fills in Materials, Tools and
 * Destination.
 *
 * Deliberately client-only: in Auto the dialog simply sends the Auto defaults,
 * so the payload is identical to a Manual user who picked the same values.
 * Mapping this onto execution_mode would silently change the feasibility
 * stage's pause behaviour, which is a different decision entirely.
 */
export default function SetupSwitch({ manual, onChange, disabled = false }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 1, sm: 1.5 },
        p: { xs: 1.5, sm: 2 },
        borderRadius: 3,
        bgcolor: alpha(theme.palette.primary.main, 0.05),
        border: '1px solid',
        borderColor: alpha(theme.palette.primary.main, 0.18),
        textAlign: 'left',
      }}
    >
      <GlassIcon name="TuneOutlined" fallback={TuneOutlinedIcon} size={20} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
          Setup
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
          {manual
            ? 'You choose what the team works with.'
            : 'We choose the materials, tools and destination.'}
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          alignSelf: { xs: 'flex-end', sm: 'auto' },
        }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: manual ? 500 : 700, color: manual ? 'text.disabled' : 'primary.main' }}
        >
          Auto
        </Typography>
        <Switch
          size="small"
          checked={manual}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          // MUI 7 drops inputProps on Switch and slotProps.input replaces the
          // default input attributes wholesale, so role has to be restated here.
          slotProps={{
            input: {
              role: 'switch',
              'aria-label': 'Choose the setup yourself instead of letting us pick',
            },
          }}
        />
        <Typography
          variant="caption"
          sx={{ fontWeight: manual ? 700 : 500, color: manual ? 'primary.main' : 'text.disabled' }}
        >
          Manual
        </Typography>
      </Box>
    </Box>
  );
}
