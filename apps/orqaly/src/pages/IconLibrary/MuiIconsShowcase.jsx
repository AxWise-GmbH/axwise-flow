import { Box, Typography, Paper, Grid } from '@mui/material';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import BusinessCenterOutlinedIcon from '@mui/icons-material/BusinessCenterOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import TelegramIcon from '@mui/icons-material/Telegram';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';

const SCREENSHOT_ICONS = [
  { name: 'HomeRounded', component: HomeRoundedIcon, context: 'Bottom Nav: Home' },
  { name: 'WorkOutline', component: WorkOutlineIcon, context: 'Bottom Nav: Workspace/Jobs' },
  { name: 'BarChartOutlined', component: BarChartOutlinedIcon, context: 'Bottom Nav: Analytics' },
  {
    name: 'ViewSidebarOutlined',
    component: ViewSidebarOutlinedIcon,
    context: 'Bottom Nav: Sidebar/Drawer',
  },
  { name: 'GroupsOutlined', component: GroupsOutlinedIcon, context: 'Marketplace: Consilium' },
  {
    name: 'CorporateFareOutlined',
    component: CorporateFareOutlinedIcon,
    context: 'Marketplace: Organizations',
  },
  { name: 'PsychologyOutlined', component: PsychologyOutlinedIcon, context: 'Marketplace: Skills' },
  { name: 'BuildOutlined', component: BuildOutlinedIcon, context: 'Marketplace: Tools' },
  {
    name: 'BusinessCenterOutlined',
    component: BusinessCenterOutlinedIcon,
    context: 'Marketplace: Business Models',
  },
  { name: 'VpnKeyOutlined', component: VpnKeyOutlinedIcon, context: 'Marketplace: Account' },
  { name: 'MicNoneOutlined', component: MicNoneOutlinedIcon, context: 'Composer: Microphone' },
  { name: 'Telegram', component: TelegramIcon, context: 'Composer: Send (Original)' },
  {
    name: 'ArrowUpwardRounded',
    component: ArrowUpwardRoundedIcon,
    context: 'Composer: Send (Alternative)',
  },
];

export default function MuiIconsShowcase() {
  return (
    <Box sx={{ p: 4, maxWidth: 1200, mx: 'auto', mt: 8 }}>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Screenshot Icon Library (MUI)
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        This page catalogs the specific Material UI icons seen in your screenshots.
      </Typography>

      <Grid container spacing={3}>
        {SCREENSHOT_ICONS.map((icon) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={icon.name}>
            <Paper
              elevation={0}
              sx={{
                p: 3,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                borderRadius: 4,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4,
                },
              }}
            >
              <Box
                sx={{
                  p: 2,
                  borderRadius: '50%',
                  bgcolor: 'action.hover',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <icon.component sx={{ fontSize: 32, color: 'primary.main' }} />
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="subtitle2" fontWeight="bold">
                  {icon.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {icon.context}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
