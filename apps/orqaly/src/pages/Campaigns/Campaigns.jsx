import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Chip,
  Button,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Snackbar,
  CircularProgress,
  useTheme,
  alpha,
  Divider,
  Stack,
  Popover,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import FilterListIcon from '@mui/icons-material/FilterList';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import InsightsIcon from '@mui/icons-material/Insights';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import Pagination from '../../components/Common/Pagination';
import usePagination from '../../hooks/usePagination';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import { campaignsService } from '../../services/campaignsService';

import AppIcon from '../../components/icons/AppIcon';

const COLUMNS = [
  { id: 'id', label: 'ID', align: 'left', minWidth: 70 },
  { id: 'name', label: 'Name', align: 'left', minWidth: 260 },
  { id: 'status', label: 'Status', align: 'center', minWidth: 110 },
  { id: 'channel', label: 'Channel', align: 'center', minWidth: 100 },
  { id: 'impressions', label: 'Impressions', align: 'center', minWidth: 110 },
  { id: 'clicks', label: 'Clicks', align: 'center', minWidth: 90 },
  { id: 'ctr', label: 'CTR', align: 'center', minWidth: 90 },
  { id: 'conversions', label: 'Conversions', align: 'center', minWidth: 110 },
  { id: 'cvr', label: 'CVR', align: 'center', minWidth: 90 },
  { id: 'bid', label: 'Bid', align: 'center', minWidth: 120 },
  { id: 'cpc', label: 'CPC', align: 'center', minWidth: 90 },
  { id: 'cpa', label: 'CPA', align: 'center', minWidth: 90 },
  { id: 'spend', label: 'Spend', align: 'center', minWidth: 90 },
  { id: 'dailyLimit', label: 'Daily limit', align: 'center', minWidth: 110 },
  { id: 'createdAt', label: 'Created', align: 'center', minWidth: 110 },
  { id: 'actions', label: 'Actions', align: 'right', minWidth: 110 },
];

const DEFAULT_FILTERS = {
  status: 'All',
  channel: 'All',
};

function formatNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

function formatPercent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return '0%';
  return `${n.toFixed(2)}%`;
}

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return '$0';
  const abs = Math.abs(n);
  const isInt = Math.round(abs) === abs;
  const decimals = abs < 1 ? 2 : isInt ? 0 : 2;
  return `$${n.toFixed(decimals)}`;
}

function formatCreated(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 16);
  // Match screenshot (DD/MM/YY).
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function bidLabel(bid) {
  if (!bid) return '-';
  if (typeof bid === 'string') return bid;
  if (typeof bid === 'object') {
    const type = String(bid.type || bid.model || 'CPM').toUpperCase();
    const amount = Number(bid.amount ?? bid.value ?? 0);
    if (Number.isFinite(amount) && amount > 0) return `${type} ${formatMoney(amount)}`;
    return type;
  }
  return String(bid);
}

function normalizeStatus(status) {
  const s = String(status || '').trim();
  if (!s) return '-';
  if (s.toLowerCase() === 'active') return 'Active';
  if (s.toLowerCase() === 'paused') return 'Paused';
  if (s.toLowerCase() === 'stopped') return 'Stopped';
  if (s.toLowerCase() === 'disabled') return 'Disabled';
  return s;
}

function safeNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[,"\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function exportCampaignsToCsv(list, filename = 'campaigns.csv') {
  const headers = [
    'id',
    'name',
    'status',
    'channel',
    'impressions',
    'clicks',
    'ctr',
    'conversions',
    'cvr',
    'bid',
    'cpc',
    'cpa',
    'spend',
    'dailyLimit',
    'createdAt',
  ];
  const lines = [headers.join(',')];
  (Array.isArray(list) ? list : []).forEach((r) => {
    const row = {
      id: r?.id ?? '',
      name: r?.name ?? '',
      status: normalizeStatus(r?.status),
      channel: r?.channel ?? '',
      impressions: r?.impressions ?? 0,
      clicks: r?.clicks ?? 0,
      ctr: r?.ctr ?? '',
      conversions: r?.conversions ?? 0,
      cvr: r?.cvr ?? '',
      bid: typeof r?.bid === 'object' ? JSON.stringify(r.bid) : (r?.bid ?? ''),
      cpc: r?.cpc ?? '',
      cpa: r?.cpa ?? '',
      spend: r?.spend ?? '',
      dailyLimit: r?.dailyLimit ?? '',
      createdAt: r?.createdAt ?? '',
    };
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  });

  const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Campaigns() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [showMetrics, setShowMetrics] = useShowMetrics('campaigns');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [toast, setToast] = useState(null);
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);

  // Industry & network connection states
  const [selectedIndustry, setSelectedIndustry] = useState('All');
  const [industryAnchorEl, setIndustryAnchorEl] = useState(null);
  const [connectionType, setConnectionType] = useState('All'); // All | S2S Connection | API Integration | Affiliate Link | Webhook Integration
  const [typeAnchorEl, setTypeAnchorEl] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // disconnected | connecting | connected
  const [logs, setLogs] = useState([]);

  // Auto-generate receiving stream logs for campaigns
  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    const interval = setInterval(() => {
      const id = Math.floor(1000 + Math.random() * 9000);
      const user = `usr_${Math.floor(100 + Math.random() * 900)}`;
      const amount = (Math.random() * 500 + 5).toFixed(2);
      const camp = `Campaign_${Math.floor(10 + Math.random() * 90)}`;

      const gamblingEvents = {
        'S2S Connection': [
          `S2S Postback: FTD received for player ${user} on ${camp} - Value: $${amount}`,
          `S2S Postback: Deposit transaction tracked - User: ${user} - Amount: $${(amount * 0.8).toFixed(2)}`,
          `S2S Postback: CPA payout validated for player ${user}`,
        ],
        'API Integration': [
          `API Sync: NGR payload received from network provider - Total: $${(amount * 1.5).toFixed(2)}`,
          `API Sync: GGR metrics imported - Campaign: ${camp} - Revenue: $${(amount * 1.9).toFixed(2)}`,
          `API Sync: Active player retention coefficients updated`,
        ],
        'Affiliate Link': [
          `Affiliate Link: Click tracked - Geo: US - Campaign: ${camp}`,
          `Affiliate Link: Referral session initiated for click_id: clk_${id}`,
        ],
        'Webhook Integration': [
          `Webhook Event: Active Player session registered for user ${user}`,
          `Webhook Event: Player activity heartbeat ping from game client`,
        ],
      };

      const ecommerceEvents = {
        'S2S Connection': [
          `S2S Postback: Conversion pixel fallback executed for order ID: O-${id}`,
        ],
        'API Integration': [
          `API Sync: Average Order Value (AOV) calculated: $${(amount * 0.4).toFixed(2)}`,
          `API Sync: Repeat purchase rate updated for storefront integration`,
        ],
        'Affiliate Link': [
          `Affiliate Link: Purchase completed - Campaign: ${camp} - Revenue: $${amount}`,
          `Affiliate Link: Referral cookie matched for order O-${id}`,
        ],
        'Webhook Integration': [
          `Webhook Event: Order completed from referral - ID: O-${id} - Value: $${amount}`,
          `Webhook Event: Refund request logged - Order: O-${id} - Status: Pending`,
        ],
      };

      const fintechEvents = {
        'S2S Connection': [
          `S2S Postback: Account funded event for user ${user} - Deposit: $${(amount * 5).toFixed(2)}`,
          `S2S Postback: Account creation callback - CPL verified for user_${id}`,
        ],
        'API Integration': [
          `API Sync: KYC verification success tracked for user_${id}`,
          `API Sync: ARPU calculations refreshed - Average: $${(amount * 0.9).toFixed(2)}`,
        ],
        'Affiliate Link': [
          `Affiliate Link: Redirection lead generated for fintech client`,
          `Affiliate Link: Referral account signup click tracked`,
        ],
        'Webhook Integration': [
          `Webhook Event: Funded volume webhook triggered - Amount: $${(amount * 3.4).toFixed(2)}`,
          `Webhook Event: Live transaction processed via payment provider`,
        ],
      };

      // Determine active verticals & connection types
      const verticals =
        selectedIndustry === 'All' ? ['Gambling', 'Ecommerce', 'Fintech'] : [selectedIndustry];
      const types =
        connectionType === 'All'
          ? ['S2S Connection', 'API Integration', 'Affiliate Link', 'Webhook Integration']
          : [connectionType];

      // Collect matching logs
      let pool = [];
      verticals.forEach((v) => {
        let eventsMap = gamblingEvents;
        if (v === 'Ecommerce') eventsMap = ecommerceEvents;
        if (v === 'Fintech') eventsMap = fintechEvents;

        types.forEach((t) => {
          if (eventsMap[t]) {
            pool = [...pool, ...eventsMap[t]];
          }
        });
      });

      if (pool.length === 0) {
        // Fallback generic event
        pool = [
          `System ping: Port active. Awaiting traffic for vertical: ${selectedIndustry} via ${connectionType}...`,
        ];
      }

      const message = pool[Math.floor(Math.random() * pool.length)];

      setLogs((prev) => [{ time: new Date().toLocaleTimeString(), message }, ...prev.slice(0, 14)]);
    }, 2500);
    return () => clearInterval(interval);
  }, [connectionStatus, selectedIndustry, connectionType]);

  const abortRef = useRef(null);
  const loadNonceRef = useRef(0);

  const columns = useMemo(() => {
    if (connectionStatus !== 'connected') return COLUMNS;

    const baseCols = [
      { id: 'id', label: 'ID', align: 'left', minWidth: 70 },
      { id: 'name', label: 'Name', align: 'left', minWidth: 260 },
      { id: 'status', label: 'Status', align: 'center', minWidth: 110 },
      { id: 'channel', label: 'Channel', align: 'center', minWidth: 100 },
    ];

    const activeVerticals =
      selectedIndustry === 'All' ? ['Gambling', 'Ecommerce', 'Fintech'] : [selectedIndustry];

    let industryCols = [];
    activeVerticals.forEach((vert) => {
      let colsForVert = [];
      if (vert === 'Gambling') {
        colsForVert = [
          { id: 'ftd', label: 'FTD', align: 'center', minWidth: 80, source: 'S2S Connection' },
          {
            id: 'deposits',
            label: 'Deposits',
            align: 'center',
            minWidth: 100,
            source: 'S2S Connection',
          },
          { id: 'ngr', label: 'NGR', align: 'center', minWidth: 100, source: 'API Integration' },
          { id: 'ggr', label: 'GGR', align: 'center', minWidth: 100, source: 'API Integration' },
          {
            id: 'activePlayers',
            label: 'Active Players',
            align: 'center',
            minWidth: 110,
            source: 'Webhook / Pixel',
          },
          {
            id: 'betVolume',
            label: 'Bet Volume',
            align: 'center',
            minWidth: 110,
            source: 'S2S Connection',
          },
          { id: 'cpa', label: 'CPA', align: 'center', minWidth: 90, source: 'S2S Connection' },
        ];
      } else if (vert === 'Ecommerce') {
        colsForVert = [
          { id: 'sales', label: 'Sales', align: 'center', minWidth: 90, source: 'Affiliate Link' },
          {
            id: 'revenue',
            label: 'Revenue',
            align: 'center',
            minWidth: 100,
            source: 'Affiliate Link',
          },
          { id: 'aov', label: 'AOV', align: 'center', minWidth: 90, source: 'API Integration' },
          { id: 'ctr', label: 'CTR', align: 'center', minWidth: 80, source: 'Webhook / Pixel' },
          { id: 'cvr', label: 'CVR', align: 'center', minWidth: 80, source: 'Webhook / Pixel' },
          { id: 'epc', label: 'EPC', align: 'center', minWidth: 90, source: 'Affiliate Link' },
          {
            id: 'refundRate',
            label: 'Refund Rate',
            align: 'center',
            minWidth: 100,
            source: 'Webhook / Pixel',
          },
        ];
      } else if (vert === 'Fintech') {
        colsForVert = [
          {
            id: 'fundedAccounts',
            label: 'Funded Accts',
            align: 'center',
            minWidth: 110,
            source: 'S2S Connection',
          },
          {
            id: 'kycRate',
            label: 'KYC Rate',
            align: 'center',
            minWidth: 90,
            source: 'API Integration',
          },
          {
            id: 'depositsVolume',
            label: 'Volume',
            align: 'center',
            minWidth: 110,
            source: 'S2S Connection',
          },
          { id: 'arpu', label: 'ARPU', align: 'center', minWidth: 90, source: 'API Integration' },
          { id: 'cpl', label: 'CPL', align: 'center', minWidth: 80, source: 'Affiliate Link' },
        ];
      }

      if (connectionType !== 'All') {
        const typeMatch =
          connectionType === 'Webhook Integration' ? 'Webhook / Pixel' : connectionType;
        colsForVert = colsForVert.filter((col) => col.source === typeMatch);
      }

      industryCols = [...industryCols, ...colsForVert];
    });

    return [
      ...baseCols,
      ...industryCols,
      { id: 'createdAt', label: 'Created', align: 'center', minWidth: 110 },
      { id: 'actions', label: 'Actions', align: 'right', minWidth: 110 },
    ];
  }, [selectedIndustry, connectionType, connectionStatus]);

  const getCellValue = (row, colId) => {
    const conversions = safeNumber(row.conversions);
    const clicks = safeNumber(row.clicks);
    const spend = safeNumber(row.spend);
    const idSeed = safeNumber(String(row.id).replace(/\D/g, '')) || 5;

    switch (colId) {
      // Gambling
      case 'ftd':
        return formatNumber(Math.round(conversions * 0.8));
      case 'deposits':
        return formatNumber(Math.round(conversions * 2.2));
      case 'ngr':
        return formatMoney(spend * 1.5);
      case 'ggr':
        return formatMoney(spend * 1.9);
      case 'activePlayers':
        return formatNumber(Math.round(conversions * 1.2 + clicks * 0.05));
      case 'betVolume':
        return formatMoney(spend * 15);
      case 'cpa':
        return formatMoney(conversions > 0 ? spend / conversions : 0);

      // Ecommerce
      case 'sales':
        return formatNumber(conversions);
      case 'revenue':
        return formatMoney(spend * 2.1);
      case 'aov':
        return formatMoney(conversions > 0 ? (spend * 2.1) / conversions : 0);
      case 'ctr':
        return formatPercent(row.ctr);
      case 'cvr':
        return formatPercent(row.cvr);
      case 'epc':
        return formatMoney(clicks > 0 ? (spend * 2.1) / clicks : 0);
      case 'refundRate':
        return formatPercent(3.2 + (idSeed % 4) * 0.8);

      // Fintech
      case 'fundedAccounts':
        return formatNumber(Math.round(conversions * 0.75));
      case 'kycRate':
        return formatPercent(82.5 + (idSeed % 8) * 1.2);
      case 'depositsVolume':
        return formatMoney(spend * 3.4);
      case 'arpu':
        return formatMoney(conversions > 0 ? (spend * 3.4) / conversions : 0);
      case 'cpl':
        return formatMoney(clicks > 0 ? spend / clicks : 0);

      default:
        return '-';
    }
  };

  const STATUS_COLORS = useMemo(
    () => ({
      Active: isDark
        ? { bg: alpha('#60A5FA', 0.16), color: '#93C5FD', border: alpha('#60A5FA', 0.35) }
        : { bg: '#DBEAFE', color: '#2563EB', border: '#BFDBFE' },
      Paused: isDark
        ? { bg: alpha('#FACC15', 0.14), color: '#FDE047', border: alpha('#FACC15', 0.28) }
        : { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' },
      Stopped: isDark
        ? { bg: alpha('#F87171', 0.14), color: '#FCA5A5', border: alpha('#F87171', 0.26) }
        : { bg: '#FEE2E2', color: '#DC2626', border: '#FECACA' },
      Disabled: isDark
        ? {
            bg: alpha(theme.palette.text.secondary, 0.14),
            color: theme.palette.text.secondary,
            border: alpha(theme.palette.text.secondary, 0.2),
          }
        : { bg: '#F1F5F9', color: '#64748B', border: '#E2E8F0' },
    }),
    [isDark, theme.palette.text.secondary]
  );

  const refresh = useCallback(async () => {
    const nonce = Date.now();
    loadNonceRef.current = nonce;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');
    try {
      const list = await campaignsService.list({ signal: controller.signal });
      if (loadNonceRef.current !== nonce) return;
      setRows(Array.isArray(list) ? list : []);
      setLoading(false);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (loadNonceRef.current !== nonce) return;
      setRows([]);
      setLoading(false);
      setError(e?.message || 'Failed to load campaigns.');
    }
  }, []);

  useEffect(() => {
    // Avoid synchronously triggering state updates inside the effect body
    // (eslint: react-hooks/set-state-in-effect).
    const t = window.setTimeout(() => {
      refresh();
    }, 0);
    return () => {
      window.clearTimeout(t);
      abortRef.current?.abort?.();
    };
  }, [refresh]);

  const existingChannels = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      const c = String(r?.channel ?? '').trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const statusCounts = useMemo(() => {
    const counts = { Active: 0, Paused: 0, Stopped: 0, Disabled: 0 };
    rows.forEach((r) => {
      const s = normalizeStatus(r?.status);
      if (counts[s] !== undefined) counts[s] += 1;
    });
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = String(search || '')
      .trim()
      .toLowerCase();
    return rows.filter((r) => {
      const id = String(r.id ?? '').toLowerCase();
      const name = String(r.name ?? '').toLowerCase();
      const channel = String(r.channel ?? '').toLowerCase();
      const status = String(r.status ?? '').toLowerCase();
      const matchesSearch =
        !q || id.includes(q) || name.includes(q) || channel.includes(q) || status.includes(q);

      const normalized = normalizeStatus(r.status);
      const matchesStatus = filters.status === 'All' || normalized === filters.status;

      const ch = String(r.channel ?? '').trim();
      const matchesChannel = filters.channel === 'All' || ch === filters.channel;

      return matchesSearch && matchesStatus && matchesChannel;
    });
  }, [rows, search, filters]);

  const hasActiveControls = useMemo(() => {
    return (
      Boolean(String(search || '').trim()) ||
      filters.status !== DEFAULT_FILTERS.status ||
      filters.channel !== DEFAULT_FILTERS.channel
    );
  }, [search, filters]);

  const handleResetControls = useCallback(() => {
    setSearch('');
    setFilters({ ...DEFAULT_FILTERS });
  }, []);

  const filteredStatusCounts = useMemo(() => {
    const counts = { Active: 0, Paused: 0, Stopped: 0, Disabled: 0 };
    filteredRows.forEach((r) => {
      const s = normalizeStatus(r?.status);
      if (counts[s] !== undefined) counts[s] += 1;
    });
    return counts;
  }, [filteredRows]);

  const totals = useMemo(() => {
    const sum = {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      spend: 0,
    };
    filteredRows.forEach((r) => {
      sum.impressions += safeNumber(r?.impressions);
      sum.clicks += safeNumber(r?.clicks);
      sum.conversions += safeNumber(r?.conversions);
      sum.spend += safeNumber(r?.spend);
    });
    return sum;
  }, [filteredRows]);

  const derived = useMemo(() => {
    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const cvr = totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0;
    const avgCpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
    const avgCpa = totals.conversions > 0 ? totals.spend / totals.conversions : 0;
    return { ctr, cvr, avgCpc, avgCpa };
  }, [totals]);

  const pagination = usePagination(filteredRows, {
    surfaceId: 'campaigns.list',
    defaultRowsPerPage: 10,
    resetOn: [search, filters.status, filters.channel],
  });
  const pagedRows = pagination.paginatedData;

  const handleToggleStatus = useCallback(async (row) => {
    const current = normalizeStatus(row.status);
    const next = current === 'Active' ? 'Paused' : 'Active';
    const id = row.id;

    // Optimistic UI update.
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));
    try {
      await campaignsService.update(id, { status: next });
      setToast({ severity: 'success', message: `Campaign ${id} set to ${next}.` });
    } catch (e) {
      // Roll back if API rejected the update.
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: current } : r)));
      setToast({
        severity: 'error',
        message:
          e?.message ||
          'Status update failed. If your API uses a different route, update campaignsService.update().',
      });
    }
  }, []);

  const handleCopy = useCallback(async (row) => {
    try {
      const text = JSON.stringify(row, null, 2);
      await navigator.clipboard.writeText(text);
      setToast({ severity: 'info', message: `Copied campaign ${row.id} to clipboard.` });
    } catch {
      setToast({ severity: 'warning', message: 'Clipboard copy failed.' });
    }
  }, []);

  const handleDelete = useCallback(
    async (row) => {
      const id = row.id;
      const ok = window.confirm(`Delete campaign ${id}?`);
      if (!ok) return;

      const snapshot = rows;
      setRows((prev) => prev.filter((r) => r.id !== id));
      try {
        await campaignsService.remove(id);
        setToast({ severity: 'success', message: `Deleted campaign ${id}.` });
      } catch (e) {
        setRows(snapshot);
        setToast({
          severity: 'error',
          message:
            e?.message ||
            'Delete failed. If your API uses a different route, update campaignsService.remove().',
        });
      }
    },
    [rows]
  );

  const headerCellSx = useMemo(
    () => ({
      fontSize: '0.72rem',
      fontWeight: 800,
      color: 'text.secondary',
      letterSpacing: '0.02em',
      textTransform: 'none',
      borderBottom: '1px solid',
      borderColor: 'divider',
      bgcolor: isDark
        ? alpha(theme.palette.background.paper, 0.5)
        : alpha(theme.palette.grey[100], 0.9),
      py: 1.15,
      whiteSpace: 'nowrap',
    }),
    [isDark, theme.palette.background.paper, theme.palette.grey]
  );

  const overview = [
    {
      label: 'Total',
      value: rows.length,
      bg: alpha(theme.palette.primary.main, 0.1),
      color: 'text.primary',
      border: alpha(theme.palette.primary.main, 0.22),
    },
    ...['Active', 'Paused', 'Stopped', 'Disabled'].map((s) => ({
      label: s,
      value: statusCounts[s] || 0,
      bg: STATUS_COLORS[s]?.bg || alpha(theme.palette.text.secondary, 0.12),
      color: STATUS_COLORS[s]?.color || theme.palette.text.secondary,
      border: STATUS_COLORS[s]?.border || alpha(theme.palette.divider, 0.7),
    })),
  ];

  const metricCards = [
    {
      label: 'Visible Campaigns',
      value: filteredRows.length,
      helper: `${rows.length} loaded from API`,
      color: theme.palette.primary.main,
      icon: CampaignOutlinedIcon,
    },
    {
      label: 'Active Campaigns',
      value: filteredStatusCounts.Active,
      helper: `${filteredStatusCounts.Paused} paused`,
      color: theme.palette.success.main,
      icon: PlayCircleOutlineIcon,
    },
    {
      label: 'Total Spend',
      value: formatMoney(totals.spend),
      helper: `Avg CPC ${formatMoney(derived.avgCpc)} · Avg CPA ${formatMoney(derived.avgCpa)}`,
      color: theme.palette.warning.main,
      icon: TrendingUpIcon,
    },
    {
      label: 'Conversions',
      value: formatNumber(totals.conversions),
      helper: `CTR ${formatPercent(derived.ctr)} · CVR ${formatPercent(derived.cvr)}`,
      color: theme.palette.primary.main,
      icon: InsightsIcon,
    },
  ];

  return (
    <PageLayout
      title="Campaigns"
      subtitle="Campaign list pulled from API (set VITE_CAMPAIGNS_API_URL or VITE_API_BASE_URL)."
      showTitleBlock={false}
    >
      <BentoCard
        title="Campaigns"
        subtitle={
          showMetrics ? (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              {overview.map((item) => (
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
                    borderColor: item.border,
                  }}
                />
              ))}
            </Stack>
          ) : undefined
        }
        icon={CampaignOutlinedIcon}
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
              {metricCards.map((card) => {
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

          {/* Toolbar: filter icon (popover with search, status, channel, export) + Refresh */}
          <Box
            sx={{
              p: 1.5,
              mb: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              flexWrap: 'wrap',
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Tooltip title="Filters: search, status, channel, export" placement="bottom" arrow>
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

            <Button
              variant="outlined"
              size="small"
              onClick={(e) => setIndustryAnchorEl(e.currentTarget)}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                borderColor: 'divider',
                color: 'text.secondary',
                height: 38,
              }}
            >
              Select Industry: {selectedIndustry === 'All' ? 'All' : selectedIndustry}
            </Button>

            <Popover
              open={Boolean(industryAnchorEl)}
              anchorEl={industryAnchorEl}
              onClose={() => setIndustryAnchorEl(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              slotProps={{
                paper: {
                  sx: {
                    mt: 1,
                    p: 1,
                    borderRadius: 2.5,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    minWidth: 160,
                  },
                },
              }}
            >
              <Stack spacing={0.5}>
                {['Gambling', 'Ecommerce', 'Fintech'].map((ind) => (
                  <Button
                    key={ind}
                    size="small"
                    onClick={() => {
                      setSelectedIndustry(ind);
                      setIndustryAnchorEl(null);
                    }}
                    sx={{
                      justifyContent: 'flex-start',
                      textTransform: 'none',
                      fontWeight: selectedIndustry === ind ? 700 : 500,
                      bgcolor:
                        selectedIndustry === ind
                          ? alpha(theme.palette.primary.main, 0.1)
                          : 'transparent',
                      color: selectedIndustry === ind ? 'primary.main' : 'text.primary',
                    }}
                  >
                    {ind}
                  </Button>
                ))}
                <Divider sx={{ my: 0.5 }} />
                <Button
                  size="small"
                  onClick={() => {
                    setSelectedIndustry('All');
                    setIndustryAnchorEl(null);
                  }}
                  sx={{
                    justifyContent: 'flex-start',
                    textTransform: 'none',
                    fontWeight: selectedIndustry === 'All' ? 700 : 500,
                    color: 'text.secondary',
                  }}
                >
                  Show All
                </Button>
              </Stack>
            </Popover>

            <Button
              variant="outlined"
              size="small"
              onClick={(e) => setTypeAnchorEl(e.currentTarget)}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                borderColor: 'divider',
                color: 'text.secondary',
                height: 38,
              }}
            >
              Select Type: {connectionType === 'All' ? 'All' : connectionType}
            </Button>

            <Popover
              open={Boolean(typeAnchorEl)}
              anchorEl={typeAnchorEl}
              onClose={() => setTypeAnchorEl(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              slotProps={{
                paper: {
                  sx: {
                    mt: 1,
                    p: 1,
                    borderRadius: 2.5,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    minWidth: 180,
                  },
                },
              }}
            >
              <Stack spacing={0.5}>
                {['S2S Connection', 'API Integration', 'Affiliate Link', 'Webhook Integration'].map(
                  (t) => (
                    <Button
                      key={t}
                      size="small"
                      onClick={() => {
                        setConnectionType(t);
                        setTypeAnchorEl(null);
                      }}
                      sx={{
                        justifyContent: 'flex-start',
                        textTransform: 'none',
                        fontWeight: connectionType === t ? 700 : 500,
                        bgcolor:
                          connectionType === t
                            ? alpha(theme.palette.primary.main, 0.1)
                            : 'transparent',
                        color: connectionType === t ? 'primary.main' : 'text.primary',
                      }}
                    >
                      {t}
                    </Button>
                  )
                )}
                <Divider sx={{ my: 0.5 }} />
                <Button
                  size="small"
                  onClick={() => {
                    setConnectionType('All');
                    setTypeAnchorEl(null);
                  }}
                  sx={{
                    justifyContent: 'flex-start',
                    textTransform: 'none',
                    fontWeight: connectionType === 'All' ? 700 : 500,
                    color: 'text.secondary',
                  }}
                >
                  Show All
                </Button>
              </Stack>
            </Popover>
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
                    minWidth: 340,
                    maxWidth: 400,
                    maxHeight: 'calc(100vh - 120px)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                  },
                },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2.5,
                  py: 2,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                }}
              >
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
                    Search, status, channel, export
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ overflow: 'auto', flex: 1, p: 2.5 }}>
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
                  placeholder="Search campaigns..."
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
                  Status
                </Typography>
                <FormControl size="small" fullWidth sx={{ mb: 2, borderRadius: 2 }}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filters.status}
                    label="Status"
                    onChange={(e) => {
                      setFilters((prev) => ({ ...prev, status: e.target.value }));
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
                      All Statuses
                    </MenuItem>
                    {['Active', 'Paused', 'Stopped', 'Disabled'].map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
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
                  Channel
                </Typography>
                <FormControl size="small" fullWidth sx={{ mb: 2, borderRadius: 2 }}>
                  <InputLabel>Channel</InputLabel>
                  <Select
                    value={filters.channel}
                    label="Channel"
                    onChange={(e) => {
                      setFilters((prev) => ({ ...prev, channel: e.target.value }));
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
                      All Channels
                    </MenuItem>
                    {existingChannels.map((c) => (
                      <MenuItem key={c} value={c}>
                        {c}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  size="small"
                  fullWidth
                  startIcon={
                    <AppIcon name="FileDownloadOutlined" fallback={FileDownloadOutlinedIcon} />
                  }
                  onClick={() => {
                    const name = `campaigns-export-${new Date().toISOString().slice(0, 10)}.csv`;
                    exportCampaignsToCsv(filteredRows, name);
                    setFilterAnchorEl(null);
                  }}
                  sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                >
                  Export CSV
                </Button>
              </Box>
              <Divider />
              <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha(theme.palette.grey[500], 0.08) }}>
                <Button
                  size="small"
                  disabled={!hasActiveControls}
                  onClick={() => {
                    handleResetControls();
                    setFilterAnchorEl(null);
                  }}
                  sx={{ textTransform: 'none', fontWeight: 600, color: 'primary.main' }}
                >
                  Reset filters
                </Button>
              </Box>
            </Popover>

            <Box sx={{ flex: 1 }} />

            <Button
              variant="outlined"
              size="small"
              startIcon={<AppIcon name="Refresh" fallback={RefreshIcon} />}
              onClick={() => refresh()}
              disabled={loading}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              Refresh
            </Button>
          </Box>

          {/* Network Connection Widget */}
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 2.5,
              borderRadius: 3,
              bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.2)' : '#F8FAFC'),
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: (t) =>
                    connectionStatus === 'connected'
                      ? alpha(t.palette.success.main, 0.12)
                      : connectionStatus === 'connecting'
                        ? alpha(t.palette.warning.main, 0.12)
                        : alpha(t.palette.text.secondary, 0.1),
                  color: (t) =>
                    connectionStatus === 'connected'
                      ? 'success.main'
                      : connectionStatus === 'connecting'
                        ? 'warning.main'
                        : 'text.secondary',
                }}
              >
                <AppIcon
                  name="CampaignOutlined"
                  fallback={CampaignOutlinedIcon}
                  sx={{ fontSize: 24 }}
                />
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Network Status:{' '}
                  {connectionStatus === 'connected'
                    ? 'Online'
                    : connectionStatus === 'connecting'
                      ? 'Connecting...'
                      : 'Disconnected'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {connectionStatus === 'connected'
                    ? `Connected to ${selectedIndustry === 'All' ? 'All Verticals' : selectedIndustry} data streams via ${connectionType === 'All' ? 'All Connections' : connectionType}. Stream is active and receiving payloads.`
                    : 'Establish a network integration connection to fetch live parameters.'}
                </Typography>
              </Box>
            </Box>
            <Button
              variant="contained"
              size="small"
              disabled={connectionStatus === 'connecting'}
              onClick={() => {
                if (connectionStatus === 'connected') {
                  setConnectionStatus('disconnected');
                  setLogs([]);
                } else {
                  setConnectionStatus('connecting');
                  setTimeout(() => {
                    setConnectionStatus('connected');
                  }, 1500);
                }
              }}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 2,
                bgcolor: connectionStatus === 'connected' ? 'error.main' : 'primary.main',
                '&:hover': {
                  bgcolor: connectionStatus === 'connected' ? 'error.dark' : 'primary.dark',
                },
              }}
            >
              {connectionStatus === 'connected' ? 'Disconnect Network' : 'Connect to Network'}
            </Button>
          </Paper>

          {error && (
            <Alert
              severity="error"
              sx={{ mb: 1.5 }}
              action={
                <Button color="inherit" size="small" onClick={() => refresh()}>
                  Retry
                </Button>
              }
            >
              {error}
            </Alert>
          )}

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
            <TableContainer
              sx={{
                borderRadius: 2,
                overflow: 'auto',
                minHeight: 260,
              }}
            >
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {columns.map((col) => (
                      <TableCell
                        key={col.id}
                        align={col.align}
                        sx={{ ...headerCellSx, minWidth: col.minWidth }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: col.align === 'center' ? 'center' : 'flex-start',
                            gap: 0.5,
                          }}
                        >
                          {col.label}
                          {col.source && connectionStatus === 'connected' && (
                            <Tooltip title={`Live Stream Active (${col.source})`} arrow>
                              <Box
                                sx={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  bgcolor: 'success.main',
                                  animation: 'pulse-dot 1.5s infinite',
                                  '@keyframes pulse-dot': {
                                    '0%': { transform: 'scale(1)', opacity: 1 },
                                    '50%': { transform: 'scale(1.5)', opacity: 0.4 },
                                    '100%': { transform: 'scale(1)', opacity: 1 },
                                  },
                                }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={COLUMNS.length} sx={{ py: 5 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 1.5,
                          }}
                        >
                          <CircularProgress size={18} />
                          <Typography variant="body2" color="text.secondary">
                            Loading campaigns…
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}

                  {!loading && pagedRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={COLUMNS.length} sx={{ py: 5 }}>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ textAlign: 'center' }}
                        >
                          No campaigns found.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}

                  {!loading &&
                    pagedRows.map((row) => {
                      const status = normalizeStatus(row.status);
                      const statusColors = STATUS_COLORS[status] || STATUS_COLORS.Disabled;
                      const isActive = status === 'Active';
                      const nameLines = String(row.name || '')
                        .split('\n')
                        .filter(Boolean);
                      return (
                        <TableRow
                          key={String(row.id)}
                          hover
                          sx={{
                            '& td': {
                              borderBottomColor: alpha(theme.palette.divider, isDark ? 0.35 : 0.6),
                            },
                          }}
                        >
                          {columns.map((col) => {
                            if (col.id === 'id') {
                              return (
                                <TableCell
                                  key={col.id}
                                  sx={{ py: 1.4, fontWeight: 700, color: 'text.primary' }}
                                >
                                  {row.id}
                                </TableCell>
                              );
                            }
                            if (col.id === 'name') {
                              return (
                                <TableCell key={col.id} sx={{ py: 1.4 }}>
                                  <Typography
                                    sx={{ fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.2 }}
                                  >
                                    {nameLines[0] || String(row.name || '-')}
                                  </Typography>
                                  {nameLines.length > 1 && (
                                    <Typography
                                      sx={{
                                        color: 'text.secondary',
                                        fontSize: '0.78rem',
                                        mt: 0.15,
                                      }}
                                    >
                                      {nameLines.slice(1).join(' ')}
                                    </Typography>
                                  )}
                                </TableCell>
                              );
                            }
                            if (col.id === 'status') {
                              return (
                                <TableCell key={col.id} align="center" sx={{ py: 1.4 }}>
                                  <Chip
                                    size="small"
                                    label={status}
                                    sx={{
                                      height: 22,
                                      fontSize: '0.72rem',
                                      fontWeight: 800,
                                      borderRadius: 1.5,
                                      bgcolor: statusColors.bg,
                                      color: statusColors.color,
                                      border: '1px solid',
                                      borderColor: statusColors.border,
                                    }}
                                  />
                                </TableCell>
                              );
                            }
                            if (col.id === 'channel') {
                              return (
                                <TableCell key={col.id} align="center" sx={{ py: 1.4 }}>
                                  <Chip
                                    size="small"
                                    label={String(row.channel || '-')}
                                    sx={{
                                      height: 22,
                                      fontSize: '0.72rem',
                                      fontWeight: 800,
                                      borderRadius: 1.5,
                                      bgcolor: isDark ? alpha('#60A5FA', 0.14) : '#DBEAFE',
                                      color: isDark ? '#93C5FD' : '#2563EB',
                                      border: '1px solid',
                                      borderColor: isDark ? alpha('#60A5FA', 0.3) : '#BFDBFE',
                                    }}
                                  />
                                </TableCell>
                              );
                            }
                            if (col.id === 'createdAt') {
                              return (
                                <TableCell key={col.id} align="center" sx={{ py: 1.4 }}>
                                  {formatCreated(row.createdAt)}
                                </TableCell>
                              );
                            }
                            if (col.id === 'actions') {
                              return (
                                <TableCell
                                  key={col.id}
                                  align="right"
                                  sx={{ py: 1.1, whiteSpace: 'nowrap' }}
                                >
                                  <Tooltip title={isActive ? 'Pause' : 'Resume'} arrow>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleToggleStatus(row)}
                                      aria-label={isActive ? 'Pause campaign' : 'Resume campaign'}
                                      sx={{
                                        color: isActive
                                          ? theme.palette.error.main
                                          : theme.palette.success.main,
                                        '&:hover': {
                                          bgcolor: alpha(
                                            isActive
                                              ? theme.palette.error.main
                                              : theme.palette.success.main,
                                            0.12
                                          ),
                                        },
                                      }}
                                    >
                                      {isActive ? (
                                        <AppIcon
                                          name="PauseCircleOutline"
                                          fallback={PauseCircleOutlineIcon}
                                          fontSize="small"
                                        />
                                      ) : (
                                        <AppIcon
                                          name="PlayCircleOutline"
                                          fallback={PlayCircleOutlineIcon}
                                          fontSize="small"
                                        />
                                      )}
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Copy row JSON" arrow>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleCopy(row)}
                                      aria-label="Copy campaign JSON"
                                      sx={{
                                        color: 'text.secondary',
                                        '&:hover': { bgcolor: 'action.hover' },
                                      }}
                                    >
                                      <AppIcon
                                        name="ContentCopyOutlined"
                                        fallback={ContentCopyOutlinedIcon}
                                        fontSize="small"
                                      />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Delete" arrow>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleDelete(row)}
                                      aria-label="Delete campaign"
                                      sx={{
                                        color: 'text.secondary',
                                        '&:hover': {
                                          bgcolor: alpha(theme.palette.error.main, 0.12),
                                          color: theme.palette.error.main,
                                        },
                                      }}
                                    >
                                      <AppIcon
                                        name="DeleteOutline"
                                        fallback={DeleteOutlineIcon}
                                        fontSize="small"
                                      />
                                    </IconButton>
                                  </Tooltip>
                                </TableCell>
                              );
                            }

                            // Legacy default render for standard columns if not connected
                            if (connectionStatus !== 'connected') {
                              if (col.id === 'impressions')
                                return (
                                  <TableCell key={col.id} align="center">
                                    {formatNumber(row.impressions)}
                                  </TableCell>
                                );
                              if (col.id === 'clicks')
                                return (
                                  <TableCell key={col.id} align="center">
                                    {formatNumber(row.clicks)}
                                  </TableCell>
                                );
                              if (col.id === 'ctr')
                                return (
                                  <TableCell key={col.id} align="center">
                                    {formatPercent(row.ctr)}
                                  </TableCell>
                                );
                              if (col.id === 'conversions')
                                return (
                                  <TableCell key={col.id} align="center">
                                    {formatNumber(row.conversions)}
                                  </TableCell>
                                );
                              if (col.id === 'cvr')
                                return (
                                  <TableCell key={col.id} align="center">
                                    {formatPercent(row.cvr)}
                                  </TableCell>
                                );
                              if (col.id === 'bid')
                                return (
                                  <TableCell key={col.id} align="center">
                                    <Chip
                                      size="small"
                                      label={bidLabel(row.bid)}
                                      sx={{
                                        height: 22,
                                        fontSize: '0.72rem',
                                        fontWeight: 800,
                                        borderRadius: 1.5,
                                        bgcolor: isDark
                                          ? alpha(theme.palette.common.white, 0.06)
                                          : '#F1F5F9',
                                        color: 'text.secondary',
                                        border: '1px solid',
                                        borderColor: alpha(theme.palette.divider, 0.8),
                                      }}
                                    />
                                  </TableCell>
                                );
                              if (col.id === 'cpc')
                                return (
                                  <TableCell key={col.id} align="center">
                                    {formatMoney(row.cpc)}
                                  </TableCell>
                                );
                              if (col.id === 'cpa')
                                return (
                                  <TableCell key={col.id} align="center">
                                    {formatMoney(row.cpa)}
                                  </TableCell>
                                );
                              if (col.id === 'spend')
                                return (
                                  <TableCell key={col.id} align="center">
                                    {formatMoney(row.spend)}
                                  </TableCell>
                                );
                              if (col.id === 'dailyLimit')
                                return (
                                  <TableCell key={col.id} align="center">
                                    {formatMoney(row.dailyLimit)}
                                  </TableCell>
                                );
                            }

                            // Render dynamic industry column values
                            return (
                              <TableCell key={col.id} align="center" sx={{ py: 1.4 }}>
                                {getCellValue(row, col.id)}
                              </TableCell>
                            );
                          })}
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
              label="campaigns"
            />
          </Paper>

          {/* Live Stream Terminal */}
          {connectionStatus === 'connected' && (
            <Paper
              variant="outlined"
              sx={{
                mt: 2.5,
                p: 2,
                borderRadius: 3,
                bgcolor: (t) => (t.palette.mode === 'dark' ? '#0F172A' : '#1E293B'),
                fontFamily: 'monospace',
                color: '#38BDF8',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 1,
                  borderBottom: '1px solid #334155',
                  pb: 1,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#94A3B8' }}
                >
                  RECEIVING CONVERSION LOGS (Network Streams Active)
                </Typography>
                <Chip
                  label="LIVE STREAM"
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    bgcolor: 'rgba(16, 185, 129, 0.15)',
                    color: '#34D399',
                  }}
                />
              </Box>
              <Box
                sx={{
                  minHeight: 100,
                  maxHeight: 150,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.5,
                }}
              >
                {logs.length === 0 && (
                  <Typography variant="body2" sx={{ color: '#64748B', fontStyle: 'italic' }}>
                    Listening on network interface ports... awaiting packets...
                  </Typography>
                )}
                {logs.map((log, idx) => (
                  <Typography
                    key={idx}
                    variant="caption"
                    sx={{
                      display: 'block',
                      fontSize: '0.75rem',
                      color: idx === 0 ? '#38BDF8' : '#64748B',
                    }}
                  >
                    <span style={{ color: '#34D399' }}>[{log.time}]</span> {log.message}
                  </Typography>
                ))}
              </Box>
            </Paper>
          )}
        </Box>
      </BentoCard>
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={2600}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert
            onClose={() => setToast(null)}
            severity={toast.severity || 'info'}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {toast.message}
          </Alert>
        ) : (
          <Alert severity="info" variant="filled">
            {' '}
          </Alert>
        )}
      </Snackbar>
    </PageLayout>
  );
}
