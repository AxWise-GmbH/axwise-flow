import { Box, Button, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';

import AppIcon from '../../icons/AppIcon';

export default function DemoMarketplaceInstall() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 16px 40px ${alpha(primary, 0.14)}`,
        p: { xs: 2, md: 2.5 },
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 2 }}>
        Install · Sales Follow-up Pro
      </Typography>
      <Stack spacing={1.5}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{
            p: 1.5,
            borderRadius: 2.5,
            border: `1px solid ${alpha(theme.palette.success.main, 0.3)}`,
            bgcolor: alpha(theme.palette.success.main, 0.06),
          }}
        >
          <AppIcon
            name='CheckCircleOutline'
            fallback={CheckCircleOutlineIcon}
            sx={{ color: 'success.main', fontSize: 20 }} />
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>Added to Agent Hub</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Ready to deploy on channels</Typography>
          </Box>
        </Stack>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'text.secondary' }}>Install skill on agents:</Typography>
        {['Triage Voice', 'Sales Follow-up'].map((name, i) => (
          <Stack
            key={name}
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: `1px solid ${i === 0 ? alpha(primary, 0.4) : theme.palette.divider}`,
              bgcolor: i === 0 ? alpha(primary, 0.06) : 'transparent',
            }}
          >
            {i === 0 ? (
              <AppIcon
                name='SmartToyOutlined'
                fallback={SmartToyOutlinedIcon}
                sx={{ fontSize: 18, color: 'primary.main' }} />
            ) : (
              <AppIcon
                name='PsychologyOutlined'
                fallback={PsychologyOutlinedIcon}
                sx={{ fontSize: 18, color: 'text.secondary' }} />
            )}
            <Typography sx={{ flex: 1, fontSize: '0.82rem', fontWeight: 600 }}>{name}</Typography>
            {i === 0 && <Chip label="selected" size="small" sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700 }} />}
          </Stack>
        ))}
        <Button
          variant="contained"
          size="small"
          sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 700, borderRadius: 2, mt: 0.5 }}
        >
          Install on 2 agents
        </Button>
      </Stack>
    </Box>
  );
}
