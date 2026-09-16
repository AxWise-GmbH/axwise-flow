import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Collapse,
  CircularProgress,
  useTheme,
  alpha,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Divider,
  Popover,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Autocomplete,
  ToggleButtonGroup,
  ToggleButton,
  Tabs,
  Tab,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import TuneIcon from '@mui/icons-material/Tune';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import AddIcon from '@mui/icons-material/Add';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import TimelineIcon from '@mui/icons-material/Timeline';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import Chip from '@mui/material/Chip';
import PageLayout from '../../components/Common/PageLayout';
import OrgFilterBanner from '../../components/Common/OrgFilterBanner';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import Pagination from '../../components/Common/Pagination';
import usePagination from '../../hooks/usePagination';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import EmptyState from '../../components/Common/EmptyState';
import { usePartners } from '../../hooks/usePartners';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { usePartnerAccessOptional } from '../../context/PartnerAccessContext';
import { useNotifications } from '../../context/NotificationContext';
import { formatCurrency } from '../../utils/formatters';
import { Navigate } from 'react-router-dom';
import AddPaymentDialog from '../Partners/components/AddPaymentDialog';
import { loadAuditLogs } from '../../services/auditLogBackend';

import AppIcon from '../../components/icons/AppIcon';

const FINANCE_CATEGORIES = ['Partners', 'Personal', 'Team', 'Projects', 'Agents'];

const CATEGORY_COLORS = {
  Partners: { bg: '#E0F2FE', color: '#0284C7', border: '#BAE6FD' },
  Personal: { bg: '#F3E8FF', color: '#7C3AED', border: '#DDD6FE' },
  Team: { bg: '#D1FAE5', color: '#059669', border: '#A7F3D0' },
  Projects: { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' },
  Agents: { bg: '#FFE4E6', color: '#E11D48', border: '#FECDD3' },
};

const CATEGORY_COLORS_DARK = {
  Partners: { bg: 'rgba(2,132,199,0.12)', color: '#38BDF8', border: 'rgba(2,132,199,0.25)' },
  Personal: { bg: 'rgba(124,58,237,0.12)', color: '#A78BFA', border: 'rgba(124,58,237,0.25)' },
  Team: { bg: 'rgba(5,150,105,0.12)', color: '#4ADE80', border: 'rgba(5,150,105,0.25)' },
  Projects: { bg: 'rgba(217,119,6,0.12)', color: '#FACC15', border: 'rgba(217,119,6,0.25)' },
  Agents: { bg: 'rgba(225,29,72,0.12)', color: '#FB7185', border: 'rgba(225,29,72,0.25)' },
};

const COLUMNS = [
  { id: 'partner', label: 'Partner', sortKey: 'partnerName', minWidth: 180 },
  { id: 'category', label: 'Category', sortKey: 'category', minWidth: 110 },
  { id: 'team', label: 'Team', sortKey: 'teamName', minWidth: 120 },
  { id: 'group', label: 'Group', sortKey: 'group', minWidth: 100 },
  { id: 'total', label: 'Total', sortKey: 'total', minWidth: 110, align: 'right' },
  { id: 'paid', label: 'Paid', sortKey: 'paid', minWidth: 110, align: 'right' },
  { id: 'debt', label: 'Debt', sortKey: 'debt', minWidth: 110, align: 'right' },
  { id: 'actions', label: '', minWidth: 56, align: 'right' },
];

function buildFinanceRows(partners) {
  return (partners || []).map((p) => {
    const name = p.name || p.information?.name || p.id;
    const teamName = p.teams && p.teams[0]?.name ? p.teams[0].name : p.information?.team || '-';
    const group = p.information?.group || p.group || '-';
    const total = Number(p.finance?.total ?? 0);
    const paid = Number(p.finance?.paid ?? 0);
    const debt = Number(p.finance?.debt ?? 0);
    const txCount = Array.isArray(p.financeTransactions) ? p.financeTransactions.length : 0;
    const lastTx =
      Array.isArray(p.financeTransactions) && p.financeTransactions.length > 0
        ? p.financeTransactions[p.financeTransactions.length - 1]
        : null;
    const lastDate = lastTx ? lastTx.datetime || lastTx.date || lastTx.time : null;
    // Derive the dominant category from transactions
    const categories = (p.financeTransactions || []).map((tx) => tx.category).filter(Boolean);
    const category = categories.length > 0 ? categories[0] : '';
    return {
      id: p.id,
      partnerId: p.id,
      partnerName: name,
      category,
      teamName,
      group,
      total,
      paid,
      debt,
      txCount,
      lastDate,
    };
  });
}

export default function Finances() {
  const theme = useTheme();
  const navigate = useNavigate();
  const partnerAccess = usePartnerAccessOptional();
  const roleId = partnerAccess?.roleId || '';
  const canAccess = roleId === 'role-super-admin' || roleId === 'role-manager';
  const { partners, loading, error, updatePartner } = usePartners();
  const { pushNotification } = useNotifications();
  const [search, setSearch] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('All');
  const [teamFilter, setTeamFilter] = useState('All');
  const [groupFilter, setGroupFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const isDark = theme.palette.mode === 'dark';
  const [order, setOrder] = useState('desc');
  const [orderBy, setOrderBy] = useState('total');
  const [showMetrics, setShowMetrics] = useShowMetrics('finances');
  // ── Org scope (?org=) from the Home ROI / Invested tiles (best-effort by group) ──
  const [searchParams, setSearchParams] = useSearchParams();
  const orgName = searchParams.get('orgName');
  const clearOrgFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('org');
    next.delete('orgName');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [selectedPartnerForPayment, setSelectedPartnerForPayment] = useState(null);
  const [selectPartnerOption, setSelectPartnerOption] = useState(null);

  const VIEW_MODE_KEY = 'orch_finances_view';
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

  const [invoiceViewRow, setInvoiceViewRow] = useState(null);

  /* ---- Activity Log Dialog state ---- */
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);

  const openActivityLog = useCallback(async () => {
    setActivityLogOpen(true);
    setActivityLogsLoading(true);
    try {
      const allLogs = await loadAuditLogs({ limit: 500 });
      const filtered = allLogs.filter(
        (log) => log.entity === 'Partner' || log.entity === 'Finance'
      );
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

  const showSuccess = useCallback(
    (title, message) => {
      pushNotification(title, message);
    },
    [pushNotification]
  );

  const handleCreatePaymentFromFinances = useCallback(
    async (partnerId, paymentInput) => {
      const partner = partners.find((p) => p.id === partnerId);
      if (!partner) return;
      const existingTransactions = Array.isArray(partner.financeTransactions)
        ? partner.financeTransactions
        : [];
      const newPayment = {
        id: `${partnerId}-pay-${Date.now()}`,
        ...paymentInput,
      };
      const financeTransactions = [newPayment, ...existingTransactions];
      const paid = financeTransactions.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      await updatePartner(partnerId, {
        financeTransactions,
        finance: { total: paid, paid, debt: 0 },
      });
      setSelectedPartnerForPayment(null);
      setAddPaymentOpen(false);
      showSuccess(
        'Payment added',
        `Payment of $${Number(paymentInput.amount || 0).toFixed(2)} has been recorded for ${partner.name || partner.information?.name || partnerId}.`
      );
    },
    [partners, updatePartner, showSuccess]
  );

  const handleCloseAddPaymentFlow = useCallback(() => {
    setAddPaymentOpen(false);
    setSelectedPartnerForPayment(null);
    setSelectPartnerOption(null);
  }, []);

  const allRows = useMemo(() => buildFinanceRows(partners), [partners]);

  const partnerFilterOptions = useMemo(() => partners, [partners]);
  const teamFilterOptions = useMemo(() => {
    const seen = new Set();
    return allRows
      .filter((r) => r.teamName && r.teamName !== '-')
      .filter((r) => {
        if (seen.has(r.teamName)) return false;
        seen.add(r.teamName);
        return true;
      })
      .map((r) => r.teamName)
      .sort((a, b) => (a || '').localeCompare(b || ''));
  }, [allRows]);
  const groupFilterOptions = useMemo(() => {
    const seen = new Set();
    return allRows
      .filter((r) => r.group && r.group !== '-')
      .filter((r) => {
        if (seen.has(r.group)) return false;
        seen.add(r.group);
        return true;
      })
      .map((r) => r.group)
      .sort((a, b) => (a || '').localeCompare(b || ''));
  }, [allRows]);

  const filtered = useMemo(() => {
    let list = [...allRows];
    if (partnerFilter !== 'All') {
      list = list.filter((r) => r.partnerId === partnerFilter);
    }
    if (teamFilter !== 'All') {
      list = list.filter((r) => r.teamName === teamFilter);
    }
    if (groupFilter !== 'All') {
      list = list.filter((r) => r.group === groupFilter);
    }
    if (categoryFilter !== 'All') {
      list = list.filter((r) => r.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (r) =>
          (r.partnerName || '').toLowerCase().includes(q) ||
          (r.teamName || '').toLowerCase().includes(q) ||
          (r.group || '').toLowerCase().includes(q) ||
          (r.category || '').toLowerCase().includes(q)
      );
    }
    if (orgName) {
      const matches = list.filter((r) => (r.group || '').toLowerCase() === orgName.toLowerCase());
      if (matches.length) list = matches;
    }
    return list;
  }, [allRows, search, partnerFilter, teamFilter, groupFilter, categoryFilter, orgName]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const valA = a[orderBy] ?? 0;
      const valB = b[orderBy] ?? 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        return order === 'desc' ? valB - valA : valA - valB;
      }
      const strA = String(valA);
      const strB = String(valB);
      if (strB < strA) return order === 'desc' ? -1 : 1;
      if (strB > strA) return order === 'desc' ? 1 : -1;
      return 0;
    });
  }, [filtered, order, orderBy]);

  const pagination = usePagination(sorted, {
    surfaceId: 'finances.list',
    defaultRowsPerPage: 10,
    resetOn: [search, partnerFilter, teamFilter, groupFilter, categoryFilter, order, orderBy],
  });
  const paginated = pagination.paginatedData;

  const stats = useMemo(() => {
    const totalBalance = filtered.reduce((s, r) => s + r.total, 0);
    const totalPaid = filtered.reduce((s, r) => s + r.paid, 0);
    const totalDebt = filtered.reduce((s, r) => s + r.debt, 0);
    const withDebt = filtered.filter((r) => r.debt > 0).length;
    return {
      totalBalance,
      totalPaid,
      totalDebt,
      partnersCount: filtered.length,
      withDebt,
    };
  }, [filtered]);

  const statCards = [
    {
      label: 'Total Balance',
      value: formatCurrency(stats.totalBalance),
      helper: 'Sum of all partner totals',
      color: theme.palette.primary.main,
      icon: AccountBalanceWalletOutlinedIcon,
    },
    {
      label: 'Total Paid',
      value: formatCurrency(stats.totalPaid),
      helper: 'Sum of paid amounts',
      color: theme.palette.success.main,
      icon: PaidOutlinedIcon,
    },
    {
      label: 'Total Debt',
      value: formatCurrency(stats.totalDebt),
      helper: 'Outstanding balance',
      color: theme.palette.warning.main,
      icon: WarningAmberOutlinedIcon,
    },
    {
      label: 'Partners',
      value: stats.partnersCount,
      helper: 'With finance data',
      color: theme.palette.info.main,
      icon: PersonOutlineIcon,
    },
    {
      label: 'With Debt',
      value: stats.withDebt,
      helper: 'Partners with outstanding debt',
      color: theme.palette.error.main,
      icon: TrendingUpOutlinedIcon,
    },
  ];

  const handleSort = (sortKey) => {
    if (!sortKey) return;
    const isAsc = orderBy === sortKey && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(sortKey);
  };

  if (!canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  if (loading) return <LoadingSpinner message="Loading finances..." />;
  if (error) return <Typography color="error">Failed to load finances: {error}</Typography>;

  return (
    <PageLayout
      title="Finances"
      subtitle="Unified view of finance data from all partners."
      showTitleBlock={false}
    >
      <OrgFilterBanner name={orgName} onClear={clearOrgFilter} />
      <BentoCard
        title="Finances"
        subtitle={
          showMetrics
            ? `${stats.partnersCount} partners · ${formatCurrency(stats.totalBalance)} total`
            : undefined
        }
        icon={AccountBalanceWalletOutlinedIcon}
        noPadding
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
      >
        <Collapse in={showMetrics}>
          <Box sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}>
            <Box
              sx={{
                mb: 2,
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  md: 'repeat(3, minmax(0, 1fr))',
                  lg: 'repeat(5, minmax(0, 1fr))',
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
                      <Box sx={{ minWidth: 0 }}>
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
          </Box>
        </Collapse>

        <Box sx={{ p: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box
            sx={{
              p: 1.5,
              mb: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              flexWrap: 'wrap',
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Tooltip title="Filters" placement="bottom" arrow>
              <IconButton
                onClick={(e) => setFilterAnchorEl(e.currentTarget)}
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
                  name="Tune"
                  fallback={TuneIcon}
                  sx={{ fontSize: 20, color: 'text.secondary' }}
                />
              </IconButton>
            </Tooltip>
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
                    maxWidth: 380,
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
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', display: 'block' }}
                    >
                      Partner, team, group, search
                    </Typography>
                  </Box>
                </Box>
              </Box>
              <Box sx={{ p: 2.5, maxHeight: 360, overflowY: 'auto' }}>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.7rem',
                    display: 'block',
                    mb: 1,
                  }}
                >
                  Search
                </Typography>
                <TextField
                  size="small"
                  placeholder="Search partners..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                  }}
                  fullWidth
                  sx={{ mb: 2, '& .MuiInputBase-root': { borderRadius: 2 } }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AppIcon
                          name="SearchOutlined"
                          fallback={SearchIcon}
                          sx={{ fontSize: 18, color: 'text.secondary' }}
                        />
                      </InputAdornment>
                    ),
                  }}
                />
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.7rem',
                    display: 'block',
                    mb: 1,
                  }}
                >
                  Partner
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
                  <InputLabel>Partner</InputLabel>
                  <Select
                    value={partnerFilter}
                    label="Partner"
                    onChange={(e) => {
                      setPartnerFilter(e.target.value);
                    }}
                    sx={{ borderRadius: 2, fontWeight: 600 }}
                  >
                    <MenuItem
                      value="All"
                      sx={{
                        fontWeight: 700,
                        color: 'primary.main',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      All Partners
                    </MenuItem>
                    {partnerFilterOptions.map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name || p.information?.name || p.id}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.7rem',
                    display: 'block',
                    mb: 1,
                  }}
                >
                  Team
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
                  <InputLabel>Team</InputLabel>
                  <Select
                    value={teamFilter}
                    label="Team"
                    onChange={(e) => {
                      setTeamFilter(e.target.value);
                    }}
                    sx={{ borderRadius: 2, fontWeight: 600 }}
                  >
                    <MenuItem
                      value="All"
                      sx={{
                        fontWeight: 700,
                        color: 'primary.main',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      All Teams
                    </MenuItem>
                    {teamFilterOptions.map((t) => (
                      <MenuItem key={t} value={t}>
                        {t}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.7rem',
                    display: 'block',
                    mb: 1,
                  }}
                >
                  Group
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
                  <InputLabel>Group</InputLabel>
                  <Select
                    value={groupFilter}
                    label="Group"
                    onChange={(e) => {
                      setGroupFilter(e.target.value);
                    }}
                    sx={{ borderRadius: 2, fontWeight: 600 }}
                  >
                    <MenuItem
                      value="All"
                      sx={{
                        fontWeight: 700,
                        color: 'primary.main',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      All Groups
                    </MenuItem>
                    {groupFilterOptions.map((g) => (
                      <MenuItem key={g} value={g}>
                        {g}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.7rem',
                    display: 'block',
                    mb: 1,
                  }}
                >
                  Category
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2 }}>
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={categoryFilter}
                    label="Category"
                    onChange={(e) => {
                      setCategoryFilter(e.target.value);
                    }}
                    sx={{ borderRadius: 2, fontWeight: 600 }}
                  >
                    <MenuItem
                      value="All"
                      sx={{
                        fontWeight: 700,
                        color: 'primary.main',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      All Categories
                    </MenuItem>
                    {FINANCE_CATEGORIES.map((cat) => (
                      <MenuItem key={cat} value={cat}>
                        {cat}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              <Divider />
              <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha(theme.palette.grey[500], 0.08) }}>
                <Typography
                  component="button"
                  variant="body2"
                  onClick={() => {
                    setSearch('');
                    setPartnerFilter('All');
                    setTeamFilter('All');
                    setGroupFilter('All');
                    setCategoryFilter('All');
                    setFilterAnchorEl(null);
                  }}
                  sx={{
                    border: 0,
                    background: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                    color: 'primary.main',
                  }}
                >
                  Reset filters
                </Typography>
              </Box>
            </Popover>

            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, val) => val != null && setViewMode(val)}
              size="small"
              sx={{
                '& .MuiToggleButton-root': { py: 0.5, px: 0.75 },
                bgcolor: alpha(theme.palette.background.default, 0.8),
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                '& .MuiToggleButton-root.Mui-selected': {
                  bgcolor: alpha(theme.palette.primary.main, 0.15),
                  color: 'primary.main',
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

            <Button
              variant="outlined"
              color="primary"
              size="small"
              startIcon={<AppIcon name="Add" fallback={AddIcon} />}
              onClick={() => setAddPaymentOpen(true)}
              sx={{
                borderRadius: 3,
                textTransform: 'none',
                fontWeight: 600,
                borderWidth: 2,
                '&:hover': { borderWidth: 2 },
              }}
            >
              Add
            </Button>
          </Box>

          {filtered.length === 0 ? (
            <Box sx={{ p: 4 }}>
              <EmptyState
                icon={AccountBalanceWalletOutlinedIcon}
                title="No finance data"
                description={
                  search ||
                  partnerFilter !== 'All' ||
                  teamFilter !== 'All' ||
                  groupFilter !== 'All' ||
                  categoryFilter !== 'All'
                    ? 'Try adjusting your filters.'
                    : 'Finance data from partners will appear here.'
                }
              />
            </Box>
          ) : viewMode === 'card' ? (
            <>
              <Box
                sx={{
                  p: 1.5,
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, 1fr)',
                    md: 'repeat(3, 1fr)',
                    lg: 'repeat(4, 1fr)',
                  },
                  gap: 1.5,
                  maxHeight: 'calc(100vh - 350px)',
                  overflow: 'auto',
                }}
              >
                {paginated.map((row) => (
                  <Paper
                    key={row.id}
                    elevation={0}
                    onClick={() => setInvoiceViewRow(row)}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      cursor: 'pointer',
                      transition: 'border-color .2s, box-shadow .2s',
                      '&:hover': {
                        borderColor: theme.palette.primary.main,
                        boxShadow: createHoverGlowShadow(theme),
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.25 }}>
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: alpha(theme.palette.primary.main, 0.08),
                          flexShrink: 0,
                        }}
                      >
                        <AppIcon
                          name="PersonOutline"
                          fallback={PersonOutlineIcon}
                          sx={{ fontSize: 18, color: 'primary.main' }}
                        />
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {row.partnerName}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                      <AppIcon
                        name="GroupsOutlined"
                        fallback={GroupsOutlinedIcon}
                        sx={{ fontSize: 14, color: 'text.secondary' }}
                      />
                      <Typography
                        variant="caption"
                        sx={{ color: row.teamName !== '-' ? 'text.secondary' : 'text.disabled' }}
                      >
                        {row.teamName}
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
                    >
                      Group: {row.group}
                    </Typography>
                    {row.category &&
                      (() => {
                        const cc =
                          (isDark ? CATEGORY_COLORS_DARK : CATEGORY_COLORS)[row.category] || {};
                        return (
                          <Chip
                            icon={
                              <AppIcon
                                name="CategoryOutlined"
                                fallback={CategoryOutlinedIcon}
                                sx={{ fontSize: 12 }}
                              />
                            }
                            label={row.category}
                            size="small"
                            sx={{
                              height: 22,
                              fontWeight: 600,
                              fontSize: '0.65rem',
                              mb: 1,
                              bgcolor: cc.bg || alpha(theme.palette.primary.main, 0.1),
                              color: cc.color || 'primary.main',
                              border: `1px solid ${cc.border || 'transparent'}`,
                            }}
                          />
                        );
                      })()}
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 0.5,
                      }}
                    >
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Total
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatCurrency(row.total)}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 0.5,
                      }}
                    >
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Paid
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'success.main' }}>
                        {formatCurrency(row.paid)}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 0.5,
                      }}
                    >
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Debt
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: row.debt > 0 ? 'warning.main' : 'text.secondary' }}
                      >
                        {formatCurrency(row.debt)}
                      </Typography>
                    </Box>
                  </Paper>
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
                label="transactions"
                dense
              />
            </>
          ) : (
            <>
              <TableContainer sx={{ maxHeight: 'calc(100vh - 350px)', flex: 1 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      {COLUMNS.map((col) => (
                        <TableCell
                          key={col.id}
                          align={col.align || 'left'}
                          sx={{ minWidth: col.minWidth, whiteSpace: 'nowrap', fontWeight: 600 }}
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
                    {paginated.map((row) => (
                      <TableRow
                        key={row.id}
                        hover
                        sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                        onClick={() => navigate(`/partners/${row.partnerId}`)}
                      >
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box
                              sx={{
                                width: 36,
                                height: 36,
                                borderRadius: 2,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                bgcolor: alpha(theme.palette.primary.main, 0.08),
                                flexShrink: 0,
                              }}
                            >
                              <AppIcon
                                name="PersonOutline"
                                fallback={PersonOutlineIcon}
                                sx={{ fontSize: 18, color: 'primary.main' }}
                              />
                            </Box>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {row.partnerName}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          {row.category ? (
                            (() => {
                              const cc =
                                (isDark ? CATEGORY_COLORS_DARK : CATEGORY_COLORS)[row.category] ||
                                {};
                              return (
                                <Chip
                                  icon={
                                    <AppIcon
                                      name="CategoryOutlined"
                                      fallback={CategoryOutlinedIcon}
                                      sx={{ fontSize: 12 }}
                                    />
                                  }
                                  label={row.category}
                                  size="small"
                                  sx={{
                                    height: 24,
                                    fontWeight: 600,
                                    fontSize: '0.7rem',
                                    bgcolor: cc.bg || alpha(theme.palette.primary.main, 0.1),
                                    color: cc.color || 'primary.main',
                                    border: `1px solid ${cc.border || 'transparent'}`,
                                  }}
                                />
                              );
                            })()
                          ) : (
                            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                              -
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <AppIcon
                              name="GroupsOutlined"
                              fallback={GroupsOutlinedIcon}
                              sx={{ fontSize: 16, color: 'text.secondary' }}
                            />
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: '0.8rem',
                                color: row.teamName !== '-' ? 'text.primary' : 'text.disabled',
                              }}
                            >
                              {row.teamName}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {row.group}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {formatCurrency(row.total)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ color: 'success.main' }}>
                            {formatCurrency(row.paid)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{ color: row.debt > 0 ? 'warning.main' : 'text.secondary' }}
                          >
                            {formatCurrency(row.debt)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                          <Tooltip title="View invoice">
                            <IconButton
                              size="small"
                              onClick={() => setInvoiceViewRow(row)}
                              aria-label="View invoice"
                            >
                              <AppIcon
                                name="VisibilityOutlined"
                                fallback={VisibilityOutlinedIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Open partner">
                            <IconButton
                              size="small"
                              component="a"
                              href={`#/partners/${row.partnerId}`}
                              onClick={(e) => {
                                e.preventDefault();
                                navigate(`/partners/${row.partnerId}`);
                              }}
                              aria-label="Open partner"
                            >
                              <AppIcon
                                name="OpenInNew"
                                fallback={OpenInNewIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
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
                label="transactions"
              />
            </>
          )}
        </Box>
      </BentoCard>
      {/* Invoice / Finance summary popup */}
      <Dialog
        open={Boolean(invoiceViewRow)}
        onClose={() => setInvoiceViewRow(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        {invoiceViewRow &&
          (() => {
            const partner = partners.find((p) => p.id === invoiceViewRow.partnerId);
            const transactions = partner?.financeTransactions ?? [];
            return (
              <>
                <DialogTitle sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Finance summary
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {invoiceViewRow.partnerName}
                  </Typography>
                </DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                  <Box sx={{ mb: 2 }}>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr',
                        gap: 0.5,
                        alignItems: 'baseline',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontWeight: 600 }}
                      >
                        Partner
                      </Typography>
                      <Typography variant="body2">{invoiceViewRow.partnerName}</Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontWeight: 600 }}
                      >
                        Team
                      </Typography>
                      <Typography variant="body2">{invoiceViewRow.teamName}</Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontWeight: 600 }}
                      >
                        Group
                      </Typography>
                      <Typography variant="body2">{invoiceViewRow.group}</Typography>
                    </Box>
                  </Box>
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 2 }}>
                    <Typography
                      variant="overline"
                      sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.08em' }}
                    >
                      Summary
                    </Typography>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        mt: 0.5,
                        py: 0.5,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Typography variant="body2">Total</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatCurrency(invoiceViewRow.total)}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        py: 0.5,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Typography variant="body2">Paid</Typography>
                      <Typography variant="body2" sx={{ color: 'success.main' }}>
                        {formatCurrency(invoiceViewRow.paid)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                      <Typography variant="body2">Debt</Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: invoiceViewRow.debt > 0 ? 'warning.main' : 'text.secondary' }}
                      >
                        {formatCurrency(invoiceViewRow.debt)}
                      </Typography>
                    </Box>
                  </Paper>
                  {transactions.length > 0 && (
                    <>
                      <Typography
                        variant="overline"
                        sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.08em' }}
                      >
                        Transactions
                      </Typography>
                      <TableContainer sx={{ mt: 0.5 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>
                                Amount
                              </TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {transactions.slice(0, 20).map((tx, idx) => (
                              <TableRow key={tx.id ?? idx}>
                                <TableCell>
                                  <Typography variant="body2">
                                    {tx.date ? new Date(tx.date).toLocaleDateString() : '-'}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Typography variant="body2">
                                    {tx.description ?? tx.type ?? '-'}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2">
                                    {typeof tx.amount === 'number'
                                      ? formatCurrency(tx.amount)
                                      : (tx.amount ?? '-')}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                      {transactions.length > 20 && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block', mt: 0.5 }}
                        >
                          Showing first 20 of {transactions.length} transactions.
                        </Typography>
                      )}
                    </>
                  )}
                </DialogContent>
                <DialogActions
                  sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}
                >
                  <Button onClick={() => setInvoiceViewRow(null)} sx={{ textTransform: 'none' }}>
                    Close
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<AppIcon name="OpenInNew" fallback={OpenInNewIcon} />}
                    onClick={() => {
                      navigate(`/partners/${invoiceViewRow.partnerId}`);
                      setInvoiceViewRow(null);
                    }}
                    sx={{ textTransform: 'none' }}
                  >
                    Open partner
                  </Button>
                </DialogActions>
              </>
            );
          })()}
      </Dialog>
      {/* Select partner for new payment */}
      <Dialog
        open={addPaymentOpen && !selectedPartnerForPayment}
        onClose={handleCloseAddPaymentFlow}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 0 }}>Add payment</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choose the partner to record a payment for.
          </Typography>
          <Autocomplete
            value={selectPartnerOption}
            onChange={(_, value) => setSelectPartnerOption(value)}
            options={partners}
            getOptionLabel={(p) => p.name || p.information?.name || p.id || ''}
            renderInput={(params) => (
              <TextField {...params} label="Partner" size="small" placeholder="Search partner..." />
            )}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 0 }}>
          <Button onClick={handleCloseAddPaymentFlow} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disableElevation
            startIcon={<AppIcon name="Add" fallback={AddIcon} />}
            onClick={() => {
              if (selectPartnerOption) {
                setSelectedPartnerForPayment(selectPartnerOption);
                setSelectPartnerOption(null);
              }
            }}
            disabled={!selectPartnerOption}
            sx={{
              textTransform: 'none',
              bgcolor: 'success.main',
              '&:hover': { bgcolor: 'success.dark' },
            }}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>
      <AddPaymentDialog
        open={Boolean(selectedPartnerForPayment)}
        onClose={handleCloseAddPaymentFlow}
        partner={selectedPartnerForPayment || undefined}
        onSubmit={handleCreatePaymentFromFinances}
      />
      {/* ===== Activity Log Dialog ===== */}
      <Dialog
        open={activityLogOpen}
        onClose={closeActivityLog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            maxHeight: '80vh',
          },
        }}
      >
        {/* Dialog header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 3,
            py: 2,
            borderBottom: 'none',
            bgcolor: isDark
              ? alpha(theme.palette.primary.main, 0.06)
              : alpha(theme.palette.primary.main, 0.04),
          }}
        >
          <AppIcon
            name="History"
            fallback={HistoryIcon}
            sx={{ color: 'primary.main', fontSize: 24 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.3 }}>
              Finance Activity
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Payment & finance action history
            </Typography>
          </Box>
          <IconButton size="small" onClick={closeActivityLog} sx={{ p: 0.5 }}>
            <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>

        {/* Tab bar */}
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

        <DialogContent sx={{ p: 0 }}>
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
                Actions like adding, editing, and deleting payments will appear here.
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
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.68rem',
                            borderRadius: 1.5,
                            height: 24,
                          }}
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
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            {`${activityLogs.length} log entr${activityLogs.length !== 1 ? 'ies' : 'y'}`}
          </Typography>
          <Button
            onClick={closeActivityLog}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}
