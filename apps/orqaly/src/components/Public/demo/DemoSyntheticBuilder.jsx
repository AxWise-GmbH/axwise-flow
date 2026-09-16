import { Box, Typography, Stack, alpha, useTheme, Slider, Switch, FormControlLabel } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';

import AppIcon from '../../icons/AppIcon';

function TraitSlider({ label, value, color }) {
  const theme = useTheme();
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.primary' }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color }}>
          {value}%
        </Typography>
      </Stack>
      <Slider
        value={value}
        sx={{
          color,
          height: 6,
          '& .MuiSlider-thumb': {
            width: 16,
            height: 16,
            border: `2px solid ${theme.palette.background.paper}`,
          },
          '& .MuiSlider-rail': {
            bgcolor: alpha(color, 0.2),
          }
        }}
      />
    </Box>
  );
}

export default function DemoSyntheticBuilder() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const primary = theme.palette.primary.main;

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        bgcolor: isDark ? alpha('#111318', 0.8) : alpha('#ffffff', 0.9),
        borderRadius: 4,
        border: `1px solid ${isDark ? alpha('#ffffff', 0.1) : alpha('#000', 0.1)}`,
        backdropFilter: 'blur(20px)',
        overflow: 'hidden',
        boxShadow: isDark 
          ? `0 24px 64px ${alpha('#000', 0.6)}`
          : `0 24px 64px ${alpha('#000', 0.1)}`,
        p: 4,
        display: 'flex',
        flexDirection: 'column',
        '& *': {
          fontFamily: '"Inter", "Roboto", sans-serif',
        }
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 4 }}>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', color: 'text.primary', mb: 0.5 }}>
            Persona Matrix
          </Typography>
          <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
            Adjust the psychological traits of the agent
          </Typography>
        </Box>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(primary, 0.1), color: primary }}>
          <AppIcon name='Tune' fallback={TuneIcon} />
        </Box>
      </Stack>
      <Stack spacing={3}>
        <TraitSlider label="Analytical" value={95} color={primary} />
        <TraitSlider label="Empathy" value={40} color="#10B981" />
        <TraitSlider label="Creativity" value={65} color="#8B5CF6" />
        <TraitSlider label="Formality" value={85} color="#F59E0B" />
        
        <Box sx={{ mt: 2, p: 3, borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.02), border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}` }}>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'text.secondary', mb: 2, letterSpacing: '0.05em' }}>
            BEHAVIORAL GUARDRAILS
          </Typography>
          <Stack spacing={1}>
            <FormControlLabel
              control={<Switch defaultChecked size="small" />}
              label={<Typography sx={{ fontSize: '0.85rem', fontWeight: 500 }}>Strict Unit Economics</Typography>}
            />
            <FormControlLabel
              control={<Switch size="small" />}
              label={<Typography sx={{ fontSize: '0.85rem', fontWeight: 500 }}>Permit Speculative Forecasts</Typography>}
            />
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
