import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  alpha,
  useTheme,
} from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import ApiOutlinedIcon from '@mui/icons-material/ApiOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import CellTowerOutlinedIcon from '@mui/icons-material/CellTowerOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import FilterTuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CloseIcon from '@mui/icons-material/Close';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

import AppIcon from '../icons/AppIcon';

export const CATEGORY_OPTIONS = [
  { slug: 'platform', label: 'Platform', Icon: AccountTreeOutlinedIcon, color: '#2563EB' },
  { slug: 'audit', label: 'Audit', Icon: TuneIcon, color: '#64748B' },
  { slug: 'all', label: 'All', Icon: HubOutlinedIcon, color: '#475569' },
  { slug: 'full', label: 'Frontend', Icon: AccountTreeOutlinedIcon, color: '#7C3AED' },
  { slug: 'database', label: 'Database', Icon: StorageOutlinedIcon, color: '#2563EB' },
  { slug: 'apis', label: 'API Routes', Icon: ApiOutlinedIcon, color: '#1D4ED8' },
  { slug: 'services', label: 'Services', Icon: HubOutlinedIcon, color: '#334155' },
  { slug: 'security', label: 'Security', Icon: SecurityOutlinedIcon, color: '#B91C1C' },
  { slug: 'storage', label: 'Storage', Icon: StorageOutlinedIcon, color: '#059669' },
  { slug: 'communication', label: 'Comms', Icon: CellTowerOutlinedIcon, color: '#06B6D4' },
  { slug: 'agents', label: 'Agents', Icon: SmartToyOutlinedIcon, color: '#EC4899' },
  { slug: 'teams', label: 'Teams', Icon: PersonOutlineIcon, color: '#0EA5E9' },
  { slug: 'consilium', label: 'Consilium', Icon: AccountTreeOutlinedIcon, color: '#9333EA' },
  { slug: 'llm', label: 'LLM', Icon: PsychologyOutlinedIcon, color: '#9333EA' },
  { slug: 'crons', label: 'Crons', Icon: ScheduleOutlinedIcon, color: '#F59E0B' },
];

const DEFAULT_SLUG = 'platform';

export default function CategoryMenu({
  value = DEFAULT_SLUG,
  onChange,
  counts = {},
  onReset,
  disabled = false,
  sx,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const active = CATEGORY_OPTIONS.find((o) => o.slug === value) ?? CATEGORY_OPTIONS[0];
  const ActiveIcon = active.Icon;
  const isNonDefault = value !== DEFAULT_SLUG;

  const handleSelect = (slug) => {
    setAnchorEl(null);
    if (slug !== value) onChange?.(slug);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange?.(DEFAULT_SLUG);
  };

  return (
    <>
      <Button
        onClick={(e) => setAnchorEl(anchorEl ? null : e.currentTarget)}
        disabled={disabled}
        variant="outlined"
        size="small"
        disableRipple={false}
        aria-haspopup="menu"
        aria-expanded={open}
        startIcon={
          <AppIcon name="TuneRounded" fallback={FilterTuneRoundedIcon} sx={{ fontSize: 16 }} />
        }
        endIcon={
          isNonDefault ? (
            <Box
              component="span"
              role="button"
              tabIndex={0}
              aria-label="Reset category"
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleClear(e);
              }}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                width: 18,
                height: 18,
                cursor: 'pointer',
                color: 'text.secondary',
                '&:hover': { bgcolor: alpha(active.color, 0.15), color: active.color },
              }}
            >
              <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 13 }} />
            </Box>
          ) : (
            <AppIcon name="ArrowDropDown" fallback={ArrowDropDownIcon} sx={{ fontSize: 18 }} />
          )
        }
        sx={{
          height: 34,
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.78rem',
          letterSpacing: '0.01em',
          borderRadius: 2,
          px: 1.25,
          gap: 0.25,
          color: isNonDefault ? active.color : 'text.primary',
          borderColor: isNonDefault ? alpha(active.color, 0.6) : 'divider',
          bgcolor: isNonDefault
            ? alpha(active.color, isDark ? 0.15 : 0.08)
            : isDark
              ? alpha('#fff', 0.04)
              : alpha('#fff', 0.7),
          '&:hover': {
            borderColor: isNonDefault ? active.color : 'text.secondary',
            bgcolor: isNonDefault
              ? alpha(active.color, isDark ? 0.22 : 0.12)
              : isDark
                ? alpha('#fff', 0.08)
                : alpha('#0F172A', 0.04),
          },
          '&:focus-visible': {
            outline: `2px solid ${alpha(theme.palette.primary.main, 0.4)}`,
            outlineOffset: 2,
          },
          ...sx,
        }}
      >
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <AppIcon fallback={ActiveIcon} sx={{ fontSize: 15, color: active.color }} />
          <Box component="span" sx={{ fontWeight: 700 }}>
            Categories:
          </Box>
          <Box component="span">{active.label}</Box>
        </Box>
      </Button>
      <Menu
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              minWidth: 260,
              maxHeight: '60vh',
              borderRadius: 2.5,
              boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.45)' : '0 8px 24px rgba(15,23,42,0.12)',
              border: '1px solid',
              borderColor: 'divider',
            },
          },
        }}
      >
        {CATEGORY_OPTIONS.map((opt) => {
          const OptIcon = opt.Icon;
          const isActive = opt.slug === value;
          const count = counts[opt.slug];
          return (
            <MenuItem
              key={opt.slug}
              role="menuitemradio"
              aria-checked={isActive}
              selected={isActive}
              onClick={() => handleSelect(opt.slug)}
              sx={{
                py: 0.75,
                pl: 1.25,
                pr: 1.5,
                gap: 1,
                borderLeft: '3px solid',
                borderLeftColor: isActive ? opt.color : 'transparent',
                '&.Mui-selected': {
                  bgcolor: alpha(opt.color, isDark ? 0.16 : 0.08),
                },
                '&.Mui-selected:hover': {
                  bgcolor: alpha(opt.color, isDark ? 0.22 : 0.12),
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 'auto !important' }}>
                <AppIcon fallback={OptIcon} sx={{ fontSize: 17, color: opt.color }} />
              </ListItemIcon>
              <ListItemText
                primary={opt.label}
                primaryTypographyProps={{
                  fontSize: '0.82rem',
                  fontWeight: isActive ? 700 : 500,
                }}
              />
              {typeof count === 'number' && (
                <Chip
                  label={count}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    bgcolor: isActive
                      ? alpha(opt.color, 0.18)
                      : alpha(theme.palette.text.secondary, 0.08),
                    color: isActive ? opt.color : 'text.secondary',
                    '& .MuiChip-label': { px: 0.9 },
                  }}
                />
              )}
            </MenuItem>
          );
        })}
        {onReset && <Divider key="reset-divider" sx={{ my: 0.5 }} />}
        {onReset && (
          <MenuItem
            key="reset-item"
            onClick={() => {
              setAnchorEl(null);
              onReset();
            }}
            sx={{ py: 0.75, gap: 1, color: 'text.secondary' }}
          >
            <ListItemIcon sx={{ minWidth: 'auto !important' }}>
              <AppIcon name="RestartAlt" fallback={RestartAltIcon} sx={{ fontSize: 17 }} />
            </ListItemIcon>
            <ListItemText
              primary="Reset filters"
              primaryTypographyProps={{ fontSize: '0.82rem', fontWeight: 500 }}
            />
          </MenuItem>
        )}
      </Menu>
    </>
  );
}
