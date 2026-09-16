import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  InputAdornment,
  alpha,
  useTheme,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  CircularProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Tabs,
  Tab,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import HistoryIcon from '@mui/icons-material/History';
import FilterListIcon from '@mui/icons-material/FilterList';
import TimelineIcon from '@mui/icons-material/Timeline';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import BentoCard from '../../components/Common/BentoCard';
import PageLayout from '../../components/Common/PageLayout';
import {
  loadAuditLogs,
  isAuditLogTableMissingError,
  AUDIT_LOG_MIGRATION_SQL,
} from '../../services/auditLogBackend';
import { getOrgActivity } from '../../services/organizationService';

import AppIcon from '../../components/icons/AppIcon';
import EventTable from '../../components/observability/EventTable';
import EventDetail from '../../components/observability/EventDetail';
import { OBSERVABILITY_LOADERS } from '../../services/observabilityService';
import { useAxwise } from '../../hooks/useAxwise';

function formatTimestamp(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortText(value, max = 80) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function getRowSeverity(row) {
  const level = row?.detailsStructured?.importance;
  if (level) return level;
  const action = String(row?.action || '').toLowerCase();
  if (action.includes('delete') || action.includes('cleared')) return 'high';
  if (action.includes('password') || action.includes('security')) return 'high';
  if (action.includes('created') || action.includes('updated')) return 'medium';
  return 'low';
}

// Observability console: source tabs beyond the base audit_log. Each renders a
// generic EventTable from its own table (loaded via observabilityService, RLS-scoped).
const OBS_TABS = [
  { key: 'axwise', label: 'AxWise' },
  { key: 'llm', label: 'LLM' },
  { key: 'goals', label: 'Goals' },
  { key: 'consilium', label: 'Consilium' },
];
const money = (v, d = 2) => (v != null ? `$${Number(v).toFixed(d)}` : '—');
const OBS_COLUMNS = {
  axwise: [
    { key: 'created_at', label: 'Time', render: (r) => formatTimestamp(r.created_at) },
    { key: 'integration_point', label: 'Point' },
    { key: 'ax_decision', label: 'Decision', render: (r) => r.ax_decision || '—' },
    { key: 'applied_outcome', label: 'Applied' },
    { key: 'duration_ms', label: 'ms', render: (r) => r.duration_ms ?? '—' },
    { key: 'cost_usd', label: 'Cost', render: (r) => money(r.cost_usd) },
  ],
  llm: [
    { key: 'created_at', label: 'Time', render: (r) => formatTimestamp(r.created_at) },
    {
      key: 'model',
      label: 'Provider · Model',
      render: (r) => `${r.provider || '?'} · ${r.model || '?'}`,
    },
    { key: 'operation', label: 'Operation', render: (r) => r.operation || r.source || '—' },
    { key: 'total_tokens', label: 'Tokens', render: (r) => r.total_tokens ?? '—' },
    { key: 'estimated_cost_usd', label: 'Cost', render: (r) => money(r.estimated_cost_usd, 4) },
    { key: 'status', label: 'Status' },
    { key: 'source', label: 'Source' },
  ],
  goals: [
    { key: 'created_at', label: 'Time', render: (r) => formatTimestamp(r.created_at) },
    { key: 'goal', label: 'Goal', render: (r) => r.goals?.title || r.goal_id || '—' },
    { key: 'event_type', label: 'Event' },
    { key: 'cost_usd', label: 'Cost', render: (r) => money(r.cost_usd) },
  ],
  consilium: [
    { key: 'created_at', label: 'Time', render: (r) => formatTimestamp(r.created_at) },
    { key: 'concilium_id', label: 'Board' },
    {
      key: 'approved',
      label: 'Approved',
      render: (r) => (r.approved == null ? '—' : r.approved ? 'yes' : 'no'),
    },
    { key: 'consensus_type', label: 'Consensus' },
    { key: 'overall_score', label: 'Score', render: (r) => r.overall_score ?? '—' },
    { key: 'decision_level', label: 'Level' },
  ],
};

function getNetwork(row) {
  return row?.detailsStructured?.network || {};
}

function getDevice(row) {
  return row?.detailsStructured?.device || {};
}

function getFingerprintId(row) {
  return row?.detailsStructured?.fingerprint?.id || '-';
}

function getCountry(row) {
  return getNetwork(row).country || 'Unknown';
}

function getIp(row) {
  return getNetwork(row).ip || '-';
}

function getService(row) {
  const network = getNetwork(row);
  return network.isp || network.org || network.service || '-';
}

function getDeviceSummary(row) {
  const device = getDevice(row);
  const browser = [device.browser, device.browserVersion].filter(Boolean).join(' ');
  const os = device.os || '';
  if (!browser && !os) return 'Unknown';
  if (!browser) return os;
  if (!os) return browser;
  return `${browser} · ${os}`;
}

function formatDatePart(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function formatTimePart(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function codeBlockSx(theme, isDark, tintColor) {
  return {
    p: 1.5,
    borderRadius: 2,
    border: '1px solid',
    borderColor: alpha(tintColor || theme.palette.primary.main, 0.35),
    bgcolor: isDark
      ? alpha(tintColor || theme.palette.primary.main, 0.12)
      : alpha(tintColor || theme.palette.primary.main, 0.05),
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    fontSize: '0.75rem',
    whiteSpace: 'pre-wrap',
    lineHeight: 1.5,
    overflowX: 'auto',
  };
}

function buildFallbackCodeSnapshot(row) {
  const action = String(row?.action || '');
  const entity = String(row?.entity || '');
  const entityId = String(row?.entityId || '');
  const details = String(row?.details || '').trim();
  if (!details) return '';
  return [
    `// Legacy audit snapshot (structured code not available for this old event)`,
    `// Action: ${action}`,
    `// Entity: ${entity} (${entityId})`,
    '',
    details.includes(', ')
      ? `const changedFields = ${JSON.stringify(details.split(', ').filter(Boolean), null, 2)};`
      : `const summary = ${JSON.stringify(details)};`,
  ].join('\n');
}

export default function AuditLog() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [searchParams] = useSearchParams();
  const orgFilter = searchParams.get('org_id') || '';
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [orgScopeIds, setOrgScopeIds] = useState(null);

  // Observability source tabs (0 = base Audit, 1+ = obsTabs). The AxWise tab is
  // dropped when the integration is disabled; the rest stay and keep working.
  const { isAxwiseEnabled } = useAxwise();
  const obsTabs = useMemo(
    () => OBS_TABS.filter((t) => t.key !== 'axwise' || isAxwiseEnabled),
    [isAxwiseEnabled]
  );
  const [tab, setTab] = useState(0);
  const obsKey = tab > 0 ? obsTabs[tab - 1]?.key || null : null;
  const [obsRows, setObsRows] = useState([]);
  const [obsLoading, setObsLoading] = useState(false);
  const [obsSelected, setObsSelected] = useState(null);

  useEffect(() => {
    if (!obsKey) return undefined;
    let cancelled = false;
    setObsLoading(true);
    setObsSelected(null);
    OBSERVABILITY_LOADERS[obsKey]()
      .then((rows) => {
        if (!cancelled) setObsRows(rows);
      })
      .finally(() => {
        if (!cancelled) setObsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [obsKey]);

  useEffect(() => {
    if (!orgFilter) {
      setOrgScopeIds(null);
      return;
    }
    let cancelled = false;
    getOrgActivity(orgFilter, 100)
      .then((data) => {
        if (cancelled) return;
        setOrgScopeIds(new Set(data?.scope_ids || [orgFilter]));
      })
      .catch(() => {
        if (!cancelled) setOrgScopeIds(new Set([orgFilter]));
      });
    return () => {
      cancelled = true;
    };
  }, [orgFilter]);

  const handleCopyMigrationSql = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(AUDIT_LOG_MIGRATION_SQL);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch (_) {
      setCopySuccess(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await loadAuditLogs({ limit: 500 });
      setEntries(data);
    } catch (err) {
      if (isAuditLogTableMissingError(err)) {
        setLoadError('TABLE_MISSING');
      } else {
        setLoadError(err?.message || 'Failed to load activity log');
      }
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filtered = entries.filter((row) => {
    if (
      orgScopeIds &&
      !orgScopeIds.has(row.entityId) &&
      !(row.entity === 'Organization' && orgScopeIds.has(orgFilter))
    ) {
      return false;
    }
    const performer = row.actorDisplay ?? row.user;
    const q = search.trim().toLowerCase();
    if (q) {
      const match = [
        row.action,
        row.entity,
        row.entityId,
        performer,
        row.user,
        row.details,
        getIp(row),
        getCountry(row),
        getService(row),
        getFingerprintId(row),
        getDeviceSummary(row),
      ].some((s) => String(s).toLowerCase().includes(q));
      if (!match) return false;
    }
    if (entityFilter !== 'all' && row.entity !== entityFilter) return false;
    if (userFilter !== 'all' && performer !== userFilter) return false;
    if (actorFilter === 'agents' && row.actorType !== 'agent') return false;
    if (actorFilter === 'users' && row.actorType === 'agent') return false;
    if (countryFilter !== 'all' && getCountry(row) !== countryFilter) return false;
    return true;
  });

  const entityCounts = entries.reduce((acc, row) => {
    acc[row.entity] = (acc[row.entity] || 0) + 1;
    return acc;
  }, {});
  const countryCounts = entries.reduce((acc, row) => {
    const country = getCountry(row);
    acc[country] = (acc[country] || 0) + 1;
    return acc;
  }, {});

  const importantMoments = useMemo(() => {
    const out = {
      high: 0,
      medium: 0,
      low: 0,
      destructive: 0,
      withCode: 0,
      withIp: 0,
      withFingerprint: 0,
    };
    for (const row of entries) {
      const severity = getRowSeverity(row);
      out[severity] += 1;
      const action = String(row.action || '').toLowerCase();
      if (action.includes('delete') || action.includes('clear')) out.destructive += 1;
      if (row.detailsStructured?.codeAfter || row.detailsStructured?.codeBefore) out.withCode += 1;
      if (getIp(row) !== '-') out.withIp += 1;
      if (getFingerprintId(row) !== '-') out.withFingerprint += 1;
    }
    return out;
  }, [entries]);

  return (
    <PageLayout
      title="Activity Log"
      subtitle="Track who changed what, when, and from where (IP, country, device fingerprint)"
      sx={{ maxWidth: '100%', width: '100%' }}
      showTitleBlock={false}
    >
      <Tabs
        value={tab}
        onChange={(e, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2, minHeight: 40 }}
      >
        <Tab label="Audit" sx={{ minHeight: 40, textTransform: 'none' }} />
        {obsTabs.map((t) => (
          <Tab key={t.key} label={t.label} sx={{ minHeight: 40, textTransform: 'none' }} />
        ))}
      </Tabs>

      {obsKey && (
        <BentoCard
          title={`${obsTabs[tab - 1].label} activity`}
          subtitle="Click a row for full detail"
          icon={HistoryIcon}
          iconColor={theme.palette.primary.main}
        >
          <EventTable
            columns={OBS_COLUMNS[obsKey]}
            rows={obsRows}
            loading={obsLoading}
            onRowClick={setObsSelected}
            emptyText={
              obsKey === 'llm' ? 'No LLM calls yet.' : `No ${obsTabs[tab - 1].label} activity yet.`
            }
          />
          <EventDetail source={obsKey} row={obsSelected} onClose={() => setObsSelected(null)} />
        </BentoCard>
      )}

      {tab === 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gridTemplateRows: 'auto auto auto',
            gridTemplateAreas: `
            "log"
            "filters"
            "summary"
          `,
            gap: 2,
            alignItems: 'stretch',
            width: '100%',
          }}
        >
          {/* Main activity log - large bento */}
          <BentoCard
            title="Activity log"
            subtitle="Search and filter entries"
            icon={HistoryIcon}
            iconColor={theme.palette.primary.main}
            gridArea="log"
            minHeight={380}
            noPadding
          >
            <Stack spacing={0} sx={{ flex: 1, minHeight: 0 }}>
              <Box
                sx={{
                  p: 1.5,
                  display: { xs: 'none', sm: 'flex' },
                  alignItems: 'center',
                  gap: 2,
                  flexWrap: 'wrap',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <TextField
                  size="small"
                  placeholder="Search logs..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AppIcon
                          name="Search"
                          fallback={SearchIcon}
                          sx={{ color: 'text.secondary', fontSize: 20 }}
                        />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ width: 260 }}
                />
                {orgFilter && (
                  <Chip
                    label="Organization filter"
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ fontWeight: 700, fontSize: '0.68rem' }}
                  />
                )}
                <Divider orientation="vertical" flexItem sx={{ height: 24, alignSelf: 'center' }} />
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', flex: 1 }}>
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Entity</InputLabel>
                    <Select
                      value={entityFilter}
                      label="Entity"
                      onChange={(e) => setEntityFilter(e.target.value)}
                    >
                      <MenuItem value="all">All Entities</MenuItem>
                      {Object.keys(entityCounts).map((e) => (
                        <MenuItem key={e} value={e}>
                          {e}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Performed by</InputLabel>
                    <Select
                      value={userFilter}
                      label="Performed by"
                      onChange={(e) => setUserFilter(e.target.value)}
                    >
                      <MenuItem value="all">All</MenuItem>
                      {Array.from(new Set(entries.map((e) => e.actorDisplay ?? e.user)))
                        .filter(Boolean)
                        .sort()
                        .map((u) => (
                          <MenuItem key={u} value={u}>
                            {u}
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Actor</InputLabel>
                    <Select
                      value={actorFilter}
                      label="Actor"
                      onChange={(e) => setActorFilter(e.target.value)}
                    >
                      <MenuItem value="all">All</MenuItem>
                      <MenuItem value="users">Users only</MenuItem>
                      <MenuItem value="agents">Agents only</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Country</InputLabel>
                    <Select
                      value={countryFilter}
                      label="Country"
                      onChange={(e) => setCountryFilter(e.target.value)}
                    >
                      <MenuItem value="all">All Countries</MenuItem>
                      {Object.keys(countryCounts)
                        .sort()
                        .map((country) => (
                          <MenuItem key={country} value={country}>
                            {country}
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                </Box>
              </Box>
              <TableContainer
                sx={{
                  flex: 1,
                  overflow: 'auto',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  maxHeight: { xs: 'calc(100vh - 180px)', sm: 'calc(100vh - 280px)' },
                  minHeight: { xs: 340, sm: 0 },
                }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          bgcolor: isDark
                            ? alpha(theme.palette.background.default, 0.8)
                            : 'action.hover',
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        Action
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          bgcolor: isDark
                            ? alpha(theme.palette.background.default, 0.8)
                            : 'action.hover',
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        Entity
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          bgcolor: isDark
                            ? alpha(theme.palette.background.default, 0.8)
                            : 'action.hover',
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        Performed by
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          bgcolor: isDark
                            ? alpha(theme.palette.background.default, 0.8)
                            : 'action.hover',
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        IP address
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          bgcolor: isDark
                            ? alpha(theme.palette.background.default, 0.8)
                            : 'action.hover',
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        Country
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          bgcolor: isDark
                            ? alpha(theme.palette.background.default, 0.8)
                            : 'action.hover',
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        Service / ISP
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          bgcolor: isDark
                            ? alpha(theme.palette.background.default, 0.8)
                            : 'action.hover',
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        Fingerprint
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          bgcolor: isDark
                            ? alpha(theme.palette.background.default, 0.8)
                            : 'action.hover',
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        Device
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          bgcolor: isDark
                            ? alpha(theme.palette.background.default, 0.8)
                            : 'action.hover',
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        Date
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          bgcolor: isDark
                            ? alpha(theme.palette.background.default, 0.8)
                            : 'action.hover',
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        Time
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          bgcolor: isDark
                            ? alpha(theme.palette.background.default, 0.8)
                            : 'action.hover',
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        Details
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          bgcolor: isDark
                            ? alpha(theme.palette.background.default, 0.8)
                            : 'action.hover',
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        View action
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={12} sx={{ py: 4, textAlign: 'center' }}>
                          <CircularProgress size={32} sx={{ color: 'primary.main' }} />
                        </TableCell>
                      </TableRow>
                    ) : loadError ? (
                      <TableRow>
                        <TableCell colSpan={12} sx={{ py: 4, textAlign: 'center' }}>
                          {loadError === 'TABLE_MISSING' ? (
                            <Box sx={{ color: 'text.primary', maxWidth: 480, mx: 'auto' }}>
                              <Typography
                                variant="body2"
                                color="error.main"
                                sx={{ fontWeight: 600, mb: 1 }}
                              >
                                Activity log table not found
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                Create the table in Supabase (one-time setup):
                              </Typography>
                              <Stack
                                direction="row"
                                spacing={1}
                                sx={{ flexWrap: 'wrap', gap: 1, mb: 1.5 }}
                              >
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={handleCopyMigrationSql}
                                  sx={{ textTransform: 'none', fontWeight: 600 }}
                                >
                                  {copySuccess ? 'Copied!' : 'Copy SQL to clipboard'}
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={fetchLogs}
                                  sx={{ textTransform: 'none' }}
                                >
                                  Retry after running migration
                                </Button>
                              </Stack>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block' }}
                              >
                                1. Open Supabase Dashboard → your project → SQL Editor → click the{' '}
                                <strong>+</strong> button (next to “Search queries…” or next to the
                                tab) to open a new query
                                <br />
                                2. Paste the SQL (from clipboard) and click <strong>Run</strong>
                                <br />
                                3. Click &quot;Retry after running migration&quot; above
                              </Typography>
                            </Box>
                          ) : (
                            <Typography color="error.main">{loadError}</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={12}
                          sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}
                        >
                          {entries.length === 0 ? (
                            <Box sx={{ maxWidth: 360, mx: 'auto' }}>
                              <Typography variant="body2" sx={{ mb: 0.5 }}>
                                No entries yet
                              </Typography>
                              <Typography variant="caption">
                                Use the app to generate logs: add or edit a partner, add a payment,
                                record a meeting, create a workflow, or change a profile note.
                                Entries will appear here automatically.
                              </Typography>
                            </Box>
                          ) : (
                            'No entries match your filters.'
                          )}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((row) => (
                        <TableRow
                          key={row.id}
                          hover
                          sx={{
                            '&:hover': {
                              bgcolor: isDark
                                ? alpha(theme.palette.primary.main, 0.06)
                                : 'action.hover',
                            },
                          }}
                        >
                          <TableCell>
                            <Chip
                              size="small"
                              label={row.action}
                              sx={{ borderRadius: 1.5, fontWeight: 600 }}
                              variant="outlined"
                              color="primary"
                            />
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.875rem' }}>
                            {row.entity} · {row.entityId}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                            <Stack
                              direction="row"
                              alignItems="center"
                              spacing={0.75}
                              flexWrap="wrap"
                            >
                              {row.actorType === 'agent' && (
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
                              {row.actorDisplay ?? row.user}
                            </Stack>
                          </TableCell>
                          <TableCell
                            sx={{
                              fontSize: '0.8rem',
                              fontFamily:
                                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            }}
                          >
                            {getIp(row)}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                            {getCountry(row)}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                            {shortText(getService(row), 38)}
                          </TableCell>
                          <TableCell
                            sx={{
                              fontSize: '0.76rem',
                              color: 'text.secondary',
                              fontFamily:
                                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            }}
                          >
                            {shortText(getFingerprintId(row), 18)}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                            {shortText(getDeviceSummary(row), 44)}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.83rem', color: 'text.secondary' }}>
                            {formatDatePart(row.timestamp)}
                          </TableCell>
                          <TableCell
                            sx={{ fontSize: '0.83rem', color: 'text.secondary' }}
                            title={new Date(row.timestamp).toLocaleString()}
                          >
                            {formatTimePart(row.timestamp)}
                            <Typography
                              variant="caption"
                              sx={{ display: 'block', color: 'text.disabled' }}
                            >
                              {formatTimestamp(row.timestamp)}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                            {shortText(row.details, 120)}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => setSelectedEntry(row)}
                              sx={{ textTransform: 'none', borderRadius: 1.5 }}
                            >
                              View action
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="caption" color="text.secondary">
                Logs are stored in the database (audit_log). Structured events now support severity,
                source, tags, and code snapshots.
              </Typography>
            </Stack>
          </BentoCard>

          {/* Filters / quick view - side bento */}
          <BentoCard
            title="Quick filters"
            subtitle="Narrow by type or user"
            icon={FilterListIcon}
            iconColor={theme.palette.primary.main}
            gridArea="filters"
            minHeight={200}
          >
            <Stack spacing={2}>
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 0.5 }}
                >
                  Entity type
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.75}>
                  {Object.entries(entityCounts).map(([entity, count]) => (
                    <Chip
                      key={entity}
                      size="small"
                      label={`${entity} (${count})`}
                      onClick={() => setEntityFilter(entityFilter === entity ? 'all' : entity)}
                      variant={entityFilter === entity ? 'filled' : 'outlined'}
                      color="primary"
                      sx={{ borderRadius: 1.5 }}
                    />
                  ))}
                </Stack>
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 0.5 }}
                >
                  Time range
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Last 7 days (configurable when backend is connected)
                </Typography>
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 0.5 }}
                >
                  Countries observed
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.75}>
                  {Object.entries(countryCounts)
                    .slice(0, 8)
                    .map(([country, count]) => (
                      <Chip
                        key={country}
                        size="small"
                        label={`${country} (${count})`}
                        onClick={() =>
                          setCountryFilter(countryFilter === country ? 'all' : country)
                        }
                        variant={countryFilter === country ? 'filled' : 'outlined'}
                        color="secondary"
                        sx={{ borderRadius: 1.5 }}
                      />
                    ))}
                </Stack>
              </Box>
            </Stack>
          </BentoCard>

          {/* Summary strip - full width bento */}
          <BentoCard
            title="Summary"
            subtitle="Activity at a glance"
            icon={TimelineIcon}
            iconColor={theme.palette.success?.main || theme.palette.primary.main}
            gridArea="summary"
            minHeight={100}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} flexWrap="wrap" useFlexGap>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AppIcon
                  name="PersonOutline"
                  fallback={PersonOutlineIcon}
                  sx={{ color: 'text.secondary', fontSize: 20 }}
                />
                <Typography variant="body2">
                  <strong>{new Set(entries.map((e) => e.user)).size}</strong> user(s)
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AppIcon
                  name="History"
                  fallback={HistoryIcon}
                  sx={{ color: 'text.secondary', fontSize: 20 }}
                />
                <Typography variant="body2">
                  <strong>{entries.length}</strong> total events
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AppIcon
                  name="FilterList"
                  fallback={FilterListIcon}
                  sx={{ color: 'text.secondary', fontSize: 20 }}
                />
                <Typography variant="body2">
                  <strong>{Object.keys(entityCounts).length}</strong> entity types
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2">
                  <strong>
                    {new Set(entries.map((e) => getIp(e)).filter((ip) => ip !== '-')).size}
                  </strong>{' '}
                  IP(s)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ·
                </Typography>
                <Typography variant="body2">
                  <strong>{Object.keys(countryCounts).length}</strong> countries
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip size="small" color="error" label={`High ${importantMoments.high}`} />
                <Chip size="small" color="warning" label={`Medium ${importantMoments.medium}`} />
                <Chip size="small" color="default" label={`Low ${importantMoments.low}`} />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2">
                  <strong>{importantMoments.destructive}</strong> destructive event(s)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ·
                </Typography>
                <Typography variant="body2">
                  <strong>{importantMoments.withCode}</strong> code snapshot event(s)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ·
                </Typography>
                <Typography variant="body2">
                  <strong>{importantMoments.withFingerprint}</strong> fingerprinted event(s)
                </Typography>
              </Box>
            </Stack>
          </BentoCard>
        </Box>
      )}
      <Dialog
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>View action</DialogTitle>
        <DialogContent dividers>
          {selectedEntry && (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={selectedEntry.action} color="primary" />
                <Chip size="small" label={`${selectedEntry.entity} · ${selectedEntry.entityId}`} />
                <Chip size="small" label={`Severity: ${getRowSeverity(selectedEntry)}`} />
                <Chip
                  size="small"
                  icon={
                    selectedEntry.actorType === 'agent' ? (
                      <AppIcon
                        name="SmartToyOutlined"
                        fallback={SmartToyOutlinedIcon}
                        sx={{ fontSize: 14 }}
                      />
                    ) : undefined
                  }
                  label={`Performed by: ${selectedEntry.actorDisplay ?? selectedEntry.user}`}
                  variant="outlined"
                  color={selectedEntry.actorType === 'agent' ? 'secondary' : 'default'}
                />
                {selectedEntry.detailsStructured?.source && (
                  <Chip size="small" label={`Source: ${selectedEntry.detailsStructured.source}`} />
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {selectedEntry.details || 'No summary details.'}
              </Typography>
              <Divider />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Access telemetry
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={`IP: ${getIp(selectedEntry)}`} variant="outlined" />
                <Chip
                  size="small"
                  label={`Country: ${getCountry(selectedEntry)}`}
                  variant="outlined"
                />
                <Chip
                  size="small"
                  label={`Service: ${shortText(getService(selectedEntry), 36)}`}
                  variant="outlined"
                />
                <Chip
                  size="small"
                  label={`Fingerprint: ${getFingerprintId(selectedEntry)}`}
                  variant="outlined"
                />
              </Stack>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: isDark
                    ? alpha(theme.palette.background.default, 0.38)
                    : alpha(theme.palette.background.default, 0.5),
                }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  useFlexGap
                  flexWrap="wrap"
                >
                  <Typography variant="caption" color="text.secondary">
                    <strong>OS:</strong> {getDevice(selectedEntry).os || 'Unknown'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    <strong>Browser:</strong> {getDevice(selectedEntry).browser || 'Unknown'}{' '}
                    {getDevice(selectedEntry).browserVersion || ''}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    <strong>Platform:</strong> {getDevice(selectedEntry).platform || 'Unknown'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    <strong>Device:</strong> {getDevice(selectedEntry).deviceType || 'Unknown'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    <strong>Timezone:</strong> {getDevice(selectedEntry).timezone || 'Unknown'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    <strong>Language:</strong> {getDevice(selectedEntry).language || 'Unknown'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    <strong>Resolution:</strong>{' '}
                    {getDevice(selectedEntry).screenResolution || 'Unknown'}
                  </Typography>
                </Stack>
                {getDevice(selectedEntry).userAgent && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 1 }}
                  >
                    <strong>User-Agent:</strong> {getDevice(selectedEntry).userAgent}
                  </Typography>
                )}
              </Box>
              {Array.isArray(selectedEntry.detailsStructured?.tags) &&
                selectedEntry.detailsStructured.tags.length > 0 && (
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                    {selectedEntry.detailsStructured.tags.map((tag) => (
                      <Chip key={tag} size="small" variant="outlined" label={tag} />
                    ))}
                  </Stack>
                )}
              {(selectedEntry.detailsStructured?.codeBefore ||
                selectedEntry.detailsStructured?.codeAfter) && (
                <>
                  <Divider />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Edited / created payload
                  </Typography>
                </>
              )}
              {selectedEntry.detailsStructured?.codeBefore && (
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
                  >
                    Before
                  </Typography>
                  <Box sx={codeBlockSx(theme, isDark, theme.palette.warning.main)}>
                    {selectedEntry.detailsStructured.codeBefore}
                  </Box>
                </Box>
              )}
              {selectedEntry.detailsStructured?.codeAfter && (
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
                  >
                    After
                  </Typography>
                  <Box sx={codeBlockSx(theme, isDark, theme.palette.success.main)}>
                    {selectedEntry.detailsStructured.codeAfter}
                  </Box>
                </Box>
              )}
              {!selectedEntry.detailsStructured?.codeBefore &&
                !selectedEntry.detailsStructured?.codeAfter &&
                buildFallbackCodeSnapshot(selectedEntry) && (
                  <Box>
                    <Divider sx={{ mb: 1.5 }} />
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
                    >
                      Event snapshot
                    </Typography>
                    <Box sx={codeBlockSx(theme, isDark, theme.palette.info.main)}>
                      {buildFallbackCodeSnapshot(selectedEntry)}
                    </Box>
                  </Box>
                )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedEntry(null)} sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}
