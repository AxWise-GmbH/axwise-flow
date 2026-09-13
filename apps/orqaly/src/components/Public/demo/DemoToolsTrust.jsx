import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';

import AppIcon from '../../icons/AppIcon';

export default function DemoToolsTrust() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: theme.palette.mode === 'dark' ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${alpha(primary, 0.25)}`,
        boxShadow: `0 16px 40px ${alpha(primary, 0.14)}`,
        p: { xs: 2.5, md: 3 },
        textAlign: 'center',
      }}
    >
      <AppIcon
        name='ShieldOutlined'
        fallback={ShieldOutlinedIcon}
        sx={{ fontSize: 56, color: 'primary.main', mb: 1.5 }} />
      <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: 'text.primary' }}>
        Every publish, scanned
      </Typography>
      <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', mt: 1, lineHeight: 1.55, maxWidth: 320, mx: 'auto' }}>
        VirusTotal before marketplace listing. Sandboxed execution on every invoke.
      </Typography>
      <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
        <Chip size="small" icon={<AppIcon
          name='SecurityOutlined'
          fallback={SecurityOutlinedIcon}
          sx={{ fontSize: '14px !important' }} />} label="Sandboxed" sx={{ fontWeight: 700, fontSize: '0.68rem' }} />
        <Chip size="small" icon={<AppIcon
          name='HistoryOutlined'
          fallback={HistoryOutlinedIcon}
          sx={{ fontSize: '14px !important' }} />} label="Audit log" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.68rem' }} />
        <Chip size="small" icon={<AppIcon
          name='StorefrontOutlined'
          fallback={StorefrontOutlinedIcon}
          sx={{ fontSize: '14px !important' }} />} label="Publish · earn crypto" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.68rem' }} />
      </Stack>
    </Box>
  );
}
