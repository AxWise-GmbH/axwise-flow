import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  alpha,
  useTheme,
} from '@mui/material';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CloseIcon from '@mui/icons-material/Close';
import SegmentOutlinedIcon from '@mui/icons-material/SegmentOutlined';

import AppIcon from '../icons/AppIcon';

const ALL = 'all';

export default function SectionMenu({
  value = ALL,
  onChange,
  types = [],
  typeMeta = {},
  counts = {},
  sx,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const isEmpty = types.length === 0;
  const isActive = value !== ALL;
  const activeMeta = isActive ? typeMeta[value] : null;
  const activeLabel = activeMeta?.label ?? value;
  const activeColor = activeMeta?.color ?? theme.palette.primary.main;

  const handleSelect = (slug) => {
    setAnchorEl(null);
    if (slug === ALL) {
      onChange?.(ALL);
    } else if (slug === value) {
      onChange?.(ALL);
    } else {
      onChange?.(slug);
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange?.(ALL);
  };

  const button = (
    <Button
      onClick={(e) => setAnchorEl(anchorEl ? null : e.currentTarget)}
      disabled={isEmpty}
      variant="outlined"
      size="small"
      aria-haspopup="menu"
      aria-expanded={open}
      startIcon={<AppIcon name="TuneRounded" fallback={TuneRoundedIcon} sx={{ fontSize: 16 }} />}
      endIcon={
        isActive ? (
          <Box
            component="span"
            role="button"
            tabIndex={0}
            aria-label="Clear section filter"
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
              '&:hover': { bgcolor: alpha(activeColor, 0.15), color: activeColor },
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
        color: isActive ? activeColor : 'text.primary',
        borderColor: isActive ? alpha(activeColor, 0.6) : 'divider',
        bgcolor: isActive
          ? alpha(activeColor, isDark ? 0.15 : 0.08)
          : isDark
            ? alpha('#fff', 0.04)
            : alpha('#fff', 0.7),
        '&:hover': {
          borderColor: isActive ? activeColor : 'text.secondary',
          bgcolor: isActive
            ? alpha(activeColor, isDark ? 0.22 : 0.12)
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
        {isActive ? (
          <Box
            component="span"
            sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: activeColor, flexShrink: 0 }}
          />
        ) : (
          <AppIcon
            name="SegmentOutlined"
            fallback={SegmentOutlinedIcon}
            sx={{ fontSize: 15, color: 'text.secondary' }}
          />
        )}
        <Box component="span" sx={{ fontWeight: 700 }}>
          Sections:
        </Box>
        <Box component="span">{isActive ? activeLabel : 'All'}</Box>
      </Box>
    </Button>
  );

  return (
    <>
      {isEmpty ? (
        <Tooltip title="No sections in this category">
          <span>{button}</span>
        </Tooltip>
      ) : (
        button
      )}
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
              minWidth: 240,
              maxHeight: '60vh',
              borderRadius: 2.5,
              boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.45)' : '0 8px 24px rgba(15,23,42,0.12)',
              border: '1px solid',
              borderColor: 'divider',
            },
          },
        }}
      >
        <MenuItem
          role="menuitemradio"
          aria-checked={value === ALL}
          selected={value === ALL}
          onClick={() => handleSelect(ALL)}
          sx={{
            py: 0.75,
            pl: 1.25,
            pr: 1.5,
            gap: 1,
            borderLeft: '3px solid',
            borderLeftColor: value === ALL ? theme.palette.primary.main : 'transparent',
          }}
        >
          <ListItemIcon sx={{ minWidth: 'auto !important' }}>
            <AppIcon
              name="SegmentOutlined"
              fallback={SegmentOutlinedIcon}
              sx={{ fontSize: 17, color: 'text.secondary' }}
            />
          </ListItemIcon>
          <ListItemText
            primary="All sections"
            primaryTypographyProps={{
              fontSize: '0.82rem',
              fontWeight: value === ALL ? 700 : 500,
            }}
          />
        </MenuItem>
        {types.map((type) => {
          const meta = typeMeta[type] || { label: type, color: '#64748B', icon: null };
          const OptIcon = meta.icon;
          const isSel = type === value;
          const count = counts[type];
          return (
            <MenuItem
              key={type}
              role="menuitemradio"
              aria-checked={isSel}
              selected={isSel}
              onClick={() => handleSelect(type)}
              sx={{
                py: 0.75,
                pl: 1.25,
                pr: 1.5,
                gap: 1,
                borderLeft: '3px solid',
                borderLeftColor: isSel ? meta.color : 'transparent',
                '&.Mui-selected': {
                  bgcolor: alpha(meta.color, isDark ? 0.16 : 0.08),
                },
                '&.Mui-selected:hover': {
                  bgcolor: alpha(meta.color, isDark ? 0.22 : 0.12),
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 'auto !important' }}>
                {OptIcon ? (
                  <AppIcon fallback={OptIcon} sx={{ fontSize: 17, color: meta.color }} />
                ) : (
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: meta.color }} />
                )}
              </ListItemIcon>
              <ListItemText
                primary={meta.label || type}
                primaryTypographyProps={{
                  fontSize: '0.82rem',
                  fontWeight: isSel ? 700 : 500,
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
                    bgcolor: isSel
                      ? alpha(meta.color, 0.18)
                      : alpha(theme.palette.text.secondary, 0.08),
                    color: isSel ? meta.color : 'text.secondary',
                    '& .MuiChip-label': { px: 0.9 },
                  }}
                />
              )}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
