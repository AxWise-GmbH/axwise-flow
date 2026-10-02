import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Box,
  InputBase,
  Badge,
  Menu,
  Typography,
  Tooltip,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import GlassIcon from '../icons/GlassIcon';
import GlobalSearch from '../Search/GlobalSearch';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { useThemeMode } from '../../context/ThemeContext';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import TopBarGoalActions from './TopBarGoalActions';
import TopBarAssistantActions from './TopBarAssistantActions';
import { useDevTasks } from '../../context/DevTasksContext';
import VoiceControlButton from '../VoiceControl/VoiceControlButton';
import AiOrb from '../VoiceControl/AiOrb';
import DevTasksPopover from '../Common/DevTasksPopover';
import { createHoverGlowSx } from '../../theme/hoverGlow';
import WelcomeGuide from '../Onboarding/WelcomeGuideV2';
import AccountGlassMenuPanel from './AccountGlassMenuPanel';
import { useSetupProgress } from '../../pages/Setup/useSetupProgress';
import { useOrgProgress } from '../../pages/Organizations/useOrgProgress';
import ProgressPill from './ProgressPill';
import AxwiseHeaderPill from './AxwiseHeaderPill';
import { getPageTitle } from '../../config/pageInfo';

export default function TopBar({
  voiceState,
  voiceIsSupported,
  voiceError,
  onOpenVoiceCommand,
  showLetsTalkBar = false,
  onOpenMobileMenu,
  desktopSidebarCollapsed = false,
  onDesktopCollapseToggle,
  hideSidebarToggle = false,
}) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const {
    notifications,
    openNotificationCenter,
    humanTaskPendingCount = 0,
    openHumanTaskInbox,
  } = useNotifications();
  const { user, logout } = useAuth();
  const { devMode } = useThemeMode();
  const { simpleMode, toggleSimpleMode } = useSimpleMode();
  const { getAllTasks } = useDevTasks();
  const [anchorEl, setAnchorEl] = useState(null);
  const [searchAnchorEl, setSearchAnchorEl] = useState(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [devTasksAnchor, setDevTasksAnchor] = useState(null);
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const devTaskCount = devMode ? getAllTasks().filter((t) => !t.done).length : 0;

  const closeSearch = useCallback(() => setSearchAnchorEl(null), []);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchAnchorEl(document.querySelector('[data-search-trigger]'));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const [quotaSummary, setQuotaSummary] = useState(null);

  useEffect(() => {
    if (anchorEl) {
      fetch('/desktop/v1/usage')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && data.spendUsd !== undefined) {
            setQuotaSummary(data);
          }
        })
        .catch(() => {});
    }
  }, [anchorEl]);

  // Floating header style: elevated controls that "float in the air"
  const controlSize = 40;
  const controlRadius = 2;
  const shadowRest = isDark
    ? '0 4px 12px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.15)'
    : '0 4px 12px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)';
  const shadowHover = isDark
    ? '0 8px 24px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.2)'
    : '0 8px 24px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)';

  const hoverGlowCircleSx = useMemo(() => createHoverGlowSx(theme, { radius: '50%' }), [theme]);
  const hoverGlowPillSx = useMemo(() => createHoverGlowSx(theme, { radius: '9999px' }), [theme]);

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const isSimpleHome = simpleMode && (pathname === '/home' || pathname === '/');
  const isSetupPage = simpleMode && pathname === '/setup';
  const isOrgPage =
    simpleMode && (pathname === '/organizations' || pathname.startsWith('/organizations/'));

  // The page-name badge is resolved from the central PAGE_INFO. It shows in the top bar in
  // simple mode (all sizes) and in advanced mode on mobile only (next to the burger).
  const pageTitle = useMemo(() => getPageTitle(pathname), [pathname]);
  const pageNamePill = pageTitle ? (
    <Box
      role="heading"
      aria-level={1}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        height: controlSize,
        px: 1.75,
        borderRadius: controlSize / 2,
        bgcolor: 'action.hover',
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: shadowRest,
        transition: 'box-shadow 0.2s ease',
        '&:hover': { boxShadow: shadowHover },
        color: 'text.primary',
        fontSize: '0.85rem',
        fontWeight: 700,
        letterSpacing: '-0.01em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        maxWidth: { xs: 160, sm: 'none' },
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {pageTitle}
    </Box>
  ) : null;

  // Setup progress — only load when on the setup page
  const setupProgress = useSetupProgress();
  const setupDone = isSetupPage ? setupProgress.completedSteps : 0;
  const setupTotal = isSetupPage ? setupProgress.totalSteps : 5;
  const setupLoading = isSetupPage ? setupProgress.loading : false;
  const setupAllDone = isSetupPage ? setupProgress.allRequiredDone : false;

  // Organizations progress — only fetches when on the org route
  const orgProgress = useOrgProgress({ enabled: isOrgPage });

  const handleLogout = async () => {
    setAnchorEl(null);
    await logout();
  };

  const handleModeToggle = () => {
    const wasSimple = localStorage.getItem('orchestratori_simple_mode') === 'true';
    toggleSimpleMode();
    setAnchorEl(null);
    if (wasSimple) {
      navigate('/home');
    } else {
      setWelcomeOpen(true);
      navigate('/home');
    }
  };

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        transition: (theme) =>
          theme.transitions.create(['margin-left'], {
            duration: theme.transitions.duration.standard,
            easing: theme.transitions.easing.easeInOut,
          }),
        bgcolor: isDark ? theme.palette.background.default : '#f8fafc',
        boxShadow: 'none',
      }}
    >
      <Toolbar
        sx={{
          justifyContent: 'space-between',
          minHeight: { xs: 56, sm: 64 },
          px: { xs: 1.5, sm: 2 },
        }}
      >
        {/* Left: burger menu (always visible) + search + voice */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 0.5, sm: 1 },
            minWidth: 0,
            flex: 1,
          }}
        >
          {/* The running goal's Actions menu. First in the row so it lands in
              the corner the user pointed at, and because on Simple home every
              other control in this slot is hidden - leaving it empty was what
              made the goal look like it had none. Renders nothing unless a page
              has published a goal. */}
          {simpleMode && <TopBarGoalActions />}
          {simpleMode && <TopBarAssistantActions />}
          {!hideSidebarToggle && (
            <Tooltip
              title={isMobile ? 'Menu' : desktopSidebarCollapsed ? 'Show menu' : 'Hide menu'}
              arrow
            >
              <Box
                component="button"
                type="button"
                onClick={() => {
                  if (isMobile && onOpenMobileMenu) onOpenMobileMenu();
                  else if (onDesktopCollapseToggle) onDesktopCollapseToggle();
                }}
                aria-label={
                  isMobile ? 'Open menu' : desktopSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'
                }
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: controlSize,
                  height: controlSize,
                  borderRadius: controlSize / 2,
                  bgcolor: 'action.hover',
                  border: '1px solid',
                  borderColor: 'divider',
                  boxShadow: shadowRest,
                  transition: 'box-shadow 0.2s ease',
                  '&:hover': { boxShadow: shadowHover },
                  cursor: 'pointer',
                  color: 'text.secondary',
                  p: 0,
                  outline: 'none',
                  flexShrink: 0,
                  ...hoverGlowCircleSx,
                }}
              >
                <GlassIcon name="Menu" fallback={MenuIcon} size={22} tone="neutral" />
              </Box>
            </Tooltip>
          )}
          {/* Search + Ask / Voice bar — full on sm+, icon-only on xs, hidden on mobile (moved to profile menu).
              In simple mode this slot becomes a Back arrow on non-home routes (returns to /home) and is hidden on home. */}
          {simpleMode ? (
            !isSimpleHome && (
              <>
                <Tooltip title="Back to Home" arrow>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => navigate('/home')}
                    aria-label="Back to Home"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: controlSize,
                      height: controlSize,
                      borderRadius: controlSize / 2,
                      bgcolor: 'action.hover',
                      border: '1px solid',
                      borderColor: 'divider',
                      boxShadow: shadowRest,
                      transition: 'box-shadow 0.2s ease',
                      '&:hover': { boxShadow: shadowHover },
                      cursor: 'pointer',
                      color: 'text.secondary',
                      p: 0,
                      outline: 'none',
                      ...hoverGlowCircleSx,
                    }}
                  >
                    <GlassIcon
                      name="ArrowBackRounded"
                      fallback={ArrowBackRoundedIcon}
                      size={22}
                      tone="neutral"
                    />
                  </Box>
                </Tooltip>
                {isSetupPage ? (
                  /* ── Setup Progress pill with counter + mini bar ── */
                  <Box
                    role="heading"
                    aria-level={1}
                    aria-label={`Setup progress: ${setupDone} of ${setupTotal} required steps completed`}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 1,
                      height: controlSize,
                      pl: 0.6,
                      pr: 1.75,
                      borderRadius: controlSize / 2,
                      bgcolor: 'action.hover',
                      border: '1px solid',
                      borderColor: setupAllDone
                        ? alpha(theme.palette.primary.main, 0.4)
                        : 'divider',
                      boxShadow: setupAllDone
                        ? `${shadowRest}, 0 0 12px ${alpha(theme.palette.primary.main, 0.15)}`
                        : shadowRest,
                      transition: 'all 0.3s ease',
                      '&:hover': { boxShadow: shadowHover },
                      overflow: 'visible',
                    }}
                  >
                    {/* Circular progress ring */}
                    <Box
                      sx={{
                        position: 'relative',
                        width: 28,
                        height: 28,
                        flexShrink: 0,
                      }}
                    >
                      {/* Track ring */}
                      <svg
                        width={28}
                        height={28}
                        viewBox="0 0 28 28"
                        style={{ position: 'absolute', top: 0, left: 0 }}
                      >
                        <circle
                          cx={14}
                          cy={14}
                          r={11}
                          fill="none"
                          stroke={alpha(theme.palette.primary.main, isDark ? 0.12 : 0.1)}
                          strokeWidth={2.5}
                        />
                        {/* Progress arc */}
                        <circle
                          cx={14}
                          cy={14}
                          r={11}
                          fill="none"
                          stroke={theme.palette.primary.main}
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 11}`}
                          strokeDashoffset={`${2 * Math.PI * 11 * (1 - (setupLoading ? 0 : setupDone / setupTotal))}`}
                          style={{
                            transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                            transform: 'rotate(-90deg)',
                            transformOrigin: '50% 50%',
                          }}
                        />
                      </svg>
                      {/* Counter text in the center */}
                      <Box
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.6rem',
                          fontWeight: 800,
                          fontFeatureSettings: '"tnum" 1',
                          color: setupAllDone ? 'primary.main' : 'text.secondary',
                          lineHeight: 1,
                        }}
                      >
                        {setupLoading ? '…' : `${setupDone}/${setupTotal}`}
                      </Box>
                    </Box>

                    {/* Label */}
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0,
                        minWidth: 0,
                      }}
                    >
                      <Box
                        component="span"
                        sx={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          letterSpacing: '-0.01em',
                          lineHeight: 1.1,
                          color: 'text.primary',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Setup
                      </Box>
                      <Box
                        component="span"
                        sx={{
                          fontSize: '0.58rem',
                          fontWeight: 600,
                          letterSpacing: '0.03em',
                          lineHeight: 1,
                          color: setupAllDone ? 'primary.main' : 'text.disabled',
                          whiteSpace: 'nowrap',
                          transition: 'color 0.3s ease',
                        }}
                      >
                        {setupLoading
                          ? 'Loading…'
                          : setupAllDone
                            ? 'Complete ✓'
                            : `${setupDone} of ${setupTotal} required`}
                      </Box>
                    </Box>
                  </Box>
                ) : isOrgPage ? (
                  /* ── Organizations progress pill (same as Setup) ── */
                  <ProgressPill
                    label="Organizations"
                    done={orgProgress.completed}
                    total={orgProgress.total}
                    loading={orgProgress.loading}
                    allDone={orgProgress.allDone}
                    subtitle={`${orgProgress.completed} of ${orgProgress.total} steps`}
                    ariaLabel={`Organizations progress: ${orgProgress.completed} of ${orgProgress.total} steps completed`}
                  />
                ) : (
                  pageNamePill
                )}
              </>
            )
          ) : isMobile ? (
            pageNamePill
          ) : (
            <Tooltip title="Search partners, tasks, meetings (⌘K)" arrow>
              <Box
                data-search-trigger
                component="button"
                type="button"
                onClick={(e) => setSearchAnchorEl(e.currentTarget)}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: controlSize,
                  height: controlSize,
                  borderRadius: controlSize / 2,
                  bgcolor: 'action.hover',
                  border: '1px solid',
                  borderColor: 'divider',
                  boxShadow: shadowRest,
                  transition: 'box-shadow 0.2s ease',
                  '&:hover': { boxShadow: shadowHover },
                  cursor: 'pointer',
                  color: 'text.secondary',
                  p: 0,
                  outline: 'none',
                  ...hoverGlowCircleSx,
                }}
              >
                <GlassIcon
                  name="SearchOutlined"
                  fallback={SearchOutlinedIcon}
                  size={22}
                  tone="neutral"
                />
              </Box>
            </Tooltip>
          )}
          {showLetsTalkBar && (
            <Box
              component="button"
              type="button"
              onClick={onOpenVoiceCommand ?? undefined}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                minHeight: controlSize,
                height: controlSize,
                bgcolor: 'action.hover',
                borderRadius: controlSize / 2,
                pl: 0.75,
                pr: 1.5,
                width: { xs: 'auto', sm: 320 },
                minWidth: { xs: 0, sm: 320 },
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: shadowRest,
                transition: 'box-shadow 0.2s ease, transform 0.15s ease',
                overflow: 'visible',
                '&:hover': { boxShadow: shadowHover, transform: 'translateY(-1px)' },
                '&:focus-within': { boxShadow: shadowHover },
                cursor: onOpenVoiceCommand ? 'pointer' : 'default',
                textAlign: 'left',
                outline: 'none',
              }}
            >
              <AiOrb
                state={
                  voiceState === 'listening'
                    ? 'listening'
                    : voiceState === 'processing'
                      ? 'searching'
                      : 'idle'
                }
                size={28}
              />
              <InputBase
                component="span"
                placeholder="Let's talk"
                aria-label="Ask or type command"
                readOnly
                sx={{
                  fontSize: '0.84rem',
                  flex: 1,
                  minWidth: 0,
                  color: 'text.primary',
                  pointerEvents: 'none',
                  display: { xs: 'none', sm: 'block' },
                  '& .MuiInputBase-input::placeholder': {
                    color: 'text.secondary',
                    opacity: 1,
                  },
                }}
              />
            </Box>
          )}
        </Box>

        <GlobalSearch
          open={Boolean(searchAnchorEl)}
          anchorEl={searchAnchorEl}
          onClose={closeSearch}
          onOpenChange={(v) => !v && closeSearch()}
        />

        {/* Right side — one style: same size, radius, spacing, shadows */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {devMode && (
            <Tooltip title="Dev Tasks" arrow>
              <Box
                sx={{
                  display: 'inline-flex',
                  borderRadius: controlRadius,
                  boxShadow: shadowRest,
                  transition: 'box-shadow 0.2s ease',
                  '&:hover': { boxShadow: shadowHover },
                }}
              >
                <Box
                  component="button"
                  type="button"
                  onClick={(e) => setDevTasksAnchor(e.currentTarget)}
                  aria-label="Dev Tasks"
                  sx={{
                    width: controlSize,
                    height: controlSize,
                    borderRadius: controlSize / 2,
                    bgcolor: (t) => alpha('#F59E0B', 0.1),
                    border: '1px solid',
                    borderColor: (t) => alpha('#F59E0B', 0.3),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#F59E0B',
                    p: 0,
                    outline: 'none',
                    transition: 'box-shadow 0.2s ease, transform 0.15s ease',
                    '&:hover': { transform: 'translateY(-1px)' },
                    ...hoverGlowCircleSx,
                  }}
                >
                  <Badge
                    badgeContent={devTaskCount}
                    max={99}
                    sx={{
                      '& .MuiBadge-badge': {
                        bgcolor: '#F59E0B',
                        color: '#fff',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        minWidth: 16,
                        height: 16,
                      },
                    }}
                  >
                    <GlassIcon
                      name="CodeOutlined"
                      fallback={CodeOutlinedIcon}
                      size={20}
                      tone="neutral"
                    />
                  </Badge>
                </Box>
              </Box>
            </Tooltip>
          )}
          {/* Theme toggle, human-task inbox, welcome-guide and notifications removed from the
              header. Theme lives in Settings > Preferences; notifications/tasks in the account menu. */}
          {/* Skip for now — shown only on /setup in simple mode */}
          {isSetupPage && (
            <Tooltip title="Skip setup and go to dashboard" arrow>
              <Box
                component="button"
                type="button"
                onClick={() => navigate('/dashboard')}
                aria-label="Skip setup"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: controlSize,
                  px: 2,
                  borderRadius: controlSize / 2,
                  bgcolor: 'action.hover',
                  border: '1px solid',
                  borderColor: 'divider',
                  boxShadow: shadowRest,
                  transition: 'box-shadow 0.2s ease, transform 0.15s ease',
                  '&:hover': { boxShadow: shadowHover, transform: 'translateY(-1px)' },
                  cursor: 'pointer',
                  color: 'text.secondary',
                  outline: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  letterSpacing: '-0.01em',
                  gap: 0.5,
                  ...hoverGlowPillSx,
                }}
              >
                Skip →
              </Box>
            </Tooltip>
          )}
          {/* AxWise minimized pill (mobile only, self-gated) - sits left of the avatar. */}
          <AxwiseHeaderPill />
          <Tooltip title={displayName} arrow>
            <Box
              sx={{
                display: 'inline-flex',
                borderRadius: controlRadius,
                boxShadow: shadowRest,
                transition: 'box-shadow 0.2s ease',
                '&:hover': { boxShadow: shadowHover },
              }}
            >
              <Box
                component="button"
                type="button"
                onClick={(e) => setAnchorEl(e.currentTarget)}
                aria-label="Account menu"
                sx={{
                  width: controlSize,
                  height: controlSize,
                  borderRadius: controlSize / 2,
                  bgcolor: 'action.hover',
                  border: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'text.secondary',
                  p: 0,
                  outline: 'none',
                  transition: 'box-shadow 0.2s ease, color 0.2s ease',
                  '&:hover': { color: 'text.primary' },
                  ...hoverGlowCircleSx,
                }}
              >
                <GlassIcon
                  name="PersonOutlined"
                  fallback={PersonOutlinedIcon}
                  size={22}
                  tone="neutral"
                />
              </Box>
            </Box>
          </Tooltip>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
              paper: {
                sx: {
                  mt: 1,
                  minWidth: 320,
                  maxWidth: '92vw',
                  borderRadius: 3,
                  overflow: 'hidden',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                },
              },
            }}
          >
            <AccountGlassMenuPanel
              displayName={displayName}
              email={user?.email}
              simpleMode={simpleMode}
              quotaSummary={quotaSummary}
              humanTaskPendingCount={humanTaskPendingCount}
              notificationCount={notifications.length}
              onClose={() => setAnchorEl(null)}
              onModeToggle={handleModeToggle}
              onOpenHumanTasks={openHumanTaskInbox}
              onOpenNotifications={openNotificationCenter}
              onNavigateSettings={() => navigate('/settings')}
              onNavigateSetup={() => navigate('/setup')}
              onLogout={handleLogout}
            />
          </Menu>
        </Box>
      </Toolbar>

      {devMode && (
        <DevTasksPopover
          anchorEl={devTasksAnchor}
          open={Boolean(devTasksAnchor)}
          onClose={() => setDevTasksAnchor(null)}
        />
      )}

      {/* Welcome Guide — opens from the Help button and when switching into simple mode. */}
      <WelcomeGuide
        open={welcomeOpen}
        onClose={() => setWelcomeOpen(false)}
        onSetup={() => navigate('/setup')}
      />
    </AppBar>
  );
}
