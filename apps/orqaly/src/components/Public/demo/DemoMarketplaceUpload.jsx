import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';

const ITEMS = [
  { Icon: SmartToyOutlinedIcon, label: 'Agent Library', sub: 'Upload · workspace-ready' },
  { Icon: HubOutlinedIcon, label: 'Your tools', sub: 'APIs & connectors' },
  { Icon: PsychologyOutlinedIcon, label: 'Second brain', sub: 'Knowledge · private' },
  { Icon: CloudUploadOutlinedIcon, label: 'Business setup', sub: 'List for rent · optional' },
];

export default function DemoMarketplaceUpload() {
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
        Your integrations
      </Typography>
      <Stack spacing={1.5}>
        {ITEMS.map(({ Icon, label, sub }) => (
          <Stack
            key={label}
            direction="row"
            alignItems="center"
            spacing={2}
            sx={{
              p: 2,
              borderRadius: 2.5,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper',
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
              <Icon sx={{ fontSize: 20 }} />
            </Box>
            <Stack>
              <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'text.primary' }}>{label}</Typography>
              <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{sub}</Typography>
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
