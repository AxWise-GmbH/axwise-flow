import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import { simpleModeFrameSx, simpleModeLabelSx } from './simpleModeFrame';

const TILES = [
  { Icon: GroupsOutlinedIcon, title: 'Consilium', sub: 'Board for your business' },
  { Icon: CorporateFareOutlinedIcon, title: 'Organizations', sub: 'Teams and agents' },
  { Icon: PsychologyOutlinedIcon, title: 'Skills', sub: 'Upgrade agents' },
  { Icon: BuildOutlinedIcon, title: 'Tools', sub: 'Integrations' },
];

export default function SimpleModeMarketplaceMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  return (
    <Box sx={simpleModeFrameSx(theme)}>
      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography sx={{ ...simpleModeLabelSx(), mb: 1.5 }}>Marketplace · Compact</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
          {TILES.map(({ Icon, title, sub }) => (
            <Stack
              key={title}
              spacing={0.75}
              sx={{
                p: 1.5,
                borderRadius: 2.5,
                border: `1px solid ${alpha(primary, 0.2)}`,
                bgcolor: alpha(primary, 0.04),
                minHeight: 88,
              }}
            >
              <Box sx={{ color: 'primary.main', display: 'flex' }}>
                <Icon sx={{ fontSize: 22 }} />
              </Box>
              <Typography sx={{ fontWeight: 800, fontSize: '0.82rem' }}>{title}</Typography>
              <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', lineHeight: 1.3 }}>{sub}</Typography>
            </Stack>
          ))}
        </Box>
        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 1.5, fontStyle: 'italic' }}>
          Illustrations appear on each tile in the live app.
        </Typography>
      </Box>
    </Box>
  );
}
