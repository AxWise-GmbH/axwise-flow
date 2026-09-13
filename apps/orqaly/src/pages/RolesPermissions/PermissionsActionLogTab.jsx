import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  alpha,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  Paper,
  InputAdornment,
  InputLabel,
  MenuItem,
  Popover,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import DevicesIcon from '@mui/icons-material/Devices';
import PublicIcon from '@mui/icons-material/Public';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import {
  AUDIT_LOG_MIGRATION_SQL,
  PERMISSIONS_ACTION_TYPES,
  isAuditLogTableMissingError,
  loadPermissionsActionLogs,
} from '../../services/auditLogBackend';
import {
  ACTION_LOG_TEMPLATES,
  getActionCategory,
  getActionTemplate,
  getCategoryLabel,
  severityColor,
} from './actionLogTemplates';

import AppIcon from '../../components/icons/AppIcon';

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatTimestamp(iso) {
  if (!iso) return 'Unknown';
  const value = new Date(iso);
  return value.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function prettifyAction(rawAction) {
  const text = String(rawAction || '').trim();
  if (!text) return 'Unknown action';
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function extractMeta(entry) {
  const s = entry.detailsStructured || {};
  const network = s.network || {};
  const fingerprint = s.fingerprint || {};
  const device = s.device || {};
  return {
    ip: network.ip || '-',
    country: network.country || '-',
    countryCode: network.countryCode || '',
    city: network.city || '',
    region: network.region || '',
    isp: network.isp || '-',
    service: network.service || '',
    org: network.org || '',
    fingerprintId: fingerprint.id || '-',
    os: device.os || '-',
    browser: device.browser || '',
    browserVersion: device.browserVersion || '',
    deviceType: device.deviceType || '-',
    screenResolution: device.screenResolution || '',
    timezone: device.timezone || '',
    language: device.language || '',
    userAgent: device.userAgent || '',
  };
}

const INITIAL_ROWS = 25;
const LOAD_MORE_ROWS = 50;

export default function PermissionsActionLogTab() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState('permissions');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('30d');
  const [actionFilter, setActionFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedCell, setCopiedCell] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_ROWS);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const tableContainerRef = useRef(null);
  const mobileContainerRef = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await loadPermissionsActionLogs({ limit: 500, permissionsOnly: false });
      setEntries(data);
    } catch (err) {
      if (isAuditLogTableMissingError(err)) {
        setError('TABLE_MISSING');
      } else {
        setError(err?.message || 'Failed to load action logs.');
      }
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    setVisibleCount(INITIAL_ROWS);
    setShowAll(false);
  }, [search, scopeFilter, categoryFilter, severityFilter, dateFilter, actionFilter, userFilter]);

  const filteredEntries = useMemo(() => {
    const now = Date.now();
    const isWithinDateRange = (timestamp) => {
      if (dateFilter === 'all') return true;
      const ts = new Date(timestamp || '').getTime();
      if (!Number.isFinite(ts)) return false;
      if (dateFilter === '24h') return now - ts <= 24 * 60 * 60 * 1000;
      if (dateFilter === '7d') return now - ts <= 7 * 24 * 60 * 60 * 1000;
      return now - ts <= 30 * 24 * 60 * 60 * 1000;
    };

    return entries.filter((entry) => {
      const template = getActionTemplate(entry.action);
      const category = getActionCategory(entry.action);

      if (scopeFilter === 'permissions' && !PERMISSIONS_ACTION_TYPES.includes(entry.action))
        return false;
      if (categoryFilter !== 'all' && category !== categoryFilter) return false;
      if (severityFilter !== 'all' && template.severity !== severityFilter) return false;
      if (!isWithinDateRange(entry.timestamp)) return false;
      if (actionFilter !== 'all' && entry.action !== actionFilter) return false;
      const performer = entry.actorDisplay ?? entry.user;
      if (userFilter !== 'all' && performer !== userFilter) return false;

      const q = search.trim().toLowerCase();
      if (!q) return true;
      const meta = extractMeta(entry);
      return [
        entry.action,
        template.label,
        category,
        entry.entity,
        entry.entityId,
        performer,
        entry.details,
        meta.ip,
        meta.country,
        meta.isp,
        meta.fingerprintId,
        meta.deviceType,
        meta.browser,
      ].some((v) =>
        String(v || '')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [
    entries,
    search,
    scopeFilter,
    categoryFilter,
    severityFilter,
    dateFilter,
    actionFilter,
    userFilter,
  ]);

  const visibleEntries = useMemo(
    () => (showAll ? filteredEntries : filteredEntries.slice(0, visibleCount)),
    [filteredEntries, visibleCount, showAll]
  );
  const hasMore = !showAll && visibleCount < filteredEntries.length;

  const handleLoadMore = useCallback(() => {
    setLoadingMore(true);
    requestAnimationFrame(() => {
      setVisibleCount((prev) => prev + LOAD_MORE_ROWS);
      setLoadingMore(false);
    });
  }, []);

  const handleViewAll = useCallback(() => {
    setLoadingMore(true);
    requestAnimationFrame(() => {
      setShowAll(true);
      setLoadingMore(false);
    });
  }, []);

  const handleScroll = useCallback(
    (e) => {
      const el = e.currentTarget;
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      const remaining = scrollHeight - scrollTop - clientHeight;
      if (remaining <= 200 && !showAll) {
        setVisibleCount((prev) => Math.min(prev + LOAD_MORE_ROWS, filteredEntries.length));
      }
    },
    [showAll, filteredEntries.length]
  );

  const actionOptions = useMemo(() => {
    const fromTemplates = Object.keys(ACTION_LOG_TEMPLATES);
    const fromData = Array.from(new Set(entries.map((entry) => entry.action)));
    return Array.from(new Set([...fromTemplates, ...fromData])).sort();
  }, [entries]);
  const userOptions = useMemo(
    () =>
      Array.from(new Set(entries.map((entry) => entry.actorDisplay ?? entry.user)))
        .filter(Boolean)
        .sort(),
    [entries]
  );
  const categoryOptions = useMemo(() => ['roles_permissions', 'users', 'security', 'other'], []);

  const clearFilters = () => {
    setSearch('');
    setScopeFilter('permissions');
    setCategoryFilter('all');
    setSeverityFilter('all');
    setDateFilter('30d');
    setActionFilter('all');
    setUserFilter('all');
  };

  const activeFiltersCount = [
    scopeFilter !== 'permissions',
    categoryFilter !== 'all',
    severityFilter !== 'all',
    dateFilter !== '30d',
    actionFilter !== 'all',
    userFilter !== 'all',
    !!search.trim(),
  ].filter(Boolean).length;

  const copyMigrationSql = async () => {
    try {
      await navigator.clipboard.writeText(AUDIT_LOG_MIGRATION_SQL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const handleCopyCell = (text, key) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedCell(key);
      setTimeout(() => setCopiedCell(''), 1500);
    } catch {
      // Clipboard not available
    }
  };

  const cellSx = {
    fontSize: '0.72rem',
    py: 0.75,
    px: 1,
    whiteSpace: 'nowrap',
    maxWidth: 140,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const headerSx = {
    fontWeight: 700,
    fontSize: '0.7rem',
    py: 1,
    px: 1,
    bgcolor: 'background.paper',
    borderBottom: '2px solid',
    borderColor: 'divider',
    position: 'sticky',
    top: 0,
    zIndex: 2,
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'text.secondary',
  };

  if (loading) {
    return (
      <Box sx={{ p: 2.5 }}>
        <Stack spacing={1}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={40} sx={{ borderRadius: 1.5 }} />
          ))}
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2.5 }}>
      {/* Toolbar: result count, filter icon, refresh */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Chip
          size="small"
          color="primary"
          variant="outlined"
          label={
            hasMore
              ? `${visibleEntries.length} / ${filteredEntries.length} result(s)`
              : `${filteredEntries.length} result(s)`
          }
        />
        {activeFiltersCount > 0 && (
          <Chip
            size="small"
            color="secondary"
            variant="outlined"
            label={`${activeFiltersCount} active`}
          />
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Filters">
          <IconButton
            onClick={(e) => setFilterAnchorEl(e.currentTarget)}
            size="small"
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
            aria-label="Filters"
          >
            <AppIcon
              name="FilterList"
              fallback={FilterListIcon}
              sx={{ fontSize: 20, color: 'text.secondary' }}
            />
          </IconButton>
        </Tooltip>
        <Button
          size="small"
          startIcon={<AppIcon name="Refresh" fallback={RefreshIcon} />}
          onClick={reload}
          variant="outlined"
          sx={{ textTransform: 'none' }}
        >
          Refresh
        </Button>
      </Stack>
      <Popover
        open={Boolean(filterAnchorEl)}
        anchorEl={filterAnchorEl}
        onClose={() => setFilterAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1.5,
              p: 0,
              borderRadius: 3,
              minWidth: 320,
              maxWidth: 400,
              boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            },
          },
        }}
      >
        <Box
          sx={{
            px: 2.5,
            py: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.primary.main, 0.04),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(theme.palette.primary.main, 0.12),
                color: 'primary.main',
              }}
            >
              <AppIcon name="FilterList" fallback={FilterListIcon} sx={{ fontSize: 22 }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                Filters
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                Search and filter action log
              </Typography>
            </Box>
          </Box>
        </Box>
        <Box
          sx={{
            p: 2.5,
            maxHeight: 420,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          <TextField
            size="small"
            placeholder="Search by action, user, IP, country..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AppIcon
                    name="Search"
                    fallback={SearchIcon}
                    sx={{ fontSize: 18, color: 'text.secondary' }}
                  />
                </InputAdornment>
              ),
            }}
            sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Scope</InputLabel>
            <Select
              value={scopeFilter}
              label="Scope"
              onChange={(e) => setScopeFilter(e.target.value)}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="permissions">Permissions only</MenuItem>
              <MenuItem value="all">All account activity</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Date range</InputLabel>
            <Select
              value={dateFilter}
              label="Date range"
              onChange={(e) => setDateFilter(e.target.value)}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="24h">Last 24 hours</MenuItem>
              <MenuItem value="7d">Last 7 days</MenuItem>
              <MenuItem value="30d">Last 30 days</MenuItem>
              <MenuItem value="all">All time</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Category</InputLabel>
            <Select
              value={categoryFilter}
              label="Category"
              onChange={(e) => setCategoryFilter(e.target.value)}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="all">All categories</MenuItem>
              {categoryOptions.map((category) => (
                <MenuItem key={category} value={category}>
                  {getCategoryLabel(category)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Severity</InputLabel>
            <Select
              value={severityFilter}
              label="Severity"
              onChange={(e) => setSeverityFilter(e.target.value)}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="all">All severities</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="info">Info</MenuItem>
              <MenuItem value="low">Low</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Action type</InputLabel>
            <Select
              value={actionFilter}
              label="Action type"
              onChange={(e) => setActionFilter(e.target.value)}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="all">All actions</MenuItem>
              {actionOptions.map((action) => (
                <MenuItem key={action} value={action}>
                  {getActionTemplate(action).label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Performed by</InputLabel>
            <Select
              value={userFilter}
              label="Performed by"
              onChange={(e) => setUserFilter(e.target.value)}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="all">All users</MenuItem>
              {userOptions.map((user) => (
                <MenuItem key={user} value={user}>
                  {user}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            fullWidth
            variant="outlined"
            size="small"
            onClick={() => {
              clearFilters();
              setFilterAnchorEl(null);
            }}
            sx={{ textTransform: 'none', fontWeight: 600, mt: 0.5 }}
          >
            Reset filters
          </Button>
        </Box>
      </Popover>
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error === 'TABLE_MISSING' ? (
            <Stack spacing={1}>
              <Typography variant="body2">Audit table not found in database.</Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="contained" onClick={copyMigrationSql}>
                  {copied ? 'Copied SQL' : 'Copy SQL migration'}
                </Button>
                <Button size="small" variant="outlined" onClick={reload}>
                  Retry
                </Button>
              </Stack>
            </Stack>
          ) : (
            error
          )}
        </Alert>
      )}
      {/* ---- MOBILE VIEW ---- */}
      {isMobile ? (
        <Box
          ref={mobileContainerRef}
          onScroll={handleScroll}
          sx={{
            maxHeight: 600,
            overflow: 'auto',
            borderRadius: 2,
          }}
        >
          <Stack spacing={1.25}>
            {visibleEntries.map((entry) => {
              const template = getActionTemplate(entry.action);
              const actionLabel =
                template.label === entry.action ? prettifyAction(entry.action) : template.label;
              const category = getActionCategory(entry.action);
              const meta = extractMeta(entry);
              return (
                <Paper
                  key={entry.id}
                  elevation={0}
                  sx={{
                    p: 1.25,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Stack spacing={0.75}>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      <Chip
                        label={actionLabel}
                        size="small"
                        color={severityColor(template.severity)}
                        variant="outlined"
                      />
                      <Chip label={getCategoryLabel(category)} size="small" variant="outlined" />
                    </Stack>
                    <Divider />
                    <Typography variant="caption">
                      <strong>Entity:</strong> {entry.entity} · {entry.entityId}
                    </Typography>
                    <Typography variant="caption">
                      <strong>Performed by:</strong>{' '}
                      {entry.actorType === 'agent' ? 'AI Agent: ' : ''}
                      {entry.actorDisplay ?? entry.user}
                    </Typography>
                    <Typography variant="caption">
                      <strong>IP:</strong> {meta.ip}
                    </Typography>
                    <Typography variant="caption">
                      <strong>Country:</strong> {meta.country}
                    </Typography>
                    <Typography variant="caption">
                      <strong>ISP:</strong> {meta.isp}
                    </Typography>
                    <Typography variant="caption">
                      <strong>Device:</strong> {meta.deviceType} · {meta.browser}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(entry.timestamp)} at {formatTime(entry.timestamp)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {entry.details || '-'}
                    </Typography>
                    <Button
                      fullWidth
                      size="small"
                      variant="outlined"
                      startIcon={<AppIcon name="Visibility" fallback={VisibilityIcon} />}
                      onClick={() => setSelected(entry)}
                      sx={{ textTransform: 'none', mt: 0.5 }}
                    >
                      View action
                    </Button>
                  </Stack>
                </Paper>
              );
            })}
            {!filteredEntries.length && (
              <Paper
                elevation={0}
                sx={{
                  py: 4,
                  px: 2,
                  textAlign: 'center',
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                {entries.length === 0 ? (
                  <Stack spacing={1} alignItems="center">
                    <Typography variant="body2" fontWeight={600} color="text.secondary">
                      No action logs yet
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 360 }}>
                      {scopeFilter === 'permissions'
                        ? 'Create or edit a role, assign a role to a user, invite a user, or change user status to generate permission actions here. You can also switch Scope to "All account activity" to see other audit entries.'
                        : 'Activity from across the app will appear here. Use the Roles and Users tabs to perform actions that are logged (e.g. create role, assign role, invite user).'}
                    </Typography>
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No action logs match the current filters. Try changing Scope, date range, or
                    other filters.
                  </Typography>
                )}
              </Paper>
            )}
            {hasMore && (
              <Stack spacing={1} alignItems="center" sx={{ py: 1.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Showing {visibleEntries.length} of {filteredEntries.length}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    startIcon={
                      loadingMore ? (
                        <CircularProgress size={14} />
                      ) : (
                        <AppIcon name="UnfoldMore" fallback={UnfoldMoreIcon} />
                      )
                    }
                    sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                  >
                    Load more
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleViewAll}
                    disabled={loadingMore}
                    sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                  >
                    View all ({filteredEntries.length})
                  </Button>
                </Stack>
              </Stack>
            )}
          </Stack>
        </Box>
      ) : (
        /* ---- DESKTOP TABLE ---- */
        <>
          <TableContainer
            ref={tableContainerRef}
            onScroll={handleScroll}
            sx={{
              maxHeight: 600,
              overflow: 'auto',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Table size="small" stickyHeader sx={{ tableLayout: 'auto' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={headerSx}>Action</TableCell>
                  <TableCell sx={headerSx}>Entity</TableCell>
                  <TableCell sx={headerSx}>User</TableCell>
                  <TableCell sx={headerSx}>IP Address</TableCell>
                  <TableCell sx={headerSx}>Country</TableCell>
                  <TableCell sx={headerSx}>Service / ISP</TableCell>
                  <TableCell sx={headerSx}>Fingerprint</TableCell>
                  <TableCell sx={headerSx}>Device</TableCell>
                  <TableCell sx={headerSx}>Date</TableCell>
                  <TableCell sx={headerSx}>Time</TableCell>
                  <TableCell sx={headerSx}>Details</TableCell>
                  <TableCell sx={{ ...headerSx, textAlign: 'right' }}>View Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleEntries.map((entry) => {
                  const template = getActionTemplate(entry.action);
                  const actionLabel =
                    template.label === entry.action ? prettifyAction(entry.action) : template.label;
                  const meta = extractMeta(entry);
                  return (
                    <TableRow key={entry.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      {/* Action */}
                      <TableCell sx={cellSx}>
                        <Chip
                          label={actionLabel}
                          size="small"
                          color={severityColor(template.severity)}
                          variant="outlined"
                          sx={{ fontWeight: 600, fontSize: '0.68rem', maxWidth: 150 }}
                        />
                      </TableCell>
                      {/* Entity */}
                      <TableCell sx={cellSx}>
                        <Tooltip title={`${entry.entity} · ${entry.entityId}`} arrow>
                          <Typography
                            variant="caption"
                            noWrap
                            sx={{ maxWidth: 120, display: 'block' }}
                          >
                            {entry.entity}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      {/* User / Agent */}
                      <TableCell sx={cellSx}>
                        <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                          {entry.actorType === 'agent' && (
                            <Chip
                              icon={
                                <AppIcon
                                  name="SmartToyOutlined"
                                  fallback={SmartToyOutlinedIcon}
                                  sx={{ fontSize: 14 }}
                                />
                              }
                              label="AI Agent"
                              size="small"
                              color="secondary"
                              variant="outlined"
                              sx={{ fontWeight: 600, fontSize: '0.65rem', height: 20 }}
                            />
                          )}
                          <Tooltip title={entry.actorDisplay ?? entry.user} arrow>
                            <Typography
                              variant="caption"
                              noWrap
                              sx={{ maxWidth: 140, display: 'block', fontWeight: 600 }}
                            >
                              {entry.actorDisplay ?? entry.user}
                            </Typography>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                      {/* IP Address */}
                      <TableCell sx={cellSx}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography
                            variant="caption"
                            sx={{ fontFamily: 'monospace', fontSize: '0.68rem' }}
                          >
                            {meta.ip}
                          </Typography>
                          {meta.ip !== '-' && (
                            <Tooltip
                              title={copiedCell === `ip-${entry.id}` ? 'Copied!' : 'Copy IP'}
                            >
                              <IconButton
                                size="small"
                                onClick={() => handleCopyCell(meta.ip, `ip-${entry.id}`)}
                                sx={{ p: 0.25 }}
                              >
                                {copiedCell === `ip-${entry.id}` ? (
                                  <AppIcon
                                    name="Check"
                                    fallback={CheckIcon}
                                    sx={{ fontSize: 13, color: 'success.main' }}
                                  />
                                ) : (
                                  <AppIcon
                                    name="ContentCopy"
                                    fallback={ContentCopyIcon}
                                    sx={{ fontSize: 13, color: 'text.disabled' }}
                                  />
                                )}
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                      {/* Country */}
                      <TableCell sx={cellSx}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          {meta.country !== '-' && (
                            <AppIcon
                              name="Public"
                              fallback={PublicIcon}
                              sx={{ fontSize: 14, color: 'text.disabled' }}
                            />
                          )}
                          <Tooltip
                            title={
                              meta.city && meta.region
                                ? `${meta.city}, ${meta.region}`
                                : meta.country
                            }
                            arrow
                          >
                            <Typography variant="caption" noWrap>
                              {meta.countryCode && meta.country !== '-'
                                ? `${meta.countryCode}`
                                : meta.country}
                            </Typography>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                      {/* Service / ISP */}
                      <TableCell sx={cellSx}>
                        <Tooltip title={meta.org || meta.isp} arrow>
                          <Typography
                            variant="caption"
                            noWrap
                            sx={{ maxWidth: 120, display: 'block' }}
                          >
                            {meta.isp}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      {/* Fingerprint */}
                      <TableCell sx={cellSx}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          {meta.fingerprintId !== '-' && (
                            <AppIcon
                              name="Fingerprint"
                              fallback={FingerprintIcon}
                              sx={{ fontSize: 14, color: 'text.disabled' }}
                            />
                          )}
                          <Tooltip title={meta.fingerprintId} arrow>
                            <Typography
                              variant="caption"
                              noWrap
                              sx={{
                                maxWidth: 80,
                                display: 'block',
                                fontFamily: 'monospace',
                                fontSize: '0.66rem',
                              }}
                            >
                              {meta.fingerprintId}
                            </Typography>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                      {/* Device */}
                      <TableCell sx={cellSx}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          {meta.deviceType !== '-' && (
                            <AppIcon
                              name="Devices"
                              fallback={DevicesIcon}
                              sx={{ fontSize: 14, color: 'text.disabled' }}
                            />
                          )}
                          <Tooltip
                            title={`${meta.os} · ${meta.browser} ${meta.browserVersion}`}
                            arrow
                          >
                            <Typography
                              variant="caption"
                              noWrap
                              sx={{ maxWidth: 100, display: 'block' }}
                            >
                              {meta.deviceType}
                              {meta.browser ? ` · ${meta.browser}` : ''}
                            </Typography>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                      {/* Date */}
                      <TableCell sx={cellSx}>
                        <Typography variant="caption">{formatDate(entry.timestamp)}</Typography>
                      </TableCell>
                      {/* Time */}
                      <TableCell sx={cellSx}>
                        <Typography
                          variant="caption"
                          sx={{ fontFamily: 'monospace', fontSize: '0.68rem' }}
                        >
                          {formatTime(entry.timestamp)}
                        </Typography>
                      </TableCell>
                      {/* Details */}
                      <TableCell sx={{ ...cellSx, maxWidth: 160 }}>
                        <Tooltip title={entry.details || '-'} arrow>
                          <Typography
                            variant="caption"
                            noWrap
                            color="text.secondary"
                            sx={{ maxWidth: 160, display: 'block' }}
                          >
                            {entry.details || '-'}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      {/* View Action */}
                      <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                        <Tooltip title="View full details">
                          <IconButton
                            size="small"
                            onClick={() => setSelected(entry)}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1.5,
                              p: 0.5,
                              '&:hover': {
                                bgcolor: alpha(theme.palette.primary.main, 0.08),
                                borderColor: theme.palette.primary.main,
                              },
                            }}
                          >
                            <AppIcon
                              name="Visibility"
                              fallback={VisibilityIcon}
                              sx={{ fontSize: 16 }}
                            />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!filteredEntries.length && (
                  <TableRow>
                    <TableCell colSpan={12} align="center" sx={{ py: 4 }}>
                      {entries.length === 0 ? (
                        <Stack spacing={1} alignItems="center" sx={{ maxWidth: 400, mx: 'auto' }}>
                          <Typography variant="body2" fontWeight={600} color="text.secondary">
                            No action logs yet
                          </Typography>
                          <Typography variant="caption" color="text.secondary" textAlign="center">
                            {scopeFilter === 'permissions'
                              ? 'Create or edit a role, assign a role to a user, or invite a user to see permission actions here. Switch Scope to "All account activity" to see other audit entries.'
                              : 'Perform actions in the Roles and Users tabs (e.g. create role, assign role, invite user) to see entries here.'}
                          </Typography>
                        </Stack>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No action logs match the current filters. Try changing Scope, date range,
                          or other filters.
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {/* Load more / View all footer */}
          {hasMore && (
            <Paper
              elevation={0}
              sx={{
                mt: 1.5,
                p: 1.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: alpha(theme.palette.background.paper, 0.6),
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="center" spacing={2}>
                <Typography variant="caption" color="text.secondary">
                  Showing {visibleEntries.length} of {filteredEntries.length} entries
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  startIcon={
                    loadingMore ? (
                      <CircularProgress size={14} />
                    ) : (
                      <AppIcon name="UnfoldMore" fallback={UnfoldMoreIcon} />
                    )
                  }
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 2,
                    fontSize: '0.75rem',
                  }}
                >
                  Load more
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleViewAll}
                  disabled={loadingMore}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 2,
                    fontSize: '0.75rem',
                  }}
                >
                  View all ({filteredEntries.length})
                </Button>
              </Stack>
            </Paper>
          )}
        </>
      )}
      {/* ---- Detail Dialog ---- */}
      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Action Details</DialogTitle>
        <DialogContent dividers>
          {selected &&
            (() => {
              const template = getActionTemplate(selected.action);
              const meta = extractMeta(selected);
              const actionLabel =
                template.label === selected.action
                  ? prettifyAction(selected.action)
                  : template.label;
              return (
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      label={actionLabel}
                      size="small"
                      color={severityColor(template.severity)}
                      variant="outlined"
                      sx={{ fontWeight: 700 }}
                    />
                    <Chip
                      label={getCategoryLabel(getActionCategory(selected.action))}
                      size="small"
                      variant="outlined"
                    />
                  </Stack>

                  <Divider />

                  <Box
                    sx={{
                      display: 'grid',
                      gap: 1.5,
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    }}
                  >
                    <Box>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: 'text.secondary',
                          textTransform: 'uppercase',
                          fontSize: '0.62rem',
                          letterSpacing: 0.8,
                          display: 'block',
                          mb: 0.25,
                        }}
                      >
                        Entity
                      </Typography>
                      <Typography variant="body2">
                        {selected.entity} · {selected.entityId}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: 'text.secondary',
                          textTransform: 'uppercase',
                          fontSize: '0.62rem',
                          letterSpacing: 0.8,
                          display: 'block',
                          mb: 0.25,
                        }}
                      >
                        Performed by
                      </Typography>
                      <Typography variant="body2">{selected.user}</Typography>
                    </Box>
                    <Box>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: 'text.secondary',
                          textTransform: 'uppercase',
                          fontSize: '0.62rem',
                          letterSpacing: 0.8,
                          display: 'block',
                          mb: 0.25,
                        }}
                      >
                        Date & Time
                      </Typography>
                      <Typography variant="body2">{formatTimestamp(selected.timestamp)}</Typography>
                    </Box>
                    <Box>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: 'text.secondary',
                          textTransform: 'uppercase',
                          fontSize: '0.62rem',
                          letterSpacing: 0.8,
                          display: 'block',
                          mb: 0.25,
                        }}
                      >
                        Raw Action Type
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
                      >
                        {selected.action}
                      </Typography>
                    </Box>
                  </Box>

                  <Divider />

                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                      color: 'text.secondary',
                      fontSize: '0.62rem',
                    }}
                  >
                    Network & Device
                  </Typography>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor:
                        theme.palette.mode === 'dark'
                          ? alpha(theme.palette.primary.main, 0.04)
                          : alpha(theme.palette.primary.main, 0.02),
                    }}
                  >
                    <Box
                      sx={{
                        display: 'grid',
                        gap: 1.25,
                        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                      }}
                    >
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.62rem' }}
                        >
                          IP Address
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
                        >
                          {meta.ip}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.62rem' }}
                        >
                          Country
                        </Typography>
                        <Typography variant="body2">
                          {meta.country}
                          {meta.city ? `, ${meta.city}` : ''}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.62rem' }}
                        >
                          Service / ISP
                        </Typography>
                        <Typography variant="body2">
                          {meta.isp}
                          {meta.org && meta.org !== meta.isp ? ` (${meta.org})` : ''}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.62rem' }}
                        >
                          Fingerprint
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
                        >
                          {meta.fingerprintId}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.62rem' }}
                        >
                          Device
                        </Typography>
                        <Typography variant="body2">
                          {meta.deviceType} · {meta.os}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.62rem' }}
                        >
                          Browser
                        </Typography>
                        <Typography variant="body2">
                          {meta.browser} {meta.browserVersion}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.62rem' }}
                        >
                          Resolution
                        </Typography>
                        <Typography variant="body2">{meta.screenResolution || '-'}</Typography>
                      </Box>
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.62rem' }}
                        >
                          Timezone
                        </Typography>
                        <Typography variant="body2">{meta.timezone || '-'}</Typography>
                      </Box>
                    </Box>
                  </Paper>

                  <Divider />

                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        fontSize: '0.62rem',
                        letterSpacing: 0.8,
                        display: 'block',
                        mb: 0.5,
                      }}
                    >
                      Details
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {selected.details || 'No details'}
                    </Typography>
                  </Box>

                  {selected.detailsStructured && (
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'action.hover',
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        fontSize: '0.72rem',
                        whiteSpace: 'pre-wrap',
                        maxHeight: 250,
                        overflow: 'auto',
                      }}
                    >
                      {JSON.stringify(selected.detailsStructured, null, 2)}
                    </Box>
                  )}
                </Stack>
              );
            })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={() => setSelected(null)} sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
