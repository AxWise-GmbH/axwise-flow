import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import HorizontalRuleRoundedIcon from '@mui/icons-material/HorizontalRuleRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { createWorkflowV2Client } from '../../workflow-v2/api.js';
import {
  GCP_CUSTOMIZABLE_NAV_ITEMS,
  GCP_PRIMARY_NAV_ITEMS,
  isGcpNavItemActive,
} from './gcpNavItems.js';
import {
  EMPTY_GCP_NAV_PREFERENCES,
  MAX_GCP_NAV_PINS,
  buildGcpRecentItems,
  normalizeGcpSectionOrder,
  persistGcpNavPreferences,
  readGcpNavPreferences,
} from './gcpNavPreferences.js';
import {
  GCP_STANDARD_NAV_BRAND_SIZE,
  GCP_STANDARD_NAV_COLLAPSE_CONTROL_SIZE,
  GCP_STANDARD_NAV_RAIL_WIDTH,
  GCP_STANDARD_NAV_WIDTH,
  persistGcpNavCollapsed,
  readGcpNavCollapsed,
} from './gcpNavChrome.js';
import { GcpNavFooter, GcpNavIcon, GcpNavRail, NavBrandHeader } from './GcpStandardNavChrome.jsx';

export {
  GCP_STANDARD_NAV_BRAND_SIZE,
  GCP_STANDARD_NAV_COLLAPSE_CONTROL_SIZE,
  GCP_STANDARD_NAV_RAIL_WIDTH,
  GCP_STANDARD_NAV_WIDTH,
};

function activeGroupId(location) {
  return GCP_PRIMARY_NAV_ITEMS.find(
    (item) =>
      item.kind === 'group' && item.children.some((child) => isGcpNavItemActive(child, location))
  )?.id;
}

async function requestRecentState(client) {
  const [threads, overview] = await Promise.allSettled([
    client.assistantThreads({ limit: 12 }),
    client.overview({ limit: 12 }),
  ]);
  const threadResponse = threads.status === 'fulfilled' ? threads.value : { threads: [] };
  const overviewResponse = overview.status === 'fulfilled' ? overview.value : { workflows: [] };
  return {
    loading: false,
    partialError: threads.status === 'rejected' || overview.status === 'rejected',
    items: buildGcpRecentItems(threadResponse, overviewResponse),
  };
}

function selectedRowSx(theme, active, nested = false) {
  return {
    minHeight: nested ? 29 : 38,
    borderRadius: 2,
    mx: 1.25,
    my: 0.125,
    pl: nested ? 4.5 : 1.5,
    pr: 1.25,
    gap: 1.25,
    color: active ? 'text.primary' : 'text.secondary',
    bgcolor: 'transparent',
    transition: 'color 180ms ease',
    '&.Mui-selected': {
      bgcolor: 'transparent',
      color: 'text.primary',
      '&:hover': { bgcolor: 'transparent' },
    },
    '&:hover': {
      bgcolor: 'transparent',
      color: 'text.primary',
    },
    '&.Mui-focusVisible': {
      bgcolor: 'transparent',
      outline: `1px solid ${alpha(theme.palette.text.primary, 0.34)}`,
      outlineOffset: -1,
    },
    '& .MuiListItemIcon-root': {
      minWidth: nested ? 8 : 24,
      color: 'inherit',
      transition: 'transform 180ms ease',
    },
    '& .MuiSvgIcon-root': { fontSize: nested ? 12 : 16 },
    '& .gcp-nav-disclosure': {
      opacity: 0,
      transition: 'transform 140ms ease, opacity 140ms ease',
    },
    '& .gcp-nav-disclosure[data-open="true"]': { opacity: 1 },
    '&:hover .gcp-nav-disclosure, &:focus-within .gcp-nav-disclosure, &.Mui-focusVisible .gcp-nav-disclosure':
      {
        opacity: 1,
      },
    '@media (hover: hover)': {
      '&:hover .MuiListItemIcon-root': { transform: 'scale(1.12)' },
      '&:hover .MuiListItemText-primary': { fontWeight: 650 },
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
      '& .MuiListItemIcon-root': { transition: 'none' },
      '& .gcp-nav-disclosure': { transition: 'none' },
    },
  };
}

function StaticNavRow({ item, location, nested = false, onNavigate }) {
  const theme = useTheme();
  const active = isGcpNavItemActive(item, location);
  return (
    <ListItem disablePadding>
      <ListItemButton
        selected={active}
        aria-current={active ? 'page' : undefined}
        onClick={() => onNavigate(item.to)}
        sx={selectedRowSx(theme, active, nested)}
      >
        {nested ? (
          <ListItemIcon aria-hidden>
            <Box
              sx={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                bgcolor: 'currentColor',
                opacity: 0.8,
              }}
            />
          </ListItemIcon>
        ) : (
          <ListItemIcon>
            <GcpNavIcon item={item} />
          </ListItemIcon>
        )}
        <ListItemText
          primary={item.label}
          primaryTypographyProps={{
            fontSize: nested ? '0.78rem' : '0.82rem',
            fontWeight: active ? 650 : 520,
            letterSpacing: '-0.005em',
          }}
        />
      </ListItemButton>
    </ListItem>
  );
}

function RecentNavRow({ item, active, pinned, onNavigate, onTogglePin }) {
  const theme = useTheme();
  return (
    <ListItem
      disablePadding
      secondaryAction={
        <IconButton
          edge="end"
          size="small"
          aria-label={`${pinned ? 'Unpin' : 'Pin'} ${item.label}`}
          onClick={() => onTogglePin(item)}
          sx={{ color: pinned ? 'text.primary' : 'text.disabled', mr: 1 }}
        >
          {pinned ? (
            <PushPinIcon sx={{ fontSize: 15 }} />
          ) : (
            <PushPinOutlinedIcon sx={{ fontSize: 15 }} />
          )}
        </IconButton>
      }
      sx={{ display: 'block' }}
    >
      <ListItemButton
        selected={active}
        aria-current={active ? 'page' : undefined}
        onClick={() => onNavigate(item.to)}
        sx={{ ...selectedRowSx(theme, active, true), pr: 5 }}
      >
        <ListItemText
          primary={item.label}
          secondary={item.meta || undefined}
          primaryTypographyProps={{
            noWrap: true,
            fontSize: '0.78rem',
            fontWeight: active ? 650 : 520,
          }}
          secondaryTypographyProps={{ noWrap: true, fontSize: '0.65rem', color: 'text.disabled' }}
        />
        <Chip
          label={item.badge}
          size="small"
          variant="outlined"
          sx={{
            height: 17,
            fontSize: '0.56rem',
            mr: 0.5,
            color: 'text.disabled',
            borderColor: 'divider',
            '& .MuiChip-label': { px: 0.55 },
          }}
        />
      </ListItemButton>
    </ListItem>
  );
}

function GcpNavContent({
  collapsed,
  location,
  preferences,
  recentItems,
  recentLoading,
  recentPartialError,
  expandedId,
  editing,
  onNavigate,
  onNewChat,
  onRefresh,
  onToggleExpanded,
  onTogglePin,
  onToggleHidden,
  onMoveSection,
  onToggleSectionGap,
  onShowAll,
  onToggleEditing,
  onToggleCollapsed,
  onOpenGroup,
  onOpenEditing,
  onClose,
  mobile = false,
}) {
  const theme = useTheme();
  const hidden = new Set(preferences.hiddenSectionIds);
  const sectionGaps = new Set(preferences.sectionGapIds);
  const pinsById = new Set(preferences.pins.map((pin) => pin.id));
  const primaryById = new Map(GCP_PRIMARY_NAV_ITEMS.map((item) => [item.id, item]));
  const orderedPrimaryItems = [
    primaryById.get('new-chat'),
    ...preferences.sectionOrder.map((id) => primaryById.get(id)).filter(Boolean),
  ];

  const groupActive = (item) =>
    item.children?.some((child) => isGcpNavItemActive(child, location)) || false;

  if (collapsed && !mobile) {
    return (
      <Box
        component="nav"
        aria-label="Orqanix workspace"
        data-nav-mode="rail"
        sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <NavBrandHeader collapsed onToggleCollapsed={onToggleCollapsed} />
        <GcpNavRail
          editing={editing}
          hidden={hidden}
          location={location}
          orderedPrimaryItems={orderedPrimaryItems}
          preferences={preferences}
          recentItems={recentItems}
          onNavigate={onNavigate}
          onNewChat={onNewChat}
          onOpenGroup={onOpenGroup}
          onOpenEditing={onOpenEditing}
        />
      </Box>
    );
  }

  const groupRow = (item, children) => {
    const open = expandedId === item.id;
    const panelId = `gcp-nav-${item.id}-panel`;
    return (
      <Box component="li" key={item.id} sx={{ flexShrink: 0, listStyle: 'none' }}>
        <ListItem component="div" disablePadding>
          <ListItemButton
            id={`gcp-nav-${item.id}-button`}
            aria-expanded={open}
            aria-controls={panelId}
            selected={groupActive(item)}
            onClick={() => onToggleExpanded(item.id)}
            sx={selectedRowSx(theme, groupActive(item))}
          >
            <ListItemIcon>
              <GcpNavIcon item={item} />
            </ListItemIcon>
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{
                fontSize: '0.82rem',
                fontWeight: groupActive(item) ? 650 : 520,
                letterSpacing: '-0.005em',
              }}
            />
            <ChevronRightRoundedIcon
              className="gcp-nav-disclosure"
              data-open={open ? 'true' : 'false'}
              data-testid={`gcp-nav-disclosure-${item.id}`}
              sx={{
                fontSize: '15px !important',
                color: 'text.disabled',
                transform: open ? 'rotate(90deg)' : 'none',
              }}
            />
          </ListItemButton>
        </ListItem>
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List
            id={panelId}
            role="group"
            aria-labelledby={`gcp-nav-${item.id}-button`}
            disablePadding
          >
            {children}
          </List>
        </Collapse>
      </Box>
    );
  };

  const renderDynamicGroup = (item) => {
    const open = expandedId === item.id;
    const panelId = `gcp-nav-${item.id}-panel`;
    const rows = item.id === 'recents' ? recentItems : preferences.pins;
    return (
      <Box component="li" key={item.id} sx={{ flexShrink: 0, listStyle: 'none' }}>
        <ListItem
          component="div"
          disablePadding
          secondaryAction={
            item.id === 'recents' ? (
              <IconButton
                size="small"
                edge="end"
                aria-label="Refresh recents"
                disabled={recentLoading}
                onClick={onRefresh}
                sx={{ mr: 1, color: 'text.disabled' }}
              >
                {recentLoading ? (
                  <CircularProgress size={14} />
                ) : (
                  <RefreshRoundedIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            ) : null
          }
          sx={{ display: 'block' }}
        >
          <ListItemButton
            id={`gcp-nav-${item.id}-button`}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => onToggleExpanded(item.id)}
            sx={{ ...selectedRowSx(theme, false), pr: item.id === 'recents' ? 5 : 1.25 }}
          >
            <ListItemIcon>
              <GcpNavIcon item={item} />
            </ListItemIcon>
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{
                fontSize: '0.82rem',
                fontWeight: open ? 650 : 520,
                letterSpacing: '-0.005em',
              }}
            />
            {item.id === 'pinned' && preferences.pins.length ? (
              <Typography variant="caption" color="text.disabled" sx={{ mr: 0.5 }}>
                {preferences.pins.length}
              </Typography>
            ) : null}
            <ChevronRightRoundedIcon
              className="gcp-nav-disclosure"
              data-open={open ? 'true' : 'false'}
              data-testid={`gcp-nav-disclosure-${item.id}`}
              sx={{
                fontSize: '15px !important',
                color: 'text.disabled',
                transform: open ? 'rotate(90deg)' : 'none',
              }}
            />
          </ListItemButton>
        </ListItem>
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List
            id={panelId}
            role="group"
            aria-labelledby={`gcp-nav-${item.id}-button`}
            disablePadding
            sx={{ maxHeight: 300, overflowY: 'auto' }}
          >
            {item.id === 'recents' && recentPartialError ? (
              <Alert severity="warning" variant="outlined" sx={{ mx: 1.5, my: 0.75, py: 0 }}>
                Some recent activity could not load.
              </Alert>
            ) : null}
            {!recentLoading && !rows.length ? (
              <Typography
                sx={{ pl: 5.5, pr: 2, py: 0.75, fontSize: '0.75rem', color: 'text.disabled' }}
              >
                {item.id === 'recents' ? 'Nothing recent yet' : 'Nothing pinned yet'}
              </Typography>
            ) : null}
            {rows.map((row) => (
              <RecentNavRow
                key={row.id}
                item={{ ...row, badge: row.badge || (row.kind === 'chat' ? 'Chat' : 'Goal') }}
                active={isGcpNavItemActive({ to: row.to }, location)}
                pinned={pinsById.has(row.id)}
                onNavigate={onNavigate}
                onTogglePin={onTogglePin}
              />
            ))}
          </List>
        </Collapse>
      </Box>
    );
  };

  return (
    <Box
      component="nav"
      aria-label="Orqanix workspace"
      data-nav-mode={mobile ? 'drawer' : 'full'}
      sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <NavBrandHeader mobile={mobile} onClose={onClose} onToggleCollapsed={onToggleCollapsed} />

      <List sx={{ py: 0.5, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {orderedPrimaryItems
          .filter((item) => item.id === 'new-chat' || !hidden.has(item.id))
          .map((item) => (
            <Fragment key={item.id}>
              {item.id !== 'new-chat' && sectionGaps.has(item.id) ? (
                <Box component="li" sx={{ listStyle: 'none' }}>
                  <Divider
                    aria-label={`Divider before ${item.label}`}
                    data-section-gap-before={item.id}
                    sx={{ mx: 1.5, my: 1.5, borderColor: 'transparent' }}
                  />
                </Box>
              ) : null}
              {(() => {
                if (item.id === 'new-chat') {
                  const active = isGcpNavItemActive(item, location);
                  return (
                    <ListItem disablePadding>
                      <ListItemButton
                        selected={active}
                        aria-current={active ? 'page' : undefined}
                        onClick={onNewChat}
                        sx={selectedRowSx(theme, active)}
                      >
                        <ListItemIcon>
                          <GcpNavIcon item={item} />
                        </ListItemIcon>
                        <ListItemText
                          primary={item.label}
                          primaryTypographyProps={{
                            fontSize: '0.82rem',
                            fontWeight: active ? 700 : 600,
                            letterSpacing: '-0.005em',
                          }}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                }
                if (item.kind === 'dynamic') return renderDynamicGroup(item);
                if (item.kind === 'group') {
                  return groupRow(
                    item,
                    item.children.map((child) => (
                      <StaticNavRow
                        key={child.id}
                        item={child}
                        location={location}
                        nested
                        onNavigate={onNavigate}
                      />
                    ))
                  );
                }
                return <StaticNavRow item={item} location={location} onNavigate={onNavigate} />;
              })()}
            </Fragment>
          ))}
      </List>

      <Collapse in={editing} unmountOnExit>
        <Box
          id="gcp-nav-edit-panel"
          role="region"
          aria-label="Edit sidebar"
          sx={{ px: 2, pb: 1.5, maxHeight: 310, overflowY: 'auto' }}
        >
          <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', mb: 0.75 }}>
            Menu choices and pins are saved in this browser for this signed-in account.
          </Typography>
          <Stack spacing={0.25}>
            {preferences.sectionOrder.map((id, index) => {
              const item = GCP_CUSTOMIZABLE_NAV_ITEMS.find((candidate) => candidate.id === id);
              if (!item) return null;
              const hasGap = sectionGaps.has(item.id);
              return (
                <Stack key={item.id} direction="row" alignItems="center" sx={{ minHeight: 30 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={!hidden.has(item.id)}
                        onChange={() => onToggleHidden(item.id)}
                        inputProps={{ 'aria-label': item.label }}
                      />
                    }
                    label={item.label}
                    slotProps={{ typography: { fontSize: '0.74rem', noWrap: true } }}
                    sx={{ minWidth: 0, flex: 1, m: 0 }}
                  />
                  <IconButton
                    size="small"
                    aria-label={`Move ${item.label} up`}
                    disabled={index === 0}
                    onClick={() => onMoveSection(item.id, -1)}
                  >
                    <KeyboardArrowUpRoundedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label={`Move ${item.label} down`}
                    disabled={index === preferences.sectionOrder.length - 1}
                    onClick={() => onMoveSection(item.id, 1)}
                  >
                    <KeyboardArrowDownRoundedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label={`${hasGap ? 'Remove' : 'Add'} divider before ${item.label}`}
                    aria-pressed={hasGap}
                    onClick={() => onToggleSectionGap(item.id)}
                    sx={{ color: hasGap ? 'text.primary' : 'text.disabled' }}
                  >
                    <HorizontalRuleRoundedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Stack>
              );
            })}
          </Stack>
          <Button size="small" color="inherit" onClick={onShowAll} sx={{ mt: 0.5 }}>
            Show all
          </Button>
        </Box>
      </Collapse>
      <GcpNavFooter
        editing={editing}
        location={location}
        onNavigate={onNavigate}
        onOpenEditing={onOpenEditing}
        onToggleEditing={onToggleEditing}
      />
    </Box>
  );
}

export default function GcpStandardNav({
  variant = 'responsive',
  mobileOpen: controlledMobileOpen,
  onMobileOpen,
  onMobileClose,
}) {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const permanent = variant === 'permanent' || (variant === 'responsive' && desktop);
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(() => activeGroupId(location) || 'recents');
  const [editing, setEditing] = useState(false);
  const [stored, setStored] = useState({ ownerId: null, value: EMPTY_GCP_NAV_PREFERENCES });
  const [collapsedState, setCollapsedState] = useState(() => ({
    ownerId: userId || null,
    value: readGcpNavCollapsed(userId),
  }));
  const [recentState, setRecentState] = useState({
    ownerId: null,
    client: null,
    loading: true,
    partialError: false,
    items: [],
  });
  const requestEpoch = useRef(0);
  const mobileOpen = controlledMobileOpen ?? internalMobileOpen;
  const client = useMemo(
    () => (isLoaded && isSignedIn ? createWorkflowV2Client(getToken) : null),
    [getToken, isLoaded, isSignedIn]
  );
  const browserPreferences = useMemo(
    () => (userId ? readGcpNavPreferences(userId) : EMPTY_GCP_NAV_PREFERENCES),
    [userId]
  );
  const preferences = stored.ownerId === userId ? stored.value : browserPreferences;
  const collapsed =
    collapsedState.ownerId === userId ? collapsedState.value : readGcpNavCollapsed(userId);
  // State updates run after render. Gate the visible projection by both Clerk
  // identity and API client so a previous account's labels disappear in the
  // same render that switches user, token provider, or signed-in status.
  const visibleRecentState =
    client && recentState.ownerId === userId && recentState.client === client
      ? recentState
      : { loading: Boolean(client), partialError: false, items: [] };

  useEffect(() => {
    if (!userId || stored.ownerId !== userId) return;
    persistGcpNavPreferences(userId, stored.value);
  }, [stored, userId]);

  useEffect(() => {
    if (!userId || collapsedState.ownerId !== userId) return;
    persistGcpNavCollapsed(userId, collapsedState.value);
  }, [collapsedState, userId]);

  const updatePreferences = useCallback(
    (update) => {
      if (!userId) return;
      setStored((current) => {
        const value = current.ownerId === userId ? current.value : readGcpNavPreferences(userId);
        return { ownerId: userId, value: update(value) };
      });
    },
    [userId]
  );

  const toggleCollapsed = useCallback(() => {
    if (!userId) return;
    setEditing(false);
    setCollapsedState((current) => ({
      ownerId: userId,
      value: !(current.ownerId === userId ? current.value : readGcpNavCollapsed(userId)),
    }));
  }, [userId]);

  const expandForGroup = useCallback(
    (id) => {
      if (!userId) return;
      setCollapsedState({ ownerId: userId, value: false });
      setExpandedId(id);
    },
    [userId]
  );

  const expandForEditing = useCallback(() => {
    if (!userId) return;
    setCollapsedState({ ownerId: userId, value: false });
    setEditing(true);
  }, [userId]);

  const refreshRecents = useCallback(async () => {
    if (!client || !userId) return;
    const epoch = ++requestEpoch.current;
    setRecentState({
      ownerId: userId,
      client,
      loading: true,
      partialError: false,
      items: [],
    });
    const nextState = await requestRecentState(client);
    if (requestEpoch.current !== epoch) return;
    setRecentState({ ownerId: userId, client, ...nextState });
  }, [client, userId]);

  useEffect(() => {
    const epoch = ++requestEpoch.current;
    if (!client || !userId) {
      Promise.resolve().then(() => {
        if (requestEpoch.current !== epoch) return;
        setRecentState({
          ownerId: userId || null,
          client,
          loading: false,
          partialError: false,
          items: [],
        });
      });
      return () => {
        requestEpoch.current += 1;
      };
    }
    requestRecentState(client).then((nextState) => {
      if (requestEpoch.current === epoch) {
        setRecentState({ ownerId: userId, client, ...nextState });
      }
    });
    return () => {
      requestEpoch.current += 1;
    };
  }, [client, userId]);

  const closeMobile = useCallback(() => {
    setInternalMobileOpen(false);
    onMobileClose?.();
  }, [onMobileClose]);

  const openMobile = useCallback(() => {
    setInternalMobileOpen(true);
    onMobileOpen?.();
  }, [onMobileOpen]);

  const handleNavigate = useCallback(
    (to) => {
      navigate(to);
      closeMobile();
    },
    [closeMobile, navigate]
  );

  const handleNewChat = useCallback(() => {
    const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    window.dispatchEvent(new CustomEvent('orqaly:new-assistant-conversation'));
    handleNavigate(`/assistant?${new URLSearchParams({ new: unique })}`);
  }, [handleNavigate]);

  const togglePin = useCallback(
    (item) => {
      updatePreferences((current) => {
        const alreadyPinned = current.pins.some((pin) => pin.id === item.id);
        return {
          ...current,
          pins: alreadyPinned
            ? current.pins.filter((pin) => pin.id !== item.id)
            : [
                {
                  id: item.id,
                  entityId: item.entityId,
                  kind: item.kind,
                  label: item.label,
                  meta: item.meta || '',
                  to: item.to,
                  pinnedAt: new Date().toISOString(),
                },
                ...current.pins.filter((pin) => pin.id !== item.id),
              ].slice(0, MAX_GCP_NAV_PINS),
        };
      });
    },
    [updatePreferences]
  );

  const toggleHidden = useCallback(
    (id) => {
      updatePreferences((current) => ({
        ...current,
        hiddenSectionIds: current.hiddenSectionIds.includes(id)
          ? current.hiddenSectionIds.filter((sectionId) => sectionId !== id)
          : [...current.hiddenSectionIds, id],
      }));
    },
    [updatePreferences]
  );

  const moveSection = useCallback(
    (id, offset) => {
      updatePreferences((current) => {
        const sectionOrder = normalizeGcpSectionOrder(current.sectionOrder);
        const currentIndex = sectionOrder.indexOf(id);
        const nextIndex = Math.min(sectionOrder.length - 1, Math.max(0, currentIndex + offset));
        if (currentIndex < 0 || nextIndex === currentIndex) return current;
        const nextOrder = [...sectionOrder];
        [nextOrder[currentIndex], nextOrder[nextIndex]] = [
          nextOrder[nextIndex],
          nextOrder[currentIndex],
        ];
        return { ...current, sectionOrder: nextOrder };
      });
    },
    [updatePreferences]
  );

  const toggleSectionGap = useCallback(
    (id) => {
      updatePreferences((current) => ({
        ...current,
        sectionGapIds: current.sectionGapIds.includes(id)
          ? current.sectionGapIds.filter((sectionId) => sectionId !== id)
          : [...current.sectionGapIds, id],
      }));
    },
    [updatePreferences]
  );

  const contentProps = {
    collapsed,
    location,
    preferences,
    recentItems: visibleRecentState.items,
    recentLoading: visibleRecentState.loading,
    recentPartialError: visibleRecentState.partialError,
    expandedId,
    editing,
    onNavigate: handleNavigate,
    onNewChat: handleNewChat,
    onRefresh: refreshRecents,
    onToggleExpanded: (id) => setExpandedId((current) => (current === id ? null : id)),
    onTogglePin: togglePin,
    onToggleHidden: toggleHidden,
    onMoveSection: moveSection,
    onToggleSectionGap: toggleSectionGap,
    onShowAll: () => updatePreferences((current) => ({ ...current, hiddenSectionIds: [] })),
    onToggleEditing: () => setEditing((current) => !current),
    onToggleCollapsed: toggleCollapsed,
    onOpenGroup: expandForGroup,
    onOpenEditing: expandForEditing,
    onClose: closeMobile,
  };

  if (permanent) {
    return (
      <Box
        component="aside"
        data-testid="gcp-standard-nav-aside"
        data-collapsed={collapsed ? 'true' : 'false'}
        sx={{
          width: collapsed ? GCP_STANDARD_NAV_RAIL_WIDTH : GCP_STANDARD_NAV_WIDTH,
          minWidth: collapsed ? GCP_STANDARD_NAV_RAIL_WIDTH : GCP_STANDARD_NAV_WIDTH,
          height: '100dvh',
          position: 'sticky',
          top: 0,
          borderRight: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          overflow: 'hidden',
          transition: theme.transitions.create(['width', 'min-width'], {
            duration: theme.transitions.duration.standard,
            easing: theme.transitions.easing.easeInOut,
          }),
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        <GcpNavContent {...contentProps} />
      </Box>
    );
  }

  return (
    <>
      {controlledMobileOpen === undefined ? (
        <IconButton
          aria-label="Open workspace menu"
          onClick={openMobile}
          sx={{
            position: 'fixed',
            top: 12,
            left: 12,
            zIndex: theme.zIndex.drawer + 1,
            width: 42,
            height: 42,
            color: 'text.primary',
            bgcolor: alpha(theme.palette.background.paper, 0.92),
            border: '1px solid',
            borderColor: 'divider',
            backdropFilter: 'blur(14px)',
            '&:hover': { bgcolor: 'background.paper' },
          }}
        >
          <MenuRoundedIcon />
        </IconButton>
      ) : null}
      <Drawer
        open={mobileOpen}
        onClose={closeMobile}
        ModalProps={{ keepMounted: true }}
        slotProps={{
          paper: {
            sx: {
              width: GCP_STANDARD_NAV_WIDTH,
              maxWidth: 'calc(100vw - 20px)',
              bgcolor: 'background.paper',
              borderRight: '1px solid',
              borderColor: 'divider',
            },
          },
        }}
      >
        <GcpNavContent {...contentProps} mobile />
      </Drawer>
    </>
  );
}
