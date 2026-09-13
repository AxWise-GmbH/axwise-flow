import { useState } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  Chip,
  Select,
  MenuItem,
  FormControl,
  IconButton,
  Badge,
  Tooltip,
  Typography,
  Paper,
  Popover,
  useTheme,
  alpha,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ClearIcon from '@mui/icons-material/Clear';
import SortRoundedIcon from '@mui/icons-material/SortRounded';

import AppIcon from '../icons/AppIcon';

/**
 * Enhanced toolbar for Marketplace tabs — filter icon opens popover with search, sort, and category filters.
 */
export default function MarketplaceToolbar({
  searchQuery,
  onSearchChange,
  categories = [],
  categoryFilter,
  onCategoryChange,
  sortBy,
  onSortChange,
  sortOptions = [],
  actionButton,
  placeholder = 'Search...',
  resultCount,
  totalCount,
  facets = [],
  facetFilters = {},
  facetOptions = {},
  onToggleFacet,
  onClearFacets,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [anchorEl, setAnchorEl] = useState(null);
  const activeFacetChips = facets.flatMap((f) =>
    (facetFilters[f.key] || []).map((value) => ({ facet: f, value }))
  );
  const hasActiveFilter = !!categoryFilter || !!searchQuery || activeFacetChips.length > 0;

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 2.5,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.8),
        bgcolor: isDark
          ? alpha(theme.palette.background.paper, 0.6)
          : alpha(theme.palette.background.default, 0.5),
        overflow: 'hidden',
      }}
    >
      {/* ── Compact bar: filter icon + result count + action ──────── */}
      <Box sx={{ display: 'flex', gap: 1, p: 1.5, alignItems: 'center' }}>
        {/* Filter toggle */}
        <Tooltip title="Search, sort & filter">
          <IconButton
            size="small"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{
              border: '1px solid',
              borderColor: hasActiveFilter ? alpha(theme.palette.primary.main, 0.4) : 'divider',
              borderRadius: 2,
              bgcolor: hasActiveFilter ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
              p: 0.75,
            }}
          >
            <Badge color="primary" variant="dot" invisible={!hasActiveFilter}>
              <AppIcon
                name="TuneRounded"
                fallback={TuneRoundedIcon}
                sx={{ fontSize: 18, color: hasActiveFilter ? 'primary.main' : 'text.secondary' }}
              />
            </Badge>
          </IconButton>
        </Tooltip>

        {/* Active filter chips (inline summary) */}
        {categoryFilter && (
          <Chip
            label={categories.find((c) => c.value === categoryFilter)?.label || categoryFilter}
            size="small"
            onDelete={() => onCategoryChange('')}
            deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
            sx={{ fontWeight: 600, fontSize: '0.72rem', height: 26, borderRadius: '8px' }}
          />
        )}
        {searchQuery && (
          <Chip
            label={`"${searchQuery.length > 20 ? searchQuery.slice(0, 20) + '…' : searchQuery}"`}
            size="small"
            onDelete={() => onSearchChange('')}
            deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
            sx={{ fontWeight: 600, fontSize: '0.72rem', height: 26, borderRadius: '8px' }}
          />
        )}
        {activeFacetChips.map(({ facet, value }) => {
          const opt = (facetOptions[facet.key] || []).find((o) => o.value === value);
          return (
            <Chip
              key={`${facet.key}:${value}`}
              label={opt?.label || value}
              size="small"
              onDelete={() => onToggleFacet?.(facet.key, value)}
              deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
              sx={{ fontWeight: 600, fontSize: '0.72rem', height: 26, borderRadius: '8px' }}
            />
          );
        })}

        <Box sx={{ flex: 1 }} />

        {/* Result count */}
        {resultCount != null && (
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            {resultCount}
            {totalCount != null && totalCount !== resultCount ? ` / ${totalCount}` : ''} result
            {resultCount !== 1 ? 's' : ''}
          </Typography>
        )}

        {/* Action button */}
        {actionButton}
      </Box>
      {/* ── Filter Popover ──────────────────────────────────────── */}
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              minWidth: 320,
              maxWidth: 380,
              boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
            },
          },
        }}
      >
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2.5,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon
              name="TuneRounded"
              fallback={TuneRoundedIcon}
              sx={{ fontSize: 18, color: 'primary.main' }}
            />
          </Box>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
              Filters
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              Search, sort & filter
            </Typography>
          </Box>
        </Box>

        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Search */}
          <Box>
            <Typography
              variant="overline"
              sx={{
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'text.secondary',
              }}
            >
              Search
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder={placeholder}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon name="Search" fallback={SearchIcon} sx={{ fontSize: 16 }} />
                  </InputAdornment>
                ),
                ...(searchQuery
                  ? {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            onClick={() => onSearchChange('')}
                            sx={{ p: 0.25 }}
                          >
                            <AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }
                  : {}),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Box>

          {/* Sort */}
          {sortOptions.length > 0 && (
            <Box>
              <Typography
                variant="overline"
                sx={{
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'text.secondary',
                }}
              >
                Sort
              </Typography>
              <FormControl fullWidth size="small">
                <Select
                  value={sortBy}
                  onChange={(e) => onSortChange(e.target.value)}
                  displayEmpty
                  startAdornment={
                    <AppIcon
                      name="SortRounded"
                      fallback={SortRoundedIcon}
                      sx={{ fontSize: 16, mr: 0.75, color: 'text.secondary' }}
                    />
                  }
                  sx={{ borderRadius: 2, fontSize: '0.82rem' }}
                >
                  {sortOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.82rem' }}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}

          {/* Category */}
          {categories.length > 0 && (
            <Box>
              <Typography
                variant="overline"
                sx={{
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'text.secondary',
                }}
              >
                Category
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
                <Chip
                  label="All"
                  size="small"
                  variant={!categoryFilter ? 'filled' : 'outlined'}
                  color={!categoryFilter ? 'primary' : 'default'}
                  onClick={() => onCategoryChange('')}
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.74rem',
                    cursor: 'pointer',
                    height: 28,
                    borderRadius: '8px',
                    transition: 'all 0.15s',
                  }}
                />
                {categories.map((cat) => {
                  const isActive = categoryFilter === cat.value;
                  return (
                    <Chip
                      key={cat.value}
                      label={cat.label}
                      size="small"
                      variant={isActive ? 'filled' : 'outlined'}
                      onClick={() =>
                        onCategoryChange(cat.value === categoryFilter ? '' : cat.value)
                      }
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.74rem',
                        cursor: 'pointer',
                        height: 28,
                        borderRadius: '8px',
                        transition: 'all 0.15s',
                        ...(isActive && cat.color
                          ? {
                              bgcolor: alpha(cat.color, 0.15),
                              color: cat.color,
                              borderColor: alpha(cat.color, 0.4),
                              '&:hover': { bgcolor: alpha(cat.color, 0.22) },
                            }
                          : {}),
                        ...(!isActive && cat.color
                          ? {
                              '&:hover': {
                                borderColor: alpha(cat.color, 0.5),
                                bgcolor: alpha(cat.color, 0.06),
                              },
                            }
                          : {}),
                      }}
                    />
                  );
                })}
              </Box>
            </Box>
          )}

          {/* Multi-select facets */}
          {facets.map((facet) => {
            const opts = facetOptions[facet.key] || [];
            if (opts.length === 0) return null;
            const selected = facetFilters[facet.key] || [];
            return (
              <Box key={facet.key}>
                <Typography
                  variant="overline"
                  sx={{
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    color: 'text.secondary',
                  }}
                >
                  {facet.label}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
                  {opts.map((opt) => {
                    const isActive = selected.includes(opt.value);
                    return (
                      <Chip
                        key={opt.value}
                        label={opt.label}
                        size="small"
                        variant={isActive ? 'filled' : 'outlined'}
                        color={isActive && !opt.color ? 'primary' : 'default'}
                        onClick={() => onToggleFacet?.(facet.key, opt.value)}
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.74rem',
                          cursor: 'pointer',
                          height: 28,
                          borderRadius: '8px',
                          transition: 'all 0.15s',
                          ...(isActive && opt.color
                            ? {
                                bgcolor: alpha(opt.color, 0.15),
                                color: opt.color,
                                borderColor: alpha(opt.color, 0.4),
                                '&:hover': { bgcolor: alpha(opt.color, 0.22) },
                              }
                            : {}),
                          ...(!isActive && opt.color
                            ? {
                                '&:hover': {
                                  borderColor: alpha(opt.color, 0.5),
                                  bgcolor: alpha(opt.color, 0.06),
                                },
                              }
                            : {}),
                        }}
                      />
                    );
                  })}
                </Box>
              </Box>
            );
          })}

          {/* Reset */}
          {hasActiveFilter && (
            <Chip
              label="Clear all filters"
              size="small"
              variant="outlined"
              onDelete={() => {
                onCategoryChange('');
                onSearchChange('');
                onClearFacets?.();
              }}
              deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
              sx={{
                fontSize: '0.72rem',
                height: 28,
                borderRadius: '8px',
                color: 'text.secondary',
                alignSelf: 'flex-start',
              }}
            />
          )}
        </Box>
      </Popover>
    </Paper>
  );
}
