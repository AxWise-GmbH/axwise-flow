import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';

const INTEGRATIONS = [
  { Icon: AccountTreeOutlinedIcon, label: 'Workflow', sub: 'Consilium decision node' },
  { Icon: SmartToyOutlinedIcon, label: 'Agents', sub: 'Council behind hard calls' },
  { Icon: TrackChangesOutlinedIcon, label: 'Goals', sub: 'Smart Request team pick' },
  { Icon: StorefrontOutlinedIcon, label: 'Marketplace', sub: 'Board templates' },
];

export default function DemoConsiliumIntegrate() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: theme.palette.mode === 'dark' ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 16px 40px ${alpha(primary, 0.14)}`,
        p: { xs: 2, md: 2.5 },
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 2 }}>
        Drop-in integrations
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.25 }}>
        {INTEGRATIONS.map(({ Icon, label, sub }) => (
          <Stack
            key={label}
            spacing={0.75}
            sx={{
              p: 1.5,
              borderRadius: 2.5,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper',
            }}
          >
            <Icon sx={{ fontSize: 22, color: 'primary.main' }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.88rem' }}>{label}</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{sub}</Typography>
          </Stack>
        ))}
      </Box>
      <Chip label="BYOK mixed models" size="small" sx={{ mt: 2, fontWeight: 700, fontSize: '0.68rem' }} />
    </Box>
  );
}
