/**
 * Report Builder - Custom report constructor page.
 *
 * Users (or an external agent via API) can:
 *  1. Define report metadata (name, description, category, icon)
 *  2. Add / reorder / remove sections (KPI grid, charts, tables, alerts)
 *  3. Configure each section's data source key
 *  4. Paste raw JSON data that an external agent sends (API receiver)
 *  5. Live-preview the report as they build it
 *  6. Save as a custom template and open in Report Studio
 *
 * Mobile-friendly with responsive layout.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Alert,
  Snackbar,
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  IconButton,
  Chip,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  InputBase,
  Collapse,
  Drawer,
  alpha,
  useTheme,
  useMediaQuery,
  keyframes,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SaveIcon from '@mui/icons-material/Save';
import PreviewIcon from '@mui/icons-material/Preview';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PeopleIcon from '@mui/icons-material/People';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CampaignIcon from '@mui/icons-material/Campaign';
import DescriptionIcon from '@mui/icons-material/Description';
import BarChartIcon from '@mui/icons-material/BarChart';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import GridViewIcon from '@mui/icons-material/GridView';
import TableRowsIcon from '@mui/icons-material/TableRows';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DataObjectIcon from '@mui/icons-material/DataObject';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WebhookIcon from '@mui/icons-material/Webhook';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LinkIcon from '@mui/icons-material/Link';
import CircleIcon from '@mui/icons-material/Circle';
import RefreshIcon from '@mui/icons-material/Refresh';
import HistoryIcon from '@mui/icons-material/History';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';
import TerminalIcon from '@mui/icons-material/Terminal';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import {
  SECTION_TYPES,
  TEMPLATE_CATEGORIES,
  FILTER_KEYS,
  saveCustomTemplate,
} from './reportTemplates';
import KpiGrid from './components/KpiGrid';
import TrendChart from './components/TrendChart';
import RankedTable from './components/RankedTable';
import BarBreakdown from './components/BarBreakdown';
import AlertsList from './components/AlertsList';

import AppIcon from '../../components/icons/AppIcon';

// ─── Constants ───────────────────────────────────────────────────────────────

const ICON_MAP = {
  AttachMoney: AttachMoneyIcon,
  People: PeopleIcon,
  Assignment: AssignmentIcon,
  Assessment: AssessmentIcon,
  Campaign: CampaignIcon,
  Description: DescriptionIcon,
};

const ICON_OPTIONS = [
  { value: 'Assessment', label: 'Chart', Icon: AssessmentIcon },
  { value: 'AttachMoney', label: 'Finance', Icon: AttachMoneyIcon },
  { value: 'People', label: 'People', Icon: PeopleIcon },
  { value: 'Assignment', label: 'Tasks', Icon: AssignmentIcon },
  { value: 'Campaign', label: 'Marketing', Icon: CampaignIcon },
  { value: 'Description', label: 'Document', Icon: DescriptionIcon },
];

const CATEGORY_OPTIONS = Object.values(TEMPLATE_CATEGORIES);

const SECTION_TYPE_OPTIONS = [
  {
    value: SECTION_TYPES.KPI_GRID,
    label: 'KPI Grid',
    icon: <AppIcon name="GridView" fallback={GridViewIcon} sx={{ fontSize: 18 }} />,
    desc: 'Metric cards with labels and values',
  },
  {
    value: SECTION_TYPES.BAR_CHART,
    label: 'Bar Chart',
    icon: <AppIcon name="BarChart" fallback={BarChartIcon} sx={{ fontSize: 18 }} />,
    desc: 'Bar chart breakdown',
  },
  {
    value: SECTION_TYPES.LINE_CHART,
    label: 'Line Chart',
    icon: <AppIcon name="ShowChart" fallback={ShowChartIcon} sx={{ fontSize: 18 }} />,
    desc: 'Trend line over time',
  },
  {
    value: SECTION_TYPES.RANKED_TABLE,
    label: 'Data Table',
    icon: <AppIcon name="TableRows" fallback={TableRowsIcon} sx={{ fontSize: 18 }} />,
    desc: 'Sortable ranked table',
  },
  {
    value: SECTION_TYPES.ALERTS_LIST,
    label: 'Alerts List',
    icon: <AppIcon name="WarningAmber" fallback={WarningAmberIcon} sx={{ fontSize: 18 }} />,
    desc: 'Severity-based alerts',
  },
];

const FILTER_OPTIONS = Object.entries(FILTER_KEYS).map(([key, value]) => ({
  value,
  label: key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' '),
}));

const CATEGORY_COLORS = {
  finance: '#4CAF50',
  partner: '#2196F3',
  operations: '#FF9800',
  executive: '#9C27B0',
  marketing: '#E91E63',
  custom: '#607D8B',
};

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genId() {
  return `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptySection() {
  return { id: genId(), type: SECTION_TYPES.KPI_GRID, dataKey: '', label: '' };
}

function tryParseJSON(text) {
  try {
    const parsed = JSON.parse(text);
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Section Preview ─────────────────────────────────────────────────────────

function SectionPreview({ section, reportData }) {
  const sectionData = reportData?.[section.dataKey];
  if (!sectionData || (Array.isArray(sectionData) && sectionData.length === 0)) {
    return (
      <Box sx={{ py: 3, textAlign: 'center', opacity: 0.4 }}>
        <AppIcon name="DataObject" fallback={DataObjectIcon} sx={{ fontSize: 28, mb: 0.5 }} />
        <Typography variant="caption" display="block">
          No data for key "{section.dataKey || '...'}"
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Paste JSON data in the Data tab
        </Typography>
      </Box>
    );
  }
  switch (section.type) {
    case SECTION_TYPES.KPI_GRID:
      return <KpiGrid data={sectionData} />;
    case SECTION_TYPES.LINE_CHART:
      return <TrendChart data={sectionData} />;
    case SECTION_TYPES.BAR_CHART:
      return <BarBreakdown data={sectionData} />;
    case SECTION_TYPES.RANKED_TABLE:
      return <RankedTable data={sectionData} />;
    case SECTION_TYPES.ALERTS_LIST:
      return <AlertsList data={sectionData} />;
    default:
      return (
        <Typography color="text.secondary" variant="body2">
          Unknown section type
        </Typography>
      );
  }
}

// ─── Section Card (builder mode) ─────────────────────────────────────────────

function SectionCard({ section, index, total, onUpdate, onRemove, onMoveUp, onMoveDown, theme }) {
  const isDark = theme.palette.mode === 'dark';
  const typeOpt = SECTION_TYPE_OPTIONS.find((o) => o.value === section.type);

  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2.5,
        overflow: 'hidden',
        animation: `${fadeIn} 0.3s ease-out`,
      }}
    >
      {/* Section Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: { xs: 1.25, sm: 2 },
          py: 1,
          bgcolor: isDark
            ? alpha(theme.palette.background.paper, 0.6)
            : alpha(theme.palette.grey[50], 0.8),
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <AppIcon
          name="DragIndicator"
          fallback={DragIndicatorIcon}
          sx={{ fontSize: 18, color: 'text.disabled', cursor: 'grab' }}
        />
        <Chip
          label={`#${index + 1}`}
          size="small"
          sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, minWidth: 28 }}
        />
        {typeOpt?.icon}
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 700, flex: 1, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}
        >
          {section.label || 'Untitled Section'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.25 }}>
          <IconButton size="small" disabled={index === 0} onClick={onMoveUp} sx={{ p: 0.5 }}>
            <AppIcon name="ArrowUpward" fallback={ArrowUpwardIcon} sx={{ fontSize: 16 }} />
          </IconButton>
          <IconButton
            size="small"
            disabled={index === total - 1}
            onClick={onMoveDown}
            sx={{ p: 0.5 }}
          >
            <AppIcon name="ArrowDownward" fallback={ArrowDownwardIcon} sx={{ fontSize: 16 }} />
          </IconButton>
          <IconButton size="small" onClick={onRemove} sx={{ p: 0.5, color: 'error.main' }}>
            <AppIcon
              name="DeleteOutlineRounded"
              fallback={DeleteOutlineRoundedIcon}
              sx={{ fontSize: 16 }}
            />
          </IconButton>
        </Box>
      </Box>
      {/* Section Config */}
      <Box sx={{ p: { xs: 1.25, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <TextField
          label="Section Label"
          size="small"
          fullWidth
          value={section.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="e.g., Monthly Trends"
          sx={{ '& .MuiInputBase-root': { borderRadius: 1.5 } }}
        />
        <Box sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Section Type</InputLabel>
            <Select
              label="Section Type"
              value={section.type}
              onChange={(e) => onUpdate({ type: e.target.value })}
              sx={{ borderRadius: 1.5 }}
            >
              {SECTION_TYPE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {opt.icon}
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                        {opt.label}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: '0.65rem' }}
                      >
                        {opt.desc}
                      </Typography>
                    </Box>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Data Key"
            size="small"
            fullWidth
            value={section.dataKey}
            onChange={(e) => onUpdate({ dataKey: e.target.value })}
            placeholder="e.g., trends, kpis, topPartners"
            helperText="Key in the JSON data object"
            sx={{ '& .MuiInputBase-root': { borderRadius: 1.5 } }}
          />
        </Box>
      </Box>
    </Paper>
  );
}

// ─── Webhook Integration Panel ───────────────────────────────────────────────

const INGEST_API = '/api/report-ingest';
const POLL_INTERVAL_MS = 3000;

const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(76, 175, 80, 0); }
`;

function CopyButton({ text, label, theme }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);
  return (
    <Tooltip title={copied ? 'Copied!' : `Copy ${label || ''}`}>
      <IconButton size="small" onClick={handleCopy} sx={{ p: 0.5 }}>
        {copied ? (
          <AppIcon
            name="CheckCircle"
            fallback={CheckCircleIcon}
            sx={{ fontSize: 16, color: 'success.main' }}
          />
        ) : (
          <AppIcon
            name="ContentCopy"
            fallback={ContentCopyIcon}
            sx={{ fontSize: 16, color: 'text.secondary' }}
          />
        )}
      </IconButton>
    </Tooltip>
  );
}

function CodeBlock({ code, language, theme }) {
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box sx={{ position: 'relative' }}>
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          borderRadius: 1.5,
          fontFamily: '"Fira Code", "JetBrains Mono", monospace',
          fontSize: '0.72rem',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          overflow: 'auto',
          maxHeight: 200,
          bgcolor: isDark ? '#0d1117' : '#f6f8fa',
          border: '1px solid',
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          color: isDark ? '#c9d1d9' : '#24292f',
        }}
      >
        {code}
      </Paper>
      <Box sx={{ position: 'absolute', top: 4, right: 4 }}>
        <CopyButton text={code} label="code" theme={theme} />
      </Box>
    </Box>
  );
}

function IntegrationTab({ platform, children, icon, theme }) {
  const [open, setOpen] = useState(false);
  const isDark = theme.palette.mode === 'dark';
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        border: '1px solid',
        borderColor: open ? alpha(theme.palette.primary.main, 0.3) : 'divider',
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
    >
      <Box
        onClick={() => setOpen(!open)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          px: 2,
          py: 1.25,
          cursor: 'pointer',
          '&:hover': {
            bgcolor: isDark
              ? alpha(theme.palette.action.hover, 0.04)
              : alpha(theme.palette.action.hover, 0.02),
          },
        }}
      >
        {icon}
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.82rem', flex: 1 }}>
          {platform}
        </Typography>
        <AppIcon
          name="ArrowDownward"
          fallback={ArrowDownwardIcon}
          sx={{
            fontSize: 14,
            color: 'text.secondary',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        />
      </Box>
      <Collapse in={open}>
        <Box sx={{ px: 2, pb: 2 }}>{children}</Box>
      </Collapse>
    </Paper>
  );
}

function WebhookPanel({
  reportData,
  setReportData,
  setName,
  setDescription,
  setCategory,
  setSections,
  theme,
}) {
  const isDark = theme.palette.mode === 'dark';
  const [webhookToken, setWebhookToken] = useState(() => {
    try {
      return sessionStorage.getItem('orch_report_webhook_token') || '';
    } catch {
      return '';
    }
  });
  const [webhookUrl, setWebhookUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [polling, setPolling] = useState(false);
  const [lastPoll, setLastPoll] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // disconnected | connected | receiving | error
  const [ingestHistory, setIngestHistory] = useState([]);
  const [totalKeysReceived, setTotalKeysReceived] = useState(0);
  const pollRef = useRef(null);
  const lastUpdatedRef = useRef(null);

  // Create webhook session
  const createSession = useCallback(async () => {
    setCreating(true);
    try {
      const res = await fetch(INGEST_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-session' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      setWebhookToken(result.token);
      setWebhookUrl(result.webhookUrl);
      setConnectionStatus('connected');
      try {
        sessionStorage.setItem('orch_report_webhook_token', result.token);
      } catch {}
    } catch (err) {
      setConnectionStatus('error');
    } finally {
      setCreating(false);
    }
  }, []);

  // Build the webhook URL from the current origin
  const fullWebhookUrl = webhookUrl || `${window.location.origin}${INGEST_API}`;

  // Poll for incoming data
  const pollOnce = useCallback(async () => {
    if (!webhookToken) return;
    try {
      const url = `${INGEST_API}?token=${webhookToken}${lastUpdatedRef.current ? `&after=${encodeURIComponent(lastUpdatedRef.current)}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          setConnectionStatus('disconnected');
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const result = await res.json();
      setLastPoll(new Date().toISOString());

      if (result.lastUpdated && result.lastUpdated !== lastUpdatedRef.current) {
        lastUpdatedRef.current = result.lastUpdated;
        setConnectionStatus('receiving');
        setTimeout(() => setConnectionStatus('connected'), 2000);

        // Merge incoming data
        if (result.data && Object.keys(result.data).length > 0) {
          setReportData(result.data);
          setTotalKeysReceived(Object.keys(result.data).length);
        }

        // Apply meta if sent by the agent
        if (result.meta) {
          if (result.meta.name) setName(result.meta.name);
          if (result.meta.description) setDescription(result.meta.description);
          if (result.meta.category) setCategory(result.meta.category);
          if (result.meta.sections) {
            setSections(
              result.meta.sections.map((s) => ({
                id: s.id || genId(),
                type: s.type || SECTION_TYPES.KPI_GRID,
                dataKey: s.dataKey || '',
                label: s.label || '',
              }))
            );
          }
        }

        if (result.history) setIngestHistory(result.history);
      } else {
        if (connectionStatus !== 'connected' && connectionStatus !== 'receiving')
          setConnectionStatus('connected');
      }
    } catch {
      setConnectionStatus('error');
    }
  }, [
    webhookToken,
    setReportData,
    setName,
    setDescription,
    setCategory,
    setSections,
    connectionStatus,
  ]);

  // Start/stop polling
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    setPolling(true);
    pollOnce();
    pollRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);
  }, [pollOnce]);

  const stopPolling = useCallback(() => {
    setPolling(false);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Auto-start polling when token exists
  useEffect(() => {
    if (webhookToken && !pollRef.current) {
      setConnectionStatus('connected');
      startPolling();
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [webhookToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Status colors
  const statusConfig = {
    disconnected: { color: '#9E9E9E', label: 'Disconnected' },
    connected: { color: '#4CAF50', label: 'Listening' },
    receiving: { color: '#2196F3', label: 'Receiving...' },
    error: { color: '#f44336', label: 'Error' },
  };
  const status = statusConfig[connectionStatus];

  const dataKeys = Object.keys(reportData || {});

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* ── Connection Status Bar ── */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: 3,
          border: '1px solid',
          borderColor: alpha(status.color, 0.4),
          bgcolor: alpha(status.color, isDark ? 0.06 : 0.03),
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: status.color,
              animation:
                connectionStatus === 'connected' || connectionStatus === 'receiving'
                  ? `${pulseGlow} 2s ease-in-out infinite`
                  : 'none',
            }}
          />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
            {status.label}
          </Typography>
        </Box>

        {webhookToken ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flex: 1,
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
            }}
          >
            {polling ? (
              <Chip
                icon={<AppIcon name="StopCircle" fallback={StopCircleIcon} sx={{ fontSize: 14 }} />}
                label="Stop"
                size="small"
                onClick={stopPolling}
                sx={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.7rem' }}
                color="warning"
                variant="outlined"
              />
            ) : (
              <Chip
                icon={<AppIcon name="PlayArrow" fallback={PlayArrowIcon} sx={{ fontSize: 14 }} />}
                label="Listen"
                size="small"
                onClick={startPolling}
                sx={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.7rem' }}
                color="success"
                variant="outlined"
              />
            )}
            <Chip
              icon={<AppIcon name="Refresh" fallback={RefreshIcon} sx={{ fontSize: 14 }} />}
              label="Poll Now"
              size="small"
              onClick={pollOnce}
              sx={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.7rem' }}
              variant="outlined"
            />
            {totalKeysReceived > 0 && (
              <Chip
                icon={
                  <AppIcon name="CheckCircle" fallback={CheckCircleIcon} sx={{ fontSize: 14 }} />
                }
                label={`${totalKeysReceived} keys loaded`}
                size="small"
                color="success"
                sx={{ fontWeight: 600, fontSize: '0.7rem' }}
              />
            )}
          </Box>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              size="small"
              disableElevation
              startIcon={<AppIcon name="Webhook" fallback={WebhookIcon} sx={{ fontSize: 16 }} />}
              onClick={createSession}
              disabled={creating}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.78rem',
                px: 2.5,
              }}
            >
              {creating ? 'Creating...' : 'Create Webhook Session'}
            </Button>
          </Box>
        )}
      </Paper>
      {/* ── Webhook URL & Token ── */}
      {webhookToken && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 1.5, sm: 2.5 },
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <AppIcon name="Link" fallback={LinkIcon} sx={{ fontSize: 18, color: 'primary.main' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
              Your Webhook Endpoint
            </Typography>
            <Chip
              label="LIVE"
              size="small"
              sx={{
                height: 18,
                fontSize: '0.55rem',
                fontWeight: 800,
                bgcolor: alpha('#4CAF50', 0.15),
                color: '#4CAF50',
                letterSpacing: '0.05em',
              }}
            />
          </Box>

          {/* URL */}
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}
            >
              Webhook URL
            </Typography>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                p: 1,
                borderRadius: 1.5,
                bgcolor: isDark ? '#0d1117' : '#f6f8fa',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  wordBreak: 'break-all',
                  color: isDark ? '#58a6ff' : '#0969da',
                }}
              >
                {fullWebhookUrl}
              </Typography>
              <CopyButton text={fullWebhookUrl} label="URL" theme={theme} />
            </Box>
          </Box>

          {/* Token */}
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}
            >
              Token (send as header: x-report-token)
            </Typography>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                p: 1,
                borderRadius: 1.5,
                bgcolor: isDark ? '#0d1117' : '#f6f8fa',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  color: isDark ? '#7ee787' : '#1a7f37',
                }}
              >
                {webhookToken}
              </Typography>
              <CopyButton text={webhookToken} label="token" theme={theme} />
            </Box>
          </Box>

          {/* Quick cURL example */}
          <Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}
            >
              Quick Test (cURL)
            </Typography>
            <CodeBlock
              theme={theme}
              code={`curl -X POST ${fullWebhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "x-report-token: ${webhookToken}" \\
  -d '{
    "kpis": [
      { "label": "Revenue", "value": 125000, "format": "currency" },
      { "label": "Users", "value": 4200, "format": "number" }
    ],
    "trends": [
      { "month": "Jan", "revenue": 40000, "spend": 12000 },
      { "month": "Feb", "revenue": 52000, "spend": 15000 }
    ]
  }'`}
            />
          </Box>
        </Paper>
      )}
      {/* ── Integration Guides ── */}
      {webhookToken && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 1.5, sm: 2.5 },
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <AppIcon
              name="IntegrationInstructions"
              fallback={IntegrationInstructionsIcon}
              sx={{ fontSize: 18, color: 'primary.main' }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
              Integration Guides
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* n8n */}
            <IntegrationTab
              platform="n8n"
              icon={
                <AppIcon
                  name="BoltRounded"
                  fallback={BoltRoundedIcon}
                  sx={{ fontSize: 18, color: '#FF6D5A' }}
                />
              }
              theme={theme}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Use an HTTP Request node at the end of your n8n workflow:
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    1. Add "HTTP Request" node
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Method: POST
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    2. URL:
                  </Typography>
                  <CodeBlock theme={theme} code={fullWebhookUrl} />
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    3. Headers:
                  </Typography>
                  <CodeBlock
                    theme={theme}
                    code={`Content-Type: application/json
x-report-token: ${webhookToken}`}
                  />
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    4. Body (JSON):
                  </Typography>
                  <CodeBlock
                    theme={theme}
                    code={`{
  "kpis": [{{ $json.kpis }}],
  "trends": [{{ $json.trends }}],
  "_meta": {
    "name": "My n8n Report",
    "description": "Auto-generated from workflow"
  }
}`}
                  />
                </Box>
                <Box
                  sx={{
                    p: 1.25,
                    borderRadius: 1.5,
                    bgcolor: alpha(theme.palette.info.main, isDark ? 0.06 : 0.04),
                    border: '1px solid',
                    borderColor: alpha(theme.palette.info.main, 0.2),
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                  >
                    <AppIcon
                      name="InfoOutlined"
                      fallback={InfoOutlinedIcon}
                      sx={{ fontSize: 14, color: 'info.main' }}
                    />
                    Use <code style={{ fontWeight: 700 }}>_meta</code> to auto-configure the report
                    name, description, category, and sections from your workflow.
                  </Typography>
                </Box>
              </Box>
            </IntegrationTab>

            {/* Make (Integromat) */}
            <IntegrationTab
              platform="Make (Integromat)"
              icon={
                <AppIcon
                  name="AutoAwesome"
                  fallback={AutoAwesomeIcon}
                  sx={{ fontSize: 18, color: '#6D2FEB' }}
                />
              }
              theme={theme}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Use the "HTTP {'>'} Make a request" module:
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <CodeBlock
                  theme={theme}
                  code={`Module: HTTP > Make a request
URL: ${fullWebhookUrl}
Method: POST
Headers:
  Content-Type: application/json
  x-report-token: ${webhookToken}
Body type: Raw
Content type: JSON (application/json)
Request content: { "kpis": [...], "trends": [...] }`}
                />
              </Box>
            </IntegrationTab>

            {/* MCP */}
            <IntegrationTab
              platform="MCP (Model Context Protocol)"
              icon={
                <AppIcon
                  name="Terminal"
                  fallback={TerminalIcon}
                  sx={{ fontSize: 18, color: '#00BCD4' }}
                />
              }
              theme={theme}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Any MCP-compatible AI agent can send data using the standard http_request tool:
              </Typography>
              <CodeBlock
                theme={theme}
                code={`{
  "tool": "http_request",
  "params": {
    "url": "${fullWebhookUrl}",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json",
      "x-report-token": "${webhookToken}"
    },
    "body": {
      "kpis": [
        { "label": "Revenue", "value": 125000, "format": "currency" }
      ],
      "trends": [
        { "month": "Jan", "revenue": 40000, "spend": 12000 }
      ],
      "_meta": {
        "name": "AI Generated Report",
        "description": "Report constructed by AI agent",
        "category": "executive",
        "sections": [
          { "type": "kpi_grid", "dataKey": "kpis", "label": "Key Metrics" },
          { "type": "line_chart", "dataKey": "trends", "label": "Trends" }
        ]
      }
    }
  }
}`}
              />
            </IntegrationTab>

            {/* Zapier */}
            <IntegrationTab
              platform="Zapier / Custom HTTP"
              icon={
                <AppIcon
                  name="BoltRounded"
                  fallback={BoltRoundedIcon}
                  sx={{ fontSize: 18, color: '#FF4A00' }}
                />
              }
              theme={theme}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Use a "Webhooks by Zapier" action (POST):
              </Typography>
              <CodeBlock
                theme={theme}
                code={`Action: Webhooks by Zapier > POST
URL: ${fullWebhookUrl}
Payload Type: JSON
Data:
  x-report-token (Header): ${webhookToken}
  kpis: [{ "label": "...", "value": ... }]
  trends: [{ "month": "...", "revenue": ... }]`}
              />
            </IntegrationTab>

            {/* Python / JavaScript */}
            <IntegrationTab
              platform="Python / JavaScript / Any Language"
              icon={
                <AppIcon
                  name="DataObject"
                  fallback={DataObjectIcon}
                  sx={{ fontSize: 18, color: '#3572A5' }}
                />
              }
              theme={theme}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, mb: 0.5, display: 'block' }}>
                Python:
              </Typography>
              <CodeBlock
                theme={theme}
                code={`import requests

requests.post(
    "${fullWebhookUrl}",
    headers={
        "Content-Type": "application/json",
        "x-report-token": "${webhookToken}"
    },
    json={
        "kpis": [{"label": "Revenue", "value": 125000, "format": "currency"}],
        "trends": [{"month": "Jan", "revenue": 40000}]
    }
)`}
              />
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, mb: 0.5, display: 'block' }}>
                  JavaScript (fetch):
                </Typography>
                <CodeBlock
                  theme={theme}
                  code={`fetch("${fullWebhookUrl}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-report-token": "${webhookToken}"
  },
  body: JSON.stringify({
    kpis: [{ label: "Revenue", value: 125000, format: "currency" }],
    trends: [{ month: "Jan", revenue: 40000 }]
  })
})`}
                />
              </Box>
            </IntegrationTab>
          </Box>
        </Paper>
      )}
      {/* ── Ingest History ── */}
      {ingestHistory.length > 0 && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 1.5, sm: 2.5 },
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <AppIcon
              name="History"
              fallback={HistoryIcon}
              sx={{ fontSize: 18, color: 'text.secondary' }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
              Ingest History
            </Typography>
            <Chip
              label={`${ingestHistory.length}`}
              size="small"
              sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }}
            />
          </Box>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              maxHeight: 200,
              overflow: 'auto',
            }}
          >
            {[...ingestHistory].reverse().map((entry, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1,
                  borderRadius: 1.5,
                  bgcolor: isDark
                    ? alpha(theme.palette.background.default, 0.4)
                    : alpha(theme.palette.grey[50], 0.6),
                  border: '1px solid',
                  borderColor: alpha(theme.palette.divider, 0.4),
                }}
              >
                <AppIcon
                  name="Circle"
                  fallback={CircleIcon}
                  sx={{ fontSize: 6, color: entry.append ? 'info.main' : 'success.main' }}
                />
                <Typography
                  variant="caption"
                  sx={{ fontFamily: 'monospace', fontSize: '0.68rem', flex: 1 }}
                >
                  {entry.keys.join(', ')}
                </Typography>
                <Chip
                  label={entry.append ? 'append' : 'set'}
                  size="small"
                  sx={{ height: 16, fontSize: '0.55rem', fontWeight: 600 }}
                  variant="outlined"
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: '0.6rem', whiteSpace: 'nowrap' }}
                >
                  {new Date(entry.at).toLocaleTimeString()}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}
      {/* ── Loaded Data Summary ── */}
      {dataKeys.length > 0 && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 1.5, sm: 2 },
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: alpha(theme.palette.success.main, 0.3),
            bgcolor: alpha(theme.palette.success.main, isDark ? 0.06 : 0.03),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <AppIcon
              name="CheckCircle"
              fallback={CheckCircleIcon}
              sx={{ fontSize: 18, color: 'success.main' }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
              Loaded Data Keys
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {dataKeys.map((key) => {
              const val = reportData[key];
              const count = Array.isArray(val)
                ? val.length
                : typeof val === 'object'
                  ? Object.keys(val).length
                  : 1;
              return (
                <Chip
                  key={key}
                  label={`${key} (${count})`}
                  size="small"
                  variant="outlined"
                  color="success"
                  onDelete={() =>
                    setReportData((prev) => {
                      const next = { ...prev };
                      delete next[key];
                      return next;
                    })
                  }
                  sx={{ fontWeight: 600, fontSize: '0.72rem', fontFamily: 'monospace' }}
                />
              );
            })}
          </Box>
        </Paper>
      )}
      {/* ── Also keep manual options ── */}
      <Divider sx={{ my: 0.5 }}>
        <Chip
          label="Or load data manually"
          size="small"
          sx={{ fontSize: '0.68rem', fontWeight: 600 }}
        />
      </Divider>
      <ManualDataLoader reportData={reportData} setReportData={setReportData} theme={theme} />
    </Box>
  );
}

// ─── Manual Data Loader (paste JSON + fetch URL - original functionality) ────

function ManualDataLoader({ reportData, setReportData, theme }) {
  const isDark = theme.palette.mode === 'dark';
  const [jsonInput, setJsonInput] = useState('');
  const [parseResult, setParseResult] = useState(null);
  const [agentUrl, setAgentUrl] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState(null);

  const handleParseJSON = useCallback(() => {
    const result = tryParseJSON(jsonInput);
    setParseResult(result);
    if (result.ok) {
      setReportData((prev) => ({ ...prev, ...result.data }));
    }
  }, [jsonInput, setReportData]);

  const handleFetchFromAgent = useCallback(async () => {
    if (!agentUrl.trim()) return;
    setAgentLoading(true);
    setAgentError(null);
    try {
      const res = await fetch(agentUrl.trim());
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setReportData((prev) => ({ ...prev, ...data }));
      setParseResult({ ok: true, data });
    } catch (err) {
      setAgentError(err.message);
    } finally {
      setAgentLoading(false);
    }
  }, [agentUrl, setReportData]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Fetch from URL */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, sm: 2 },
          borderRadius: 2.5,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <AppIcon
            name="BoltRounded"
            fallback={BoltRoundedIcon}
            sx={{ fontSize: 18, color: 'primary.main' }}
          />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
            Fetch from URL
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
          <TextField
            size="small"
            fullWidth
            placeholder="https://api.example.com/data"
            value={agentUrl}
            onChange={(e) => setAgentUrl(e.target.value)}
            sx={{ '& .MuiInputBase-root': { borderRadius: 1.5, fontSize: '0.85rem' } }}
          />
          <Button
            variant="contained"
            size="small"
            disableElevation
            onClick={handleFetchFromAgent}
            disabled={!agentUrl.trim() || agentLoading}
            sx={{
              borderRadius: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              minWidth: 'fit-content',
              whiteSpace: 'nowrap',
            }}
          >
            {agentLoading ? 'Fetching...' : 'Fetch'}
          </Button>
        </Box>
        {agentError && (
          <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
            {agentError}
          </Typography>
        )}
      </Paper>
      {/* Paste JSON */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, sm: 2 },
          borderRadius: 2.5,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <AppIcon
            name="ContentPaste"
            fallback={ContentPasteIcon}
            sx={{ fontSize: 18, color: 'warning.main' }}
          />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
            Paste JSON
          </Typography>
        </Box>
        <TextField
          multiline
          rows={4}
          fullWidth
          size="small"
          placeholder='{ "kpis": [...], "trends": [...] }'
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          sx={{
            '& .MuiInputBase-root': {
              borderRadius: 1.5,
              fontFamily: 'monospace',
              fontSize: '0.8rem',
            },
            mb: 1,
          }}
        />
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            variant="contained"
            size="small"
            disableElevation
            onClick={handleParseJSON}
            disabled={!jsonInput.trim()}
            sx={{ borderRadius: 1.5, textTransform: 'none', fontWeight: 600 }}
          >
            Parse & Load
          </Button>
          {parseResult &&
            (parseResult.ok ? (
              <Chip
                icon={<AppIcon name="CheckCircle" fallback={CheckCircleIcon} />}
                label={`Loaded ${Object.keys(parseResult.data).length} keys`}
                size="small"
                color="success"
                sx={{ fontWeight: 600 }}
              />
            ) : (
              <Chip
                label={`Error: ${parseResult.error}`}
                size="small"
                color="error"
                variant="outlined"
                sx={{ fontWeight: 600, fontSize: '0.68rem' }}
              />
            ))}
        </Box>
      </Paper>
    </Box>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ReportBuilder() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();

  // ─ Report Meta ─
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('custom');
  const [icon, setIcon] = useState('Assessment');
  const [selectedFilters, setSelectedFilters] = useState([]);

  // ─ Sections ─
  const [sections, setSections] = useState([createEmptySection()]);

  // ─ Data ─
  const [reportData, setReportData] = useState({});

  // ─ UI ─
  const [activeTab, setActiveTab] = useState('build'); // build | data | preview
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const accent = CATEGORY_COLORS[category] || CATEGORY_COLORS.custom;
  const IconComp = ICON_MAP[icon] || AssessmentIcon;

  // ─ Section Management ─
  const addSection = useCallback(() => {
    setSections((prev) => [...prev, createEmptySection()]);
  }, []);

  const updateSection = useCallback((id, updates) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, []);

  const removeSection = useCallback((id) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const moveSection = useCallback((index, dir) => {
    setSections((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  // ─ Save ─
  const handleSave = useCallback(() => {
    const tplId = `custom-${Date.now()}`;
    const tpl = {
      id: tplId,
      name: name.trim() || 'Untitled Report',
      description: description.trim() || 'Custom report',
      category,
      icon,
      audience: ['manager', 'executive'],
      sections: sections
        .filter((s) => s.label && s.dataKey)
        .map((s) => ({
          id: s.id,
          type: s.type,
          dataKey: s.dataKey,
          label: s.label,
        })),
      filters: selectedFilters,
      exportFormats: ['pdf', 'csv'],
      isCustom: true,
      reportData, // Store the data with the template
    };
    try {
      saveCustomTemplate(tpl);
    } catch (err) {
      setSaveError(err?.message || 'Could not save this report - check the sections.');
      return;
    }
    setSaved(true);
    setTimeout(() => {
      navigate(`/reports?template=${tplId}`);
    }, 800);
  }, [name, description, category, icon, sections, selectedFilters, reportData, navigate]);

  const isValid = name.trim().length > 0 && sections.some((s) => s.label && s.dataKey);

  return (
    <PageLayout
      title="Report Builder"
      subtitle="Construct a custom report from scratch or load data from an agent API."
      action={
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AppIcon name="ArrowBack" fallback={ArrowBackIcon} sx={{ fontSize: 16 }} />}
            onClick={() => navigate('/reports')}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, fontSize: '0.78rem' }}
          >
            Back
          </Button>
          <Button
            size="small"
            variant="contained"
            disableElevation
            startIcon={
              saved ? (
                <AppIcon name="CheckCircle" fallback={CheckCircleIcon} sx={{ fontSize: 16 }} />
              ) : (
                <AppIcon name="Save" fallback={SaveIcon} sx={{ fontSize: 16 }} />
              )
            }
            onClick={handleSave}
            disabled={!isValid || saved}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.78rem',
              px: 2,
              bgcolor: saved ? 'success.main' : undefined,
            }}
          >
            {saved ? 'Saved!' : 'Save Report'}
          </Button>
        </Box>
      }
    >
      {/* Tab Bar */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 2.5, flexWrap: 'wrap' }}>
        {[
          {
            key: 'build',
            label: 'Build',
            icon: <AppIcon name="Edit" fallback={EditIcon} sx={{ fontSize: 16 }} />,
          },
          {
            key: 'webhook',
            label: 'Webhook',
            icon: <AppIcon name="Webhook" fallback={WebhookIcon} sx={{ fontSize: 16 }} />,
          },
          {
            key: 'data',
            label: 'Data',
            icon: <AppIcon name="DataObject" fallback={DataObjectIcon} sx={{ fontSize: 16 }} />,
          },
          {
            key: 'preview',
            label: 'Preview',
            icon: <AppIcon name="Visibility" fallback={VisibilityIcon} sx={{ fontSize: 16 }} />,
          },
        ].map((tab) => (
          <Chip
            key={tab.key}
            icon={tab.icon}
            label={tab.label}
            clickable
            onClick={() => setActiveTab(tab.key)}
            color={activeTab === tab.key ? 'primary' : 'default'}
            variant={activeTab === tab.key ? 'filled' : 'outlined'}
            sx={{ fontWeight: 600, fontSize: '0.8rem', px: 0.5, borderRadius: 2 }}
          />
        ))}
      </Box>
      {/* ─── BUILD TAB ─── */}
      {activeTab === 'build' && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            gap: 2.5,
            animation: `${fadeIn} 0.3s ease-out`,
          }}
        >
          {/* Left: Report Config */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Meta */}
            <BentoCard title="Report Details" icon={DescriptionIcon} iconColor={accent}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <TextField
                  label="Report Name"
                  size="small"
                  fullWidth
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Weekly Revenue Summary"
                  sx={{ '& .MuiInputBase-root': { borderRadius: 1.5 } }}
                />
                <TextField
                  label="Description"
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this report cover?"
                  sx={{ '& .MuiInputBase-root': { borderRadius: 1.5 } }}
                />
                <Box sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Category</InputLabel>
                    <Select
                      label="Category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      sx={{ borderRadius: 1.5 }}
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <MenuItem key={c} value={c}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box
                              sx={{
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                bgcolor: CATEGORY_COLORS[c] || '#607D8B',
                              }}
                            />
                            <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                              {c}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))}
                      <MenuItem value="custom">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box
                            sx={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              bgcolor: CATEGORY_COLORS.custom,
                            }}
                          />
                          <Typography variant="body2">Custom</Typography>
                        </Box>
                      </MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Icon</InputLabel>
                    <Select
                      label="Icon"
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                      sx={{ borderRadius: 1.5 }}
                    >
                      {ICON_OPTIONS.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AppIcon fallback={opt.Icon} sx={{ fontSize: 18 }} />
                            <Typography variant="body2">{opt.label}</Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
                {/* Filters */}
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.75, display: 'block' }}
                  >
                    Available Filters
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {FILTER_OPTIONS.map((f) => (
                      <Chip
                        key={f.value}
                        label={f.label}
                        size="small"
                        clickable
                        color={selectedFilters.includes(f.value) ? 'primary' : 'default'}
                        variant={selectedFilters.includes(f.value) ? 'filled' : 'outlined'}
                        onClick={() =>
                          setSelectedFilters((prev) =>
                            prev.includes(f.value)
                              ? prev.filter((x) => x !== f.value)
                              : [...prev, f.value]
                          )
                        }
                        sx={{ fontSize: '0.72rem', fontWeight: 500 }}
                      />
                    ))}
                  </Box>
                </Box>
              </Box>
            </BentoCard>

            {/* Sections */}
            <BentoCard
              title={`Sections (${sections.length})`}
              icon={GridViewIcon}
              iconColor={accent}
              action={
                <Button
                  size="small"
                  startIcon={
                    <AppIcon name="AddRounded" fallback={AddRoundedIcon} sx={{ fontSize: 16 }} />
                  }
                  onClick={addSection}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    borderRadius: 2,
                  }}
                >
                  Add
                </Button>
              }
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {sections.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 4, opacity: 0.5 }}>
                    <AppIcon name="GridView" fallback={GridViewIcon} sx={{ fontSize: 32, mb: 1 }} />
                    <Typography variant="body2">
                      No sections yet. Click "Add" to create one.
                    </Typography>
                  </Box>
                ) : (
                  sections.map((section, i) => (
                    <SectionCard
                      key={section.id}
                      section={section}
                      index={i}
                      total={sections.length}
                      onUpdate={(updates) => updateSection(section.id, updates)}
                      onRemove={() => removeSection(section.id)}
                      onMoveUp={() => moveSection(i, -1)}
                      onMoveDown={() => moveSection(i, 1)}
                      theme={theme}
                    />
                  ))
                )}
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<AppIcon name="AddRounded" fallback={AddRoundedIcon} />}
                  onClick={addSection}
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 600,
                    py: 1.25,
                    borderStyle: 'dashed',
                  }}
                >
                  Add Section
                </Button>
              </Box>
            </BentoCard>
          </Box>

          {/* Right: Live Preview Card (desktop) */}
          {!isMobile && (
            <Box
              sx={{
                width: 380,
                flexShrink: 0,
                position: 'sticky',
                top: 16,
                alignSelf: 'flex-start',
              }}
            >
              <BentoCard title="Live Preview" icon={PreviewIcon} iconColor={accent}>
                <ReportPreviewMini
                  name={name}
                  description={description}
                  category={category}
                  icon={icon}
                  accent={accent}
                  IconComp={IconComp}
                  sections={sections}
                  reportData={reportData}
                  theme={theme}
                />
              </BentoCard>
            </Box>
          )}
        </Box>
      )}
      {/* ─── WEBHOOK TAB ─── */}
      {activeTab === 'webhook' && (
        <Box sx={{ maxWidth: 860, animation: `${fadeIn} 0.3s ease-out` }}>
          <WebhookPanel
            reportData={reportData}
            setReportData={setReportData}
            setName={setName}
            setDescription={setDescription}
            setCategory={setCategory}
            setSections={setSections}
            theme={theme}
          />
        </Box>
      )}
      {/* ─── DATA TAB ─── */}
      {activeTab === 'data' && (
        <Box sx={{ maxWidth: 800, animation: `${fadeIn} 0.3s ease-out` }}>
          <ManualDataLoader reportData={reportData} setReportData={setReportData} theme={theme} />
        </Box>
      )}
      {/* ─── PREVIEW TAB ─── */}
      {activeTab === 'preview' && (
        <Box sx={{ animation: `${fadeIn} 0.3s ease-out` }}>
          {/* Report Header Preview */}
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, sm: 3 },
              mb: 2,
              borderRadius: 3,
              border: '1px solid',
              borderColor: alpha(accent, 0.3),
              bgcolor: isDark ? alpha(accent, 0.06) : alpha(accent, 0.03),
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: alpha(accent, 0.12),
                  color: accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppIcon fallback={IconComp} sx={{ fontSize: 28 }} />
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                  {name || 'Untitled Report'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {description || 'No description'}
                </Typography>
              </Box>
              <Box sx={{ ml: 'auto', display: 'flex', gap: 0.75 }}>
                <Chip
                  label={category}
                  size="small"
                  sx={{
                    textTransform: 'capitalize',
                    fontWeight: 600,
                    bgcolor: alpha(accent, 0.1),
                    color: accent,
                  }}
                />
                <Chip
                  label={`${sections.filter((s) => s.label && s.dataKey).length} sections`}
                  size="small"
                  variant="outlined"
                />
              </Box>
            </Box>
          </Paper>

          {/* Section Previews */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {sections.filter((s) => s.label).length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6, opacity: 0.4 }}>
                <AppIcon name="GridView" fallback={GridViewIcon} sx={{ fontSize: 48, mb: 1 }} />
                <Typography variant="body1">
                  Add sections in the Build tab to see a preview
                </Typography>
              </Box>
            ) : (
              sections
                .filter((s) => s.label)
                .map((section, i) => {
                  const sectionIcon =
                    section.type === SECTION_TYPES.RANKED_TABLE
                      ? TableRowsIcon
                      : section.type === SECTION_TYPES.BAR_CHART
                        ? BarChartIcon
                        : section.type === SECTION_TYPES.LINE_CHART
                          ? ShowChartIcon
                          : section.type === SECTION_TYPES.ALERTS_LIST
                            ? WarningAmberIcon
                            : GridViewIcon;
                  return (
                    <BentoCard
                      key={section.id}
                      title={section.label}
                      icon={sectionIcon}
                      iconColor={accent}
                      delay={i * 0.05}
                    >
                      <SectionPreview section={section} reportData={reportData} />
                    </BentoCard>
                  );
                })
            )}
          </Box>

          {Object.keys(reportData).length === 0 && sections.some((s) => s.label) && (
            <Paper
              elevation={0}
              sx={{
                mt: 2,
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: alpha(theme.palette.warning.main, 0.3),
                bgcolor: alpha(theme.palette.warning.main, isDark ? 0.06 : 0.03),
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <AppIcon
                name="WarningAmber"
                fallback={WarningAmberIcon}
                sx={{ color: 'warning.main', fontSize: 20 }}
              />
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  No data loaded
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Switch to the Data tab to paste JSON or fetch from an agent API.
                </Typography>
              </Box>
            </Paper>
          )}
        </Box>
      )}
      <Snackbar
        open={Boolean(saveError)}
        autoHideDuration={5000}
        onClose={() => setSaveError('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setSaveError('')} sx={{ width: '100%' }}>
          {saveError}
        </Alert>
      </Snackbar>
    </PageLayout>
  );
}

// ─── Mini Preview (sidebar) ──────────────────────────────────────────────────

function ReportPreviewMini({
  name,
  description,
  category,
  accent,
  IconComp,
  sections,
  reportData,
  theme,
}) {
  const isDark = theme.palette.mode === 'dark';
  const validSections = sections.filter((s) => s.label);
  return (
    <Box>
      {/* Mini header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          mb: 2,
          p: 1.5,
          borderRadius: 2,
          bgcolor: alpha(accent, isDark ? 0.08 : 0.04),
          border: '1px solid',
          borderColor: alpha(accent, 0.2),
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 1.5,
            bgcolor: alpha(accent, 0.15),
            color: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon fallback={IconComp} sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, fontSize: '0.8rem', lineHeight: 1.2 }}
            noWrap
          >
            {name || 'Untitled'}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {description || 'No description'}
          </Typography>
        </Box>
        <Chip
          label={category}
          size="small"
          sx={{
            height: 18,
            fontSize: '0.55rem',
            fontWeight: 700,
            textTransform: 'capitalize',
            bgcolor: alpha(accent, 0.1),
            color: accent,
          }}
        />
      </Box>
      {/* Section list */}
      {validSections.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3, opacity: 0.4 }}>
          <Typography variant="caption">Add sections to preview</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {validSections.map((section, i) => {
            const typeOpt = SECTION_TYPE_OPTIONS.find((o) => o.value === section.type);
            const hasData =
              reportData?.[section.dataKey] &&
              (Array.isArray(reportData[section.dataKey])
                ? reportData[section.dataKey].length > 0
                : true);
            return (
              <Paper
                key={section.id}
                elevation={0}
                sx={{
                  p: 1.25,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box sx={{ color: hasData ? accent : 'text.disabled' }}>{typeOpt?.icon}</Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, display: 'block', lineHeight: 1.2 }}
                    noWrap
                  >
                    {section.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                    {typeOpt?.label} · {section.dataKey || '-'}
                  </Typography>
                </Box>
                {hasData ? (
                  <AppIcon
                    name="CheckCircle"
                    fallback={CheckCircleIcon}
                    sx={{ fontSize: 14, color: 'success.main' }}
                  />
                ) : (
                  <Chip
                    label="No data"
                    size="small"
                    sx={{
                      height: 16,
                      fontSize: '0.55rem',
                      bgcolor: alpha(theme.palette.warning.main, 0.1),
                      color: 'warning.main',
                    }}
                  />
                )}
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
