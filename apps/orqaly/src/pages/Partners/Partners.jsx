import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Alert,
  Collapse,
  useTheme,
  Paper,
  alpha,
  Chip,
  Stack,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Tooltip,
  IconButton,
} from '@mui/material';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import InsightsIcon from '@mui/icons-material/Insights';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import AddIcon from '@mui/icons-material/Add';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import TimelineIcon from '@mui/icons-material/Timeline';
import PartnersToolbar from './components/PartnersToolbar';
import BentoCard from '../../components/Common/BentoCard';
import PageLayout from '../../components/Common/PageLayout';
import FormDialog from '../../components/Common/FormDialog';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import PartnersTable, { COLUMN_DEFS } from './components/PartnersTable';
import FunnelStatusBadge from './components/FunnelStatusBadge';
import CampaignsDrawer from './components/CampaignsDrawer';
import FtdDrawer from './components/FtdDrawer';
import CrDrawer from './components/CrDrawer';
import FinanceDrawer from './components/FinanceDrawer';
import TaskKanban from './components/TaskKanban';
import AddPartnerDialog from './components/AddPartnerDialog';
import UploadMaterialDialog from './components/UploadMaterialDialog';
import RecordingQuickDialog from './components/RecordingQuickDialog';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import EmptyState from '../../components/Common/EmptyState';
import { usePartners } from '../../hooks/usePartners';
import { useProjects } from '../../hooks/useProjects';
import { usePartnerAccessOptional } from '../../context/PartnerAccessContext';
import { debounce } from '../../utils/formatters';
import { useNotifications } from '../../context/NotificationContext';
import { formatMonthYear } from './utils/periodMetrics';
import { exportPartnersToCsv } from '../../utils/exportPartnersCsv';
import { logAction, loadAuditLogs } from '../../services/auditLogBackend';
import { logChange as logPartnerChange } from '../../services/partnerHistoryService';
import {
  FUNNEL_STATUSES,
  FUNNEL_STATUS_COLORS,
  FUNNEL_STATUS_COLORS_DARK,
  COUNTRY_FLAGS,
} from '../../utils/constants';

import AppIcon from '../../components/icons/AppIcon';

const STORAGE_KEY = 'orch_partner_columns';
const VIEW_MODE_KEY = 'orch_partners_view';
const DEFAULT_FILTERS = {
  group: 'All',
  team: 'All',
  trafficSource: 'All',
  geo: 'All',
  funnelStatus: 'All',
  agreement: 'All',
};

function loadColumnVisibility() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export default function Partners() {
  const navigate = useNavigate();
  const theme = useTheme();
  const {
    partners,
    loading,
    error,
    addPartner,
    updatePartner,
    updatePartnerTasks,
    archivePartner,
  } = usePartners();
  const { projects } = useProjects();
  const { pushNotification } = useNotifications();
  const partnerAccess = usePartnerAccessOptional();
  const isPartnerRole = partnerAccess?.isPartnerRole ?? false;
  const isDark = theme.palette.mode === 'dark';

  const [showMetrics, setShowMetrics] = useShowMetrics('partners');

  // Search & filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [period, setPeriod] = useState(formatMonthYear(new Date()));

  // Column visibility
  const [columnVisibility, setColumnVisibility] = useState(loadColumnVisibility);

  // View mode: card | list
  const [viewMode, setViewMode] = useState(() => {
    try {
      const v = localStorage.getItem(VIEW_MODE_KEY);
      return v === 'list' ? 'list' : 'card';
    } catch {
      return 'card';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {}
  }, [viewMode]);

  // Drawer / dialog state
  const [campaignsDrawer, setCampaignsDrawer] = useState({ open: false, partner: null });
  const [ftdDrawer, setFtdDrawer] = useState({ open: false, partner: null });
  const [crDrawer, setCrDrawer] = useState({ open: false, partner: null });
  const [financeDrawer, setFinanceDrawer] = useState({ open: false, partner: null });
  const [kanbanDialog, setKanbanDialog] = useState({ open: false, partner: null });
  const [addDialog, setAddDialog] = useState(false);
  const [uploadDialog, setUploadDialog] = useState({ open: false, partner: null });
  const [recordingDialog, setRecordingDialog] = useState({ open: false, partner: null });
  const [createSuccessPopup, setCreateSuccessPopup] = useState({ open: false, partnerName: '' });
  const createSuccessTimerRef = useRef(null);

  /* ---- Page Activity Log Dialog ---- */
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);

  const openActivityLog = useCallback(async () => {
    setActivityLogOpen(true);
    setActivityLogsLoading(true);
    try {
      const allLogs = await loadAuditLogs({ limit: 500 });
      const filtered = allLogs.filter((log) => log.entity === 'Partner');
      setActivityLogs(filtered);
    } catch (_) {
      setActivityLogs([]);
    } finally {
      setActivityLogsLoading(false);
    }
  }, []);

  const closeActivityLog = useCallback(() => {
    setActivityLogOpen(false);
    setActivityLogs([]);
  }, []);

  const formatLogDateTime = (ts) => {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  const getActionColor = (action) => {
    const a = (action || '').toLowerCase();
    if (a.includes('created') || a.includes('create') || a.includes('added') || a.includes('add'))
      return 'success';
    if (a.includes('deleted') || a.includes('delete')) return 'error';
    if (a.includes('updated') || a.includes('saved') || a.includes('save')) return 'info';
    if (a.includes('paused') || a.includes('disabled')) return 'warning';
    return 'default';
  };

  const getUserFromLog = (log) => {
    if (log.user && log.user !== '-') return log.user;
    return '-';
  };

  const getIpFromLog = (log) => {
    const s = log.detailsStructured;
    if (s?.network?.ip) return s.network.ip;
    return '-';
  };

  // Debounced search
  const debouncedSetSearch = useMemo(() => debounce((val) => setDebouncedSearch(val), 300), []);

  const handleSearchChange = useCallback(
    (val) => {
      setSearch(val);
      debouncedSetSearch(val);
    },
    [debouncedSetSearch]
  );

  // Persist column visibility
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columnVisibility));
  }, [columnVisibility]);

  useEffect(() => {
    return () => {
      if (createSuccessTimerRef.current) {
        window.clearTimeout(createSuccessTimerRef.current);
      }
    };
  }, []);

  const openCreateSuccessPopup = useCallback((partnerName) => {
    if (createSuccessTimerRef.current) {
      window.clearTimeout(createSuccessTimerRef.current);
    }
    setCreateSuccessPopup({ open: true, partnerName: partnerName || 'Partner' });
    createSuccessTimerRef.current = window.setTimeout(() => {
      setCreateSuccessPopup({ open: false, partnerName: '' });
      createSuccessTimerRef.current = null;
    }, 2000);
  }, []);

  // Filtered data
  const activePartners = useMemo(() => partners.filter((p) => !p.isArchived), [partners]);

  const filteredPartners = useMemo(() => {
    let result = activePartners;

    // Text search
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.userId.toLowerCase().includes(q) ||
          p.team.toLowerCase().includes(q) ||
          p.telegramNick.toLowerCase().includes(q)
      );
    }

    // Filters
    if (filters.group !== 'All') {
      result = result.filter((p) => p.group === filters.group);
    }
    if (filters.team !== 'All') {
      result = result.filter((p) => p.team === filters.team);
    }
    if (filters.trafficSource !== 'All') {
      result = result.filter((p) => p.trafficSource === filters.trafficSource);
    }
    if (filters.geo !== 'All') {
      result = result.filter((p) => p.geo === filters.geo);
    }
    if (filters.funnelStatus !== 'All') {
      result = result.filter((p) => p.funnelStatus === filters.funnelStatus);
    }
    if (filters.agreement !== 'All') {
      result = result.filter((p) => p.agreement === filters.agreement);
    }

    return result;
  }, [activePartners, debouncedSearch, filters]);

  const existingTeams = useMemo(
    () => [...new Set(activePartners.map((p) => p.team).filter(Boolean))].sort(),
    [activePartners]
  );

  const existingGeos = useMemo(
    () => [...new Set(activePartners.map((p) => p.geo).filter(Boolean))].sort(),
    [activePartners]
  );

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleColumnVisibilityChange = (colId, visible) => {
    setColumnVisibility((prev) => ({ ...prev, [colId]: visible }));
  };

  const handleResetControls = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setColumnVisibility({});
    setSearch('');
    setDebouncedSearch('');
    setPeriod(formatMonthYear(new Date()));
  };

  const fieldLabelMap = {
    team: 'Group & Team',
    group: 'Group & Team',
    groupSubtype: 'Group & Team',
    trafficSources: 'Traffic & Geo',
    trafficSource: 'Traffic & Geo',
    geos: 'Traffic & Geo',
    geo: 'Traffic & Geo',
    telegramNick: 'Contact',
    telegramGroup: 'Contact',
    agreement: 'Agreements',
    funnelStatus: 'Funnel Status',
    currentBalance: 'Finance',
    campaigns: 'Campaigns',
    campaignsActive: 'Campaigns',
    campaignsTotal: 'Campaigns',
    financeTransactions: 'Finance',
    finance: 'Finance',
  };

  const stringifyValue = (value) => {
    if (Array.isArray(value)) return value.join(', ');
    if (value && typeof value === 'object') return 'updated';
    return String(value);
  };

  // Handlers
  const handleAddPartner = async (data) => {
    const created = await addPartner(data);
    pushNotification('Partner', `changed to ${created.name}`);
    openCreateSuccessPopup(created?.name);
  };

  const handleSaveTasks = async (partnerId, tasks) => {
    await updatePartnerTasks(partnerId, tasks);
    pushNotification('Tasks', `changed to ${tasks.length} tasks`);
  };

  const handleEditPartner = useCallback(
    async (partnerId, updates) => {
      try {
        // Capture old values before the update for history diff
        const partner = partners.find((p) => p.id === partnerId);
        const oldValues = {};
        const primaryFields = [
          'geos',
          'trafficSources',
          'group',
          'team',
          'agreement',
          'funnelStatus',
          'telegramNick',
          'telegramGroup',
          'currentBalance',
          'description',
        ];
        // Only track the primary key for each composite update
        for (const key of Object.keys(updates)) {
          if (partner && primaryFields.includes(key)) {
            oldValues[key] = partner[key];
          }
        }

        await updatePartner(partnerId, updates);

        // Deduplicate notifications by topic - derived fields (geo, trafficSource,
        // groupSubtype) share a label with their primary field so we only notify once.
        const notified = new Set();
        const changedFields = Object.keys(updates);
        const ordered = [...changedFields].sort((a, b) => {
          const ai = primaryFields.indexOf(a);
          const bi = primaryFields.indexOf(b);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });
        ordered.forEach((field) => {
          const topic = fieldLabelMap[field] || field;
          if (notified.has(topic)) return;
          notified.add(topic);
          const value = stringifyValue(updates[field]);
          pushNotification(topic, `changed to ${value}`);
        });

        // Log change to partner history with before/after values (non-blocking)
        const newValues = {};
        for (const key of Object.keys(oldValues)) {
          newValues[key] = updates[key];
        }
        logPartnerChange(partnerId, oldValues, newValues, 'Updated partner details').catch(
          () => {}
        );
      } catch (err) {
        pushNotification('Partners', err?.message || 'Failed to save changes.', 'error');
      }
    },
    [partners, updatePartner, pushNotification]
  );

  const handleAddCampaign = useCallback(
    async (partnerId, newCampaignInput) => {
      const partner = partners.find((p) => p.id === partnerId);
      if (!partner) return;

      const newCampaign = {
        id: `C-${Math.floor(1000 + Math.random() * 9000)}`,
        status: 'Active',
        ftd: 0,
        cr: 0,
        spend: 0,
        revenue: 0,
        ...newCampaignInput,
      };

      const campaigns = [newCampaign, ...(partner.campaigns || [])];
      const campaignsActive = campaigns.filter((c) => c.status === 'Active').length;
      const campaignsTotal = campaigns.length;

      const updated = await updatePartner(partnerId, {
        campaigns,
        campaignsActive,
        campaignsTotal,
      });

      setCampaignsDrawer({ open: true, partner: updated });
      pushNotification('Campaigns', `changed to ${newCampaign.name}`);
    },
    [partners, updatePartner, pushNotification]
  );

  const handleCreateFinancePayment = useCallback(
    async (partnerId, paymentInput) => {
      const partner = partners.find((p) => p.id === partnerId);
      if (!partner) return;

      const existingTransactions = Array.isArray(partner.financeTransactions)
        ? partner.financeTransactions
        : [];

      const newPayment = {
        id: `${partner.id}-pay-${Date.now()}`,
        ...paymentInput,
      };

      const financeTransactions = [newPayment, ...existingTransactions];

      const paid = financeTransactions.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const total = paid;
      const debt = 0;

      const updated = await updatePartner(partnerId, {
        financeTransactions,
        finance: { total, paid, debt },
      });

      setFinanceDrawer({ open: true, partner: updated });
      pushNotification('Finance', `changed to ${paymentInput.description}`);
    },
    [partners, updatePartner, pushNotification]
  );

  const handleUploadMaterial = async (partnerId, material) => {
    const partner = partners.find((p) => p.id === partnerId);
    if (!partner) return;

    const newMaterial = {
      id: `M-${Math.floor(100 + Math.random() * 900)}`,
      name: material.name,
      type: material.type,
      uploadedAt: new Date().toISOString().split('T')[0],
      campaignId: material.campaignId,
      campaignName: material.campaignName,
    };

    const updatedMaterials = [newMaterial, ...(partner.materials || [])];
    await updatePartner(partnerId, { materials: updatedMaterials });
    pushNotification('Materials', `changed to ${material.campaignName}`);
  };

  const handleArchivePartner = useCallback(
    async (partner) => {
      if (!partner?.id) return;
      const ok = window.confirm(
        `Archive partner "${partner.name}"?\n\nThe account is moved to archive and related actions/history are preserved.`
      );
      if (!ok) return;
      await archivePartner(partner.id, 'Archived via Partners page delete button');
      pushNotification('Partner archived', `${partner.name} moved to archive.`);
    },
    [archivePartner, pushNotification]
  );

  if (loading) return <LoadingSpinner message="Loading partners..." />;

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Failed to load partners: {error}
      </Alert>
    );
  }

  const subtitle = `${activePartners.length} active · ${partners.length - activePartners.length} archived`;
  const filteredWorkingCount = filteredPartners.filter((p) => p.funnelStatus === 'Working').length;
  const filteredPartnersWithMeetings = filteredPartners.filter(
    (p) => (p.meetings || []).length > 0
  ).length;
  const filteredMeetingsCount = filteredPartners.reduce(
    (sum, p) => sum + (p.meetings || []).length,
    0
  );
  const filteredActiveCampaignPartners = filteredPartners.filter((p) => {
    if (typeof p.campaignsActive === 'number') return p.campaignsActive > 0;
    return (p.campaigns || []).some((c) => c.status === 'Active');
  }).length;
  const funnelColors =
    theme.palette.mode === 'dark' ? FUNNEL_STATUS_COLORS_DARK : FUNNEL_STATUS_COLORS;
  const funnelCounts = (() => {
    const counts = {};
    FUNNEL_STATUSES.forEach((status) => {
      counts[status] = 0;
    });
    activePartners.forEach((partner) => {
      const status = partner.funnelStatus || 'Contacted';
      if (counts[status] !== undefined) counts[status] += 1;
    });
    return counts;
  })();
  const partnerOverview = [
    {
      label: 'Total',
      value: activePartners.length,
      color: 'text.primary',
      bg: alpha(theme.palette.primary.main, 0.1),
    },
    ...FUNNEL_STATUSES.map((status) => ({
      label: status,
      value: funnelCounts[status] || 0,
      color: funnelColors[status]?.color || theme.palette.text.secondary,
      bg: alpha(funnelColors[status]?.color || theme.palette.text.secondary, 0.14),
    })),
  ];

  const statCards = [
    {
      label: 'Visible Partners',
      value: filteredPartners.length,
      helper: `${activePartners.length} active in system`,
      icon: Diversity3Icon,
      color: theme.palette.primary.main,
    },
    {
      label: 'Working Stage',
      value: filteredWorkingCount,
      helper: 'Partners currently in active funnel stage',
      icon: TrendingUpIcon,
      color: theme.palette.success.main,
    },
    {
      label: 'Planned / Recorded Meetings',
      value: filteredMeetingsCount,
      helper: `${filteredPartnersWithMeetings} partners with meetings`,
      icon: EventAvailableIcon,
      color: theme.palette.primary.main,
    },
    {
      label: 'Active Campaign Partners',
      value: filteredActiveCampaignPartners,
      helper: 'Partners running at least one active campaign',
      icon: InsightsIcon,
      color: theme.palette.warning.main,
    },
  ];

  return (
    <PageLayout title="Partners" subtitle={subtitle} showTitleBlock={false}>
      <BentoCard
        title="Partners"
        pageInfoPath="/partners"
        subtitle={
          showMetrics ? (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              {partnerOverview.map((item) => (
                <Chip
                  key={item.label}
                  label={`${item.label}: ${item.value}`}
                  size="small"
                  sx={{
                    height: 24,
                    borderRadius: 1.5,
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    bgcolor: item.bg,
                    color: item.color,
                    border: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.9),
                  }}
                />
              ))}
            </Stack>
          ) : null
        }
        icon={PeopleOutlinedIcon}
        iconColor={theme.palette.primary.main}
        noPadding
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
      >
        <Box sx={{ px: { xs: 1, sm: 1.25 }, pt: 1.25, pb: 1.25 }}>
          <Collapse in={showMetrics}>
            <Box
              sx={{
                mb: 2,
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  lg: 'repeat(4, minmax(0, 1fr))',
                },
              }}
            >
              {statCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Paper
                    key={card.label}
                    elevation={0}
                    sx={{
                      p: 1.5,
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: alpha(card.color, 0.22),
                      background: `linear-gradient(135deg, ${alpha(card.color, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 1,
                      }}
                    >
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', fontWeight: 600 }}
                        >
                          {card.label}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '1.35rem',
                            fontWeight: 800,
                            color: 'text.primary',
                            lineHeight: 1.15,
                            mt: 0.45,
                          }}
                        >
                          {card.value}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', display: 'block', mt: 0.35 }}
                        >
                          {card.helper}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: 2,
                          bgcolor: alpha(card.color, 0.16),
                          color: card.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <AppIcon fallback={Icon} sx={{ fontSize: 18 }} />
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          </Collapse>

          {/* Toolbar - Task Manager style */}
          <Box
            sx={{
              p: 1.5,
              mb: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap',
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <PartnersToolbar
              search={search}
              onSearchChange={handleSearchChange}
              filters={filters}
              onFilterChange={handleFilterChange}
              period={period}
              onPeriodChange={setPeriod}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={handleColumnVisibilityChange}
              allColumns={COLUMN_DEFS}
              onAddPartner={isPartnerRole ? undefined : () => setAddDialog(true)}
              onResetControls={handleResetControls}
              onExportCsv={async () => {
                const name = `partners-export-${formatMonthYear(new Date()).replace('/', '-')}.csv`;
                exportPartnersToCsv(filteredPartners, name);
                await logAction({
                  action: 'Export',
                  entity: 'Partners',
                  entityId: '-',
                  details: 'Partners CSV exported',
                });
              }}
              existingTeams={existingTeams}
              existingGeos={existingGeos}
              inline
            />

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
              <ToggleButton value="card" aria-label="Card view">
                <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 20 }} />
              </ToggleButton>
              <ToggleButton value="list" aria-label="List view">
                <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 20 }} />
              </ToggleButton>
            </ToggleButtonGroup>

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

            <Box sx={{ flex: 1 }} />

            {!isPartnerRole && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<AppIcon name="Add" fallback={AddIcon} />}
                onClick={() => setAddDialog(true)}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
              >
                Add
              </Button>
            )}
          </Box>

          {filteredPartners.length === 0 && (
            <EmptyState
              icon={PeopleOutlinedIcon}
              title={
                activePartners.length === 0
                  ? 'No active partners yet'
                  : 'No partners match your filters'
              }
              description={
                activePartners.length === 0
                  ? isPartnerRole
                    ? 'No partner linked to your account.'
                    : 'Add your first partner to get started.'
                  : 'Try adjusting your search or filters.'
              }
              actionLabel={
                activePartners.length === 0 && !isPartnerRole ? 'Add Partner' : 'Clear filters'
              }
              onAction={
                activePartners.length === 0 && !isPartnerRole
                  ? () => setAddDialog(true)
                  : handleResetControls
              }
            />
          )}
          {filteredPartners.length > 0 && (
            <>
              <Paper
                elevation={0}
                sx={{
                  p: { xs: 1.1, sm: 1.25 },
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: alpha(theme.palette.background.paper, 0.98),
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                    mb: 1.5,
                    flexWrap: 'wrap',
                  }}
                >
                  <Typography
                    variant="overline"
                    sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em' }}
                  >
                    Partner list
                  </Typography>
                </Box>

                {viewMode === 'card' ? (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        sm: 'repeat(2, 1fr)',
                        lg: 'repeat(3, 1fr)',
                      },
                      gap: 1.5,
                    }}
                  >
                    {filteredPartners.map((partner) => {
                      const trafficList =
                        partner.trafficSources || [partner.trafficSource].filter(Boolean);
                      const geoList = partner.geos || [partner.geo].filter(Boolean);
                      const trafficStr = trafficList.length > 0 ? trafficList.join(', ') : '-';
                      const geoStr =
                        geoList.length > 0
                          ? geoList
                              .map((code) => `${COUNTRY_FLAGS[code] || '🏳️'} ${code}`)
                              .join(', ')
                          : '-';
                      return (
                        <Paper
                          key={partner.id}
                          elevation={0}
                          onClick={() => navigate(`/partners/${partner.id}`)}
                          sx={{
                            p: 1.5,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                            bgcolor: theme.palette.background.paper,
                            cursor: 'pointer',
                            transition: 'border-color 0.2s, box-shadow 0.2s',
                            '&:hover': {
                              borderColor: theme.palette.primary.main,
                              boxShadow: createHoverGlowShadow(theme),
                            },
                          }}
                        >
                          <Typography
                            variant="subtitle1"
                            sx={{ fontWeight: 700, mb: 1, lineHeight: 1.3 }}
                          >
                            {partner.name}
                          </Typography>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: 'text.secondary',
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                }}
                              >
                                Team
                              </Typography>
                              <Typography variant="body2" sx={{ mt: 0.25 }}>
                                {partner.team || '-'}
                              </Typography>
                            </Box>
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: 'text.secondary',
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                }}
                              >
                                Traffic & Geo
                              </Typography>
                              <Typography variant="body2" sx={{ mt: 0.25 }}>
                                {trafficStr}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{ color: 'text.secondary', display: 'block' }}
                              >
                                {geoStr}
                              </Typography>
                            </Box>
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: 'text.secondary',
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                  display: 'block',
                                  mb: 0.5,
                                }}
                              >
                                Funnel
                              </Typography>
                              <FunnelStatusBadge status={partner.funnelStatus} />
                            </Box>
                          </Box>
                        </Paper>
                      );
                    })}
                  </Box>
                ) : (
                  <PartnersTable
                    partners={filteredPartners}
                    projects={projects}
                    period={period}
                    columnVisibility={columnVisibility}
                    onOpenCampaigns={(p) => setCampaignsDrawer({ open: true, partner: p })}
                    onOpenFtd={(p) => setFtdDrawer({ open: true, partner: p })}
                    onOpenCr={(p) => setCrDrawer({ open: true, partner: p })}
                    onOpenFinance={(p) => setFinanceDrawer({ open: true, partner: p })}
                    onOpenKanban={
                      isPartnerRole ? undefined : (p) => setKanbanDialog({ open: true, partner: p })
                    }
                    onViewStats={(p) => navigate(`/partners/${p.id}`)}
                    onUploadMaterial={
                      isPartnerRole ? undefined : (p) => setUploadDialog({ open: true, partner: p })
                    }
                    onEditPartner={isPartnerRole ? undefined : handleEditPartner}
                    onArchivePartner={isPartnerRole ? undefined : handleArchivePartner}
                    onStartRecording={
                      isPartnerRole
                        ? undefined
                        : (p) => setRecordingDialog({ open: true, partner: p })
                    }
                    onViewMeetings={(p) => navigate(`/partners/${p.id}#meetings`)}
                  />
                )}
              </Paper>
            </>
          )}
        </Box>
      </BentoCard>
      {/* Drawers */}
      <CampaignsDrawer
        open={campaignsDrawer.open}
        onClose={() => setCampaignsDrawer({ open: false, partner: null })}
        partner={campaignsDrawer.partner}
        onAddCampaign={handleAddCampaign}
      />
      <FtdDrawer
        open={ftdDrawer.open}
        onClose={() => setFtdDrawer({ open: false, partner: null })}
        partner={ftdDrawer.partner}
      />
      <CrDrawer
        open={crDrawer.open}
        onClose={() => setCrDrawer({ open: false, partner: null })}
        partner={crDrawer.partner}
      />
      <FinanceDrawer
        open={financeDrawer.open}
        onClose={() => setFinanceDrawer({ open: false, partner: null })}
        partner={financeDrawer.partner}
        onCreatePayment={handleCreateFinancePayment}
      />
      {/* Kanban */}
      {kanbanDialog.open && (
        <TaskKanban
          open={kanbanDialog.open}
          onClose={() => setKanbanDialog({ open: false, partner: null })}
          partner={kanbanDialog.partner}
          onSaveTasks={handleSaveTasks}
        />
      )}
      {/* Add Partner Dialog */}
      <AddPartnerDialog
        open={addDialog}
        onClose={() => setAddDialog(false)}
        onSubmit={handleAddPartner}
        existingTeams={existingTeams}
      />
      {/* Upload Material Dialog */}
      <UploadMaterialDialog
        open={uploadDialog.open}
        onClose={() => setUploadDialog({ open: false, partner: null })}
        partner={uploadDialog.partner}
        onUpload={handleUploadMaterial}
      />
      {/* Recording Dialog */}
      <RecordingQuickDialog
        open={recordingDialog.open}
        partner={recordingDialog.partner}
        onClose={() => setRecordingDialog({ open: false, partner: null })}
      />
      <FormDialog
        open={createSuccessPopup.open}
        onClose={() => setCreateSuccessPopup({ open: false, partnerName: '' })}
        title="Congratulations!"
        subtitle={`Partner ${createSuccessPopup.partnerName} created successfully.`}
        icon={CheckCircleRoundedIcon}
        iconVariant="success"
        maxWidth="xs"
        hideFooter
        paperSx={{ textAlign: 'center' }}
        contentSx={{ textAlign: 'center', py: 1.5 }}
      >
        <AppIcon
          name="CheckCircleRounded"
          fallback={CheckCircleRoundedIcon}
          sx={{ fontSize: 44, color: 'success.main', mb: 1 }}
        />
      </FormDialog>
      {/* ===== Activity Log Dialog ===== */}
      <FormDialog
        open={activityLogOpen}
        onClose={closeActivityLog}
        title="Partners Activity"
        subtitle="Partner action history"
        icon={HistoryIcon}
        maxWidth="md"
        paperSx={{ maxHeight: '80vh' }}
        contentDividers={false}
        contentSx={{ p: 0 }}
        actions={
          <>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ flex: 1 }}
            >{`${activityLogs.length} log entr${activityLogs.length !== 1 ? 'ies' : 'y'}`}</Typography>
            <Button
              onClick={closeActivityLog}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
            >
              Close
            </Button>
          </>
        }
        footerJustify="flex-start"
      >
        <Tabs
          value={0}
          sx={{
            px: 3,
            minHeight: 40,
            borderBottom: '1px solid',
            borderColor: 'divider',
            '& .MuiTab-root': {
              minHeight: 40,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.82rem',
            },
          }}
        >
          <Tab
            icon={<AppIcon name="History" fallback={HistoryIcon} sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label={`Action Log (${activityLogs.length})`}
          />
        </Tabs>
        {activityLogsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              Loading...
            </Typography>
          </Box>
        ) : activityLogs.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, px: 3 }}>
            <AppIcon
              name="History"
              fallback={HistoryIcon}
              sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }}
            />
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5, fontSize: '0.95rem' }}>
              No actions recorded yet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Actions like adding, editing, and deleting partners will appear here.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 480 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {['Action', 'User', 'IP Address', 'Date & Time', 'Details'].map((h) => (
                    <TableCell
                      key={h}
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.68rem',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        bgcolor: isDark ? alpha(theme.palette.background.paper, 0.95) : 'grey.50',
                        borderBottom: '2px solid',
                        borderColor: 'divider',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {activityLogs.map((log) => (
                  <TableRow key={log.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell sx={{ py: 1.25 }}>
                      <Chip
                        label={log.action}
                        size="small"
                        color={getActionColor(log.action)}
                        sx={{ fontWeight: 700, fontSize: '0.68rem', borderRadius: 1.5, height: 24 }}
                      />
                    </TableCell>
                    <TableCell sx={{ py: 1.25 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 500 }}>
                        {getUserFromLog(log)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.25 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.78rem',
                          fontFamily: 'monospace',
                          color: 'text.secondary',
                        }}
                      >
                        {getIpFromLog(log)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.25, whiteSpace: 'nowrap' }}>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.78rem', color: 'text.secondary' }}
                      >
                        {formatLogDateTime(log.timestamp)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.25 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.78rem',
                          color: 'text.primary',
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {log.details || '-'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </FormDialog>
    </PageLayout>
  );
}
