import {
  Box,
  Button,
  ButtonBase,
  Switch,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import AssignmentLateOutlinedIcon from '@mui/icons-material/AssignmentLateOutlined';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import GlassIcon from '../../src/components/icons/GlassIcon';

/** Snapshot of the pre-df3554f simple-mode account menu (glass tile panel). */
export default function SimpleMenuBeforePanel({
  displayName = 'mister',
  email = 'misters.builder@gmail.com',
  humanTaskPendingCount = 0,
  notificationCount = 0,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const iconCircleSx = {
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: isDark ? alpha(theme.palette.background.paper, 0.55) : alpha('#ffffff', 0.7),
    border: '1px solid',
    borderColor: isDark ? alpha('#ffffff', 0.10) : alpha(theme.palette.divider, 0.6),
    backdropFilter: 'saturate(180%) blur(12px)',
    WebkitBackdropFilter: 'saturate(180%) blur(12px)',
    boxShadow: isDark
      ? 'inset 0 1px 0 rgba(255,255,255,0.08)'
      : 'inset 0 1px 0 rgba(255,255,255,0.7)',
  };

  const glassCardSx = {
    borderRadius: 2,
    border: '1px solid',
    borderColor: 'divider',
    bgcolor: isDark ? alpha(theme.palette.background.paper, 0.5) : alpha(theme.palette.background.paper, 0.7),
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  };

  const tileBaseSx = {
    ...glassCardSx,
    width: '100%',
    display: 'flex',
    color: 'text.primary',
    textAlign: 'left',
  };

  return (
    <Box
      data-testid="menu-before"
      sx={{
        width: 320,
        maxWidth: '92vw',
        p: 1.25,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ ...glassCardSx, border: 'none', px: 1.5, py: 1.25 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {displayName}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
          {email}
        </Typography>
      </Box>

      <Box sx={{ ...glassCardSx, px: 1.25, py: 1 }}>
        <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'text.secondary', mb: 0.5 }}>
          Platform mode
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box aria-hidden sx={iconCircleSx}>
              <GlassIcon name="TuneOutlined" fallback={TuneOutlinedIcon} size={18} tone="brand" />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.1 }}>Simple</Typography>
              <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', lineHeight: 1.1 }}>Switch to Advanced</Typography>
            </Box>
          </Box>
          <Switch checked={false} color="primary" size="small" readOnly />
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
        <ButtonBase sx={{ ...tileBaseSx, alignItems: 'center', px: 1, py: 1, minHeight: 52 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, width: '100%' }}>
            <Box aria-hidden sx={iconCircleSx}>
              <GlassIcon name="AssignmentLateOutlined" fallback={AssignmentLateOutlinedIcon} size={16} tone="brand" />
            </Box>
            <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, flex: 1, textAlign: 'left', lineHeight: 1.15 }}>
              Human tasks
            </Typography>
            <Box sx={{ minWidth: 22, height: 18, px: 0.75, borderRadius: '9px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, bgcolor: alpha(theme.palette.text.primary, 0.08), color: 'text.secondary' }}>
              {humanTaskPendingCount}
            </Box>
          </Box>
        </ButtonBase>

        <ButtonBase sx={{ ...tileBaseSx, alignItems: 'center', px: 1, py: 1, minHeight: 52 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, width: '100%' }}>
            <Box aria-hidden sx={iconCircleSx}>
              <GlassIcon name="PersonOutlined" fallback={PersonOutlinedIcon} size={16} tone="brand" />
            </Box>
            <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, flex: 1, textAlign: 'left', lineHeight: 1.15 }}>
              Profile
            </Typography>
            <Box component="span" sx={{ px: 0.9, py: 0.25, borderRadius: '9999px', fontSize: '0.66rem', fontWeight: 700, color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.12), border: '1px solid', borderColor: alpha(theme.palette.primary.main, 0.3) }}>
              Change
            </Box>
          </Box>
        </ButtonBase>
      </Box>

      <ButtonBase sx={{ ...tileBaseSx, flexDirection: 'column', alignItems: 'stretch', p: 1.25, minHeight: 84 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <Box aria-hidden sx={iconCircleSx}>
            <GlassIcon name="NotificationsOutlined" fallback={NotificationsOutlinedIcon} size={18} tone="brand" />
          </Box>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, flex: 1, textAlign: 'left' }}>
            Notifications
          </Typography>
        </Box>
        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', textAlign: 'left', width: '100%', mt: 0.5 }}>
          {notificationCount > 0 ? `${notificationCount} unread - tap to open inbox` : 'No new notifications - tap to open inbox'}
        </Typography>
      </ButtonBase>

      <ButtonBase sx={{ ...tileBaseSx, alignItems: 'center', px: 1.25, py: 1.25, minHeight: 64 }}>
        <Box aria-hidden sx={iconCircleSx}>
          <GlassIcon name="PersonOutlined" fallback={PersonOutlinedIcon} size={18} tone="brand" />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, ml: 1, textAlign: 'left' }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.15 }}>Profile & Settings</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', lineHeight: 1.15 }}>Manage your profile and preferences</Typography>
        </Box>
      </ButtonBase>

      <ButtonBase sx={{ ...tileBaseSx, alignItems: 'center', px: 1.25, py: 1.25, minHeight: 64 }}>
        <Box aria-hidden sx={iconCircleSx}>
          <GlassIcon name="VpnKeyOutlined" fallback={VpnKeyOutlinedIcon} size={18} tone="brand" />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, ml: 1, textAlign: 'left' }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.15 }}>Setup</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', lineHeight: 1.15 }}>keys and storage</Typography>
        </Box>
        <Box component="span" sx={{ ml: 1, px: 1, py: 0.4, borderRadius: '9999px', fontSize: '0.68rem', fontWeight: 700, color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.12), border: '1px solid', borderColor: alpha(theme.palette.primary.main, 0.35), whiteSpace: 'nowrap' }}>
          Setup now ›
        </Box>
      </ButtonBase>

      <Button fullWidth variant="outlined" color="error" sx={{ mt: 0.5, py: 1, borderRadius: 2, textTransform: 'none', fontWeight: 600, fontSize: '0.85rem' }}>
        Sign out
      </Button>
    </Box>
  );
}
