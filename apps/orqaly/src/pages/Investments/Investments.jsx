/**
 * Investments - Deal marketplace, investor profiles, pools, portfolio.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
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
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  CircularProgress,
  Collapse,
  LinearProgress,
  alpha,
  useTheme,
  useMediaQuery,
  Snackbar,
  Alert,
  Rating,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Menu,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import HistoryIcon from '@mui/icons-material/History';
import AddIcon from '@mui/icons-material/Add';
import PoolOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import SearchIcon from '@mui/icons-material/Search';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import ShowChartOutlinedIcon from '@mui/icons-material/ShowChartOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FormDialog from '../../components/Common/FormDialog';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageLayout from '../../components/Common/PageLayout';
import PillTabStrip from '../../components/Common/PillTabStrip';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import Pagination from '../../components/Common/Pagination';
import usePagination from '../../hooks/usePagination';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import {
  listDeals,
  createDeal,
  listInvestors,
  createInvestor,
  listPools,
  createPool,
  commitToDeal,
  listCommitments,
  startCouncil,
  getCouncilStatus,
} from '../../services/investmentService';

import AppIcon from '../../components/icons/AppIcon';

const VALID_TABS = ['deals', 'investors', 'pools', 'portfolio'];

const RISK_COLORS = { low: '#059669', medium: '#D97706', high: '#DC2626', critical: '#7C3AED' };
const DEAL_STATUS_COLORS = {
  draft: '#888',
  pending_review: '#D97706',
  seeking_funding: '#2563EB',
  funded: '#059669',
  active: '#10B981',
  distributing_returns: '#7C3AED',
  completed: '#059669',
  failed: '#DC2626',
  cancelled: '#888',
};

export default function Investments() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [copiedInvestorId, setCopiedInvestorId] = useState(null);
  const [councilLoading, setCouncilLoading] = useState(false);
  const [councilJobId, setCouncilJobId] = useState(null);
  const [councilResult, setCouncilResult] = useState(null);
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [showMetrics, setShowMetrics] = useShowMetrics('investments');
  const [tab, setTab] = useState(() => {
    const requested = searchParams.get('tab');
    return VALID_TABS.includes(requested) ? requested : 'deals';
  });
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('orch_invest_view') || 'card';
    } catch {
      return 'card';
    }
  });
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [addMenuAnchor, setAddMenuAnchor] = useState(null);

  // Data
  const [deals, setDeals] = useState([]);
  const [investors, setInvestors] = useState([]);
  const [pools, setPools] = useState([]);
  const [commitments, setCommitments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Dialogs
  const [dealDialog, setDealDialog] = useState(false);
  const [investorDialog, setInvestorDialog] = useState(false);
  const [poolDialog, setPoolDialog] = useState(false);
  const [dealForm, setDealForm] = useState({
    title: '',
    description: '',
    industry: '',
    required_amount: '',
    risk_level: 'medium',
    roi_projections: { expected: '' },
    revenue_share_terms: { share_pct: '' },
  });
  const [investorForm, setInvestorForm] = useState({
    name: '',
    bio: '',
    investor_type: 'human',
    investment_capacity: '',
    risk_profile: 'moderate',
  });
  const [poolForm, setPoolForm] = useState({
    name: '',
    description: '',
    target_amount: '',
    min_contribution: '1',
  });
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [d, i, p, c] = await Promise.all([
        listDeals(),
        listInvestors(),
        listPools(),
        listCommitments(),
      ]);
      setDeals(Array.isArray(d) ? d : []);
      setInvestors(Array.isArray(i) ? i : []);
      setPools(Array.isArray(p) ? p : []);
      setCommitments(Array.isArray(c) ? c : []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleStartCouncil = useCallback(
    async (teamId) => {
      setCouncilLoading(true);
      setCouncilResult(null);
      try {
        const result = await startCouncil(teamId);
        if (result.job_id) {
          setCouncilJobId(result.job_id);
          let attempts = 0;
          const poll = setInterval(async () => {
            attempts++;
            try {
              const status = await getCouncilStatus(result.job_id);
              if (status.status === 'done') {
                clearInterval(poll);
                setCouncilResult({ success: true, deal_title: status.result?.deal_title });
                setCouncilLoading(false);
                setToast({
                  open: true,
                  message: `Council complete! Deal "${status.result?.deal_title}" posted for review.`,
                  severity: 'success',
                });
                await loadAll();
              } else if (status.status === 'failed') {
                clearInterval(poll);
                setCouncilResult({ success: false, error: status.error });
                setCouncilLoading(false);
                setToast({
                  open: true,
                  message: `Council failed: ${status.error}`,
                  severity: 'error',
                });
              }
            } catch {
              /* keep polling */
            }
            if (attempts > 60) {
              clearInterval(poll);
              setCouncilLoading(false);
            }
          }, 3000);
        }
      } catch (err) {
        setToast({ open: true, message: err.message, severity: 'error' });
        setCouncilLoading(false);
      }
    },
    [loadAll]
  );

  const handleCopyInvestorLink = useCallback((investorId) => {
    navigator.clipboard.writeText(`${window.location.origin}/investments/investor/${investorId}`);
    setCopiedInvestorId(investorId);
    setTimeout(() => setCopiedInvestorId(null), 2000);
  }, []);

  // Metrics
  const metrics = useMemo(() => {
    const totalFunding = deals.reduce((s, d) => s + Number(d.current_funded || 0), 0);
    const totalRequired = deals.reduce((s, d) => s + Number(d.required_amount || 0), 0);
    const activePools = pools.filter((p) => p.status === 'forming' || p.status === 'active').length;
    return [
      {
        label: 'Deals',
        value: deals.length,
        color: theme.palette.primary.main,
        icon: ShowChartOutlinedIcon,
      },
      { label: 'Investors', value: investors.length, color: '#7C3AED', icon: PersonOutlinedIcon },
      {
        label: 'Funded',
        value: `$${totalFunding.toFixed(0)}`,
        color: '#059669',
        icon: AccountBalanceWalletOutlinedIcon,
      },
      { label: 'Pools', value: activePools, color: '#2563EB', icon: GroupsOutlinedIcon },
    ];
  }, [deals, investors, pools, theme]);

  // CRUD handlers
  const handleCreateDeal = async () => {
    if (!dealForm.title || !dealForm.required_amount) return;
    setSaving(true);
    try {
      await createDeal({
        ...dealForm,
        required_amount: Number(dealForm.required_amount),
        roi_projections: { expected: Number(dealForm.roi_projections.expected) || 0 },
        revenue_share_terms: { share_pct: Number(dealForm.revenue_share_terms.share_pct) || 0 },
      });
      setToast({ open: true, message: 'Deal created', severity: 'success' });
      setDealDialog(false);
      setDealForm({
        title: '',
        description: '',
        industry: '',
        required_amount: '',
        risk_level: 'medium',
        roi_projections: { expected: '' },
        revenue_share_terms: { share_pct: '' },
      });
      loadAll();
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateInvestor = async () => {
    if (!investorForm.name) return;
    setSaving(true);
    try {
      await createInvestor({
        ...investorForm,
        investment_capacity: Number(investorForm.investment_capacity) || 0,
      });
      setToast({ open: true, message: 'Investor registered', severity: 'success' });
      setInvestorDialog(false);
      setInvestorForm({
        name: '',
        bio: '',
        investor_type: 'human',
        investment_capacity: '',
        risk_profile: 'moderate',
      });
      loadAll();
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePool = async () => {
    if (!poolForm.name || !poolForm.target_amount) return;
    setSaving(true);
    try {
      await createPool({
        ...poolForm,
        target_amount: Number(poolForm.target_amount),
        min_contribution: Number(poolForm.min_contribution) || 1,
      });
      setToast({ open: true, message: 'Pool created', severity: 'success' });
      setPoolDialog(false);
      setPoolForm({ name: '', description: '', target_amount: '', min_contribution: '1' });
      loadAll();
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const filteredDeals = useMemo(() => {
    if (!search) return deals;
    const q = search.toLowerCase();
    return deals.filter(
      (d) => d.title.toLowerCase().includes(q) || (d.industry || '').toLowerCase().includes(q)
    );
  }, [deals, search]);

  // Pagination for each tab's data
  const dealsPagination = usePagination(filteredDeals, {
    surfaceId: 'investments.list',
    defaultRowsPerPage: 12,
    resetOn: [search, tab],
  });
  const investorsPagination = usePagination(investors, {
    surfaceId: 'investments.investors',
    defaultRowsPerPage: 12,
    resetOn: [tab],
  });
  const poolsPagination = usePagination(pools, {
    surfaceId: 'investments.pools',
    defaultRowsPerPage: 12,
    resetOn: [tab],
  });
  const commitmentsPagination = usePagination(commitments, {
    surfaceId: 'investments.portfolio',
    defaultRowsPerPage: 10,
    resetOn: [tab],
  });

  return (
    <PageLayout showTitleBlock={false}>
      <BentoCard
        title="Investments"
        subtitle={showMetrics ? `${deals.length} deals` : undefined}
        icon={TrendingUpOutlinedIcon}
        iconColor={theme.palette.primary.main}
        noPadding
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
        pageInfoPath="/investments"
      >
        {/* Metrics */}
        <Collapse in={showMetrics}>
          <Box sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}>
            <Box
              sx={{
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: {
                  xs: 'repeat(2, minmax(0, 1fr))',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  md: 'repeat(4, minmax(0, 1fr))',
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

        {/* Pill Tabs */}
        <PillTabStrip>
          {[
            { id: 'deals', label: 'Deals', icon: ShowChartOutlinedIcon },
            { id: 'investors', label: 'Investors', icon: PersonOutlinedIcon },
            { id: 'pools', label: 'Pools', icon: GroupsOutlinedIcon },
            { id: 'portfolio', label: 'Portfolio', icon: AccountBalanceWalletOutlinedIcon },
          ].map((t) => (
            <Button
              key={t.id}
              startIcon={isMobile ? undefined : <AppIcon fallback={t.icon} sx={{ fontSize: 18 }} />}
              onClick={() => setTab(t.id)}
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
                bgcolor: tab === t.id ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                color: tab === t.id ? 'primary.main' : 'text.secondary',
                boxShadow:
                  tab === t.id ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}` : 'none',
                '&:hover': {
                  bgcolor:
                    tab === t.id
                      ? alpha(theme.palette.primary.main, 0.15)
                      : alpha(theme.palette.text.primary, 0.05),
                },
              }}
            >
              {t.label}
            </Button>
          ))}
        </PillTabStrip>

        {/* Toolbar (below tabs) */}
        <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, pt: 1, pb: 0, gap: 1 }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            size="small"
            onChange={(_, v) => {
              if (v) {
                setViewMode(v);
                try {
                  localStorage.setItem('orch_invest_view', v);
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
            <ToggleButton value="card" aria-label="Card view" sx={{ borderRadius: '8px 0 0 8px' }}>
              <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 18 }} />
            </ToggleButton>
            <ToggleButton value="list" aria-label="List view" sx={{ borderRadius: '0 8px 8px 0' }}>
              <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 18 }} />
            </ToggleButton>
          </ToggleButtonGroup>

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

          <Tooltip title="Add new">
            <IconButton
              onClick={(e) => setAddMenuAnchor(e.currentTarget)}
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
              <AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={addMenuAnchor}
            open={Boolean(addMenuAnchor)}
            onClose={() => setAddMenuAnchor(null)}
            slotProps={{
              paper: {
                sx: { minWidth: 200, bgcolor: 'background.paper', backgroundImage: 'none' },
              },
            }}
          >
            <MenuItem
              onClick={() => {
                setAddMenuAnchor(null);
                setDealDialog(true);
              }}
            >
              <ListItemIcon>
                <AppIcon
                  name="ShowChartOutlined"
                  fallback={ShowChartOutlinedIcon}
                  fontSize="small"
                  sx={{ color: 'primary.main' }}
                />
              </ListItemIcon>
              <ListItemText>New Deal</ListItemText>
            </MenuItem>
            <MenuItem
              onClick={() => {
                setAddMenuAnchor(null);
                setInvestorDialog(true);
              }}
            >
              <ListItemIcon>
                <AppIcon
                  name="PersonOutlined"
                  fallback={PersonOutlinedIcon}
                  fontSize="small"
                  sx={{ color: 'info.main' }}
                />
              </ListItemIcon>
              <ListItemText>Register Investor</ListItemText>
            </MenuItem>
            <MenuItem
              onClick={() => {
                setAddMenuAnchor(null);
                setPoolDialog(true);
              }}
            >
              <ListItemIcon>
                <AppIcon
                  name="AccountBalanceOutlined"
                  fallback={PoolOutlinedIcon}
                  fontSize="small"
                  sx={{ color: 'warning.main' }}
                />
              </ListItemIcon>
              <ListItemText>Create Pool</ListItemText>
            </MenuItem>
          </Menu>
        </Box>

        {/* Divider */}
        <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', mt: 1.5 }} />

        {/* Divider */}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        )}

        {/* ── Deals Tab ───────────────────────────────────── */}
        {!loading && tab === 'deals' && (
          <Box sx={{ p: 1.5 }}>
            {filteredDeals.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <AppIcon
                  name="ShowChartOutlined"
                  fallback={ShowChartOutlinedIcon}
                  sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
                />
                <Typography color="text.secondary">
                  No deals yet. Create your first deal to get started.
                </Typography>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {dealsPagination.paginatedData.map((deal) => (
                  <Grid key={deal.id} size={{ xs: 12, sm: 6, md: 4 }}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        '&:hover': {
                          borderColor:
                            DEAL_STATUS_COLORS[deal.status] || theme.palette.primary.main,
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Chip
                          label={deal.status}
                          size="small"
                          sx={{
                            fontSize: '0.6rem',
                            height: 20,
                            bgcolor: alpha(DEAL_STATUS_COLORS[deal.status] || '#888', 0.12),
                            color: DEAL_STATUS_COLORS[deal.status] || '#888',
                            fontWeight: 700,
                          }}
                        />
                        <Chip
                          label={deal.risk_level}
                          size="small"
                          sx={{
                            fontSize: '0.6rem',
                            height: 20,
                            bgcolor: alpha(RISK_COLORS[deal.risk_level] || '#888', 0.12),
                            color: RISK_COLORS[deal.risk_level] || '#888',
                          }}
                        />
                      </Box>
                      <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
                        {deal.title}
                      </Typography>
                      {deal.industry && (
                        <Chip
                          label={deal.industry}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.6rem', height: 18, mb: 1, alignSelf: 'flex-start' }}
                        />
                      )}
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          mb: 1,
                          flex: 1,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {deal.description || 'No description'}
                      </Typography>
                      {/* Funding bar */}
                      <Box sx={{ mb: 0.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="caption" fontWeight={600}>
                            ${Number(deal.current_funded || 0).toFixed(0)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ${Number(deal.required_amount).toFixed(0)}
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={Number(deal.funding_pct || 0)}
                          color={deal.funding_pct >= 100 ? 'success' : 'primary'}
                          sx={{ height: 6, borderRadius: 3 }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 'auto' }}>
                        {deal.roi_projections?.expected && (
                          <Typography variant="caption" color="text.secondary">
                            ROI: {deal.roi_projections.expected}%
                          </Typography>
                        )}
                        {deal.revenue_share_terms?.share_pct && (
                          <Typography variant="caption" color="text.secondary">
                            Rev: {deal.revenue_share_terms.share_pct}%
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.disabled">
                          {new Date(deal.created_at).toLocaleDateString()}
                        </Typography>
                      </Box>
                      <Box sx={{ mt: 1 }}>
                        <Button
                          size="small"
                          startIcon={<AppIcon name="OpenInNew" fallback={OpenInNewIcon} />}
                          onClick={() => navigate(`/investments/deal/${deal.id}`)}
                        >
                          View Deal
                        </Button>
                      </Box>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            )}
            <Pagination
              count={dealsPagination.totalCount}
              page={dealsPagination.page}
              rowsPerPage={dealsPagination.rowsPerPage}
              rowsPerPageOptions={dealsPagination.rowsPerPageOptions}
              onPageChange={dealsPagination.setPage}
              onRowsPerPageChange={dealsPagination.setRowsPerPage}
              onLoadAll={dealsPagination.loadAll}
              onCollapseAll={dealsPagination.collapseAll}
              allMode={dealsPagination.allMode}
              label="investments"
              dense
            />
          </Box>
        )}

        {/* ── Investors Tab ────────────────────────────────── */}
        {!loading && tab === 'investors' && (
          <Box sx={{ p: 1.5 }}>
            {investors.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <AppIcon
                  name="PersonOutlined"
                  fallback={PersonOutlinedIcon}
                  sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
                />
                <Typography color="text.secondary">No investors registered yet.</Typography>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {investorsPagination.paginatedData.map((inv) => (
                  <Grid key={inv.id} size={{ xs: 12, sm: 6, md: 4 }}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            bgcolor: alpha(
                              inv.investor_type === 'ai' ? '#7C3AED' : theme.palette.primary.main,
                              0.12
                            ),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {inv.investor_type === 'ai' ? (
                            <AppIcon
                              name="SmartToyOutlined"
                              fallback={SmartToyOutlinedIcon}
                              sx={{ fontSize: 18, color: '#7C3AED' }}
                            />
                          ) : (
                            <AppIcon
                              name="PersonOutlined"
                              fallback={PersonOutlinedIcon}
                              sx={{ fontSize: 18, color: 'primary.main' }}
                            />
                          )}
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" fontWeight={700}>
                            {inv.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {inv.investor_type === 'ai' ? 'AI Investor' : 'Human'} ·{' '}
                            {inv.risk_profile}
                          </Typography>
                        </Box>
                        <Chip
                          label={`${Math.round(inv.trust_score)}/100`}
                          size="small"
                          color={
                            inv.trust_score >= 70
                              ? 'success'
                              : inv.trust_score >= 40
                                ? 'warning'
                                : 'error'
                          }
                          variant="outlined"
                          sx={{ fontSize: '0.6rem', height: 20 }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" color="text.secondary">
                          Capacity: ${Number(inv.investment_capacity || 0).toFixed(0)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Invested: ${Number(inv.total_invested || 0).toFixed(0)}
                        </Typography>
                      </Box>
                      <Box sx={{ mt: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Button
                          size="small"
                          startIcon={<AppIcon name="OpenInNew" fallback={OpenInNewIcon} />}
                          onClick={() => navigate(`/investments/investor/${inv.id}`)}
                        >
                          Profile
                        </Button>
                        <Tooltip
                          title={copiedInvestorId === inv.id ? 'Copied!' : 'Copy shareable link'}
                        >
                          <IconButton size="small" onClick={() => handleCopyInvestorLink(inv.id)}>
                            <AppIcon
                              name="ContentCopy"
                              fallback={ContentCopyIcon}
                              fontSize="small"
                            />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            )}
            <Pagination
              count={investorsPagination.totalCount}
              page={investorsPagination.page}
              rowsPerPage={investorsPagination.rowsPerPage}
              rowsPerPageOptions={investorsPagination.rowsPerPageOptions}
              onPageChange={investorsPagination.setPage}
              onRowsPerPageChange={investorsPagination.setRowsPerPage}
              onLoadAll={investorsPagination.loadAll}
              onCollapseAll={investorsPagination.collapseAll}
              allMode={investorsPagination.allMode}
              label="investors"
              dense
            />
          </Box>
        )}

        {/* ── Pools Tab ────────────────────────────────────── */}
        {!loading && tab === 'pools' && (
          <Box sx={{ p: 1.5 }}>
            {pools.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <AppIcon
                  name="GroupsOutlined"
                  fallback={GroupsOutlinedIcon}
                  sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
                />
                <Typography color="text.secondary">No investment pools yet.</Typography>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {poolsPagination.paginatedData.map((pool) => {
                  const pct =
                    pool.target_amount > 0
                      ? Math.min(100, (Number(pool.current_amount) / pool.target_amount) * 100)
                      : 0;
                  const members = pool.investment_pool_members?.length || 0;
                  return (
                    <Grid key={pool.id} size={{ xs: 12, sm: 6, md: 4 }}>
                      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2" fontWeight={700}>
                            {pool.name}
                          </Typography>
                          <Chip
                            label={pool.status}
                            size="small"
                            sx={{ fontSize: '0.6rem', height: 20 }}
                          />
                        </Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block', mb: 1 }}
                        >
                          {pool.description || 'No description'}
                        </Typography>
                        <Box sx={{ mb: 0.5 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="caption" fontWeight={600}>
                              ${Number(pool.current_amount || 0).toFixed(0)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              ${Number(pool.target_amount).toFixed(0)}
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={pct}
                            sx={{ height: 5, borderRadius: 3 }}
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {members} member{members !== 1 ? 's' : ''} · Min: $
                          {Number(pool.min_contribution || 1).toFixed(0)}
                        </Typography>
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
            )}
            <Pagination
              count={poolsPagination.totalCount}
              page={poolsPagination.page}
              rowsPerPage={poolsPagination.rowsPerPage}
              rowsPerPageOptions={poolsPagination.rowsPerPageOptions}
              onPageChange={poolsPagination.setPage}
              onRowsPerPageChange={poolsPagination.setRowsPerPage}
              onLoadAll={poolsPagination.loadAll}
              onCollapseAll={poolsPagination.collapseAll}
              allMode={poolsPagination.allMode}
              label="pools"
              dense
            />
          </Box>
        )}

        {/* ── Portfolio Tab ─────────────────────────────────── */}
        {!loading && tab === 'portfolio' && (
          <Box sx={{ p: 1.5 }}>
            {commitments.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <AppIcon
                  name="AccountBalanceWalletOutlined"
                  fallback={AccountBalanceWalletOutlinedIcon}
                  sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
                />
                <Typography color="text.secondary">
                  No investments yet. Browse deals and start investing.
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Deal</TableCell>
                      <TableCell>Amount</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Returns</TableCell>
                      <TableCell>Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {commitmentsPagination.paginatedData.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {c.investment_deals?.title || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>${Number(c.amount).toFixed(2)}</TableCell>
                        <TableCell>
                          <Chip
                            label={c.commitment_type}
                            size="small"
                            sx={{ fontSize: '0.6rem', height: 18 }}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={c.status}
                            size="small"
                            color={c.status === 'active' ? 'success' : 'default'}
                            variant="outlined"
                            sx={{ fontSize: '0.6rem', height: 18 }}
                          />
                        </TableCell>
                        <TableCell>${Number(c.returns_received || 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(c.committed_at).toLocaleDateString()}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            <Pagination
              count={commitmentsPagination.totalCount}
              page={commitmentsPagination.page}
              rowsPerPage={commitmentsPagination.rowsPerPage}
              rowsPerPageOptions={commitmentsPagination.rowsPerPageOptions}
              onPageChange={commitmentsPagination.setPage}
              onRowsPerPageChange={commitmentsPagination.setRowsPerPage}
              onLoadAll={commitmentsPagination.loadAll}
              onCollapseAll={commitmentsPagination.collapseAll}
              allMode={commitmentsPagination.allMode}
              label="commitments"
            />
          </Box>
        )}
      </BentoCard>
      {/* ── Create Deal Dialog ──────────────────────────────── */}
      <FormDialog
        open={dealDialog}
        onClose={() => setDealDialog(false)}
        title="New Deal"
        icon={TrendingUpOutlinedIcon}
        maxWidth="sm"
        primaryLabel={saving ? 'Creating...' : 'Create Deal'}
        onPrimary={handleCreateDeal}
        primaryDisabled={saving || !dealForm.title || !dealForm.required_amount}
        primaryLoading={saving}
        contentSx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        <TextField
          label="Title"
          required
          fullWidth
          value={dealForm.title}
          onChange={(e) => setDealForm((f) => ({ ...f, title: e.target.value }))}
        />
        <TextField
          label="Description"
          fullWidth
          multiline
          rows={2}
          value={dealForm.description}
          onChange={(e) => setDealForm((f) => ({ ...f, description: e.target.value }))}
        />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Required Amount ($)"
            type="number"
            fullWidth
            value={dealForm.required_amount}
            onChange={(e) => setDealForm((f) => ({ ...f, required_amount: e.target.value }))}
          />
          <TextField
            label="Industry"
            fullWidth
            value={dealForm.industry}
            onChange={(e) => setDealForm((f) => ({ ...f, industry: e.target.value }))}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Expected ROI (%)"
            type="number"
            fullWidth
            value={dealForm.roi_projections.expected}
            onChange={(e) =>
              setDealForm((f) => ({
                ...f,
                roi_projections: { ...f.roi_projections, expected: e.target.value },
              }))
            }
          />
          <TextField
            label="Revenue Share (%)"
            type="number"
            fullWidth
            value={dealForm.revenue_share_terms.share_pct}
            onChange={(e) =>
              setDealForm((f) => ({
                ...f,
                revenue_share_terms: { ...f.revenue_share_terms, share_pct: e.target.value },
              }))
            }
          />
        </Box>
        <FormControl fullWidth>
          <InputLabel>Risk Level</InputLabel>
          <Select
            value={dealForm.risk_level}
            label="Risk Level"
            onChange={(e) => setDealForm((f) => ({ ...f, risk_level: e.target.value }))}
          >
            {Object.keys(RISK_COLORS).map((r) => (
              <MenuItem key={r} value={r}>
                {r}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </FormDialog>
      {/* ── Register Investor Dialog ────────────────────────── */}
      <FormDialog
        open={investorDialog}
        onClose={() => setInvestorDialog(false)}
        title="Register Investor"
        icon={GroupsOutlinedIcon}
        maxWidth="sm"
        primaryLabel={saving ? 'Registering...' : 'Register'}
        onPrimary={handleCreateInvestor}
        primaryDisabled={saving || !investorForm.name}
        primaryLoading={saving}
        contentSx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        <TextField
          label="Name"
          required
          fullWidth
          value={investorForm.name}
          onChange={(e) => setInvestorForm((f) => ({ ...f, name: e.target.value }))}
        />
        <TextField
          label="Bio"
          fullWidth
          multiline
          rows={2}
          value={investorForm.bio}
          onChange={(e) => setInvestorForm((f) => ({ ...f, bio: e.target.value }))}
        />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl fullWidth>
            <InputLabel>Type</InputLabel>
            <Select
              value={investorForm.investor_type}
              label="Type"
              onChange={(e) => setInvestorForm((f) => ({ ...f, investor_type: e.target.value }))}
            >
              <MenuItem value="human">Human</MenuItem>
              <MenuItem value="ai">AI Agent</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Risk Profile</InputLabel>
            <Select
              value={investorForm.risk_profile}
              label="Risk Profile"
              onChange={(e) => setInvestorForm((f) => ({ ...f, risk_profile: e.target.value }))}
            >
              <MenuItem value="conservative">Conservative</MenuItem>
              <MenuItem value="moderate">Moderate</MenuItem>
              <MenuItem value="aggressive">Aggressive</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <TextField
          label="Investment Capacity ($)"
          type="number"
          fullWidth
          value={investorForm.investment_capacity}
          onChange={(e) => setInvestorForm((f) => ({ ...f, investment_capacity: e.target.value }))}
        />
      </FormDialog>
      {/* ── Create Pool Dialog ──────────────────────────────── */}
      <FormDialog
        open={poolDialog}
        onClose={() => setPoolDialog(false)}
        title="Create Investment Pool"
        icon={PoolOutlinedIcon}
        maxWidth="sm"
        primaryLabel={saving ? 'Creating...' : 'Create Pool'}
        onPrimary={handleCreatePool}
        primaryDisabled={saving || !poolForm.name || !poolForm.target_amount}
        primaryLoading={saving}
        contentSx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        <TextField
          label="Pool Name"
          required
          fullWidth
          value={poolForm.name}
          onChange={(e) => setPoolForm((f) => ({ ...f, name: e.target.value }))}
        />
        <TextField
          label="Description"
          fullWidth
          multiline
          rows={2}
          value={poolForm.description}
          onChange={(e) => setPoolForm((f) => ({ ...f, description: e.target.value }))}
        />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Target Amount ($)"
            type="number"
            fullWidth
            value={poolForm.target_amount}
            onChange={(e) => setPoolForm((f) => ({ ...f, target_amount: e.target.value }))}
          />
          <TextField
            label="Min Contribution ($)"
            type="number"
            fullWidth
            value={poolForm.min_contribution}
            onChange={(e) => setPoolForm((f) => ({ ...f, min_contribution: e.target.value }))}
          />
        </Box>
      </FormDialog>
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
