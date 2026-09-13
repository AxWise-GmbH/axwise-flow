import { createElement, useState } from 'react';
import {
  Box,
  Divider,
  IconButton,
  List,
  ListItem,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import PlaylistPlayOutlinedIcon from '@mui/icons-material/PlaylistPlayOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';
import BrandOrb from '../../pages/Standart/primitives/BrandOrb.jsx';
import { GCP_FOOTER_NAV_ITEMS, isGcpNavItemActive } from './gcpNavItems.js';
import {
  GCP_STANDARD_NAV_BRAND_SIZE,
  GCP_STANDARD_NAV_COLLAPSE_CONTROL_SIZE,
} from './gcpNavChrome.js';

const ICONS = {
  'new-chat': EditOutlinedIcon,
  recents: HistoryOutlinedIcon,
  pinned: PushPinOutlinedIcon,
  home: HomeOutlinedIcon,
  assistant: AutoAwesomeOutlinedIcon,
  goals: FlagOutlinedIcon,
  structure: AccountTreeOutlinedIcon,
  intelligence: PsychologyOutlinedIcon,
  history: ArchiveOutlinedIcon,
  agents: SmartToyOutlinedIcon,
  capabilities: ExtensionOutlinedIcon,
  knowledge: MenuBookOutlinedIcon,
  results: AssessmentOutlinedIcon,
  'assistant-chats': ChatBubbleOutlineOutlinedIcon,
  'goal-runs': PlaylistPlayOutlinedIcon,
  'results-artifacts': DescriptionOutlinedIcon,
  notifications: NotificationsNoneRoundedIcon,
  activity: ReceiptLongOutlinedIcon,
  settings: SettingsOutlinedIcon,
  'edit-sidebar': TuneOutlinedIcon,
  more: MoreHorizRoundedIcon,
};

function iconFor(item, fallback = ChevronRightRoundedIcon) {
  return ICONS[item?.icon || item?.id] || fallback;
}

export function GcpNavIcon({ item }) {
  return createElement(iconFor(item));
}

export function NavBrandHeader({ collapsed = false, mobile = false, onToggleCollapsed, onClose }) {
  if (collapsed) {
    return (
      <Box
        component="header"
        data-testid="gcp-nav-brand"
        sx={{ minHeight: 72, display: 'grid', placeItems: 'center', flexShrink: 0 }}
      >
        <Tooltip title="Expand workspace menu" placement="right" arrow>
          <IconButton
            aria-label="Expand workspace menu"
            onClick={onToggleCollapsed}
            sx={{ width: 40, height: 40, p: 0.125 }}
          >
            <BrandOrb size={GCP_STANDARD_NAV_BRAND_SIZE} title="Orqaly" />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Stack
      component="header"
      data-testid="gcp-nav-brand"
      direction="row"
      alignItems="center"
      sx={{ minHeight: 72, px: 2, flexShrink: 0 }}
    >
      <BrandOrb size={GCP_STANDARD_NAV_BRAND_SIZE} title="Orqaly" />
      <Box sx={{ flex: 1, minWidth: 0 }} />
      <Tooltip title={mobile ? 'Close menu' : 'Collapse menu'} placement="bottom" arrow>
        <IconButton
          aria-label={mobile ? 'Close workspace menu' : 'Collapse workspace menu'}
          onClick={mobile ? onClose : onToggleCollapsed}
          size="small"
          data-control-size={mobile ? 40 : GCP_STANDARD_NAV_COLLAPSE_CONTROL_SIZE}
          sx={{
            width: mobile ? 40 : GCP_STANDARD_NAV_COLLAPSE_CONTROL_SIZE,
            height: mobile ? 40 : GCP_STANDARD_NAV_COLLAPSE_CONTROL_SIZE,
            borderRadius: 1.5,
            color: 'text.secondary',
            '&:hover': { bgcolor: 'transparent', color: 'text.primary' },
          }}
        >
          {mobile ? (
            <CloseRoundedIcon sx={{ fontSize: 20 }} />
          ) : (
            <ViewSidebarOutlinedIcon sx={{ fontSize: 18 }} />
          )}
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

function railButtonSx(theme, active = false) {
  return {
    width: 40,
    height: 40,
    borderRadius: 2,
    color: active ? 'text.primary' : 'text.secondary',
    bgcolor: active ? alpha(theme.palette.text.primary, 0.09) : 'transparent',
    transition: 'color 180ms ease, background-color 180ms ease, transform 180ms ease',
    '&:hover': {
      color: 'text.primary',
      bgcolor: active ? alpha(theme.palette.text.primary, 0.11) : 'transparent',
      transform: 'scale(1.08)',
    },
    '&.Mui-focusVisible': {
      outline: `1px solid ${alpha(theme.palette.text.primary, 0.4)}`,
      outlineOffset: 1,
    },
    '& .MuiSvgIcon-root': { fontSize: 18 },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
      '&:hover': { transform: 'none' },
    },
  };
}

function RailButton({ item, active = false, onClick }) {
  const theme = useTheme();
  return (
    <Tooltip title={item.label} placement="right" arrow>
      <IconButton
        aria-label={item.label}
        aria-current={active && item.kind === 'link' ? 'page' : undefined}
        onClick={onClick}
        sx={railButtonSx(theme, active)}
      >
        <GcpNavIcon item={item} />
      </IconButton>
    </Tooltip>
  );
}

export function GcpNavRail({
  editing,
  hidden,
  location,
  orderedPrimaryItems,
  preferences,
  recentItems,
  onNavigate,
  onNewChat,
  onOpenGroup,
  onOpenEditing,
}) {
  const activeFor = (item) => {
    if (item.kind === 'group') {
      return item.children.some((child) => isGcpNavItemActive(child, location));
    }
    if (item.kind === 'dynamic') {
      const rows = item.id === 'recents' ? recentItems : preferences.pins;
      return rows.some((row) => isGcpNavItemActive({ to: row.to }, location));
    }
    return isGcpNavItemActive(item, location);
  };

  return (
    <>
      <List
        aria-label="Workspace destinations"
        sx={{
          px: 0.75,
          py: 0.5,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.25,
        }}
      >
        {orderedPrimaryItems
          .filter((item) => item.id === 'new-chat' || !hidden.has(item.id))
          .map((item) => {
            const active = activeFor(item);
            const onClick =
              item.id === 'new-chat'
                ? onNewChat
                : item.kind === 'group' || item.kind === 'dynamic'
                  ? () => onOpenGroup(item.id)
                  : () => onNavigate(item.to);
            return (
              <ListItem key={item.id} disablePadding sx={{ width: 'auto' }}>
                <RailButton item={item} active={active} onClick={onClick} />
              </ListItem>
            );
          })}
      </List>

      <GcpNavFooter
        collapsed
        editing={editing}
        location={location}
        onNavigate={onNavigate}
        onOpenEditing={onOpenEditing}
      />
    </>
  );
}

const SETTINGS_ITEM = GCP_FOOTER_NAV_ITEMS.find((item) => item.id === 'settings');
const MORE_ITEMS = GCP_FOOTER_NAV_ITEMS.filter((item) => item.id !== 'settings');

function FooterIconButton({ active = false, item, onClick, ...buttonProps }) {
  const theme = useTheme();
  return (
    <Tooltip title={item.label} placement="top" arrow>
      <IconButton
        aria-label={item.label}
        aria-current={item.kind === 'link' && active ? 'page' : undefined}
        onClick={onClick}
        size="small"
        sx={{
          width: 28,
          height: 28,
          p: 0.5,
          borderRadius: 1.5,
          color: active ? 'text.primary' : 'text.secondary',
          bgcolor: active ? alpha(theme.palette.text.primary, 0.07) : 'transparent',
          '&:hover': {
            color: 'text.primary',
            bgcolor: active ? alpha(theme.palette.text.primary, 0.09) : 'transparent',
          },
          '&.Mui-focusVisible': {
            outline: `1px solid ${alpha(theme.palette.text.primary, 0.4)}`,
            outlineOffset: 1,
          },
          '& .MuiSvgIcon-root': { fontSize: 16 },
        }}
        {...buttonProps}
      >
        <GcpNavIcon item={item} />
      </IconButton>
    </Tooltip>
  );
}

export function GcpNavFooter({
  collapsed = false,
  editing,
  location,
  onNavigate,
  onOpenEditing,
  onToggleEditing,
}) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const closeMenu = () => setMenuAnchor(null);
  const moreActive =
    Boolean(menuAnchor) ||
    editing ||
    MORE_ITEMS.some((item) => item.kind === 'link' && isGcpNavItemActive(item, location));
  const moreItem = { id: 'more', kind: 'control', label: 'More', icon: 'more' };

  const actions = (
    <>
      <FooterIconButton
        item={SETTINGS_ITEM}
        active={isGcpNavItemActive(SETTINGS_ITEM, location)}
        onClick={() => onNavigate(SETTINGS_ITEM.to)}
      />
      <FooterIconButton
        item={moreItem}
        active={moreActive}
        aria-haspopup="menu"
        aria-expanded={Boolean(menuAnchor)}
        aria-controls={menuAnchor ? 'gcp-nav-more-menu' : undefined}
        onClick={(event) => setMenuAnchor(event.currentTarget)}
      />
      <Menu
        id="gcp-nav-more-menu"
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        disableScrollLock
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        slotProps={{
          list: { 'aria-label': 'More workspace utilities' },
          paper: { sx: { minWidth: 210, border: '1px solid', borderColor: 'divider' } },
        }}
      >
        {MORE_ITEMS.flatMap((item, index) => {
          const active = item.kind === 'control' ? editing : isGcpNavItemActive(item, location);
          const rows = [];
          if (item.kind === 'control' && index > 0) {
            rows.push(<Divider key={`${item.id}-divider`} />);
          }
          rows.push(
            <MenuItem
              key={item.id}
              selected={active}
              aria-current={item.kind === 'link' && active ? 'page' : undefined}
              aria-pressed={item.kind === 'control' ? active : undefined}
              onClick={() => {
                closeMenu();
                if (item.kind === 'control') {
                  if (collapsed) onOpenEditing();
                  else onToggleEditing();
                  return;
                }
                onNavigate(item.to);
              }}
              sx={{ minHeight: 36, gap: 1.25, fontSize: '0.8rem' }}
            >
              <Box
                component="span"
                aria-hidden
                sx={{ width: 18, display: 'grid', placeItems: 'center', color: 'text.secondary' }}
              >
                <GcpNavIcon item={item} />
              </Box>
              {item.label}
            </MenuItem>
          );
          return rows;
        })}
      </Menu>
    </>
  );

  if (collapsed) {
    return (
      <Stack
        role="group"
        aria-label="Workspace utilities"
        alignItems="center"
        gap={0.25}
        sx={{
          flexShrink: 0,
          mx: 0.5,
          px: 0.5,
          py: 1,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        {actions}
      </Stack>
    );
  }

  return (
    <Box
      role="group"
      aria-label="Workspace utilities"
      sx={{
        minHeight: 52,
        px: 3,
        py: 1.5,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <Typography
        noWrap
        sx={{
          minWidth: 0,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontSize: '0.75rem',
          color: 'text.disabled',
          lineHeight: 1.4,
        }}
      >
        AxWise &amp; Orqaly
      </Typography>
      <Stack direction="row" alignItems="center" gap={0.25} sx={{ flexShrink: 0 }}>
        {actions}
      </Stack>
    </Box>
  );
}
