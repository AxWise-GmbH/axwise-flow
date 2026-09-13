import { useState, useMemo, useCallback, useRef } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  IconButton,
  Paper,
  Typography,
  Chip,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import { TYPE_LABELS } from '../data/searchIndex';

const TYPE_ORDER = ['section', 'faq', 'endpoint', 'env', 'table', 'page', 'provider'];

/**
 * Hero search box with a grouped results dropdown, keyboard navigation, and
 * click-away close. `results` is the flat ranked list from useDocSearch; on
 * select the parent switches tab and scrolls the matched row into view.
 */
export default function DocSearchBox({ query, setQuery, results = [], onSelect, onClear }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef(null);

  const groups = useMemo(() => {
    const byType = {};
    for (const r of results) (byType[r.type] ||= []).push(r);
    const seen = new Set();
    const out = [];
    for (const t of [...TYPE_ORDER, ...Object.keys(byType)]) {
      if (byType[t] && !seen.has(t)) {
        seen.add(t);
        out.push({ type: t, label: TYPE_LABELS[t] || t, items: byType[t] });
      }
    }
    return out;
  }, [results]);

  const ordered = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const indexById = useMemo(() => {
    const m = {};
    ordered.forEach((r, i) => (m[r.id] = i));
    return m;
  }, [ordered]);

  const showDropdown = open && query.trim().length >= 2 && ordered.length > 0;

  const handleChange = (e) => {
    setQuery(e.target.value);
    setOpen(true);
    setActiveIndex(0);
  };

  const select = useCallback(
    (record) => {
      if (!record) return;
      onSelect?.(record);
      setOpen(false);
    },
    [onSelect]
  );

  const handleKeyDown = (e) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(ordered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(ordered[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const clear = () => {
    onClear?.();
    setOpen(false);
  };

  return (
    <Box sx={{ position: 'relative', width: '100%', maxWidth: 440 }}>
      <TextField
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        placeholder="Search the docs..."
        size="small"
        fullWidth
        autoComplete="off"
        inputProps={{
          'aria-label': 'Search documentation',
          role: 'combobox',
          'aria-expanded': showDropdown,
        }}
        InputProps={{
          sx: { fontSize: '0.85rem', borderRadius: 2.5, bgcolor: 'background.paper' },
          startAdornment: (
            <InputAdornment position="start">
              <SearchOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            </InputAdornment>
          ),
          endAdornment: query ? (
            <InputAdornment position="end">
              <IconButton
                size="small"
                aria-label="Clear search"
                onMouseDown={(e) => e.preventDefault()}
                onClick={clear}
              >
                <CloseOutlinedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
      />

      {showDropdown && (
        <Paper
          elevation={8}
          role="listbox"
          onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}
          sx={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: (t) => t.zIndex.modal,
            maxHeight: 380,
            overflowY: 'auto',
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            py: 0.5,
          }}
        >
          {groups.map((group) => (
            <Box key={group.type}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  px: 1.5,
                  pt: 1,
                  pb: 0.5,
                  fontWeight: 700,
                  fontSize: '0.62rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'text.disabled',
                }}
              >
                {group.label}
              </Typography>
              {group.items.map((record) => {
                const idx = indexById[record.id];
                const isActive = idx === activeIndex;
                return (
                  <Box
                    key={record.id}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      select(record);
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.5,
                      py: 0.75,
                      cursor: 'pointer',
                      bgcolor: isActive ? alpha(primary, 0.1) : 'transparent',
                    }}
                  >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{ fontWeight: 600, fontSize: '0.8rem', fontFamily: record.type === 'endpoint' || record.type === 'env' || record.type === 'table' ? 'monospace' : undefined }}
                      >
                        {record.title}
                      </Typography>
                      {record.subtitle && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: '0.7rem' }}>
                          {record.subtitle}
                        </Typography>
                      )}
                    </Box>
                    <Chip
                      label={TYPE_LABELS[record.type] || record.type}
                      size="small"
                      sx={{ height: 18, fontSize: '0.6rem', borderRadius: 1, flexShrink: 0 }}
                    />
                  </Box>
                );
              })}
            </Box>
          ))}
        </Paper>
      )}
    </Box>
  );
}
