import { Box, Switch, Typography, alpha, useTheme } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PanToolOutlinedIcon from '@mui/icons-material/PanToolOutlined';
import GlassIcon from '../../../icons/GlassIcon';

/**
 * Execution approval: on or off. AxWise scope confirmation is a separate,
 * mandatory Gate 1 and is never controlled by this switch.
 *
 * Off is the default and maps to hitl_mode 'unattended' for later execution
 * gates. The owner still confirms or corrects the native AxWise scope first.
 * A failed research gate or an invalid authorization manifest also parks the
 * goal, so this removes only the routine second wait.
 *
 * Independent of Setup by design. Someone can hand-pick every document and
 * still want the run to finish without pinging them twice.
 */
export default function HumanApproveSwitch({
  enabled,
  onChange,
  disabled = false,
  // Professional's Step 1 is a numbered form, so it keeps the ordinal. The
  // Simple thread drops it: position in the conversation already says when.
  label = '5 · Execution approval',
}) {
  const theme = useTheme();
  const tone = enabled ? theme.palette.warning.main : theme.palette.primary.main;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 1, sm: 1.5 },
        p: { xs: 1.5, sm: 2 },
        borderRadius: 3,
        bgcolor: alpha(tone, 0.05),
        border: '1px solid',
        borderColor: alpha(tone, 0.18),
        textAlign: 'left',
        transition: 'background-color 200ms ease, border-color 200ms ease',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <GlassIcon
        name={enabled ? 'PanToolOutlined' : 'SmartToyOutlined'}
        fallback={enabled ? PanToolOutlinedIcon : SmartToyOutlinedIcon}
        size={20}
        tone={tone}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
          {enabled
            ? 'On — after you confirm the AxWise scope, pause again before execution.'
            : 'Off — after you confirm the AxWise scope, continue automatically unless execution needs your decision.'}
        </Typography>
      </Box>
      <Switch
        size="small"
        checked={enabled}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        sx={{ alignSelf: { xs: 'flex-end', sm: 'auto' } }}
        // See SetupSwitch: slotProps.input replaces the default attributes, so
        // role must be restated alongside the label.
        slotProps={{
          input: {
            role: 'switch',
            'aria-label': 'Pause for my approval before execution',
          },
        }}
      />
    </Box>
  );
}
