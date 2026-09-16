import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';

import AppIcon from '../../icons/AppIcon';

const SITES = [
  { name: 'Coffee brand site', domain: 'roastedco.test', state: 'live' },
  { name: 'Yoga studio landing', domain: 'flowstudio.test', state: 'live' },
  { name: 'Consulting microsite', domain: 'klein.test', state: 'building' },
];

export default function DemoReplicators() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
        p: { xs: 2, md: 2.5 },
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 2 }}>
        Your replicators
      </Typography>
      <Stack spacing={1.25}>
        {SITES.map((s, i) => (
          <Stack
            key={i}
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{
              p: 1.75,
              borderRadius: 2.5,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
            }}
          >
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 1.5,
                bgcolor: alpha(primary, 0.12),
                color: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppIcon
                name='LanguageOutlined'
                fallback={LanguageOutlinedIcon}
                sx={{ fontSize: 18 }} />
            </Box>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'text.primary' }}>{s.name}</Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{s.domain}</Typography>
            </Stack>
            <Box
              sx={{
                px: 1.25,
                py: 0.4,
                borderRadius: 1,
                bgcolor: s.state === 'live' ? alpha(primary, 0.12) : alpha(theme.palette.warning.main, 0.12),
                color: s.state === 'live' ? 'primary.main' : 'warning.main',
                fontSize: '0.68rem',
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {s.state}
            </Box>
          </Stack>
        ))}
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: `1.5px dashed ${alpha(primary, 0.4)}`,
            color: 'primary.main',
            justifyContent: 'center',
            mt: 1,
          }}
        >
          <AppIcon
            name='ContentCopyOutlined'
            fallback={ContentCopyOutlinedIcon}
            sx={{ fontSize: 16 }} />
          <Typography sx={{ fontWeight: 700, fontSize: '0.82rem' }}>Clone from a template</Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
