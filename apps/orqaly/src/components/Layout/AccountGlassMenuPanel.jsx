import { Box, Badge, Button, ButtonBase, Switch, Typography, alpha, useTheme } from '@mui/material';
import AssignmentLateOutlinedIcon from '@mui/icons-material/AssignmentLateOutlined';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import GlassIcon from '../icons/GlassIcon';

/**
 * Glass tile account menu — shared by simple and advanced mode.
 * GlassIcon renders liquid-glass SVGs in simple mode and plain MUI icons in advanced.
 */
export default function AccountGlassMenuPanel({
  displayName,
  email,
  simpleMode,
  humanTaskPendingCount = 0,
  notificationCount = 0,
  onClose,
  onModeToggle,
  onOpenHumanTasks,
  onOpenNotifications,
  onNavigateSettings,
  onNavigateSetup,
  onLogout,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const iconTone = simpleMode ? 'brand' : 'neutral';

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
    borderColor: isDark ? alpha('#ffffff', 0.1) : alpha(theme.palette.divider, 0.6),
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
    bgcolor: isDark
      ? alpha(theme.palette.background.paper, 0.5)
      : alpha(theme.palette.background.paper, 0.7),
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  };

  const tileBaseSx = {
    ...glassCardSx,
    width: '100%',
    display: 'flex',
    color: 'text.primary',
    textAlign: 'left',
    transition: 'transform .15s ease, background .15s ease, border-color .15s ease',
    '&:hover': {
      transform: 'translateY(-1px)',
      bgcolor: isDark
        ? alpha(theme.palette.background.paper, 0.7)
        : alpha(theme.palette.background.paper, 0.92),
      borderColor: alpha(theme.palette.primary.main, 0.4),
    },
    '&:focus-visible': {
      boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.25)}`,
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
      '&:hover': { transform: 'none' },
    },
  };

  return (
    <Box
      role="menu"
      aria-label="Account menu"
      sx={{
        width: 320,
        maxWidth: '92vw',
        p: 1.25,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Box sx={{ ...glassCardSx, border: 'none', px: 1.5, py: 1.25 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {displayName}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {email}
        </Typography>
      </Box>

      <Box sx={{ ...glassCardSx, px: 1.25, py: 1 }}>
        <Typography
          sx={{
            fontSize: '0.62rem',
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: 'text.secondary',
            mb: 0.5,
          }}
        >
          Platform mode
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box aria-hidden sx={iconCircleSx}>
              <GlassIcon
                name="TuneOutlined"
                fallback={TuneOutlinedIcon}
                size={18}
                tone={iconTone}
              />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.1 }}>
                {simpleMode ? 'Simple' : 'Advanced'}
              </Typography>
              <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', lineHeight: 1.1 }}>
                {simpleMode ? 'Switch to Advanced' : 'Switch to Simple'}
              </Typography>
            </Box>
          </Box>
          <Switch
            checked={!simpleMode}
            onChange={onModeToggle}
            color="primary"
            size="small"
            inputProps={{ 'aria-label': 'Toggle Simple or Advanced platform mode' }}
          />
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
        <ButtonBase
          focusRipple
          role="menuitem"
          onClick={() => {
            onClose();
            onOpenHumanTasks();
          }}
          sx={{ ...tileBaseSx, alignItems: 'center', px: 1, py: 1, minHeight: 52 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, width: '100%' }}>
            <Box aria-hidden sx={iconCircleSx}>
              <GlassIcon
                name="AssignmentLateOutlined"
                fallback={AssignmentLateOutlinedIcon}
                size={16}
                tone={iconTone}
              />
            </Box>
            <Typography
              sx={{
                fontSize: '0.74rem',
                fontWeight: 600,
                flex: 1,
                textAlign: 'left',
                lineHeight: 1.15,
              }}
            >
              Human tasks
            </Typography>
            <Box
              sx={{
                minWidth: 22,
                height: 18,
                px: 0.75,
                borderRadius: '9px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                fontWeight: 700,
                bgcolor:
                  humanTaskPendingCount > 0
                    ? alpha(theme.palette.warning.main, 0.18)
                    : alpha(theme.palette.text.primary, 0.08),
                color: humanTaskPendingCount > 0 ? theme.palette.warning.main : 'text.secondary',
              }}
            >
              {humanTaskPendingCount}
            </Box>
          </Box>
        </ButtonBase>

        <ButtonBase
          focusRipple
          role="menuitem"
          onClick={() => {
            onClose();
            onNavigateSettings();
          }}
          sx={{ ...tileBaseSx, alignItems: 'center', px: 1, py: 1, minHeight: 52 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, width: '100%' }}>
            <Box aria-hidden sx={iconCircleSx}>
              <GlassIcon
                name="PersonOutlined"
                fallback={PersonOutlinedIcon}
                size={16}
                tone={iconTone}
              />
            </Box>
            <Typography
              sx={{
                fontSize: '0.74rem',
                fontWeight: 600,
                flex: 1,
                textAlign: 'left',
                lineHeight: 1.15,
              }}
            >
              Profile
            </Typography>
            <Box
              component="span"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
                onNavigateSettings();
              }}
              sx={{
                px: 0.9,
                py: 0.25,
                borderRadius: '9999px',
                fontSize: '0.66rem',
                fontWeight: 700,
                color: 'primary.main',
                bgcolor: alpha(theme.palette.primary.main, 0.12),
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, 0.3),
                cursor: 'pointer',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.2) },
              }}
            >
              Change
            </Box>
          </Box>
        </ButtonBase>
      </Box>

      <ButtonBase
        focusRipple
        role="menuitem"
        onClick={() => {
          onClose();
          onOpenNotifications();
        }}
        sx={{
          ...tileBaseSx,
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'space-between',
          p: 1.25,
          minHeight: 84,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <Box aria-hidden sx={iconCircleSx}>
            <GlassIcon
              name="NotificationsOutlined"
              fallback={NotificationsOutlinedIcon}
              size={18}
              tone={iconTone}
            />
          </Box>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, flex: 1, textAlign: 'left' }}>
            Notifications
          </Typography>
          {notificationCount > 0 && (
            <Badge
              color="error"
              badgeContent={notificationCount}
              max={99}
              sx={{ '& .MuiBadge-badge': { position: 'relative', transform: 'none' } }}
            />
          )}
        </Box>
        <Typography
          sx={{
            fontSize: '0.72rem',
            color: 'text.secondary',
            textAlign: 'left',
            width: '100%',
            mt: 0.5,
          }}
        >
          {notificationCount > 0
            ? `${notificationCount} unread - tap to open inbox`
            : 'No new notifications - tap to open inbox'}
        </Typography>
      </ButtonBase>

      <ButtonBase
        focusRipple
        role="menuitem"
        onClick={() => {
          onClose();
          onNavigateSetup();
        }}
        sx={{ ...tileBaseSx, alignItems: 'center', px: 1.25, py: 1.25, minHeight: 64 }}
      >
        <Box aria-hidden sx={iconCircleSx}>
          <GlassIcon
            name="VpnKeyOutlined"
            fallback={VpnKeyOutlinedIcon}
            size={18}
            tone={iconTone}
          />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, ml: 1, textAlign: 'left' }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.15 }}>
            Setup
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', lineHeight: 1.15 }}>
            keys and storage
          </Typography>
        </Box>
        <Box
          component="span"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
            onNavigateSetup();
          }}
          sx={{
            ml: 1,
            px: 1,
            py: 0.4,
            borderRadius: '9999px',
            fontSize: '0.68rem',
            fontWeight: 700,
            color: 'primary.main',
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            border: '1px solid',
            borderColor: alpha(theme.palette.primary.main, 0.35),
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.3,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.2) },
          }}
        >
          Setup now ›
        </Box>
      </ButtonBase>

      <Button
        role="menuitem"
        onClick={onLogout}
        fullWidth
        variant="outlined"
        color="error"
        sx={{
          mt: 0.5,
          py: 1,
          borderRadius: 2,
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.85rem',
          borderColor: alpha(theme.palette.error.main, 0.4),
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          bgcolor: isDark
            ? alpha(theme.palette.background.paper, 0.5)
            : alpha(theme.palette.background.paper, 0.7),
          '&:hover': {
            borderColor: theme.palette.error.main,
            bgcolor: alpha(theme.palette.error.main, 0.08),
          },
        }}
      >
        Sign out
      </Button>
    </Box>
  );
}
