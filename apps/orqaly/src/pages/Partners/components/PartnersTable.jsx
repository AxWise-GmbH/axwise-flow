import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  Chip,
  Typography,
  Box,
  IconButton,
  Tooltip,
  useTheme,
  alpha,
  Collapse,
  LinearProgress,
} from '@mui/material';
import Pagination from '../../../components/Common/Pagination';
import usePagination from '../../../hooks/usePagination';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import Groups2OutlinedIcon from '@mui/icons-material/Groups2Outlined';
import MicIcon from '@mui/icons-material/Mic';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import PartnerProfileCell from './PartnerProfileCell';
import FunnelStatusBadge from './FunnelStatusBadge';
import EditPopover from './EditPopover';
import {
  AGREEMENT_COLORS,
  AGREEMENT_COLORS_DARK,
  FUNNEL_STATUS_COLORS,
  FUNNEL_STATUSES,
  AGREEMENT_TYPES,
  GROUP_TYPES,
  TRAFFIC_SOURCES,
  COUNTRY_FLAGS,
} from '../../../utils/constants';
import { formatCurrency, formatPercent } from '../../../utils/formatters';
import { createHoverGlowShadow } from '../../../theme/hoverGlow';
import {
  parseMonthYear,
  getCampaignMetricsForPeriod,
  getFinanceSummary,
  getFinanceForPeriod,
} from '../utils/periodMetrics';

import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';

import AppIcon from '../../../components/icons/AppIcon';

export const COLUMN_DEFS = [
  { id: 'profile', label: 'Partner', sortKey: 'name', minWidth: 150 },
  { id: 'meetings', label: 'Meetings', minWidth: 80, align: 'center' },
  { id: 'groupTeam', label: 'Group & Teams', sortKey: 'team', minWidth: 180 },
  { id: 'category', label: 'Category', sortKey: 'category', minWidth: 120 },
  { id: 'projects', label: 'Projects', sortKey: 'projectsCount', minWidth: 130 },
  { id: 'agreement', label: 'Agreement', sortKey: 'agreement', minWidth: 90 },
  {
    id: 'campaigns',
    label: 'Campaigns',
    sortKey: 'campaignsActive',
    minWidth: 90,
    align: 'center',
  },
  { id: 'clicks', label: 'Clicks', sortKey: 'clicksTotal', minWidth: 90, align: 'center' },
  { id: 'ftd', label: 'FTD', sortKey: 'ftdTotal', minWidth: 70, align: 'center' },
  { id: 'cr', label: 'CR%', sortKey: 'crAvg', minWidth: 70, align: 'center' },
  { id: 'roiCac', label: 'ROI / CAC', sortKey: 'roi', minWidth: 100, align: 'center' },
  { id: 'finance', label: 'Finance', sortKey: 'financeTotal', minWidth: 150, align: 'right' },
  { id: 'trafficGeo', label: 'Traffic & Geo', sortKey: 'trafficSource', minWidth: 120 },
  { id: 'funnelStatus', label: 'Funnel', sortKey: 'funnelStatus', minWidth: 130 },
  { id: 'contact', label: 'Contacts', sortKey: 'telegramNick', minWidth: 140 },
];

// Wraps an editable cell with hover indicator and click handler
function EditableWrapper({ children, onClick }) {
  const theme = useTheme();
  const hoverBg = alpha(theme.palette.primary.main, 0.06);
  return (
    <Box
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        borderRadius: 1,
        px: 0.5,
        mx: -0.5,
        py: 0.25,
        transition: 'background-color 0.15s',
        '&:hover': { bgcolor: hoverBg },
        '&:hover .edit-hint': { opacity: 1 },
      }}
    >
      {children}
      <AppIcon
        name="EditOutlined"
        fallback={EditOutlinedIcon}
        className="edit-hint"
        sx={{
          fontSize: 13,
          color: 'text.secondary',
          opacity: 0,
          transition: 'opacity 0.15s',
          flexShrink: 0,
        }}
      />
    </Box>
  );
}

export default function PartnersTable({
  partners,
  projects = [],
  period,
  columnVisibility,
  onOpenCampaigns,
  onOpenFtd,
  onOpenCr,
  onOpenFinance,
  onOpenKanban,
  onViewStats,
  onUploadMaterial,
  onEditPartner,
  onArchivePartner,
  onStartRecording,
  onViewMeetings,
}) {
  const navigate = useNavigate();
  const [order, setOrder] = useState('asc');
  const [orderBy, setOrderBy] = useState('name');
  const [expandedRows, setExpandedRows] = useState({});

  const toggleRow = useCallback((id) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Memoize period parsing
  const selectedPeriod = useMemo(() => parseMonthYear(period), [period]);

  // Compute metrics for a set of campaigns
  const computeCampaignMetrics = useCallback((campaigns, period) => {
    let clicksTotal = 0;
    let ftdTotal = 0;
    let crSum = 0;
    let crCount = 0;

    (campaigns || []).forEach((c) => {
      const m = period
        ? getCampaignMetricsForPeriod(c, period)
        : { clicks: Number(c.clicks || 0), ftd: Number(c.ftd || 0), cr: Number(c.cr || 0) };
      clicksTotal += m.clicks;
      ftdTotal += m.ftd;
      if (m.clicks > 0) {
        crSum += m.cr;
        crCount++;
      }
    });

    return {
      clicksTotal,
      ftdTotal,
      crAvg: crCount > 0 ? crSum / crCount : 0,
      campaignsActive: (campaigns || []).filter((c) => c.status === 'Active').length,
    };
  }, []);

  // Index projects by partnerId and teamId for fast lookup
  const projectsByPartner = useMemo(() => {
    const map = {};
    (projects || []).forEach((proj) => {
      if (proj.partnerId) {
        if (!map[proj.partnerId]) map[proj.partnerId] = [];
        map[proj.partnerId].push(proj);
      }
    });
    return map;
  }, [projects]);

  // Enrich partners with period-aware metrics for sorting and display
  const enrichedPartners = useMemo(() => {
    return partners.map((p) => {
      // Overall campaign metrics
      const campaigns = p.campaigns || [];
      const metrics = computeCampaignMetrics(campaigns, selectedPeriod);

      // Finance metrics
      const baseFinance = getFinanceSummary(p);
      const financePeriod = selectedPeriod
        ? getFinanceForPeriod(p, baseFinance, selectedPeriod)
        : baseFinance;

      // Projects for this partner
      const partnerProjects = projectsByPartner[p.id] || [];

      // Per-team metrics + projects
      const teams = (p.teams || []).map((team) => {
        const teamCampaigns = team.campaigns?.items || [];
        const teamMetrics = computeCampaignMetrics(teamCampaigns, selectedPeriod);
        const teamProjects = partnerProjects.filter((proj) => proj.teamId === team.id);
        return { ...team, _metrics: teamMetrics, _projects: teamProjects };
      });

      return {
        ...p,
        teams,
        _projects: partnerProjects,
        projectsCount: partnerProjects.length,
        _periodMetrics: {
          clicksTotal: metrics.clicksTotal,
          ftdTotal: metrics.ftdTotal,
          crAvg: metrics.crAvg,
          financeTotal: financePeriod.total,
          financePaid: financePeriod.paid,
          financeDebt: financePeriod.debt,
        },
      };
    });
  }, [partners, selectedPeriod, computeCampaignMetrics, projectsByPartner]);

  // Edit popover state
  const [editState, setEditState] = useState({
    anchorEl: null,
    partnerId: null,
    field: null, // which field is being edited
    mode: 'select',
    title: '',
    options: [],
    currentValue: null,
    currentValues: [],
    textValue: '',
    textPlaceholder: '',
  });

  const handleSort = (sortKey) => {
    if (!sortKey) return;
    const isAsc = orderBy === sortKey && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(sortKey);
  };

  const getSortValue = useCallback((item, key) => {
    if (item._periodMetrics) {
      if (key === 'clicksTotal') return item._periodMetrics.clicksTotal;
      if (key === 'ftdTotal') return item._periodMetrics.ftdTotal;
      if (key === 'crAvg') return item._periodMetrics.crAvg;
      if (key === 'financeTotal') return item._periodMetrics.financeTotal;
    }
    // Fallback to base props if period metrics missing or key is standard
    return item[key];
  }, []);

  const sorted = useMemo(() => {
    return [...enrichedPartners].sort((a, b) => {
      const valA = getSortValue(a, orderBy);
      const valB = getSortValue(b, orderBy);

      if (valB < valA) return order === 'desc' ? -1 : 1;
      if (valB > valA) return order === 'desc' ? 1 : -1;
      return 0;
    });
  }, [enrichedPartners, order, orderBy, getSortValue]);

  const openEdit = useCallback(
    (e, partner, config) => {
      if (!onEditPartner) return;
      e.stopPropagation();
      setEditState({
        anchorEl: e.currentTarget,
        partnerId: partner.id,
        ...config,
      });
    },
    [onEditPartner]
  );

  const closeEdit = useCallback(() => {
    setEditState((prev) => ({ ...prev, anchorEl: null }));
  }, []);

  const handleEditSave = useCallback(
    (value) => {
      if (!editState.partnerId || !editState.field) return;

      const updates = {};

      // Handle composite fields
      switch (editState.field) {
        case 'group':
          updates.group = value;
          updates.groupSubtype = value === 'Webmaster' ? 'Personal Traffic' : 'Our DB';
          break;
        case 'currentBalance':
          updates.currentBalance = parseFloat(value) || 0;
          break;
        case 'trafficSources':
          updates.trafficSources = value;
          updates.trafficSource = value?.[0] || 'FB';
          break;
        case 'geos':
          updates.geos = value;
          updates.geo = value?.[0] || 'BR';
          break;
        default:
          updates[editState.field] = value;
      }

      onEditPartner(editState.partnerId, updates);
    },
    [editState.partnerId, editState.field, onEditPartner]
  );

  const visibleColumns = COLUMN_DEFS.filter((col) => columnVisibility[col.id] !== false);

  const pagination = usePagination(sorted, {
    surfaceId: 'partners.list',
    defaultRowsPerPage: 10,
    resetOn: [order, orderBy],
  });
  const paginated = pagination.paginatedData;
  const teamOptions = useMemo(
    () => [...new Set(partners.map((p) => p.team).filter(Boolean))].sort(),
    [partners]
  );

  // Build edit config for each editable cell type
  const getEditConfig = useCallback(
    (colId, partner) => {
      switch (colId) {
        case 'category':
          return [
            {
              field: 'category',
              mode: 'select',
              title: 'Change Category',
              currentValue: partner.category || 'Gambling',
              options: [
                { value: 'Gambling', label: 'Gambling', bg: '#DC2626' },
                { value: 'Ecommerce', label: 'Ecommerce', bg: '#2563EB' },
                { value: 'Fintech', label: 'Fintech', bg: '#059669' },
              ],
            },
          ];
        case 'groupTeam':
          return [
            {
              field: 'team',
              mode: 'selectCreate',
              title: 'Team',
              currentValue: partner.team,
              options: teamOptions.map((team) => ({ value: team, label: team })),
              textValue: partner.team,
              textPlaceholder: 'Create new team...',
            },
            {
              field: 'group',
              mode: 'select',
              title: 'Change Group',
              currentValue: partner.group,
              options: GROUP_TYPES.map((g) => ({
                value: g,
                label: g === 'Webmaster' ? 'Webmaster (Personal Traffic)' : 'Partner (Our DB)',
                bg: g === 'Webmaster' ? '#2563EB' : '#059669',
              })),
            },
          ];
        case 'trafficGeo':
          return [
            {
              field: 'trafficSources',
              mode: 'multiselect',
              title: 'Traffic Sources',
              currentValues: partner.trafficSources || [partner.trafficSource].filter(Boolean),
              options: TRAFFIC_SOURCES.map((s) => ({
                value: s,
                label: s,
              })),
            },
            {
              field: 'geos',
              mode: 'multiselect',
              title: 'Country / Geos',
              currentValues: partner.geos || [partner.geo].filter(Boolean),
              options: Object.keys(COUNTRY_FLAGS).map((code) => ({
                value: code,
                label: `${COUNTRY_FLAGS[code]} ${code}`,
              })),
            },
          ];
        case 'contact':
          return [
            {
              field: 'telegramNick',
              mode: 'text',
              title: 'Telegram Nick',
              textValue: partner.telegramNick,
              textPlaceholder: '@nickname',
            },
            {
              field: 'telegramGroup',
              mode: 'text',
              title: 'Telegram Group',
              textValue: partner.telegramGroup || '',
              textPlaceholder: 'https://t.me/group_name',
            },
          ];
        case 'agreement':
          return [
            {
              field: 'agreement',
              mode: 'select',
              title: 'Agreement Type',
              currentValue: partner.agreement,
              options: AGREEMENT_TYPES.map((a) => ({
                value: a,
                label: a,
                bg: AGREEMENT_COLORS[a]?.color,
                color: AGREEMENT_COLORS[a]?.color,
              })),
            },
          ];
        case 'funnelStatus':
          return [
            {
              field: 'funnelStatus',
              mode: 'select',
              title: 'Funnel Status',
              currentValue: partner.funnelStatus,
              options: FUNNEL_STATUSES.map((s) => ({
                value: s,
                label: s,
                bg: FUNNEL_STATUS_COLORS[s]?.color,
                color: FUNNEL_STATUS_COLORS[s]?.color,
              })),
            },
          ];
        default:
          return null;
      }
    },
    [teamOptions]
  );

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: isDark ? alpha(theme.palette.background.paper, 0.6) : undefined,
      }}
    >
      <TableContainer sx={{ maxHeight: 'calc(100vh - 280px)' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {/* Expand toggle column */}
              <TableCell sx={{ width: 40, p: 0 }} />
              {visibleColumns.map((col) => (
                <TableCell
                  key={col.id}
                  align={col.align || 'left'}
                  sx={{ minWidth: col.minWidth, whiteSpace: 'nowrap' }}
                >
                  {col.sortKey ? (
                    <TableSortLabel
                      active={orderBy === col.sortKey}
                      direction={orderBy === col.sortKey ? order : 'asc'}
                      onClick={() => handleSort(col.sortKey)}
                    >
                      {col.label}
                    </TableSortLabel>
                  ) : (
                    col.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + 1} align="center" sx={{ py: 6 }}>
                  <Typography variant="body2" color="text.secondary">
                    No partners found
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((partner) => {
                const isExpanded = !!expandedRows[partner.id];
                const teams = partner.teams || [];
                const hasTeams = teams.length > 0;
                return (
                  <React.Fragment key={partner.id}>
                    <TableRow
                      hover
                      sx={{
                        '& > *': { borderBottom: isExpanded ? 'unset' : undefined },
                        cursor: hasTeams ? 'pointer' : 'default',
                      }}
                      onClick={() => hasTeams && toggleRow(partner.id)}
                    >
                      {/* Expand toggle */}
                      <TableCell sx={{ width: 40, p: 0, pl: 0.5 }}>
                        {hasTeams && (
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRow(partner.id);
                            }}
                            sx={{
                              transition: 'transform 0.2s',
                              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            }}
                          >
                            <AppIcon
                              name="KeyboardArrowDown"
                              fallback={KeyboardArrowDownIcon}
                              sx={{ fontSize: 20 }}
                            />
                          </IconButton>
                        )}
                      </TableCell>
                      {visibleColumns.map((col) => (
                        <TableCell
                          key={col.id}
                          align={col.align || 'left'}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <CellRenderer
                            colId={col.id}
                            partner={partner}
                            metrics={partner._periodMetrics}
                            handlers={{
                              onOpenCampaigns,
                              onOpenFtd,
                              onOpenCr,
                              onOpenFinance,
                              onOpenKanban,
                              onViewStats,
                              onUploadMaterial,
                              onArchivePartner,
                              onStartRecording,
                              onViewMeetings,
                              onOpenProject: (projectName) =>
                                navigate(`/projects?search=${encodeURIComponent(projectName)}`),
                            }}
                            openEdit={openEdit}
                            getEditConfig={getEditConfig}
                            isDark={isDark}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                    {/* Expandable team detail row */}
                    {hasTeams && (
                      <TableRow>
                        <TableCell
                          colSpan={visibleColumns.length + 1}
                          sx={{ py: 0, px: 0, borderBottom: isExpanded ? undefined : 'none' }}
                        >
                          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <TeamDetailPanel
                              teams={teams}
                              partner={partner}
                              isDark={isDark}
                              handlers={{
                                onOpenCampaigns,
                                onOpenFtd,
                                onOpenCr,
                                onOpenFinance,
                                onOpenProject: (projectName) =>
                                  navigate(`/projects?search=${encodeURIComponent(projectName)}`),
                              }}
                            />
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            )}
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
        label="partners"
      />
      {/* Single shared edit popover */}
      <EditPopover
        anchorEl={editState.anchorEl}
        open={Boolean(editState.anchorEl)}
        onClose={closeEdit}
        title={editState.title}
        mode={editState.mode}
        options={editState.options}
        currentValue={editState.currentValue}
        currentValues={editState.currentValues}
        textValue={editState.textValue}
        textPlaceholder={editState.textPlaceholder}
        onSave={handleEditSave}
      />
    </Paper>
  );
}

/**
 * Expandable panel showing per-team statistics inside the expanded row.
 * Shows an aggregated "All Teams" summary bar at the top, then individual team cards.
 */
function TeamDetailPanel({ teams, partner, isDark, handlers }) {
  const theme = useTheme();

  // Compute aggregated totals across all teams for the summary bar
  const allTeamTotals = useMemo(() => {
    let clicks = 0,
      ftd = 0,
      crSum = 0,
      crCount = 0,
      campaigns = 0,
      finTotal = 0,
      finPaid = 0,
      finDebt = 0;
    teams.forEach((t) => {
      const m = t._metrics || {};
      clicks += m.clicksTotal || 0;
      ftd += m.ftdTotal || 0;
      if (m.crAvg > 0) {
        crSum += m.crAvg;
        crCount++;
      }
      campaigns += m.campaignsActive || 0;
      finTotal += Number(t.finance?.summary?.total || 0);
      finPaid += Number(t.finance?.summary?.paid || 0);
      finDebt += Number(t.finance?.summary?.debt || 0);
    });
    return {
      clicks,
      ftd,
      crAvg: crCount > 0 ? crSum / crCount : 0,
      campaigns,
      finTotal,
      finPaid,
      finDebt,
    };
  }, [teams]);

  const cardBg = isDark
    ? alpha(theme.palette.background.paper, 0.6)
    : alpha(theme.palette.grey[50], 0.8);
  const summaryBg = isDark
    ? alpha(theme.palette.primary.main, 0.06)
    : alpha(theme.palette.primary.main, 0.03);
  const borderColor = isDark ? alpha('#fff', 0.08) : alpha('#000', 0.08);

  return (
    <Box sx={{ px: 3, py: 2.5 }}>
      {/* Summary bar - All Teams aggregated */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          px: 2.5,
          py: 1.5,
          mb: 2,
          borderRadius: 2,
          bgcolor: summaryBg,
          border: '1px solid',
          borderColor,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mr: 1 }}>
          All Teams
        </Typography>
        <Chip
          label={`${teams.length} Teams`}
          size="small"
          sx={{
            height: 22,
            fontSize: '0.7rem',
            fontWeight: 700,
            bgcolor: isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06),
          }}
        />
        <StatBadge
          label="Campaigns"
          value={allTeamTotals.campaigns}
          color={theme.palette.primary.main}
          isDark={isDark}
        />
        <StatBadge
          label="Clicks"
          value={allTeamTotals.clicks.toLocaleString()}
          color={theme.palette.primary.main}
          isDark={isDark}
        />
        <StatBadge
          label="FTD"
          value={allTeamTotals.ftd.toLocaleString()}
          color={theme.palette.success.main}
          isDark={isDark}
        />
        <StatBadge
          label="CR"
          value={formatPercent(allTeamTotals.crAvg)}
          color={theme.palette.warning.main}
          isDark={isDark}
        />
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            Total: {formatCurrency(allTeamTotals.finTotal)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
            Paid: {formatCurrency(allTeamTotals.finPaid)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
            Debt: {formatCurrency(allTeamTotals.finDebt)}
          </Typography>
        </Box>
      </Box>
      {/* Individual team cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 2,
        }}
      >
        {teams.map((team) => {
          const m = team._metrics || {};
          const geo = team.trafficGeo || {};
          const geos = geo.geos || [];
          const sources = geo.trafficSources || [];
          const fin = team.finance?.summary || {};
          const campItems = team.campaigns?.items || [];
          const activeCamps = campItems.filter((c) => c.status === 'Active');
          const linkCount = team.links?.items?.length || 0;
          const materialCount = team.materials?.items?.length || 0;
          const teamProjects = team._projects || [];
          const crBarWidth = Math.min(100, (m.crAvg || 0) * 5); // scale CR for visual bar (20% = full)

          return (
            <Box
              key={team.id}
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: cardBg,
                border: '1px solid',
                borderColor,
                transition: 'box-shadow 0.2s, border-color 0.2s',
                '&:hover': {
                  borderColor: theme.palette.primary.main,
                  boxShadow: createHoverGlowShadow(theme),
                },
              }}
            >
              {/* Team header */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: activeCamps.length > 0 ? 'success.main' : 'text.disabled',
                      flexShrink: 0,
                    }}
                  />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                    {team.name}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {sources.map((s) => (
                    <Chip
                      key={s}
                      label={s}
                      size="small"
                      sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600 }}
                    />
                  ))}
                  {geos.map((g) => (
                    <Chip
                      key={g}
                      label={`${COUNTRY_FLAGS[g] || ''} ${g}`}
                      size="small"
                      sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600 }}
                    />
                  ))}
                </Box>
              </Box>
              {/* Metrics grid */}
              <Box
                sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 1.5, mb: 1.5 }}
              >
                <MetricBox
                  label="Campaigns"
                  value={m.campaignsActive || 0}
                  sub={`of ${campItems.length}`}
                  color={theme.palette.primary.main}
                  isDark={isDark}
                />
                <MetricBox
                  label="Clicks"
                  value={(m.clicksTotal || 0).toLocaleString()}
                  color={theme.palette.primary.main}
                  isDark={isDark}
                />
                <MetricBox
                  label="FTD"
                  value={(m.ftdTotal || 0).toLocaleString()}
                  color={theme.palette.success.main}
                  isDark={isDark}
                />
                <MetricBox
                  label="CR %"
                  value={formatPercent(m.crAvg || 0)}
                  color={theme.palette.warning.main}
                  isDark={isDark}
                />
              </Box>
              {/* CR progress bar */}
              <Box sx={{ mb: 1.5 }}>
                <LinearProgress
                  variant="determinate"
                  value={crBarWidth}
                  sx={{
                    height: 4,
                    borderRadius: 2,
                    bgcolor: isDark ? alpha('#fff', 0.06) : alpha('#000', 0.06),
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 2,
                      bgcolor:
                        m.crAvg >= 5
                          ? 'success.main'
                          : m.crAvg >= 2
                            ? 'warning.main'
                            : 'error.main',
                    },
                  }}
                />
              </Box>
              {/* Finance row */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 1.5,
                  bgcolor: isDark ? alpha('#fff', 0.03) : alpha('#000', 0.02),
                  mb: 1,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.68rem' }}
                >
                  Total: {formatCurrency(fin.total || 0)}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 600, color: 'success.main', fontSize: '0.68rem' }}
                >
                  Paid: {formatCurrency(fin.paid || 0)}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 600, color: 'error.main', fontSize: '0.68rem' }}
                >
                  Debt: {formatCurrency(fin.debt || 0)}
                </Typography>
              </Box>
              {/* Projects */}
              {teamProjects.length > 0 && (
                <Box sx={{ mb: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.62rem',
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      display: 'block',
                      mb: 0.5,
                    }}
                  >
                    Projects ({teamProjects.length})
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {teamProjects.map((proj) => {
                      const statusColors = isDark
                        ? {
                            Active: '#4ADE80',
                            Paused: '#FACC15',
                            Completed: '#60A5FA',
                            Archived: '#8B949E',
                          }
                        : {
                            Active: '#059669',
                            Paused: '#D97706',
                            Completed: '#2563EB',
                            Archived: '#64748B',
                          };
                      const c = statusColors[proj.status] || statusColors.Active;
                      return (
                        <Chip
                          key={proj.id}
                          icon={
                            <AppIcon
                              name="FolderOutlined"
                              fallback={FolderOutlinedIcon}
                              sx={{ fontSize: '13px !important' }}
                            />
                          }
                          label={proj.name}
                          size="small"
                          clickable
                          onClick={() => handlers.onOpenProject?.(proj.name)}
                          sx={{
                            height: 22,
                            fontSize: '0.62rem',
                            fontWeight: 600,
                            maxWidth: 150,
                            cursor: 'pointer',
                            color: c,
                            bgcolor: isDark ? alpha(c, 0.1) : alpha(c, 0.08),
                            border: '1px solid',
                            borderColor: isDark ? alpha(c, 0.2) : alpha(c, 0.15),
                            transition: 'all 0.15s',
                            '&:hover': { bgcolor: isDark ? alpha(c, 0.2) : alpha(c, 0.15) },
                            '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                          }}
                        />
                      );
                    })}
                  </Box>
                </Box>
              )}
              {/* Links & Materials counts */}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {linkCount > 0 && (
                  <Chip
                    label={`${linkCount} Links`}
                    size="small"
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.62rem', fontWeight: 600 }}
                  />
                )}
                {materialCount > 0 && (
                  <Chip
                    label={`${materialCount} Materials`}
                    size="small"
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.62rem', fontWeight: 600 }}
                  />
                )}
                {teamProjects.length === 0 && linkCount === 0 && materialCount === 0 && (
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.disabled', fontSize: '0.65rem' }}
                  >
                    No projects, links or materials
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** Compact stat badge for the summary bar */
function StatBadge({ label, value, color, isDark }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
        {label}:
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.75rem', color }}>
        {value}
      </Typography>
    </Box>
  );
}

/** Small metric box for team cards */
function MetricBox({ label, value, sub, color, isDark }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        textAlign: 'center',
        py: 0.75,
        px: 0.5,
        borderRadius: 1.5,
        bgcolor: isDark ? alpha(color, 0.08) : alpha(color, 0.06),
      }}
    >
      <Typography
        variant="h6"
        sx={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2, color }}
      >
        {value}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', fontSize: '0.6rem', lineHeight: 1 }}
      >
        {label}
        {sub && <span style={{ opacity: 0.6 }}> {sub}</span>}
      </Typography>
    </Box>
  );
}

/**
 * Renders a single cell. Editable columns are wrapped in EditableWrapper.
 * For composite cells (groupTeam, trafficGeo) that have two editable sub-fields,
 * each sub-part is independently clickable.
 */
function CellRenderer({ colId, partner, metrics, handlers, openEdit, getEditConfig, isDark }) {
  const theme = useTheme();
  const agColors = (isDark ? AGREEMENT_COLORS_DARK : AGREEMENT_COLORS)[partner.agreement] || {};

  const safeMetrics = metrics || {
    clicksTotal: 0,
    ftdTotal: partner.ftdTotal || 0,
    crAvg: partner.crAvg || 0,
    financeTotal: getFinanceSummary(partner).total,
    financePaid: getFinanceSummary(partner).paid,
    financeDebt: getFinanceSummary(partner).debt,
  };

  switch (colId) {
    case 'profile':
      return (
        <PartnerProfileCell
          partner={partner}
          onOpenKanban={handlers.onOpenKanban}
          onViewStats={handlers.onViewStats}
          onUploadMaterial={handlers.onUploadMaterial}
          onArchivePartner={handlers.onArchivePartner}
        />
      );

    case 'meetings': {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25 }}>
          <Tooltip title={`Record meeting - ${partner.name}`}>
            <IconButton
              size="small"
              onClick={() => handlers.onStartRecording?.(partner)}
              sx={{
                color: 'error.main',
                '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.08) },
              }}
            >
              <AppIcon name="Mic" fallback={MicIcon} sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="View meetings">
            <IconButton
              size="small"
              onClick={() => handlers.onViewMeetings?.(partner)}
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                  color: 'primary.main',
                },
              }}
            >
              <AppIcon
                name="VisibilityOutlined"
                fallback={VisibilityOutlinedIcon}
                sx={{ fontSize: 18 }}
              />
            </IconButton>
          </Tooltip>
        </Box>
      );
    }

    case 'category': {
      const config = getEditConfig('category', partner)?.[0];
      return (
        <EditableWrapper onClick={(e) => openEdit(e, partner, config)}>
          <Chip
            label={partner.category || 'Gambling'}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.65rem',
              fontWeight: 600,
              bgcolor: (theme) => {
                const cat = partner.category || 'Gambling';
                if (cat === 'Gambling')
                  return theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2';
                if (cat === 'Ecommerce')
                  return theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE';
                return theme.palette.mode === 'dark' ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5';
              },
              color: (theme) => {
                const cat = partner.category || 'Gambling';
                if (cat === 'Gambling')
                  return theme.palette.mode === 'dark' ? '#F87171' : '#DC2626';
                if (cat === 'Ecommerce')
                  return theme.palette.mode === 'dark' ? '#60A5FA' : '#2563EB';
                return theme.palette.mode === 'dark' ? '#34D399' : '#059669';
              },
            }}
          />
        </EditableWrapper>
      );
    }

    case 'groupTeam': {
      const configs = getEditConfig('groupTeam', partner);
      const groupColors = isDark
        ? partner.group === 'Webmaster'
          ? { bg: alpha('#60A5FA', 0.2), color: '#93C5FD' }
          : { bg: alpha('#34D399', 0.2), color: '#6EE7B7' }
        : partner.group === 'Webmaster'
          ? { bg: '#DBEAFE', color: '#2563EB' }
          : { bg: '#D1FAE5', color: '#059669' };
      const teams = partner.teams || [];
      return (
        <Box>
          <EditableWrapper onClick={(e) => openEdit(e, partner, configs[1])}>
            <Chip
              label={partner.group}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.65rem',
                fontWeight: 600,
                bgcolor: groupColors.bg,
                color: groupColors.color,
                mb: teams.length > 0 ? 0.75 : 0,
              }}
            />
          </EditableWrapper>
          {teams.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {teams.map((team) => {
                const tm = team._metrics || {};
                const activeCamps = tm.campaignsActive || 0;
                return (
                  <Box
                    key={team.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      py: 0.4,
                      px: 0.75,
                      borderRadius: 1.5,
                      bgcolor: isDark ? alpha('#fff', 0.03) : alpha('#000', 0.02),
                      border: '1px solid',
                      borderColor: isDark ? alpha('#fff', 0.06) : alpha('#000', 0.06),
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        minWidth: 0,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {team.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                      {activeCamps > 0 && (
                        <Chip
                          label={`${activeCamps}C`}
                          size="small"
                          sx={{
                            height: 16,
                            fontSize: '0.58rem',
                            fontWeight: 700,
                            bgcolor: isDark ? alpha('#60A5FA', 0.15) : '#EFF6FF',
                            color: isDark ? '#93C5FD' : '#2563EB',
                          }}
                        />
                      )}
                      {tm.ftdTotal > 0 && (
                        <Chip
                          label={`${tm.ftdTotal}F`}
                          size="small"
                          sx={{
                            height: 16,
                            fontSize: '0.58rem',
                            fontWeight: 700,
                            bgcolor: isDark ? alpha('#34D399', 0.15) : '#ECFDF5',
                            color: isDark ? '#6EE7B7' : '#059669',
                          }}
                        />
                      )}
                      {tm.crAvg > 0 && (
                        <Chip
                          label={`${tm.crAvg.toFixed(1)}%`}
                          size="small"
                          sx={{
                            height: 16,
                            fontSize: '0.58rem',
                            fontWeight: 700,
                            bgcolor: isDark ? alpha('#FBBF24', 0.15) : '#FFFBEB',
                            color: isDark ? '#FCD34D' : '#D97706',
                          }}
                        />
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <EditableWrapper onClick={(e) => openEdit(e, partner, configs[0])}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 500,
                  lineHeight: 1.3,
                  fontSize: '0.8rem',
                  color: 'text.secondary',
                }}
              >
                {partner.team || 'No teams'}
              </Typography>
            </EditableWrapper>
          )}
        </Box>
      );
    }

    case 'trafficGeo': {
      const configs = getEditConfig('trafficGeo', partner);
      const trafficList = partner.trafficSources || [partner.trafficSource].filter(Boolean);
      const geoList = partner.geos || [partner.geo].filter(Boolean);
      return (
        <Box>
          <EditableWrapper onClick={(e) => openEdit(e, partner, configs[0])}>
            <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
              {trafficList.length > 0 ? trafficList.join(', ') : '-'}
            </Typography>
          </EditableWrapper>
          <EditableWrapper onClick={(e) => openEdit(e, partner, configs[1])}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {geoList.length > 0
                ? geoList.map((code) => `${COUNTRY_FLAGS[code] || '🏳️'} ${code}`).join(', ')
                : '-'}
            </Typography>
          </EditableWrapper>
        </Box>
      );
    }

    case 'contact': {
      const configs = getEditConfig('contact', partner);
      const telegramGroupLabel = partner.telegramGroup
        ? partner.telegramGroup.replace(/^https?:\/\//, '')
        : '-';
      return (
        <Box>
          <EditableWrapper onClick={(e) => openEdit(e, partner, configs[0])}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <AppIcon
                name="PersonOutline"
                fallback={PersonOutlineIcon}
                sx={{ fontSize: 14, color: 'text.secondary' }}
              />
              <Typography
                variant="body2"
                sx={{ fontWeight: 500, fontSize: '0.8rem', lineHeight: 1.3 }}
              >
                {partner.telegramNick || '-'}
              </Typography>
            </Box>
          </EditableWrapper>
          <EditableWrapper onClick={(e) => openEdit(e, partner, configs[1])}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <AppIcon
                name="Groups2Outlined"
                fallback={Groups2OutlinedIcon}
                sx={{ fontSize: 14, color: 'text.secondary' }}
              />
              <Typography
                variant="caption"
                sx={{
                  color: partner.telegramGroup ? 'primary.main' : 'text.secondary',
                  fontSize: '0.72rem',
                  lineHeight: 1.2,
                  wordBreak: 'break-all',
                }}
              >
                {telegramGroupLabel}
              </Typography>
            </Box>
          </EditableWrapper>
        </Box>
      );
    }

    case 'projects': {
      const allProjects = partner._projects || [];
      const teams = partner.teams || [];
      const statusColorMap = isDark
        ? { Active: '#4ADE80', Paused: '#FACC15', Completed: '#60A5FA', Archived: '#8B949E' }
        : { Active: '#059669', Paused: '#D97706', Completed: '#2563EB', Archived: '#64748B' };
      if (allProjects.length === 0) {
        return (
          <Typography variant="body2" sx={{ fontSize: '0.78rem', color: 'text.disabled' }}>
            No projects
          </Typography>
        );
      }
      const renderProjectChip = (proj) => {
        const c = statusColorMap[proj.status] || statusColorMap.Active;
        return (
          <Chip
            key={proj.id}
            icon={
              <AppIcon
                name="FolderOutlined"
                fallback={FolderOutlinedIcon}
                sx={{ fontSize: '13px !important' }}
              />
            }
            label={proj.name}
            size="small"
            clickable
            onClick={() => handlers.onOpenProject?.(proj.name)}
            sx={{
              height: 22,
              fontSize: '0.62rem',
              fontWeight: 600,
              maxWidth: 130,
              cursor: 'pointer',
              color: c,
              bgcolor: isDark ? alpha(c, 0.1) : alpha(c, 0.08),
              border: '1px solid',
              borderColor: isDark ? alpha(c, 0.2) : alpha(c, 0.15),
              transition: 'all 0.15s',
              '&:hover': { bgcolor: isDark ? alpha(c, 0.2) : alpha(c, 0.15) },
              '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
            }}
          />
        );
      };
      const unassigned = allProjects.filter((proj) => !proj.teamId);
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {teams.map((team) => {
            const teamProjects = team._projects || [];
            if (teamProjects.length === 0) return null;
            return (
              <Box key={team.id}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.62rem',
                    color: 'text.secondary',
                    lineHeight: 1.2,
                  }}
                >
                  {team.name}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.4, flexWrap: 'wrap', mt: 0.2 }}>
                  {teamProjects.map(renderProjectChip)}
                </Box>
              </Box>
            );
          })}
          {unassigned.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.4, flexWrap: 'wrap' }}>
              {unassigned.map(renderProjectChip)}
            </Box>
          )}
        </Box>
      );
    }

    case 'agreement': {
      const configs = getEditConfig('agreement', partner);
      return (
        <EditableWrapper onClick={(e) => openEdit(e, partner, configs[0])}>
          <Chip
            label={partner.agreement}
            size="small"
            sx={{
              height: 24,
              fontSize: '0.7rem',
              fontWeight: 600,
              bgcolor: agColors.bg,
              color: agColors.color,
            }}
          />
        </EditableWrapper>
      );
    }

    case 'funnelStatus': {
      const configs = getEditConfig('funnelStatus', partner);
      return (
        <EditableWrapper onClick={(e) => openEdit(e, partner, configs[0])}>
          <FunnelStatusBadge status={partner.funnelStatus} />
        </EditableWrapper>
      );
    }

    case 'campaigns': {
      const campColors = isDark
        ? partner.campaignsActive > 0
          ? { bg: alpha('#60A5FA', 0.2), color: '#93C5FD', hover: alpha('#60A5FA', 0.3) }
          : { bg: alpha('#94A3B8', 0.15), color: '#94A3B8', hover: alpha('#94A3B8', 0.25) }
        : partner.campaignsActive > 0
          ? { bg: '#DBEAFE', color: '#2563EB', hover: '#BFDBFE' }
          : { bg: '#F1F5F9', color: '#94A3B8', hover: '#E2E8F0' };
      return (
        <Chip
          label={`${partner.campaignsActive} Active`}
          size="small"
          clickable
          onClick={() => handlers.onOpenCampaigns(partner)}
          sx={{
            height: 24,
            fontSize: '0.72rem',
            fontWeight: 600,
            bgcolor: campColors.bg,
            color: campColors.color,
            cursor: 'pointer',
            '&:hover': { bgcolor: campColors.hover },
          }}
        />
      );
    }

    case 'clicks':
      return (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {safeMetrics.clicksTotal.toLocaleString()}
        </Typography>
      );

    case 'ftd': {
      const ftdBg = alpha(theme.palette.primary.main, isDark ? 0.12 : 0.08);
      const ftdHover = alpha(theme.palette.primary.main, isDark ? 0.2 : 0.12);
      return (
        <Box
          onClick={() => handlers.onOpenFtd(partner)}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 44,
            px: 1,
            py: 0.5,
            borderRadius: 1.5,
            bgcolor: ftdBg,
            cursor: 'pointer',
            transition: 'background-color 0.15s',
            '&:hover': { bgcolor: ftdHover },
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
            {Number(safeMetrics.ftdTotal).toLocaleString()}
          </Typography>
        </Box>
      );
    }

    case 'cr': {
      const crBg = alpha(theme.palette.primary.main, isDark ? 0.12 : 0.08);
      const crHover = alpha(theme.palette.primary.main, isDark ? 0.2 : 0.12);
      return (
        <Box
          onClick={() => handlers.onOpenCr(partner)}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 44,
            px: 1,
            py: 0.5,
            borderRadius: 1.5,
            bgcolor: crBg,
            cursor: 'pointer',
            transition: 'background-color 0.15s',
            '&:hover': { bgcolor: crHover },
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
            {formatPercent(safeMetrics.crAvg)}
          </Typography>
        </Box>
      );
    }

    case 'roiCac':
      return (
        <Box>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              lineHeight: 1.3,
              color:
                partner.roi > 0
                  ? 'success.main'
                  : partner.roi < 0
                    ? 'error.main'
                    : 'text.secondary',
            }}
          >
            {partner.roi > 0 ? '+' : ''}
            {formatPercent(partner.roi)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            CAC: {partner.cac > 0 ? formatCurrency(partner.cac) : '-'}
          </Typography>
        </Box>
      );

    case 'finance': {
      const financeHover = alpha(theme.palette.primary.main, 0.06);
      return (
        <Box
          onClick={() => handlers.onOpenFinance(partner)}
          sx={{
            cursor: 'pointer',
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 0.1,
            borderRadius: 1,
            px: 0.5,
            py: 0.25,
            transition: 'background-color 0.15s',
            '&:hover': { bgcolor: financeHover },
          }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            Total: {formatCurrency(safeMetrics.financeTotal)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
            Paid: {formatCurrency(safeMetrics.financePaid)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
            Debt: {formatCurrency(safeMetrics.financeDebt)}
          </Typography>
        </Box>
      );
    }

    default:
      return null;
  }
}
