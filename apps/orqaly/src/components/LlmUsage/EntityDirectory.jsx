/**
 * EntityDirectory - per-entity usage directory.
 *
 * Lists every entity of a type (goal/agent/team/consilium/organization) with
 * its LLM usage rollup, via the useUsageDirectory hook. Renders a toolbar
 * (filter/search/sort popover + grid/list view toggle + a count/cost summary),
 * a responsive card grid or an MUI table, loading skeletons, a graceful empty
 * state and an error notice. Clicking a card or row opens a right-side drawer
 * containing the existing LlmUsagePanel scoped to that entity id.
 */
import { useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  InputAdornment,
  FormControl,
  Select,
  MenuItem,
  IconButton,
  Popover,
  Tooltip,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  Drawer,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Skeleton,
  Grid,
  alpha,
  useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ClearIcon from '@mui/icons-material/Clear';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useNavigate } from 'react-router-dom';
import { useUsageDirectory } from '../../hooks/useUsageDirectory';
import EntityCard from './EntityCard';
import LlmUsagePanel from './LlmUsagePanel';
import { formatCurrency } from '../../utils/formatters';
import { formatTokens } from '../../utils/formatTokens';

import AppIcon from '../icons/AppIcon';

const SORT_OPTIONS = [
  { id: 'cost', label: 'Cost' },
  { id: 'name', label: 'Name' },
  { id: 'calls', label: 'Calls' },
];

// Entities that carry a meaningful status worth filtering on. Agents report a
// null status, so we hide the status filter + column for them.
const STATUS_FILTERS = {
  goal: ['active', 'running', 'completed', 'failed', 'pending'],
  organization: ['active', 'inactive'],
  consilium: ['active', 'completed', 'pending'],
  team: ['active', 'inactive'],
};

const ENTITY_LABEL = {
  goal: 'goal',
  agent: 'agent',
  team: 'team',
  consilium: 'consilium',
  organization: 'organization',
};

// Per-entity extra count columns shown in the list/table view.
const COUNT_COLUMNS = {
  goal: [
    { key: 'agentsUsed', label: 'Agents', get: (it) => it.agentsUsed ?? it.counts?.agents ?? 0 },
  ],
  organization: [
    { key: 'goals', label: 'Goals', get: (it) => it.counts?.goals ?? 0 },
    { key: 'agents', label: 'Agents', get: (it) => it.counts?.agents ?? 0 },
  ],
  consilium: [
    { key: 'goals', label: 'Goals', get: (it) => it.counts?.goals ?? 0 },
    { key: 'teams', label: 'Teams', get: (it) => it.counts?.teams ?? 0 },
  ],
  team: [
    { key: 'members', label: 'Members', get: (it) => it.counts?.members ?? 0 },
    { key: 'goals', label: 'Goals', get: (it) => it.counts?.goals ?? 0 },
  ],
  agent: [{ key: 'goalsUsedIn', label: 'Goals', get: (it) => it.counts?.goalsUsedIn ?? 0 }],
};

function fmtInt(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtTokens(value) {
  return formatTokens(value) || '0';
}

function fmtCost(value) {
  const v = Number(value || 0);
  if (v > 0 && v < 0.01) return `$${v.toFixed(4)}`;
  return formatCurrency(v);
}

export default function EntityDirectory({
  entity = 'goal',
  from,
  to,
  demoItems = null,
  demoSnapshot = null,
  embedded = false,
  provider,
  model,
  source,
  search: searchProp,
  status: statusProp,
  sortBy: sortByProp,
  sortDir: sortDirProp,
  viewMode: viewModeProp,
}) {
  const theme = useTheme();
  const navigate = useNavigate();

  const [searchState, setSearch] = useState('');
  const [statusState, setStatus] = useState('');
  const [orderByState, setOrderBy] = useState('cost');
  const [orderDirState, setOrderDir] = useState('desc');
  const [viewModeState, setViewMode] = useState('cards');
  const [filterAnchor, setFilterAnchor] = useState(null);
  const [drillItem, setDrillItem] = useState(null);

  // In embedded mode (e.g. the Reports LLM tab) the parent page owns the
  // filter/sort/view controls; otherwise the directory's own toolbar drives them.
  const search = embedded ? searchProp || '' : searchState;
  const status = embedded ? statusProp || '' : statusState;
  const orderBy = embedded ? sortByProp || 'cost' : orderByState;
  const orderDir = embedded ? sortDirProp || 'desc' : orderDirState;
  const viewMode = embedded ? viewModeProp || 'cards' : viewModeState;

  // `demoItems` injects a fixed list (preview page) and bypasses the fetch.
  const hook = useUsageDirectory(entity, {
    from,
    to,
    provider,
    model,
    source,
    enabled: !demoItems,
  });
  const items = demoItems || hook.items;
  const loading = demoItems ? false : hook.loading;
  const error = demoItems ? null : hook.error;
  const totals = demoItems
    ? demoItems.reduce(
        (a, it) => ({
          calls: a.calls + (it.usage?.calls || 0),
          totalTokens: a.totalTokens + (it.usage?.totalTokens || 0),
          cost: a.cost + (it.usage?.cost || 0),
        }),
        { calls: 0, totalTokens: 0, cost: 0 }
      )
    : hook.totals;

  const statusOptions = STATUS_FILTERS[entity];
  const countColumns = COUNT_COLUMNS[entity] || [];
  const label = ENTITY_LABEL[entity] || entity;

  // Client-side filter + sort. The hook also accepts server-side search/status,
  // but filtering the already-fetched snapshot keeps the toolbar instant.
  const visible = useMemo(() => {
    let list = Array.isArray(items) ? [...items] : [];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((it) => (it.name || '').toLowerCase().includes(q));
    }
    if (status) {
      list = list.filter((it) => String(it.status || '').toLowerCase() === status);
    }
    list.sort((a, b) => {
      let av;
      let bv;
      switch (orderBy) {
        case 'name':
          av = a.name || '';
          bv = b.name || '';
          break;
        case 'calls':
          av = a.usage?.calls || 0;
          bv = b.usage?.calls || 0;
          break;
        case 'cost':
        default:
          av = a.usage?.cost || 0;
          bv = b.usage?.cost || 0;
          break;
      }
      if (typeof av === 'string')
        return orderDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return orderDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [items, search, status, orderBy, orderDir]);

  const hasFilter = Boolean(search || status);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Toolbar */}
      <Box
        sx={{
          display: embedded ? 'none' : 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          p: 1,
          borderRadius: 2.5,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Tooltip title="Search & sort" placement="bottom" arrow>
          <IconButton
            onClick={(e) => setFilterAnchor(e.currentTarget)}
            aria-label="Search and sort"
            sx={{
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: hasFilter ? 'primary.main' : 'divider',
              borderRadius: 2,
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                borderColor: 'primary.main',
              },
            }}
          >
            <AppIcon
              name="TuneRounded"
              fallback={TuneRoundedIcon}
              sx={{ fontSize: 20, color: hasFilter ? 'primary.main' : 'text.secondary' }}
            />
          </IconButton>
        </Tooltip>

        <ToggleButtonGroup
          value={viewMode}
          exclusive
          size="small"
          onChange={(_, v) => v != null && setViewMode(v)}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            '& .MuiToggleButton-root': {
              px: 1.25,
              py: 0.75,
              border: 'none',
              color: 'text.secondary',
              '&.Mui-selected': {
                bgcolor: alpha(theme.palette.primary.main, 0.15),
                color: 'primary.main',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.22) },
              },
            },
          }}
        >
          <ToggleButton value="cards" aria-label="Card view">
            <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 20 }} />
          </ToggleButton>
          <ToggleButton value="list" aria-label="List view">
            <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 20 }} />
          </ToggleButton>
        </ToggleButtonGroup>

        {search && (
          <Chip
            label={`"${search.length > 12 ? `${search.slice(0, 12)}…` : search}"`}
            size="small"
            onDelete={() => setSearch('')}
            deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
            sx={{
              height: 24,
              fontSize: '0.7rem',
              fontWeight: 600,
              bgcolor: alpha(theme.palette.primary.main, 0.08),
            }}
          />
        )}

        <Box sx={{ flex: 1 }} />

        {/* Summary */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label={`${visible.length} ${label}${visible.length !== 1 ? 's' : ''}`}
            size="small"
            sx={{ height: 24, fontSize: '0.7rem', fontWeight: 600 }}
          />
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', fontWeight: 600 }}
            data-testid="directory-summary"
          >
            {fmtCost(totals?.cost)} · {fmtTokens(totals?.totalTokens)} tokens
          </Typography>
        </Box>
      </Box>
      {/* Filter popover */}
      <Popover
        open={Boolean(filterAnchor)}
        anchorEl={filterAnchor}
        onClose={() => setFilterAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              minWidth: 300,
              maxWidth: 360,
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
              Search & Sort
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              Filter this directory
            </Typography>
          </Box>
        </Box>
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
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
              size="small"
              fullWidth
              placeholder={`Search ${label}s...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon name="Search" fallback={SearchIcon} sx={{ fontSize: 16 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Box>

          {statusOptions && (
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
                Status
              </Typography>
              <FormControl size="small" fullWidth>
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  displayEmpty
                  sx={{ borderRadius: 2, fontSize: '0.82rem' }}
                >
                  <MenuItem value="" sx={{ fontSize: '0.82rem' }}>
                    All statuses
                  </MenuItem>
                  {statusOptions.map((s) => (
                    <MenuItem
                      key={s}
                      value={s}
                      sx={{ fontSize: '0.82rem', textTransform: 'capitalize' }}
                    >
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}

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
              Sort By
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <Select
                  value={orderBy}
                  onChange={(e) => setOrderBy(e.target.value)}
                  sx={{ borderRadius: 2, fontSize: '0.82rem' }}
                >
                  {SORT_OPTIONS.map((o) => (
                    <MenuItem key={o.id} value={o.id} sx={{ fontSize: '0.82rem' }}>
                      {o.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <IconButton
                size="small"
                onClick={() => setOrderDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                aria-label="Toggle sort direction"
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 0.5 }}
              >
                {orderDir === 'desc' ? (
                  <AppIcon
                    name="ArrowDownward"
                    fallback={ArrowDownwardIcon}
                    sx={{ fontSize: 16 }}
                  />
                ) : (
                  <AppIcon name="ArrowUpward" fallback={ArrowUpwardIcon} sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            </Box>
          </Box>
        </Box>
      </Popover>
      {/* Error notice */}
      {error && (
        <Box
          sx={{
            p: 1.25,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.warning.main, 0.08),
            border: '1px solid',
            borderColor: alpha(theme.palette.warning.main, 0.3),
          }}
        >
          <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600 }}>
            {error.message || 'Usage directory could not be loaded. Showing an empty snapshot.'}
          </Typography>
        </Box>
      )}
      {/* Content */}
      {loading ? (
        <Grid container spacing="10px" data-testid="directory-loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
              <Skeleton variant="rounded" height={180} sx={{ borderRadius: 2.5 }} />
            </Grid>
          ))}
        </Grid>
      ) : visible.length === 0 ? (
        <Box
          data-testid="directory-empty"
          sx={{
            textAlign: 'center',
            py: 6,
            px: 2,
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 2.5,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {hasFilter
              ? `No ${label}s match your filters.`
              : `No ${label}s with usage in this range yet.`}
          </Typography>
        </Box>
      ) : viewMode !== 'list' ? (
        <Grid container spacing="10px" data-testid="directory-grid">
          {visible.map((item) => (
            <Grid key={item.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <EntityCard entity={entity} item={item} onOpen={setDrillItem} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <TableContainer
          component={Paper}
          elevation={0}
          data-testid="directory-table"
          sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}
        >
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: alpha(theme.palette.text.primary, 0.03) }}>
                <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                {statusOptions && <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>}
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  Calls
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  Tokens
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  Cost
                </TableCell>
                {countColumns.map((c) => (
                  <TableCell key={c.key} align="right" sx={{ fontWeight: 700 }}>
                    {c.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((item) => (
                <TableRow
                  key={item.id}
                  hover
                  onClick={() => setDrillItem(item)}
                  sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                >
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                    {item.name || 'Unknown'}
                  </TableCell>
                  {statusOptions && (
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {item.status ? (
                        <Chip
                          label={item.status}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.65rem', textTransform: 'capitalize' }}
                        />
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  )}
                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                    {fmtInt(item.usage?.calls)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                    {fmtTokens(item.usage?.totalTokens)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontWeight: 700, fontSize: '0.8rem', color: 'success.main' }}
                  >
                    {fmtCost(item.usage?.cost)}
                  </TableCell>
                  {countColumns.map((c) => (
                    <TableCell key={c.key} align="right" sx={{ fontSize: '0.8rem' }}>
                      {fmtInt(c.get(item))}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {/* Drill-down drawer */}
      <Drawer
        anchor="right"
        open={Boolean(drillItem)}
        onClose={() => setDrillItem(null)}
        slotProps={{
          paper: { sx: { width: { xs: '100%', sm: 620, md: 800 }, maxWidth: '100vw' } },
        }}
      >
        {drillItem && (
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
            {/* Drawer header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
                {drillItem.name || 'Usage'}
              </Typography>
              {drillItem.link && (
                <Tooltip title="Open">
                  <IconButton
                    size="small"
                    onClick={() => navigate(drillItem.link)}
                    aria-label={`Open ${drillItem.name || 'item'}`}
                    sx={{ color: 'primary.main' }}
                  >
                    <AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              )}
              <IconButton size="small" onClick={() => setDrillItem(null)} aria-label="Close">
                <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>

            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              <LlmUsagePanel
                entity={entity}
                entityId={drillItem.id}
                from={from}
                to={to}
                demo={demoSnapshot ? demoSnapshot(drillItem) : undefined}
              />
            </Box>
          </Box>
        )}
      </Drawer>
    </Box>
  );
}
