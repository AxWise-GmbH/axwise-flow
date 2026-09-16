import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Box,
  OutlinedInput,
  InputLabel,
  FormControl,
  FormHelperText,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Chip,
  IconButton,
  Paper,
  Popper,
  alpha,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import AppIcon from '../icons/AppIcon';

/**
 * Design-system multi-select with search and tag display.
 * Reusable for country/geo, languages, or any option list.
 *
 * @param {Object} props
 * @param {Array<{ value: string, label: string, icon?: string | React.ReactNode }>} props.options - Options to choose from
 * @param {string[]} props.value - Selected values (controlled)
 * @param {function(string[]): void} props.onChange - Called when selection changes
 * @param {string} [props.placeholder] - Placeholder when empty (e.g. "Country / Geo")
 * @param {string} [props.label] - Input label
 * @param {string} [props.helperText] - Helper text below input
 * @param {number} [props.maxListHeight] - Max height of dropdown list (px)
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.required]
 * @param {string} [props.size] - 'small' | 'medium'
 * @param {Object} [props.sx] - Extra sx for root
 */
export default function MultiSelectWithSearch({
  options = [],
  value = [],
  onChange,
  placeholder = 'Select…',
  label,
  helperText,
  maxListHeight = 280,
  disabled = false,
  required = false,
  size = 'medium',
  sx = {},
}) {
  const theme = useTheme();
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const isDark = theme.palette.mode === 'dark';
  const primary = theme.palette.primary.main;

  const selectedSet = useMemo(() => new Set(value), [value]);
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (opt) =>
        (opt.label || '').toLowerCase().includes(q) ||
        String(opt.value || '')
          .toLowerCase()
          .includes(q)
    );
  }, [options, search]);

  const selectedOptions = useMemo(
    () => options.filter((opt) => selectedSet.has(opt.value)),
    [options, selectedSet]
  );

  const handleToggle = (optValue) => {
    const next = selectedSet.has(optValue)
      ? value.filter((v) => v !== optValue)
      : [...value, optValue];
    onChange(next);
  };

  const handleRemoveTag = (e, optValue) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== optValue));
  };

  const handleClearAll = (e) => {
    e.stopPropagation();
    onChange([]);
    setSearch('');
  };

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const listId = `multi-select-list-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <FormControl
      fullWidth
      size={size}
      disabled={disabled}
      required={required}
      sx={{ position: 'relative', ...sx }}
      ref={anchorRef}
    >
      {label && (
        <InputLabel shrink htmlFor={listId} sx={{ fontWeight: 600 }}>
          {label}
        </InputLabel>
      )}
      <OutlinedInput
        id={listId}
        placeholder={selectedOptions.length === 0 ? placeholder : 'Search…'}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        inputProps={{ style: { minWidth: 60 }, 'aria-label': label || placeholder }}
        sx={{
          mt: label ? 1.5 : 0,
          borderRadius: 2,
          borderColor: open ? primary : 'divider',
          boxShadow: open ? `0 0 0 2px ${alpha(primary, 0.2)}` : 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          '&:hover': {
            borderColor: open ? primary : alpha(primary, 0.5),
          },
          '& fieldset': {
            borderColor: open ? primary : undefined,
          },
          minHeight: size === 'small' ? 40 : 48,
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 0.75,
          py: 0.75,
          px: 1.25,
        }}
        startAdornment={
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.5,
              alignItems: 'center',
              maxWidth: '100%',
            }}
          >
            {selectedOptions.map((opt) => (
              <Chip
                key={opt.value}
                size="small"
                label={
                  <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {opt.icon != null && (
                      <Box component="span" sx={{ lineHeight: 1, fontSize: '0.875rem' }}>
                        {typeof opt.icon === 'string' ? opt.icon : opt.icon}
                      </Box>
                    )}
                    <span>{opt.label || opt.value}</span>
                  </Box>
                }
                onDelete={(e) => handleRemoveTag(e, opt.value)}
                deleteIcon={<AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 14 }} />}
                sx={{
                  height: size === 'small' ? 24 : 28,
                  borderRadius: 1.5,
                  bgcolor: isDark ? alpha(primary, 0.18) : alpha(primary, 0.12),
                  border: '1px solid',
                  borderColor: alpha(primary, 0.3),
                  color: 'text.primary',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  '& .MuiChip-deleteIcon': {
                    color: 'text.secondary',
                    '&:hover': { color: 'text.primary' },
                  },
                }}
              />
            ))}
          </Box>
        }
        endAdornment={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, ml: 0.5 }}>
            {value.length > 0 && (
              <IconButton
                size="small"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleClearAll}
                aria-label="Clear all"
                sx={{ p: 0.25 }}
              >
                <AppIcon
                  name="Close"
                  fallback={CloseIcon}
                  sx={{ fontSize: 18, color: 'text.secondary' }}
                />
              </IconButton>
            )}
            <IconButton
              size="small"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? 'Collapse' : 'Expand'}
              sx={{ p: 0.25 }}
            >
              {open ? (
                <AppIcon
                  name="ExpandLess"
                  fallback={ExpandLessIcon}
                  sx={{ fontSize: 20, color: 'text.secondary' }}
                />
              ) : (
                <AppIcon
                  name="ExpandMore"
                  fallback={ExpandMoreIcon}
                  sx={{ fontSize: 20, color: 'text.secondary' }}
                />
              )}
            </IconButton>
          </Box>
        }
      />
      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        disablePortal={false}
        modifiers={[
          { name: 'offset', options: { offset: [0, 4] } },
          { name: 'flip', options: { fallbackPlacements: ['bottom-end', 'top-start'] } },
          { name: 'preventOverflow', options: { padding: 8 } },
        ]}
        style={{ zIndex: 1400 }}
      >
        <Paper
          elevation={8}
          onMouseDown={(e) => e.preventDefault()}
          sx={{
            width: anchorRef.current ? anchorRef.current.offsetWidth : 'auto',
            minWidth: 200,
            maxHeight: maxListHeight,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            boxShadow: theme.shadows[8],
          }}
        >
          <List
            dense
            sx={{
              overflow: 'auto',
              py: 0,
              maxHeight: maxListHeight,
            }}
          >
            {filteredOptions.length === 0 ? (
              <ListItem>
                <ListItemText
                  primary="No options"
                  secondary={search ? 'Try a different search' : ''}
                  primaryTypographyProps={{ fontSize: '0.875rem' }}
                />
              </ListItem>
            ) : (
              filteredOptions.map((opt) => {
                const selected = selectedSet.has(opt.value);
                return (
                  <ListItem key={opt.value} disablePadding>
                    <ListItemButton
                      selected={selected}
                      onClick={() => handleToggle(opt.value)}
                      sx={{
                        py: 0.75,
                        px: 1.5,
                        borderRadius: 1,
                        mx: 0.5,
                        mt: 0.25,
                        '&.Mui-selected': {
                          bgcolor: alpha(primary, 0.12),
                          '&:hover': { bgcolor: alpha(primary, 0.18) },
                        },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Checkbox
                          edge="start"
                          checked={selected}
                          tabIndex={-1}
                          disableRipple
                          size="small"
                          sx={{ p: 0.25 }}
                        />
                      </ListItemIcon>
                      {opt.icon != null && (
                        <Box sx={{ mr: 1, lineHeight: 1, fontSize: '1rem' }}>
                          {typeof opt.icon === 'string' ? opt.icon : opt.icon}
                        </Box>
                      )}
                      <ListItemText
                        primary={opt.label || opt.value}
                        primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })
            )}
          </List>
        </Paper>
      </Popper>
      {helperText && <FormHelperText sx={{ mt: 0.5 }}>{helperText}</FormHelperText>}
    </FormControl>
  );
}
