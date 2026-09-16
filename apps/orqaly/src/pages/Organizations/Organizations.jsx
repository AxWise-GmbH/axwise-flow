/**
 * Organizations - Create holding structures, subsidiaries, and multi-company setups.
 */
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  IconButton,
  TextField,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  ToggleButtonGroup,
  ToggleButton,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  CircularProgress,
  Collapse,
  Tabs,
  Tab,
  alpha,
  useTheme,
  useMediaQuery,
  Snackbar,
  Alert,
  Divider,
  Tooltip,
} from '@mui/material';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import HistoryIcon from '@mui/icons-material/History';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import LinkIcon from '@mui/icons-material/Link';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import PageLayout from '../../components/Common/PageLayout';
import FormDialog from '../../components/Common/FormDialog';
import Pagination from '../../components/Common/Pagination';
import usePagination from '../../hooks/usePagination';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import PillTabStrip from '../../components/Common/PillTabStrip';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import {
  listOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  getOrgFinances,
} from '../../services/organizationService';
import { formatCurrency } from '../../utils/formatters';
import { useConcilium } from '../../hooks/useConcilium';
import { getOrgTeamMap, setOrgTeams } from '../../services/orgTeamService';
import OrgVaultDialog from '../../components/Organizations/OrgVaultDialog';
import { getOrgVaultMap } from '../../services/orgVaultService';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { getOrgAgentMap, setOrgAgents } from '../../services/orgAgentService';
import { getAllTeams } from '../../services/conciliumTeamsService';
import { getAllTeams as getJobPoolTeams } from '../../services/teamService';
import { getAgents } from '../../services/agentHubService';
import OrgAssignDialog from '../../components/Organizations/OrgAssignDialog';
import AgentDetailDialog from '../../components/AgentHub/AgentDetailDialog';
import OrgArchitectureDialog from '../../components/Organizations/OrgArchitectureDialog';
import OrgDetailDrawer from '../../components/Organizations/OrgDetailDrawer';
import SimpleOrganizations from './SimpleOrganizations';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { useAuth } from '../../context/AuthContext';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';

import AppIcon from '../../components/icons/AppIcon';

// Lazy so @xyflow/react stays out of the initial Organizations bundle.
const ConsiliumTopologyView = lazy(
  () => import('../../components/Concilium/graph/ConsiliumTopologyView')
);

const ORG_TYPES = [
  { value: 'virtual', label: 'Virtual', color: '#6366F1' },
  { value: 'holding', label: 'Holding', color: '#7C3AED' },
  { value: 'subsidiary', label: 'Subsidiary', color: '#2563EB' },
  { value: 'division', label: 'Division', color: '#059669' },
  { value: 'department', label: 'Department', color: '#D97706' },
];

const INDUSTRIES = [
  'Technology',
  'Finance',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Real Estate',
  'Education',
  'Logistics',
  'Energy',
  'Media',
  'Consulting',
  'Legal',
  'Agriculture',
  'Hospitality',
  'Other',
];

const ROWS_PER_PAGE = [10, 25, 50];

function getTypeColor(type) {
  return ORG_TYPES.find((t) => t.value === type)?.color || '#888';
}
function getTypeLabel(type) {
  return ORG_TYPES.find((t) => t.value === type)?.label || type;
}

const LEGAL_FORMS = [
  'LLC',
  'Corp',
  'Inc',
  'Ltd',
  'GmbH',
  'SA',
  'AG',
  'SRL',
  'PLC',
  'LLP',
  'Sole Proprietorship',
  'Partnership',
  'Non-Profit',
  'Other',
];

const COUNTRIES = [
  'United States',
  'United Kingdom',
  'Germany',
  'France',
  'Netherlands',
  'Switzerland',
  'Canada',
  'Australia',
  'Japan',
  'Singapore',
  'UAE',
  'Ireland',
  'Luxembourg',
  'Sweden',
  'Denmark',
  'Norway',
  'Finland',
  'Belgium',
  'Austria',
  'Spain',
  'Italy',
  'Portugal',
  'Poland',
  'Czech Republic',
  'Romania',
  'Bulgaria',
  'Estonia',
  'Latvia',
  'Lithuania',
  'Israel',
  'India',
  'Brazil',
  'Mexico',
  'South Korea',
  'China',
  'Hong Kong',
  'New Zealand',
  'South Africa',
  'Other',
];

const KYB_STATUS_MAP = {
  draft: { label: 'Draft', color: '#888' },
  pending: { label: 'Pending', color: '#D97706' },
  verified: { label: 'Verified', color: '#059669' },
  rejected: { label: 'Rejected', color: '#DC2626' },
};

const EMPTY_FORM = {
  name: '',
  description: '',
  industry: '',
  org_type: 'virtual',
  parent_id: '',
  website: '',
  consilium_id: '',
  // KYB Basic
  kyb_level: 'basic',
  legal_name: '',
  registration_number: '',
  country: '',
  legal_form: '',
  contact_email: '',
  contact_phone: '',
  // KYB Full
  tax_id: '',
  incorporation_date: '',
  registered_address: { street: '', city: '', state: '', zip: '', country: '' },
  directors: [],
  ubos: [],
  bank_details: { bank_name: '', iban: '', swift: '', account_holder: '' },
  industry_codes: { sic: '', naics: '', nace: '' },
  kyb_status: 'draft',
  kyb_notes: '',
};

export default function Organizations() {
  const { simpleMode } = useSimpleMode();
  if (simpleMode) return <SimpleOrganizations />;
  return <AdvancedOrganizations />;
}

function AdvancedOrganizations() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useAuth();

  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('orch_orgs_view') || 'list';
    } catch {
      return 'list';
    }
  });
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [showMetrics, setShowMetrics] = useShowMetrics('organizations');

  // Sorting
  const [orderBy, setOrderBy] = useState('created_at');
  const [order, setOrder] = useState('desc');

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [dialogTab, setDialogTab] = useState(0); // 0=basic, 1=full

  // Toast
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  // Org assignments (team / agent maps)
  const [orgTeamMap, setOrgTeamMap] = useState({});
  const [orgAgentMap, setOrgAgentMap] = useState({});
  const [allTeams, setAllTeams] = useState([]);
  const [allAgents, setAllAgents] = useState([]);

  // Assign dialog
  const [vaultDialog, setVaultDialog] = useState({ open: false, orgId: null, orgName: '' });
  const [orgVaultMap, setOrgVaultMap] = useState({});
  const [assignDialog, setAssignDialog] = useState({
    open: false,
    orgId: '',
    orgName: '',
    mode: 'team',
  });

  // Agent detail dialog
  const [agentDetailDialog, setAgentDetailDialog] = useState({ open: false, agent: null });

  // Architecture dialog
  const [archDialog, setArchDialog] = useState({ open: false, org: null });

  // Detail drawer
  const [detailDrawer, setDetailDrawer] = useState({ open: false, org: null });

  // Financial data per org
  const [orgFinances, setOrgFinances] = useState({});

  // Consilium boards
  const { concilium } = useConcilium();

  /* ── Load ────────────────────────────────────────────────────────────── */
  const loadOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listOrganizations();
      const list = Array.isArray(data) ? data : [];
      setOrgs(list);
      // Load team/agent maps and metadata in parallel
      const ids = list.map((o) => o.id);
      const [teamMap, agentMap, govTeams, jobTeams, finData, vaultMap] = await Promise.all([
        getOrgTeamMap(ids),
        getOrgAgentMap(ids),
        getAllTeams().catch(() => []),
        getJobPoolTeams().catch(() => []),
        getOrgFinances().catch(() => ({})),
        getOrgVaultMap(ids).catch(() => ({})),
      ]);
      setOrgTeamMap(teamMap);
      setOrgAgentMap(agentMap);
      setOrgVaultMap(vaultMap || {});
      setOrgFinances(finData || {});
      const seen = new Set();
      const mergedTeams = [...govTeams, ...jobTeams].filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
      setAllTeams(mergedTeams);
      setAllAgents(getAgents());
    } catch {
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  // Deep-link from the Home "Units" tile: auto-open the org's detail drawer once.
  const [orgSearchParams] = useSearchParams();
  const orgDeepLinkedRef = useRef(false);
  useEffect(() => {
    if (orgDeepLinkedRef.current) return;
    const orgId = orgSearchParams.get('org');
    if (!orgId || orgs.length === 0) return;
    const org = orgs.find((o) => o.id === orgId);
    if (org) {
      setDetailDrawer({ open: true, org });
      orgDeepLinkedRef.current = true;
    }
  }, [orgSearchParams, orgs]);

  /* ── Filter & sort ──────────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = orgs;
    // Pill tab filter
    if (activeTab === 'active') list = list.filter((o) => o.is_active !== false);
    else if (activeTab === 'holding') list = list.filter((o) => o.org_type === 'holding');
    else if (activeTab === 'subsidiary') list = list.filter((o) => o.org_type === 'subsidiary');
    else if (activeTab === 'department')
      list = list.filter((o) => o.org_type === 'department' || o.org_type === 'division');
    // Search + type filter
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          (o.description || '').toLowerCase().includes(q) ||
          (o.industry || '').toLowerCase().includes(q)
      );
    }
    if (typeFilter) list = list.filter((o) => o.org_type === typeFilter);
    return list;
  }, [orgs, search, typeFilter, activeTab]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[orderBy] || '';
      const bVal = b[orderBy] || '';
      return order === 'asc' ? (aVal > bVal ? 1 : -1) : aVal < bVal ? 1 : -1;
    });
  }, [filtered, orderBy, order]);

  const pagination = usePagination(sorted, {
    surfaceId: `orgs.${activeTab}`,
    defaultRowsPerPage: ROWS_PER_PAGE[0],
    resetOn: [activeTab, search, typeFilter, orderBy, order],
  });
  const paginated = pagination.paginatedData;

  const handleSort = (col) => {
    setOrder(orderBy === col && order === 'asc' ? 'desc' : 'asc');
    setOrderBy(col);
  };

  /* ── Metrics ────────────────────────────────────────────────────────── */
  const formatCompact = (v) => {
    if (v == null || v === 0) return '$0';
    const abs = Math.abs(v);
    if (abs >= 1000) return `${v < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
    return `${v < 0 ? '-' : ''}$${abs.toFixed(0)}`;
  };

  const finTotals = useMemo(() => {
    let invested = 0,
      returned = 0,
      netProfit = 0;
    for (const f of Object.values(orgFinances)) {
      invested += f.invested || 0;
      returned += f.returned || 0;
    }
    netProfit = returned - invested;
    const roi = invested > 0 ? Number((((returned - invested) / invested) * 100).toFixed(1)) : 0;
    return { invested, returned, netProfit, roi };
  }, [orgFinances]);

  const metrics = useMemo(() => {
    const active = orgs.filter((o) => o.is_active).length;
    return [
      {
        label: 'Total',
        value: orgs.length,
        color: theme.palette.primary.main,
        icon: CorporateFareOutlinedIcon,
      },
      { label: 'Active', value: active, color: '#059669', icon: CheckCircleOutlineIcon },
      {
        label: 'Invested',
        value: formatCompact(finTotals.invested),
        color: '#F59E0B',
        icon: AttachMoneyIcon,
      },
      {
        label: 'Returned',
        value: formatCompact(finTotals.returned),
        color: '#10B981',
        icon: TrendingUpIcon,
      },
      {
        label: 'ROI',
        value: `${finTotals.roi > 0 ? '+' : ''}${finTotals.roi}%`,
        color: finTotals.roi >= 0 ? '#8B5CF6' : '#EF4444',
        icon: TimelineOutlinedIcon,
      },
      {
        label: 'Net Profit',
        value: formatCompact(finTotals.netProfit),
        color: finTotals.netProfit >= 0 ? '#059669' : '#EF4444',
        icon: AccountBalanceOutlinedIcon,
      },
    ];
  }, [orgs, theme, finTotals]);

  /* ── CRUD ────────────────────────────────────────────────────────────── */
  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setDialogTab(0);
    setDialogOpen(true);
  };
  const openEdit = (org) => {
    setEditId(org.id);
    setForm({
      name: org.name || '',
      description: org.description || '',
      industry: org.industry || '',
      org_type: org.org_type || 'holding',
      parent_id: org.parent_id || '',
      website: org.website || '',
      consilium_id: org.consilium_id || '',
      kyb_level: org.kyb_level || 'basic',
      legal_name: org.legal_name || '',
      registration_number: org.registration_number || '',
      country: org.country || '',
      legal_form: org.legal_form || '',
      contact_email: org.contact_email || '',
      contact_phone: org.contact_phone || '',
      tax_id: org.tax_id || '',
      incorporation_date: org.incorporation_date || '',
      registered_address: org.registered_address || {
        street: '',
        city: '',
        state: '',
        zip: '',
        country: '',
      },
      directors: org.directors || [],
      ubos: org.ubos || [],
      bank_details: org.bank_details || { bank_name: '', iban: '', swift: '', account_holder: '' },
      industry_codes: org.industry_codes || { sic: '', naics: '', nace: '' },
      kyb_status: org.kyb_status || 'draft',
      kyb_notes: org.kyb_notes || '',
    });
    setDialogTab(org.kyb_level === 'full' ? 1 : 0);
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setEditId(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await updateOrganization(editId, form);
        setToast({ open: true, message: 'Organization updated', severity: 'success' });
      } else {
        await createOrganization(form);
        setToast({ open: true, message: 'Organization created', severity: 'success' });
      }
      closeDialog();
      await loadOrgs();
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteOrganization(deleteConfirm.id);
      setToast({ open: true, message: 'Organization deleted', severity: 'success' });
      setDeleteConfirm(null);
      await loadOrgs();
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };

  const handleSaveAssignment = useCallback(
    async (selectedIds) => {
      const { orgId, mode } = assignDialog;
      if (mode === 'team') {
        await setOrgTeams(orgId, selectedIds);
        setOrgTeamMap((prev) => ({ ...prev, [orgId]: selectedIds }));
      } else if (mode === 'agent') {
        await setOrgAgents(orgId, selectedIds);
        setOrgAgentMap((prev) => ({ ...prev, [orgId]: selectedIds }));
      } else if (mode === 'parent') {
        const parentId = selectedIds[0] || null;
        await updateOrganization(orgId, { parent_id: parentId });
        setOrgs((prev) => prev.map((o) => (o.id === orgId ? { ...o, parent_id: parentId } : o)));
      } else if (mode === 'consilium') {
        const consiliumId = selectedIds[0] || null;
        await updateOrganization(orgId, { consilium_id: consiliumId });
        setOrgs((prev) =>
          prev.map((o) => (o.id === orgId ? { ...o, consilium_id: consiliumId } : o))
        );
      }
    },
    [assignDialog]
  );

  // Vault cell: a briefing exists, or an invitation to write one.
  const orgVaultLabel = (id) => (orgVaultMap[id]?.hasBriefing ? 'Briefed' : '+ Add');

  const getConsiliumName = (id) => {
    if (!id) return null;
    const board = (concilium || []).find((c) => c.id === id);
    return board?.name || id;
  };

  const getParentName = (id) => {
    if (!id) return null;
    const parent = orgs.find((o) => o.id === id);
    return parent?.name || null;
  };

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <PageLayout showTitleBlock={false}>
      <BentoCard
        title="Organizations"
        explain
        noTour
        subtitle={showMetrics ? `${orgs.length} organizations` : undefined}
        icon={CorporateFareOutlinedIcon}
        iconColor={theme.palette.primary.main}
        noPadding
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
        pageInfoPath="/organizations"
      >
        {/* ── Metrics ──────────────────────────────────────── */}
        <Collapse in={showMetrics}>
          <Box
            data-tour-block="org-metrics"
            data-tour-label="Overview stats"
            sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}
          >
            <Box
              sx={{
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: {
                  xs: 'repeat(2, minmax(0, 1fr))',
                  sm: 'repeat(3, minmax(0, 1fr))',
                  md: 'repeat(6, minmax(0, 1fr))',
                },
              }}
            >
              {metrics.map((m) => {
                const Icon = m.icon;
                return (
                  <Paper
                    key={m.label}
                    elevation={0}
                    sx={{
                      p: 1.5,
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: alpha(m.color, 0.22),
                      background: `linear-gradient(135deg, ${alpha(m.color, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
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
                          {m.label}
                        </Typography>
                        <Typography
                          sx={{ fontSize: '1.35rem', fontWeight: 800, lineHeight: 1.15, mt: 0.45 }}
                        >
                          {m.value}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: 2,
                          bgcolor: alpha(m.color, 0.16),
                          color: m.color,
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
          </Box>
        </Collapse>

        {/* ── Pill Tabs ──────────────────────────────────── */}
        <PillTabStrip data-tour-block="org-tabs" data-tour-label="Type filter">
          {[
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Active' },
            { id: 'holding', label: 'Holdings' },
            { id: 'subsidiary', label: 'Subsidiaries' },
            { id: 'department', label: 'Departments' },
          ].map((t) => (
            <Button
              key={t.id}
              onClick={() => {
                setActiveTab(t.id);
              }}
              sx={{
                borderRadius: 2.5,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: { xs: '0.75rem', sm: '0.85rem' },
                px: { xs: 1.25, sm: 2 },
                minHeight: 36,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.2s',
                bgcolor:
                  activeTab === t.id ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                color: activeTab === t.id ? 'primary.main' : 'text.secondary',
                boxShadow:
                  activeTab === t.id
                    ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}`
                    : 'none',
                '&:hover': {
                  bgcolor:
                    activeTab === t.id
                      ? alpha(theme.palette.primary.main, 0.15)
                      : alpha(theme.palette.text.primary, 0.05),
                },
              }}
            >
              {t.label}
            </Button>
          ))}
        </PillTabStrip>

        {/* ── Toolbar (below tabs) ────────────────────────── */}
        <Box
          data-tour-block="org-toolbar"
          data-tour-label="Controls"
          sx={{ display: 'flex', alignItems: 'center', px: 1.5, pt: 1, pb: 0, gap: 1 }}
        >
          {/* Filter icon */}
          <Tooltip title="Toggle filters">
            <IconButton
              onClick={() => setShowFilters((v) => !v)}
              size="small"
              sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: showFilters || search || typeFilter ? 'primary.main' : 'divider',
                borderRadius: 2,
                flexShrink: 0,
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  borderColor: 'primary.main',
                },
              }}
            >
              <AppIcon
                name="TuneRounded"
                fallback={TuneRoundedIcon}
                sx={{
                  fontSize: 18,
                  color: showFilters || search || typeFilter ? 'primary.main' : 'text.secondary',
                }}
              />
              {(search || typeFilter) && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 8,
                    height: 8,
                    bgcolor: 'error.main',
                    borderRadius: '50%',
                  }}
                />
              )}
            </IconButton>
          </Tooltip>

          {/* View toggle */}
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            size="small"
            onChange={(_, v) => {
              if (v) {
                setViewMode(v);
                try {
                  localStorage.setItem('orch_orgs_view', v);
                } catch {}
              }
            }}
            sx={{
              flexShrink: 0,
              '& .MuiToggleButton-root': {
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  borderColor: 'primary.main',
                },
                '&.Mui-selected': {
                  bgcolor: alpha(theme.palette.primary.main, 0.15),
                  color: 'primary.main',
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.22) },
                },
              },
            }}
          >
            <ToggleButton value="card" sx={{ borderRadius: '8px 0 0 8px' }}>
              <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 18 }} />
            </ToggleButton>
            <ToggleButton value="list">
              <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 18 }} />
            </ToggleButton>
            <ToggleButton
              value="graph"
              sx={{ borderRadius: '0 8px 8px 0' }}
              aria-label="Graph view"
            >
              <AppIcon
                name="AccountTree"
                fallback={AccountTreeOutlinedIcon}
                sx={{ fontSize: 18 }}
              />
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Activity log */}
          <Tooltip title="Activity log">
            <IconButton
              size="small"
              sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                flexShrink: 0,
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  borderColor: 'primary.main',
                },
              }}
            >
              <AppIcon
                name="History"
                fallback={HistoryIcon}
                sx={{ fontSize: 18, color: 'text.secondary' }}
              />
            </IconButton>
          </Tooltip>

          <Box sx={{ flex: 1 }} />

          {/* New Organization */}
          <Tooltip title="Add new organization">
            <IconButton
              onClick={openCreate}
              sx={{
                bgcolor: 'background.paper',
                border: '2px solid',
                borderColor: alpha(theme.palette.primary.main, 0.5),
                borderRadius: 2,
                color: 'primary.main',
                flexShrink: 0,
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  borderColor: 'primary.main',
                },
              }}
            >
              <AppIcon
                name="AddCircleOutline"
                fallback={AddCircleOutlineIcon}
                sx={{ fontSize: 20 }}
              />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Divider */}
        <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', mt: 1.5 }} />

        {/* Filters (collapsible) */}
        <Collapse in={showFilters}>
          <Box
            sx={{ display: 'flex', gap: 1, px: 1.5, py: 1, flexWrap: 'wrap', alignItems: 'center' }}
          >
            <TextField
              size="small"
              placeholder="Search organizations..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <AppIcon name="Search" fallback={SearchIcon} fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ minWidth: 200, flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Type</InputLabel>
              <Select
                value={typeFilter}
                label="Type"
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                }}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">All Types</MenuItem>
                {ORG_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Collapse>

        {/* ── Loading ──────────────────────────────────────── */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        )}

        {/* ── Empty ────────────────────────────────────────── */}
        {!loading && viewMode !== 'graph' && filtered.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <AppIcon
              name="CorporateFareOutlined"
              fallback={CorporateFareOutlinedIcon}
              sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
            />
            <Typography color="text.secondary">
              No organizations found. Create your first organization to get started.
            </Typography>
          </Box>
        )}

        {/* ── Table View ───────────────────────────────────── */}
        {!loading && viewMode === 'list' && filtered.length > 0 && (
          <Box data-tour-block="org-content" data-tour-label="Your organizations">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === 'name'}
                        direction={orderBy === 'name' ? order : 'asc'}
                        onClick={() => handleSort('name')}
                      >
                        Name
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === 'industry'}
                        direction={orderBy === 'industry' ? order : 'asc'}
                        onClick={() => handleSort('industry')}
                      >
                        Industry
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Invested</TableCell>
                    <TableCell>Returned</TableCell>
                    <TableCell>Net Profit</TableCell>
                    <TableCell>ROI</TableCell>
                    <TableCell>Consilium</TableCell>
                    <TableCell>Teams</TableCell>
                    <TableCell>Agents</TableCell>
                    <TableCell>Vault</TableCell>
                    <TableCell>Activity</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === 'created_at'}
                        direction={orderBy === 'created_at' ? order : 'asc'}
                        onClick={() => handleSort('created_at')}
                      >
                        Created
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginated.map((org) => (
                    <TableRow key={org.id} hover>
                      <TableCell>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            cursor: 'pointer',
                            '&:hover .org-name': { color: 'primary.main' },
                          }}
                          onClick={() => setDetailDrawer({ open: true, org })}
                        >
                          <AppIcon
                            name="CorporateFareOutlined"
                            fallback={CorporateFareOutlinedIcon}
                            sx={{ fontSize: 18, color: getTypeColor(org.org_type) }}
                          />
                          <Typography
                            className="org-name"
                            variant="body2"
                            fontWeight={600}
                            sx={{ transition: 'color 0.15s' }}
                          >
                            {org.name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getTypeLabel(org.org_type)}
                          size="small"
                          sx={{
                            bgcolor: alpha(getTypeColor(org.org_type), 0.12),
                            color: getTypeColor(org.org_type),
                            fontWeight: 600,
                            fontSize: '0.7rem',
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {org.industry || '-'}
                        </Typography>
                      </TableCell>
                      {/* Financial columns */}
                      {(() => {
                        const fin = orgFinances[org.id] || {};
                        const np = (fin.returned || 0) - (fin.invested || 0);
                        const roi = fin.roi || 0;
                        return (
                          <>
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 700, color: '#F59E0B', fontSize: '0.8rem' }}
                              >
                                {formatCompact(fin.invested || 0)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 700, color: '#10B981', fontSize: '0.8rem' }}
                              >
                                {formatCompact(fin.returned || 0)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 700,
                                  color: np >= 0 ? '#10B981' : '#EF4444',
                                  fontSize: '0.8rem',
                                }}
                              >
                                {formatCompact(np)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={`${roi > 0 ? '↑' : roi < 0 ? '↓' : ''} ${roi}%`}
                                size="small"
                                sx={{
                                  fontWeight: 700,
                                  fontSize: '0.7rem',
                                  height: 22,
                                  bgcolor: alpha(roi >= 0 ? '#10B981' : '#EF4444', 0.1),
                                  color: roi >= 0 ? '#10B981' : '#EF4444',
                                }}
                              />
                            </TableCell>
                          </>
                        );
                      })()}

                      {/* Consilium column */}
                      <TableCell>
                        <Box
                          sx={{
                            display: 'flex',
                            gap: 0.5,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            maxWidth: 160,
                          }}
                        >
                          {org.consilium_id ? (
                            <Chip
                              icon={
                                <AppIcon name="Link" fallback={LinkIcon} sx={{ fontSize: 12 }} />
                              }
                              label={getConsiliumName(org.consilium_id)}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '0.65rem', height: 20 }}
                            />
                          ) : (
                            <Typography variant="caption" color="text.disabled">
                              —
                            </Typography>
                          )}
                          <IconButton
                            size="small"
                            sx={{
                              p: 0.25,
                              color: 'text.disabled',
                              '&:hover': { color: 'primary.main' },
                            }}
                            onClick={() =>
                              setAssignDialog({
                                open: true,
                                orgId: org.id,
                                orgName: org.name,
                                mode: 'consilium',
                              })
                            }
                          >
                            <AppIcon
                              name="AddCircleOutline"
                              fallback={AddCircleOutlineIcon}
                              sx={{ fontSize: 14 }}
                            />
                          </IconButton>
                        </Box>
                      </TableCell>

                      {/* Team column */}
                      <TableCell>
                        <Box
                          sx={{
                            display: 'flex',
                            gap: 0.5,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            maxWidth: 160,
                          }}
                        >
                          {(orgTeamMap[org.id] || []).slice(0, 2).map((tid) => {
                            const team = allTeams.find((t) => t.id === tid);
                            return team ? (
                              <Chip
                                key={tid}
                                label={team.name}
                                size="small"
                                sx={{ fontSize: '0.65rem', height: 20 }}
                              />
                            ) : null;
                          })}
                          {(orgTeamMap[org.id] || []).length > 2 && (
                            <Typography variant="caption" color="text.secondary">
                              +{(orgTeamMap[org.id] || []).length - 2}
                            </Typography>
                          )}
                          <IconButton
                            size="small"
                            sx={{
                              p: 0.25,
                              color: 'text.disabled',
                              '&:hover': { color: 'primary.main' },
                            }}
                            onClick={() =>
                              setAssignDialog({
                                open: true,
                                orgId: org.id,
                                orgName: org.name,
                                mode: 'team',
                              })
                            }
                          >
                            <AppIcon
                              name="AddCircleOutline"
                              fallback={AddCircleOutlineIcon}
                              sx={{ fontSize: 14 }}
                            />
                          </IconButton>
                        </Box>
                      </TableCell>

                      {/* Agents column */}
                      <TableCell>
                        <Box
                          sx={{
                            display: 'flex',
                            gap: 0.5,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            maxWidth: 180,
                          }}
                        >
                          {(orgAgentMap[org.id] || []).slice(0, 2).map((aid) => {
                            const agent = allAgents.find((a) => (a.agent_id || a.id) === aid);
                            return agent ? (
                              <Chip
                                key={aid}
                                label={agent.role || agent.name || aid}
                                size="small"
                                sx={{ fontSize: '0.65rem', height: 20, cursor: 'pointer' }}
                                onClick={() => setAgentDetailDialog({ open: true, agent })}
                              />
                            ) : null;
                          })}
                          {(orgAgentMap[org.id] || []).length > 2 && (
                            <Typography variant="caption" color="text.secondary">
                              +{(orgAgentMap[org.id] || []).length - 2}
                            </Typography>
                          )}
                          <IconButton
                            size="small"
                            sx={{
                              p: 0.25,
                              color: 'text.disabled',
                              '&:hover': { color: 'success.main' },
                            }}
                            onClick={() =>
                              setAssignDialog({
                                open: true,
                                orgId: org.id,
                                orgName: org.name,
                                mode: 'agent',
                              })
                            }
                          >
                            <AppIcon
                              name="AddCircleOutline"
                              fallback={AddCircleOutlineIcon}
                              sx={{ fontSize: 14 }}
                            />
                          </IconButton>
                        </Box>
                      </TableCell>

                      {/* Vault column — company briefing and agent conditioning */}
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          clickable
                          label={orgVaultLabel(org.id)}
                          onClick={() =>
                            setVaultDialog({ open: true, orgId: org.id, orgName: org.name })
                          }
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      </TableCell>

                      {/* Activity column */}
                      <TableCell>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setDetailDrawer({ open: true, org })}
                          sx={{
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: '0.65rem',
                            borderRadius: 1.5,
                            py: 0.25,
                            px: 1,
                            borderColor: alpha(theme.palette.primary.main, 0.3),
                            color: 'primary.main',
                          }}
                        >
                          View Details
                        </Button>
                      </TableCell>
                      <TableCell>
                        {org.is_active ? (
                          <Chip
                            icon={
                              <AppIcon
                                name="CheckCircleOutline"
                                fallback={CheckCircleOutlineIcon}
                              />
                            }
                            label="Active"
                            size="small"
                            color="success"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem' }}
                          />
                        ) : (
                          <Chip
                            icon={<AppIcon name="CancelOutlined" fallback={CancelOutlinedIcon} />}
                            label="Inactive"
                            size="small"
                            color="default"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem' }}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(org.created_at).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => openEdit(org)} title="Edit">
                          <AppIcon
                            name="EditOutlined"
                            fallback={EditOutlinedIcon}
                            fontSize="small"
                          />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => setDeleteConfirm(org)}
                          title="Delete"
                          color="error"
                        >
                          <AppIcon
                            name="DeleteOutline"
                            fallback={DeleteOutlineIcon}
                            fontSize="small"
                          />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
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
              label="orgs"
            />
          </Box>
        )}

        {/* ── Card View ────────────────────────────────────── */}
        {!loading && viewMode === 'card' && filtered.length > 0 && (
          <Box data-tour-block="org-content" data-tour-label="Your organizations" sx={{ p: 1.5 }}>
            <Grid container spacing={2}>
              {paginated.map((org) => (
                <Grid key={org.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2.5,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 2,
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                      '&:hover': {
                        borderColor: 'primary.main',
                        transform: 'translateY(-2px)',
                        boxShadow: createHoverGlowShadow(theme),
                      },
                    }}
                    onClick={() => setDetailDrawer({ open: true, org })}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 1.5,
                          bgcolor: alpha(getTypeColor(org.org_type), 0.12),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <AppIcon
                          name="CorporateFareOutlined"
                          fallback={CorporateFareOutlinedIcon}
                          sx={{ color: getTypeColor(org.org_type), fontSize: 22 }}
                        />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" noWrap>
                          {org.name}
                        </Typography>
                        <Chip
                          label={getTypeLabel(org.org_type)}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            bgcolor: alpha(getTypeColor(org.org_type), 0.1),
                            color: getTypeColor(org.org_type),
                          }}
                        />
                      </Box>
                      {org.is_active ? (
                        <AppIcon
                          name="CheckCircleOutline"
                          fallback={CheckCircleOutlineIcon}
                          sx={{ color: 'success.main', fontSize: 18 }}
                        />
                      ) : (
                        <AppIcon
                          name="CancelOutlined"
                          fallback={CancelOutlinedIcon}
                          sx={{ color: 'text.disabled', fontSize: 18 }}
                        />
                      )}
                    </Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mb: 1.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {org.description || 'No description'}
                    </Typography>

                    {/* Financial mini-metrics */}
                    {(() => {
                      const fin = orgFinances[org.id] || {};
                      const roi = fin.roi || 0;
                      return (
                        <Paper
                          elevation={0}
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: 0.5,
                            p: 1.25,
                            borderRadius: 2,
                            mb: 1.5,
                            bgcolor: alpha(theme.palette.text.primary, 0.02),
                            border: '1px solid',
                            borderColor: alpha(theme.palette.text.primary, 0.04),
                          }}
                        >
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography
                              sx={{
                                fontSize: '0.6rem',
                                fontWeight: 600,
                                color: 'text.secondary',
                                textTransform: 'uppercase',
                              }}
                            >
                              Invested
                            </Typography>
                            <Typography
                              sx={{ fontSize: '0.9rem', fontWeight: 800, color: '#F59E0B' }}
                            >
                              {formatCompact(fin.invested || 0)}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography
                              sx={{
                                fontSize: '0.6rem',
                                fontWeight: 600,
                                color: 'text.secondary',
                                textTransform: 'uppercase',
                              }}
                            >
                              Returned
                            </Typography>
                            <Typography
                              sx={{ fontSize: '0.9rem', fontWeight: 800, color: '#10B981' }}
                            >
                              {formatCompact(fin.returned || 0)}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography
                              sx={{
                                fontSize: '0.6rem',
                                fontWeight: 600,
                                color: 'text.secondary',
                                textTransform: 'uppercase',
                              }}
                            >
                              ROI
                            </Typography>
                            <Typography
                              sx={{
                                fontSize: '0.9rem',
                                fontWeight: 800,
                                color: roi >= 0 ? '#8B5CF6' : '#EF4444',
                              }}
                            >
                              {roi > 0 ? '+' : ''}
                              {roi}%
                            </Typography>
                          </Box>
                        </Paper>
                      );
                    })()}

                    {/* Activity summary bar */}
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 1.5,
                        mb: 1.5,
                        px: 1.25,
                        py: 0.75,
                        borderRadius: 1.5,
                        bgcolor: alpha(theme.palette.text.primary, 0.02),
                        border: '1px solid',
                        borderColor: alpha(theme.palette.text.primary, 0.04),
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          color: 'text.secondary',
                          fontSize: '0.65rem',
                        }}
                      >
                        <AppIcon
                          name="AssignmentOutlined"
                          fallback={AssignmentOutlinedIcon}
                          sx={{ fontSize: 13 }}
                        />{' '}
                        <strong style={{ color: theme.palette.text.primary }}>
                          {(orgTeamMap[org.id] || []).length}
                        </strong>{' '}
                        teams
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          color: 'text.secondary',
                          fontSize: '0.65rem',
                        }}
                      >
                        <AppIcon
                          name="ViewModule"
                          fallback={ViewModuleIcon}
                          sx={{ fontSize: 13 }}
                        />{' '}
                        <strong style={{ color: theme.palette.text.primary }}>
                          {(orgAgentMap[org.id] || []).length}
                        </strong>{' '}
                        agents
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
                      {org.industry && (
                        <Chip
                          label={org.industry}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem' }}
                        />
                      )}
                      {org.consilium_id && (
                        <Chip
                          icon={<AppIcon name="Link" fallback={LinkIcon} sx={{ fontSize: 12 }} />}
                          label={getConsiliumName(org.consilium_id)}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem' }}
                        />
                      )}
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mt: 'auto',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        {new Date(org.created_at).toLocaleDateString()}
                      </Typography>
                      <Box onClick={(e) => e.stopPropagation()}>
                        <IconButton size="small" onClick={() => openEdit(org)}>
                          <AppIcon
                            name="EditOutlined"
                            fallback={EditOutlinedIcon}
                            fontSize="small"
                          />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => setDeleteConfirm(org)}
                          color="error"
                        >
                          <AppIcon
                            name="DeleteOutline"
                            fallback={DeleteOutlineIcon}
                            fontSize="small"
                          />
                        </IconButton>
                      </Box>
                    </Box>
                  </Paper>
                </Grid>
              ))}
            </Grid>
            {pagination.totalCount > pagination.rowsPerPage && (
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
                label="orgs"
              />
            )}
          </Box>
        )}

        {/* ── Graph view (shared Consilium topology canvas) ── */}
        {!loading && viewMode === 'graph' && (
          <Suspense
            fallback={
              <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={32} />
              </Box>
            }
          >
            <ConsiliumTopologyView user={user} />
          </Suspense>
        )}
      </BentoCard>
      {/* ── Create / Edit Dialog (KYB Two-Level) ────────────── */}
      <FormDialog
        open={dialogOpen}
        onClose={closeDialog}
        title={editId ? 'Edit Organization' : 'New Organization'}
        icon={CorporateFareOutlinedIcon}
        maxWidth="md"
        contentDividers={false}
        contentSx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0 }}
        actions={
          <>
            {dialogTab === 0 && form.org_type !== 'virtual' && (
              <Button
                onClick={() => {
                  setDialogTab(1);
                  setForm((f) => ({ ...f, kyb_level: 'full' }));
                }}
                sx={{ mr: 'auto', textTransform: 'none' }}
              >
                Add Full KYB Details →
              </Button>
            )}
            <Button onClick={closeDialog}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              startIcon={saving ? <CircularProgress size={16} /> : null}
            >
              {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
            </Button>
          </>
        }
        footerJustify="flex-end"
      >
        <Tabs
          value={dialogTab}
          onChange={(_, v) => {
            setDialogTab(v);
            if (v === 1) setForm((f) => ({ ...f, kyb_level: 'full' }));
          }}
          sx={{ mx: -3, px: 3, borderBottom: 1, borderColor: 'divider', mt: -1 }}
        >
          <Tab label="Basic Info" sx={{ textTransform: 'none', fontWeight: 700 }} />
          {form.org_type !== 'virtual' && (
            <Tab label="Full KYB Details" sx={{ textTransform: 'none', fontWeight: 700 }} />
          )}
        </Tabs>
        {/* ── Tab 0: Basic ──────────────────────────────────── */}
        {dialogTab === 0 && (
          <>
            {form.org_type === 'virtual' ? (
              <Typography variant="caption" color="text.secondary" sx={{ mb: -1 }}>
                Virtual org - structural placeholder only, no legal details required.
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ mb: -1 }}>
                Fast onboarding - fill the essentials now, add full KYB details later.
              </Typography>
            )}
            <TextField
              label="Name"
              fullWidth
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={form.org_type}
                  label="Type"
                  onChange={(e) => setForm((f) => ({ ...f, org_type: e.target.value }))}
                >
                  {ORG_TYPES.map((t) => (
                    <MenuItem key={t.value} value={t.value}>
                      {t.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {form.org_type !== 'virtual' && (
                <FormControl fullWidth>
                  <InputLabel>Legal Form</InputLabel>
                  <Select
                    value={form.legal_form}
                    label="Legal Form"
                    onChange={(e) => setForm((f) => ({ ...f, legal_form: e.target.value }))}
                  >
                    <MenuItem value="">Select...</MenuItem>
                    {LEGAL_FORMS.map((l) => (
                      <MenuItem key={l} value={l}>
                        {l}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>
            {form.org_type !== 'virtual' && (
              <>
                <TextField
                  label="Legal Name (if different)"
                  fullWidth
                  value={form.legal_name}
                  onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
                  placeholder="Official registered name"
                />
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Registration Number"
                    fullWidth
                    value={form.registration_number}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, registration_number: e.target.value }))
                    }
                    placeholder="e.g. 12345678"
                  />
                  <FormControl fullWidth>
                    <InputLabel>Country</InputLabel>
                    <Select
                      value={form.country}
                      label="Country"
                      onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                    >
                      <MenuItem value="">Select...</MenuItem>
                      {COUNTRIES.map((c) => (
                        <MenuItem key={c} value={c}>
                          {c}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </>
            )}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Industry</InputLabel>
                <Select
                  value={form.industry}
                  label="Industry"
                  onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                >
                  <MenuItem value="">Select...</MenuItem>
                  {INDUSTRIES.map((i) => (
                    <MenuItem key={i} value={i}>
                      {i}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Parent Organization</InputLabel>
                <Select
                  value={form.parent_id}
                  label="Parent Organization"
                  onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}
                >
                  <MenuItem value="">None (Top-level)</MenuItem>
                  {orgs
                    .filter((o) => o.id !== editId)
                    .map((o) => (
                      <MenuItem key={o.id} value={o.id}>
                        {o.name}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Box>
            {form.org_type !== 'virtual' && (
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Contact Email"
                  fullWidth
                  value={form.contact_email}
                  onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                  placeholder="contact@company.com"
                />
                <TextField
                  label="Contact Phone"
                  fullWidth
                  value={form.contact_phone}
                  onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                  placeholder="+1 234 567 890"
                />
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Website"
                fullWidth
                value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                placeholder="https://example.com"
              />
              <FormControl fullWidth>
                <InputLabel>Consilium Board</InputLabel>
                <Select
                  value={form.consilium_id}
                  label="Consilium Board"
                  onChange={(e) => setForm((f) => ({ ...f, consilium_id: e.target.value }))}
                >
                  <MenuItem value="">None</MenuItem>
                  {(concilium || []).map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </>
        )}

        {/* ── Tab 1: Full KYB ───────────────────────────────── */}
        {dialogTab === 1 && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ mb: -1 }}>
              Complete KYB verification - tax details, registered address, directors, beneficial
              owners, and banking.
            </Typography>

            {/* Tax & Incorporation */}
            <Divider textAlign="left">
              <Chip label="Tax & Incorporation" size="small" />
            </Divider>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Tax ID (VAT / EIN / TIN)"
                fullWidth
                value={form.tax_id}
                onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
              />
              <TextField
                label="Incorporation Date"
                type="date"
                fullWidth
                value={form.incorporation_date}
                onChange={(e) => setForm((f) => ({ ...f, incorporation_date: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="SIC Code"
                value={form.industry_codes?.sic || ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    industry_codes: { ...f.industry_codes, sic: e.target.value },
                  }))
                }
                sx={{ flex: 1 }}
              />
              <TextField
                label="NAICS Code"
                value={form.industry_codes?.naics || ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    industry_codes: { ...f.industry_codes, naics: e.target.value },
                  }))
                }
                sx={{ flex: 1 }}
              />
              <TextField
                label="NACE Code"
                value={form.industry_codes?.nace || ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    industry_codes: { ...f.industry_codes, nace: e.target.value },
                  }))
                }
                sx={{ flex: 1 }}
              />
            </Box>

            {/* Registered Address */}
            <Divider textAlign="left">
              <Chip label="Registered Address" size="small" />
            </Divider>
            <TextField
              label="Street Address"
              fullWidth
              value={form.registered_address?.street || ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  registered_address: { ...f.registered_address, street: e.target.value },
                }))
              }
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="City"
                value={form.registered_address?.city || ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    registered_address: { ...f.registered_address, city: e.target.value },
                  }))
                }
                sx={{ flex: 1 }}
              />
              <TextField
                label="State / Region"
                value={form.registered_address?.state || ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    registered_address: { ...f.registered_address, state: e.target.value },
                  }))
                }
                sx={{ flex: 1 }}
              />
              <TextField
                label="ZIP / Postal"
                value={form.registered_address?.zip || ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    registered_address: { ...f.registered_address, zip: e.target.value },
                  }))
                }
                sx={{ flex: 1 }}
              />
            </Box>

            {/* Directors */}
            <Divider textAlign="left">
              <Chip label={`Directors (${form.directors?.length || 0})`} size="small" />
            </Divider>
            {(form.directors || []).map((d, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  label="Name"
                  value={d.name || ''}
                  onChange={(e) => {
                    const dirs = [...form.directors];
                    dirs[i] = { ...dirs[i], name: e.target.value };
                    setForm((f) => ({ ...f, directors: dirs }));
                  }}
                  sx={{ flex: 2 }}
                  size="small"
                />
                <TextField
                  label="Role"
                  value={d.role || ''}
                  onChange={(e) => {
                    const dirs = [...form.directors];
                    dirs[i] = { ...dirs[i], role: e.target.value };
                    setForm((f) => ({ ...f, directors: dirs }));
                  }}
                  sx={{ flex: 1 }}
                  size="small"
                  placeholder="CEO, CFO..."
                />
                <TextField
                  label="Nationality"
                  value={d.nationality || ''}
                  onChange={(e) => {
                    const dirs = [...form.directors];
                    dirs[i] = { ...dirs[i], nationality: e.target.value };
                    setForm((f) => ({ ...f, directors: dirs }));
                  }}
                  sx={{ flex: 1 }}
                  size="small"
                />
                <IconButton
                  size="small"
                  color="error"
                  onClick={() =>
                    setForm((f) => ({ ...f, directors: f.directors.filter((_, j) => j !== i) }))
                  }
                >
                  <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button
              size="small"
              startIcon={<AppIcon name="AddCircleOutline" fallback={AddCircleOutlineIcon} />}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  directors: [...(f.directors || []), { name: '', role: '', nationality: '' }],
                }))
              }
              sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
            >
              Add Director
            </Button>

            {/* UBOs */}
            <Divider textAlign="left">
              <Chip label={`Beneficial Owners (${form.ubos?.length || 0})`} size="small" />
            </Divider>
            {(form.ubos || []).map((u, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  label="Name"
                  value={u.name || ''}
                  onChange={(e) => {
                    const ubs = [...form.ubos];
                    ubs[i] = { ...ubs[i], name: e.target.value };
                    setForm((f) => ({ ...f, ubos: ubs }));
                  }}
                  sx={{ flex: 2 }}
                  size="small"
                />
                <TextField
                  label="Ownership %"
                  type="number"
                  value={u.ownership_pct || ''}
                  onChange={(e) => {
                    const ubs = [...form.ubos];
                    ubs[i] = { ...ubs[i], ownership_pct: e.target.value };
                    setForm((f) => ({ ...f, ubos: ubs }));
                  }}
                  sx={{ flex: 1 }}
                  size="small"
                />
                <TextField
                  label="Nationality"
                  value={u.nationality || ''}
                  onChange={(e) => {
                    const ubs = [...form.ubos];
                    ubs[i] = { ...ubs[i], nationality: e.target.value };
                    setForm((f) => ({ ...f, ubos: ubs }));
                  }}
                  sx={{ flex: 1 }}
                  size="small"
                />
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => setForm((f) => ({ ...f, ubos: f.ubos.filter((_, j) => j !== i) }))}
                >
                  <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button
              size="small"
              startIcon={<AppIcon name="AddCircleOutline" fallback={AddCircleOutlineIcon} />}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  ubos: [...(f.ubos || []), { name: '', ownership_pct: '', nationality: '' }],
                }))
              }
              sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
            >
              Add Beneficial Owner
            </Button>

            {/* Bank Details */}
            <Divider textAlign="left">
              <Chip label="Bank Details" size="small" />
            </Divider>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Bank Name"
                value={form.bank_details?.bank_name || ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    bank_details: { ...f.bank_details, bank_name: e.target.value },
                  }))
                }
                sx={{ flex: 1 }}
              />
              <TextField
                label="Account Holder"
                value={form.bank_details?.account_holder || ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    bank_details: { ...f.bank_details, account_holder: e.target.value },
                  }))
                }
                sx={{ flex: 1 }}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="IBAN / Account Number"
                value={form.bank_details?.iban || ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    bank_details: { ...f.bank_details, iban: e.target.value },
                  }))
                }
                sx={{ flex: 1 }}
              />
              <TextField
                label="SWIFT / BIC"
                value={form.bank_details?.swift || ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    bank_details: { ...f.bank_details, swift: e.target.value },
                  }))
                }
                sx={{ flex: 1 }}
              />
            </Box>

            {/* KYB Status */}
            <Divider textAlign="left">
              <Chip label="Verification Status" size="small" />
            </Divider>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl sx={{ flex: 1 }}>
                <InputLabel>KYB Status</InputLabel>
                <Select
                  value={form.kyb_status}
                  label="KYB Status"
                  onChange={(e) => setForm((f) => ({ ...f, kyb_status: e.target.value }))}
                >
                  {Object.entries(KYB_STATUS_MAP).map(([k, v]) => (
                    <MenuItem key={k} value={k}>
                      {v.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Notes"
                value={form.kyb_notes}
                onChange={(e) => setForm((f) => ({ ...f, kyb_notes: e.target.value }))}
                sx={{ flex: 2 }}
                placeholder="Internal verification notes..."
              />
            </Box>
          </>
        )}
      </FormDialog>
      {/* ── Delete Confirm ──────────────────────────────────── */}
      <FormDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Organization"
        icon={DeleteOutlineIcon}
        iconVariant="error"
        maxWidth="xs"
        actions={
          <>
            <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="contained" color="error" onClick={handleDelete}>
              Delete
            </Button>
          </>
        }
      >
        <Typography>
          Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This cannot be
          undone.
        </Typography>
      </FormDialog>
      {/* ── Assign Teams / Agents Dialog ────────────────────── */}
      <OrgVaultDialog
        open={vaultDialog.open}
        onClose={() => setVaultDialog({ open: false, orgId: null, orgName: '' })}
        orgId={vaultDialog.orgId}
        orgName={vaultDialog.orgName}
      />

      <OrgAssignDialog
        open={assignDialog.open}
        onClose={() => setAssignDialog((d) => ({ ...d, open: false }))}
        orgId={assignDialog.orgId}
        orgName={assignDialog.orgName}
        mode={assignDialog.mode}
        currentIds={
          assignDialog.mode === 'team'
            ? orgTeamMap[assignDialog.orgId] || []
            : assignDialog.mode === 'agent'
              ? orgAgentMap[assignDialog.orgId] || []
              : assignDialog.mode === 'parent'
                ? orgs.find((o) => o.id === assignDialog.orgId)?.parent_id
                  ? [orgs.find((o) => o.id === assignDialog.orgId).parent_id]
                  : []
                : assignDialog.mode === 'consilium'
                  ? orgs.find((o) => o.id === assignDialog.orgId)?.consilium_id
                    ? [orgs.find((o) => o.id === assignDialog.orgId).consilium_id]
                    : []
                  : []
        }
        externalItems={
          assignDialog.mode === 'parent'
            ? orgs.filter((o) => o.id !== assignDialog.orgId)
            : assignDialog.mode === 'consilium'
              ? concilium || []
              : undefined
        }
        onSave={handleSaveAssignment}
      />
      {/* ── Agent Detail Dialog ──────────────────────────────── */}
      <AgentDetailDialog
        open={agentDetailDialog.open}
        onClose={() => setAgentDetailDialog({ open: false, agent: null })}
        agent={agentDetailDialog.agent}
      />
      {/* ── Architecture Dialog ──────────────────────────────── */}
      <OrgArchitectureDialog
        open={archDialog.open}
        onClose={() => setArchDialog({ open: false, org: null })}
        org={archDialog.org}
        consiliumBoards={concilium}
        orgTeamMap={orgTeamMap}
        orgAgentMap={orgAgentMap}
        allTeams={allTeams}
        allAgents={allAgents}
      />
      {/* ── Detail Drawer ──────────────────────────────────── */}
      <OrgDetailDrawer
        open={detailDrawer.open}
        onClose={() => setDetailDrawer({ open: false, org: null })}
        org={detailDrawer.org}
        orgTeamMap={orgTeamMap}
        orgAgentMap={orgAgentMap}
        allTeams={allTeams}
        allAgents={allAgents}
        concilium={concilium}
        orgs={orgs}
        getTypeColor={getTypeColor}
        getTypeLabel={getTypeLabel}
      />
      {/* ── Toast ───────────────────────────────────────────── */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          variant="filled"
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </PageLayout>
  );
}
