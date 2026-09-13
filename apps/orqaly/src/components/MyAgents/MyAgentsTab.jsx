import { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  InputAdornment,
  Avatar,
  FormControl,
  Select,
  MenuItem,
  IconButton,
  Popover,
  Tooltip,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  Menu,
  ListItemIcon,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ClearIcon from '@mui/icons-material/Clear';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import HistoryIcon from '@mui/icons-material/History';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import ReplayIcon from '@mui/icons-material/Replay';

import EmptyState from '../Common/EmptyState';
import MetricsStrip from '../Common/MetricsStrip';
import LoadingSpinner from '../Common/LoadingSpinner';
import Pagination from '../Common/Pagination';
import AgentReuseDialog from './AgentReuseDialog';
import AgentCard from './AgentCard';

import { useMyAgents } from '../../hooks/useMyAgents';
import usePagination from '../../hooks/usePagination';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { cardGridColumns } from '../../utils/cardGridColumns';

import AppIcon from '../icons/AppIcon';

const SORT_OPTIONS = [
  { id: 'lastUsed', label: 'Last Used' },
  { id: 'name', label: 'Name' },
  { id: 'rating', label: 'Rating' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'spend', label: 'Spend' },
];

export default function MyAgentsTab({
  onAgentClick,
  showMetrics: showMetricsProp,
  embedded = false,
  openActivityLog,
}) {
  const theme = useTheme();
  const { simpleMode } = useSimpleMode();
  const { agents, teams: conciliumTeams, stats, loading, refetch } = useMyAgents();
  const [showMetricsLocal, setShowMetrics] = useShowMetrics('myagents');
  // When embedded, mirror the parent page's metrics toggle instead of tracking our own.
  const showMetrics = showMetricsProp === undefined ? showMetricsLocal : showMetricsProp;

  const statCards = useMemo(
    () => [
      {
        label: 'Agents Used',
        value: stats.totalAgents,
        helper: 'Distinct agents hired',
        color: theme.palette.primary.main,
        icon: PeopleOutlineIcon,
      },
      {
        label: 'Avg Rating',
        value: stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '—',
        helper: 'Across your jobs',
        color: theme.palette.warning.main,
        icon: StarOutlineIcon,
      },
      {
        label: 'Total Spend',
        value: `$${stats.totalSpend.toFixed(2)}`,
        helper: 'All-time spend',
        color: theme.palette.success.main,
        icon: PaidOutlinedIcon,
      },
      {
        label: 'Active Jobs',
        value: stats.activeJobs,
        helper: 'In progress',
        color: theme.palette.info.main,
        icon: WorkOutlineIcon,
      },
      {
        label: 'Pending Approval',
        value: stats.pendingApproval,
        helper: 'Awaiting review',
        color: theme.palette.secondary.main,
        icon: HourglassEmptyIcon,
      },
    ],
    [stats, theme]
  );

  const [subTab, setSubTab] = useState('agents');
  const [search, setSearch] = useState('');
  const [filterAnchor, setFilterAnchor] = useState(null);
  const [categoryAnchor, setCategoryAnchor] = useState(null);
  const [viewMode, setViewMode] = useState('cards');
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [orderBy, setOrderBy] = useState('lastUsed');
  const [orderDir, setOrderDir] = useState('desc');
  const [reuseAgent, setReuseAgent] = useState(null);

  const toggleDir = useCallback(() => {
    setOrderDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  }, []);

  // Map concilium teams to card-compatible shape
  const teamRows = useMemo(
    () =>
      conciliumTeams.map((t) => ({
        agentId: t.id,
        agentName: t.name,
        role: 'team',
        category: 'team',
        userRating: null,
        jobsTotal: 0,
        jobsCompleted: 0,
        totalSpend: 0,
        lastUsed: t.updated_at || t.created_at,
        approvalPending: 0,
      })),
    [conciliumTeams]
  );

  const sorted = useMemo(() => {
    const list = subTab === 'teams' ? [...teamRows] : [...agents];
    const filtered = search
      ? list.filter((a) => {
          const q = search.toLowerCase();
          return (
            (a.agentName || '').toLowerCase().includes(q) ||
            (a.role || '').toLowerCase().includes(q) ||
            (a.profile?.location || '').toLowerCase().includes(q)
          );
        })
      : list;
    filtered.sort((a, b) => {
      let av, bv;
      switch (orderBy) {
        case 'name':
          av = a.agentName || '';
          bv = b.agentName || '';
          break;
        case 'rating':
          av = a.userRating ?? 0;
          bv = b.userRating ?? 0;
          break;
        case 'jobs':
          av = a.jobsTotal;
          bv = b.jobsTotal;
          break;
        case 'spend':
          av = a.totalSpend;
          bv = b.totalSpend;
          break;
        case 'lastUsed':
        default:
          av = new Date(a.lastUsed || 0);
          bv = new Date(b.lastUsed || 0);
          break;
      }
      if (typeof av === 'string')
        return orderDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return orderDir === 'asc' ? av - bv : bv - av;
    });
    return filtered;
  }, [agents, teamRows, subTab, search, orderBy, orderDir]);

  // Single pagination hook that adjusts surfaceId as the sub-tab switches
  // so agents vs. teams retain independent rowsPerPage preferences.
  const pagination = usePagination(sorted, {
    surfaceId: subTab === 'teams' ? 'myAgents.teams' : 'myAgents.agents',
    defaultRowsPerPage: 10,
    resetOn: [subTab, search, orderBy, orderDir],
  });

  if (loading) return <LoadingSpinner />;

  return (
    <Box>
      <MetricsStrip
        pageKey="myagents"
        cards={statCards}
        showToggle={!embedded}
        showMetrics={embedded ? showMetrics : undefined}
        onToggle={embedded ? undefined : setShowMetrics}
      />
      <Box sx={{ px: { xs: 1.25, sm: 1.5 } }}>
        {/* Toolbar — Knowledge pattern: filter + view toggle + activity + spacer + category + chips */}
        <Box
          sx={{
            py: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            borderBottom: '1px solid',
            borderColor: 'divider',
            mb: 1.5,
          }}
        >
          <Tooltip title="Search & sort" placement="bottom" arrow>
            <IconButton
              onClick={(e) => setFilterAnchor(e.currentTarget)}
              sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: search ? 'primary.main' : 'divider',
                borderRadius: 2,
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  borderColor: 'primary.main',
                },
              }}
              aria-label="Search and sort"
            >
              <AppIcon
                name="TuneRounded"
                fallback={TuneRoundedIcon}
                sx={{ fontSize: 20, color: search ? 'primary.main' : 'text.secondary' }}
              />
            </IconButton>
          </Tooltip>

          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => v != null && setViewMode(v)}
            size="small"
            sx={{
              bgcolor: alpha(theme.palette.background.default, 0.8),
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
            <ToggleButton value="table" aria-label="Table view">
              <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 20 }} />
            </ToggleButton>
          </ToggleButtonGroup>

          {openActivityLog && (
            <Tooltip title="Activity Log" placement="bottom" arrow>
              <IconButton
                onClick={openActivityLog}
                sx={{
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.06),
                    borderColor: 'primary.main',
                  },
                }}
                aria-label="Activity Log"
              >
                <AppIcon
                  name="History"
                  fallback={HistoryIcon}
                  sx={{ fontSize: 20, color: 'text.secondary' }}
                />
              </IconButton>
            </Tooltip>
          )}

          {search && (
            <Chip
              label={`"${search.length > 12 ? search.slice(0, 12) + '…' : search}"`}
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
          <Chip
            label={`${sorted.length} ${subTab === 'teams' ? 'team' : 'agent'}${sorted.length !== 1 ? 's' : ''}`}
            size="small"
            sx={{ height: 24, fontSize: '0.7rem', fontWeight: 600 }}
          />

          <Box sx={{ flex: 1 }} />

          {/* Category button (icon) → sub-tab switcher: Individual Agents / Teams */}
          {(() => {
            const categories = [
              { id: 'agents', label: 'Individual Agents', icon: SmartToyOutlinedIcon },
              { id: 'teams', label: 'Teams', icon: GroupsOutlinedIcon },
            ];
            return (
              <>
                <Tooltip title="Category" placement="bottom" arrow>
                  <IconButton
                    onClick={(e) => setCategoryAnchor(e.currentTarget)}
                    sx={{
                      bgcolor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.06),
                        borderColor: 'primary.main',
                      },
                    }}
                    aria-label="Categories"
                  >
                    <AppIcon
                      name="CategoryOutlined"
                      fallback={CategoryOutlinedIcon}
                      sx={{ fontSize: 20, color: 'text.secondary' }}
                    />
                  </IconButton>
                </Tooltip>
                <Menu
                  anchorEl={categoryAnchor}
                  open={Boolean(categoryAnchor)}
                  onClose={() => setCategoryAnchor(null)}
                  slotProps={{ paper: { sx: { mt: 1, minWidth: 220, borderRadius: 2 } } }}
                >
                  {categories.map((c) => {
                    const Icon = c.icon;
                    const selected = c.id === subTab;
                    return (
                      <MenuItem
                        key={c.id}
                        selected={selected}
                        onClick={() => {
                          setSubTab(c.id);
                          setCategoryAnchor(null);
                        }}
                        sx={{
                          gap: 1,
                          '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.1) },
                          '&.Mui-selected:hover': {
                            bgcolor: alpha(theme.palette.primary.main, 0.14),
                          },
                        }}
                      >
                        <ListItemIcon
                          sx={{ minWidth: 28, color: selected ? 'primary.main' : 'text.secondary' }}
                        >
                          <AppIcon fallback={Icon} sx={{ fontSize: 18 }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={c.label}
                          primaryTypographyProps={{
                            fontWeight: selected ? 700 : 500,
                            color: selected ? 'primary.main' : 'text.primary',
                            fontSize: '0.85rem',
                          }}
                        />
                      </MenuItem>
                    );
                  })}
                </Menu>
              </>
            );
          })()}
        </Box>

        {/* Filter Popover */}
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
                Filter your agents
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
                placeholder="Search agents..."
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
                    displayEmpty
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
                  onClick={toggleDir}
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

        {/* Content */}
        {sorted.length === 0 ? (
          <EmptyState
            title={search ? 'No matching agents' : 'No agents yet'}
            description={
              search ? 'Try a different search' : 'Agents you work with will appear here'
            }
          />
        ) : viewMode === 'cards' ? (
          <>
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: cardGridColumns(simpleMode, {
                  xs: '1fr',
                  sm: '1fr 1fr',
                  lg: 'repeat(3, 1fr)',
                }),
              }}
            >
              {pagination.paginatedData.map((a) => (
                <AgentCard
                  key={a.agentId}
                  agent={a}
                  isTeam={subTab === 'teams'}
                  profile={a.profile}
                  onAskAgain={() => setReuseAgent(a)}
                  onClick={() => onAgentClick?.(a)}
                />
              ))}
            </Box>
            <Pagination
              count={pagination.totalCount}
              page={pagination.page}
              rowsPerPage={pagination.rowsPerPage}
              rowsPerPageOptions={pagination.rowsPerPageOptions}
              onPageChange={pagination.setPage}
              onRowsPerPageChange={pagination.setRowsPerPage}
              onLoadAll={pagination.loadAll}
              onCollapseAll={pagination.collapseAll}
              allMode={pagination.allMode}
              label={subTab === 'teams' ? 'teams' : 'agents'}
              dense
            />
          </>
        ) : (
          <>
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: alpha(theme.palette.text.primary, 0.03) }}>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Name
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Role
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Rating
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Jobs
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Spend
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Last Used
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagination.paginatedData.map((a) => {
                    const lastUsedLabel = a.lastUsed
                      ? new Date(a.lastUsed).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: '2-digit',
                        })
                      : '—';
                    return (
                      <TableRow
                        key={a.agentId}
                        hover
                        onClick={() => onAgentClick?.(a)}
                        sx={{
                          cursor: onAgentClick ? 'pointer' : 'default',
                          '&:last-child td': { borderBottom: 0 },
                        }}
                      >
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar
                              src={a.profile?.avatar_url}
                              sx={{
                                width: 28,
                                height: 28,
                                fontSize: '0.75rem',
                                bgcolor: alpha(theme.palette.primary.main, 0.15),
                                color: 'primary.main',
                              }}
                            >
                              {(a.agentName || '?').charAt(0)}
                            </Avatar>
                            <Typography sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                              {a.agentName || 'Unknown'}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                          {a.role || '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                          {a.userRating != null ? Number(a.userRating).toFixed(1) : '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                          {a.jobsCompleted ?? 0}/{a.jobsTotal ?? 0}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                          ${Number(a.totalSpend || 0).toFixed(2)}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                          {lastUsedLabel}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Ask Again">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReuseAgent(a);
                              }}
                              sx={{ color: 'primary.main' }}
                            >
                              <AppIcon name="Replay" fallback={ReplayIcon} sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <Pagination
              count={pagination.totalCount}
              page={pagination.page}
              rowsPerPage={pagination.rowsPerPage}
              rowsPerPageOptions={pagination.rowsPerPageOptions}
              onPageChange={pagination.setPage}
              onRowsPerPageChange={pagination.setRowsPerPage}
              onLoadAll={pagination.loadAll}
              onCollapseAll={pagination.collapseAll}
              allMode={pagination.allMode}
              label={subTab === 'teams' ? 'teams' : 'agents'}
              dense
            />
          </>
        )}
      </Box>
      <AgentReuseDialog
        open={!!reuseAgent}
        onClose={() => setReuseAgent(null)}
        agent={reuseAgent}
        isTeam={subTab === 'teams'}
        onSubmitted={() => refetch()}
      />
    </Box>
  );
}
