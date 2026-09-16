import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import { simpleModeFrameSx, simpleModeLabelSx } from './simpleModeFrame';

const STEPS = ['Start a goal', 'Organize', 'Providers', 'Dashboards', 'Marketplace'];

export default function SimpleModeIntroMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const active = 0;

  return (
    <Box sx={simpleModeFrameSx(theme)}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '4fr 5fr' },
          gap: 2,
          p: { xs: 2, md: 2.5 },
        }}
      >
        <Box
          sx={{
            minHeight: 120,
            borderRadius: 2,
            border: `1px solid ${alpha(primary, 0.15)}`,
            bgcolor: alpha(primary, 0.06),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: primary,
          }}
        >
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Illustration
          </Typography>
        </Box>
        <Stack spacing={1}>
          <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: 'primary.main', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {STEPS[active]}
          </Typography>
          <Typography sx={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.2 }}>
            Describe what you want - get a finished result
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', lineHeight: 1.5 }}>
            Plain-language goals, specialist agents, real deliverables - websites, documents, campaigns.
          </Typography>
        </Stack>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.75, pb: 2 }}>
        {STEPS.map((_, i) => (
          <Box
            key={i}
            sx={{
              width: i === active ? 20 : 8,
              height: 8,
              borderRadius: 999,
              bgcolor: i === active ? primary : alpha(primary, 0.25),
              transition: 'width 0.2s',
            }}
          />
        ))}
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>
        <Typography sx={simpleModeLabelSx()}>5-step tour · shown when Simple Mode is enabled</Typography>
      </Box>
    </Box>
  );
}
