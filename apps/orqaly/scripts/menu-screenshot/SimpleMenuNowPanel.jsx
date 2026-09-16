import {
  Box,
  Divider,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Typography,
} from '@mui/material';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import GlassIcon from '../../src/components/icons/GlassIcon';

/** Current simple-mode account menu (list-style, shared with advanced mode). */
export default function SimpleMenuNowPanel({
  displayName = 'mister',
  email = 'misters.builder@gmail.com',
}) {
  return (
    <Box
      data-testid="menu-now"
      sx={{
        minWidth: 220,
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{displayName}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{email}</Typography>
      </Box>
      <Divider />
      <MenuItem sx={{ py: 1.25 }}>
        <ListItemIcon>
          <GlassIcon name="SearchOutlined" fallback={SearchOutlinedIcon} size={20} tone="neutral" />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: '0.85rem' }}>Search</ListItemText>
      </MenuItem>
      <MenuItem sx={{ py: 1.25 }}>
        <ListItemIcon>
          <GlassIcon name="LightModeOutlined" fallback={LightModeOutlinedIcon} size={20} tone="neutral" />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: '0.85rem' }}>Light mode</ListItemText>
      </MenuItem>
      <MenuItem sx={{ py: 1.25 }}>
        <ListItemIcon>
          <GlassIcon name="DashboardOutlined" fallback={DashboardOutlinedIcon} size={20} tone="neutral" />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: '0.85rem' }}>Advanced mode</ListItemText>
      </MenuItem>
      <Divider />
      <MenuItem sx={{ py: 1.25 }}>
        <ListItemIcon>
          <GlassIcon name="PersonOutlined" fallback={PersonOutlinedIcon} size={20} tone="neutral" />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: '0.85rem' }}>Profile & Settings</ListItemText>
      </MenuItem>
      <MenuItem sx={{ py: 1.25 }}>
        <ListItemIcon>
          <GlassIcon name="VpnKeyOutlined" fallback={VpnKeyOutlinedIcon} size={20} tone="neutral" />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: '0.85rem' }}>Setup (keys & storage)</ListItemText>
      </MenuItem>
      <MenuItem sx={{ py: 1.25, color: 'error.main' }}>
        <ListItemIcon>
          <GlassIcon name="LogoutOutlined" fallback={LogoutOutlinedIcon} size={20} tone="error" />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }}>Sign out</ListItemText>
      </MenuItem>
    </Box>
  );
}
