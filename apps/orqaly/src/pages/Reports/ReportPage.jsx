import { memo, useMemo, useCallback, useRef, useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Typography,
  Paper,
  Chip,
  IconButton,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Skeleton,
  Tooltip,
  InputBase,
  CircularProgress,
  Collapse,
  Menu,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  LinearProgress,
  Drawer,
  Badge,
  Switch,
  FormControlLabel,
  alpha,
  useTheme,
  useMediaQuery,
  keyframes,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PeopleIcon from '@mui/icons-material/People';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CampaignIcon from '@mui/icons-material/Campaign';
import DescriptionIcon from '@mui/icons-material/Description';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DownloadIcon from '@mui/icons-material/Download';
import SlideshowIcon from '@mui/icons-material/Slideshow';
import InsightsIcon from '@mui/icons-material/Insights';
import CloseIcon from '@mui/icons-material/Close';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PrintIcon from '@mui/icons-material/Print';
import ShareIcon from '@mui/icons-material/Share';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import FlagIcon from '@mui/icons-material/Flag';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import TimelineIcon from '@mui/icons-material/Timeline';
import { useNavigate, useSearchParams } from 'react-router-dom';

import FormDialog from '../../components/Common/FormDialog';
import PageLayout from '../../components/Common/PageLayout';
import LlmReportsTab from '../../components/Reports/LlmReportsTab';
import BentoCard from '../../components/Common/BentoCard';
import AiOrb from '../../components/VoiceControl/AiOrb';
import { useReport } from '../../hooks/useReport';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import {
  SECTION_TYPES,
  TEMPLATE_CATEGORIES,
  matchTemplateByKeywords,
  REPORT_TEMPLATES,
} from './reportTemplates';
import KpiGrid from './components/KpiGrid';
import TrendChart from './components/TrendChart';
import RankedTable from './components/RankedTable';
import BarBreakdown from './components/BarBreakdown';
import AlertsList from './components/AlertsList';
import FunnelChart from './components/FunnelChart';
import HeatmapCalendar from './components/HeatmapCalendar';
import Treemap from './components/Treemap';
import GaugeKpi from './components/GaugeKpi';
import GeoMap from './components/GeoMap';
import DrillDownDrawer from './components/DrillDownDrawer';
import AiNarrative from './components/AiNarrative';
import { exportToProfessionalPDF, exportAIPresentation } from './exporters';
import './print.css';
import { maybeNotify } from '../../services/emailNotificationDispatcher';

import AppIcon from '../../components/icons/AppIcon';

const ICON_MAP = {
  AttachMoney: AttachMoneyIcon,
  People: PeopleIcon,
  Assignment: AssignmentIcon,
  Assessment: AssessmentIcon,
  Campaign: CampaignIcon,
  Timeline: TimelineIcon,
  SmartToy: SmartToyIcon,
  Flag: FlagIcon,
  MenuBook: MenuBookIcon,
  AutoFixHigh: AutoFixHighIcon,
  GraphicEq: GraphicEqRoundedIcon,
};

const CATEGORY_COLORS = {
  [TEMPLATE_CATEGORIES.FINANCE]: '#4CAF50',
  [TEMPLATE_CATEGORIES.PARTNER]: '#2196F3',
  [TEMPLATE_CATEGORIES.OPERATIONS]: '#FF9800',
  [TEMPLATE_CATEGORIES.EXECUTIVE]: '#9C27B0',
  [TEMPLATE_CATEGORIES.MARKETING]: '#E91E63',
  [TEMPLATE_CATEGORIES.AGENTS]: '#00BCD4',
  [TEMPLATE_CATEGORIES.GOALS]: '#7C4DFF',
  [TEMPLATE_CATEGORIES.KNOWLEDGE]: '#3F51B5',
  [TEMPLATE_CATEGORIES.QUALITY]: '#009688',
  [TEMPLATE_CATEGORIES.PULSE]: '#F44336',
};

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
`;

const speakingPulse = keyframes`
  0%, 100% { opacity: 0.45; transform: scaleY(0.6); }
  50% { opacity: 1; transform: scaleY(1); }
`;

const QUICK_PROMPTS = [
  {
    label: 'Finance overview',
    prompt: 'Show me a finance and growth report with revenue and ROI trends',
  },
  { label: 'Partner performance', prompt: 'Build a partner performance report with leaderboard' },
  {
    label: 'Task delivery status',
    prompt: 'Generate an operations report showing overdue tasks and workload',
  },
  { label: 'Executive summary', prompt: 'Create an executive summary with health alerts' },
  {
    label: 'Marketing & campaigns',
    prompt: 'Show marketing acquisition report with channel ROI and campaign performance',
  },
];

// ─── AI report intent parser ─────────────────────────────────────────────────

function parseReportIntent(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase().trim();
  if (lower.length < 3) return null;

  const matched = matchTemplateByKeywords(text);
  const matchedTemplates = REPORT_TEMPLATES.filter((tpl) => {
    const keywords = {
      'tpl-finance-growth': [
        'finance',
        'growth',
        'revenue',
        'profit',
        'roi',
        'money',
        'spend',
        'ftd',
      ],
      'tpl-partner-performance': ['partner', 'performance', 'funnel', 'conversion', 'leaderboard'],
      'tpl-operations-tasks': ['operations', 'task', 'workload', 'overdue', 'git', 'delivery'],
      'tpl-executive-summary': ['executive', 'summary', 'overview', 'health', 'alert'],
      'tpl-marketing-acquisition': [
        'marketing',
        'acquisition',
        'campaign',
        'channel',
        'lead',
        'attribution',
        'ad',
      ],
    };
    const kws = keywords[tpl.id] || [];
    return kws.some((kw) => lower.includes(kw));
  });

  const filters = {};
  const periodMatch = lower.match(/\b(?:for|in|of)\s+(\w+\s*\d{0,4})\b/);
  if (periodMatch) filters.period = periodMatch[1].trim();
  const geoMatch = lower.match(/\b(?:for|in)\s+([A-Z]{2})\b/i);
  if (geoMatch) filters.geo = geoMatch[1].toUpperCase();
  const teamMatch = lower.match(/\bteam\s+([\w\s]+?)(?:\s+report|\s+for|$)/i);
  if (teamMatch) filters.team = teamMatch[1].trim();

  const suggestions = matchedTemplates.length > 0 ? matchedTemplates : matched ? [matched] : [];
  const isCustom =
    lower.includes('custom') ||
    lower.includes('personali') ||
    lower.includes('combine') ||
    lower.includes('mix');
  const primaryMatch = suggestions[0] || matched || REPORT_TEMPLATES[0];

  return {
    query: text,
    primaryTemplate: primaryMatch,
    suggestions: suggestions.length > 1 ? suggestions : [],
    filters,
    isCustomRequest: isCustom,
    confidence:
      suggestions.length > 0 ? (matchedTemplates.length >= 2 ? 'multiple' : 'high') : 'low',
    summary: buildSummary(text, primaryMatch, filters, isCustom),
  };
}

function buildSummary(text, template, filters, isCustom) {
  if (isCustom)
    return `I'll build a personalized report combining relevant sections for: "${text}"`;
  const filterParts = Object.entries(filters)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  if (template) {
    return filterParts
      ? `Great match! "${template.name}" fits your request. Applying filters: ${filterParts}`
      : `Great match! "${template.name}" is the best fit for your request.`;
  }
  return "I'll find the best template for your needs.";
}

// ─── Section Renderer ────────────────────────────────────────────────────────

// Table row counts per display density. Compact trims to the essentials;
// detailed shows the long tail.
const DENSITY_ROWS = { compact: 5, standard: 10, detailed: 25 };

const SectionRenderer = memo(function SectionRenderer({
  section,
  data,
  onDrill,
  scope,
  loading = false,
  displayMode = 'standard',
}) {
  const sectionData = data?.[section.dataKey] || [];
  const config = section.config || {};
  const maxRows = DENSITY_ROWS[displayMode] || DENSITY_ROWS.standard;
  switch (section.type) {
    case SECTION_TYPES.KPI_GRID:
      return <KpiGrid data={sectionData} onDrill={onDrill} loading={loading} />;
    case SECTION_TYPES.LINE_CHART:
      return <TrendChart data={sectionData} loading={loading} />;
    case SECTION_TYPES.BAR_CHART:
      return <BarBreakdown data={sectionData} loading={loading} />;
    case SECTION_TYPES.RANKED_TABLE:
      return (
        <RankedTable
          data={sectionData}
          maxRows={maxRows}
          loading={loading}
          onRowClick={
            onDrill ? (row) => onDrill({ title: section.label, payload: row }) : undefined
          }
        />
      );
    case SECTION_TYPES.ALERTS_LIST:
      return <AlertsList data={sectionData} scope={scope} />;
    case SECTION_TYPES.FUNNEL_CHART:
      return <FunnelChart data={sectionData} loading={loading} {...config} />;
    case SECTION_TYPES.HEATMAP_CALENDAR:
      return <HeatmapCalendar data={sectionData} loading={loading} {...config} />;
    case SECTION_TYPES.TREEMAP:
      return <Treemap data={sectionData} loading={loading} {...config} />;
    case SECTION_TYPES.GAUGE_KPI:
      return <GaugeKpi data={sectionData} loading={loading} {...config} />;
    case SECTION_TYPES.GEO_MAP:
      return <GeoMap data={sectionData} loading={loading} {...config} />;
    default:
      return <Typography color="text.secondary">Unknown section type: {section.type}</Typography>;
  }
});

function SectionSkeleton() {
  return (
    <Box sx={{ py: 2 }}>
      <Skeleton variant="rectangular" height={24} width="40%" sx={{ mb: 1.5, borderRadius: 1 }} />
      <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />
    </Box>
  );
}

// ─── Template Card ───────────────────────────────────────────────────────────

function TemplateCard({ tpl, isSelected, onSelect, theme, compact }) {
  const isDark = theme.palette.mode === 'dark';
  const accent = CATEGORY_COLORS[tpl.category] || theme.palette.primary.main;
  const IconComp = ICON_MAP[tpl.icon] || DescriptionIcon;
  return (
    <Paper
      elevation={0}
      onClick={() => onSelect(tpl.id)}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Open ${tpl.name} report template`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(tpl.id);
        }
      }}
      sx={{
        p: compact ? 1.5 : 2,
        borderRadius: 2.5,
        border: '2px solid',
        borderColor: isSelected ? accent : 'divider',
        bgcolor: isSelected
          ? alpha(accent, isDark ? 0.12 : 0.06)
          : isDark
            ? alpha(theme.palette.background.paper, 0.5)
            : theme.palette.background.paper,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: 'primary.main',
          transform: 'translateY(-2px)',
          boxShadow: createHoverGlowShadow(theme),
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: compact ? 0.5 : 1 }}>
        <Box
          sx={{
            width: compact ? 30 : 36,
            height: compact ? 30 : 36,
            borderRadius: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(accent, 0.12),
            color: accent,
          }}
        >
          <AppIcon fallback={IconComp} sx={{ fontSize: compact ? 16 : 20 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, lineHeight: 1.2, fontSize: compact ? '0.78rem' : undefined }}
          >
            {tpl.name}
          </Typography>
          <Chip
            label={tpl.category}
            size="small"
            sx={{
              mt: 0.5,
              height: 18,
              fontSize: '0.6rem',
              fontWeight: 600,
              bgcolor: alpha(accent, 0.1),
              color: accent,
              textTransform: 'capitalize',
            }}
          />
        </Box>
        {isSelected && (
          <AppIcon
            name="CheckCircle"
            fallback={CheckCircleIcon}
            sx={{ fontSize: 18, color: accent, flexShrink: 0 }}
          />
        )}
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', lineHeight: 1.4, fontSize: compact ? '0.68rem' : undefined }}
      >
        {tpl.description}
      </Typography>
    </Paper>
  );
}

// ─── Filter Bar ──────────────────────────────────────────────────────────────

function FilterBar({ template, filters, setFilter, clearFilters }) {
  if (!template?.filters?.length) return null;
  const filterConfigs = {
    period: {
      label: 'Period',
      options: ['All', '2026-01', '2026-02', '2025-Q4', '2025-12', '2025-11'],
    },
    team: { label: 'Team', options: ['All', 'Team Alpha', 'Team Beta', 'Team Gamma'] },
    geo: { label: 'Geo', options: ['All', 'BR', 'US', 'GB', 'DE', 'FR', 'ES', 'IT', 'MX'] },
    partner: { label: 'Partner', type: 'text' },
    trafficSource: {
      label: 'Traffic Source',
      options: ['All', 'Organic', 'Paid', 'Social', 'Referral'],
    },
    status: { label: 'Status', options: ['All', 'Active', 'Paused', 'At Risk', 'Churned'] },
    priority: { label: 'Priority', options: ['All', 'High', 'Medium', 'Low'] },
    assignee: { label: 'Assignee', type: 'text' },
  };
  const activeCount = Object.values(filters).filter((v) => v && v !== 'All').length;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AppIcon
          name="FilterList"
          fallback={FilterListIcon}
          sx={{ fontSize: 16, color: 'text.secondary' }}
        />
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            color: 'text.secondary',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontSize: '0.65rem',
          }}
        >
          Filters {activeCount > 0 && `(${activeCount} active)`}
        </Typography>
        {activeCount > 0 && (
          <Chip
            label="Clear all"
            size="small"
            variant="outlined"
            onClick={clearFilters}
            onDelete={clearFilters}
            deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 12 }} />}
            sx={{ height: 20, fontSize: '0.6rem' }}
          />
        )}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {template.filters.map((filterKey) => {
          const config = filterConfigs[filterKey];
          if (!config) return null;
          if (config.type === 'text') {
            return (
              <TextField
                key={filterKey}
                label={config.label}
                size="small"
                fullWidth
                value={filters[filterKey] || ''}
                onChange={(e) => setFilter(filterKey, e.target.value)}
                sx={{ '& .MuiInputBase-root': { fontSize: '0.8rem', borderRadius: 1.5 } }}
              />
            );
          }
          return (
            <FormControl key={filterKey} size="small" fullWidth>
              <InputLabel sx={{ fontSize: '0.8rem' }}>{config.label}</InputLabel>
              <Select
                label={config.label}
                value={filters[filterKey] || 'All'}
                onChange={(e) => setFilter(filterKey, e.target.value)}
                sx={{ fontSize: '0.8rem', borderRadius: 1.5 }}
              >
                {config.options.map((opt) => (
                  <MenuItem key={opt} value={opt} sx={{ fontSize: '0.8rem' }}>
                    {opt}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          );
        })}
      </Box>
    </Box>
  );
}

// ─── Export functions (CSV - PDFs live in ./exporters) ───────────────────────

function exportToCSV(template, snapshot) {
  if (!template || !snapshot) return;
  const lines = [
    `Report: ${template.name}`,
    `Category: ${template.category}`,
    `Generated: ${snapshot.computedAt}`,
    `Version: ${snapshot.version || 'N/A'}`,
    '',
  ];
  if (snapshot.kpis?.length) {
    lines.push('=== Key Metrics ===', 'Metric,Value');
    snapshot.kpis.forEach((k) =>
      lines.push(`"${k.label}","${formatForExport(k.value, k.format)}"`)
    );
    lines.push('');
  }
  template.sections.forEach((section) => {
    const data = snapshot[section.dataKey];
    if (!Array.isArray(data) || data.length === 0) return;
    lines.push(`=== ${section.label} ===`);
    const cols = Object.keys(data[0]);
    lines.push(cols.map((c) => `"${c}"`).join(','));
    data.forEach((row) => lines.push(cols.map((c) => `"${formatForExport(row[c])}"`).join(',')));
    lines.push('');
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${template.name.replace(/\s+/g, '_')}_Report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatForExport(value, format) {
  if (value == null) return '';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  if (format === 'currency') return `$${num.toLocaleString()}`;
  if (format === 'percent') return `${num.toFixed(1)}%`;
  return num.toLocaleString();
}

// ─── Report Studio Full-Screen Dialog ────────────────────────────────────────

function ReportStudioDialog({
  open,
  onClose,
  template,
  templateId,
  builtInTemplates,
  selectTemplate,
  filters,
  setFilter,
  clearFilters,
  snapshot,
  loading,
  error,
  errorStatus,
  freshness,
  version,
  computedAt,
  autoRefresh,
  setAutoRefresh,
  refresh,
  theme,
  onNavigateBuilder,
}) {
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const [livePreview, setLivePreview] = useState(true);
  const [displayMode, setDisplayMode] = useState('standard');
  const [shareCopied, setShareCopied] = useState(false);
  const [drillTarget, setDrillTarget] = useState(null);
  const reportScrollRef = useRef(null);
  const sectionRefs = useRef({});

  const handleDrill = useCallback((payload) => {
    if (!payload) return setDrillTarget(null);
    if (payload.payload || payload.title) {
      setDrillTarget({ title: payload.title || 'Detail', payload: payload.payload || payload });
    } else {
      setDrillTarget({ title: payload.label || 'Detail', payload });
    }
  }, []);

  // Build a shareable deep link to the current template + filters and copy it.
  // The studio is fully URL-driven, so the recipient lands on the same view.
  const handleShareLink = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (templateId) params.set('template', templateId);
    Object.entries(filters || {}).forEach(([k, v]) => {
      if (v && v !== 'All') params.set(k, v);
    });
    const url = `${window.location.origin}/reports?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard blocked (insecure context / permissions) - fall back to prompt.
      window.prompt('Copy this report link:', url);
    }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }, [templateId, filters]);

  const scrollToSection = useCallback((id) => {
    const node = sectionRefs.current[id];
    if (node && reportScrollRef.current) {
      const container = reportScrollRef.current;
      const top = node.offsetTop - 12;
      container.scrollTo({ top, behavior: 'smooth' });
    }
  }, []);

  const accent = CATEGORY_COLORS[template?.category] || theme.palette.primary.main;
  const IconComp = template ? ICON_MAP[template.icon] || DescriptionIcon : AssessmentIcon;

  const handleExport = useCallback(
    (type) => {
      setExportProgress(type);
      setTimeout(async () => {
        if (type === 'pdf') await exportToProfessionalPDF(template, snapshot);
        if (type === 'csv') exportToCSV(template, snapshot);
        if (type === 'presentation') await exportAIPresentation(template, snapshot);
        maybeNotify('report_exported', {
          reportName: template?.name || 'Report',
          format: type,
        });
        setTimeout(() => setExportProgress(null), 500);
      }, 300);
    },
    [template, snapshot]
  );

  /* ── Right Panel: Context Sidebar ── */
  const contextContent = (
    <>
      {/* Context Header */}
      <Box
        sx={{
          p: { xs: 1.5, md: 2 },
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AppIcon
            name="BoltRounded"
            fallback={BoltRoundedIcon}
            color="primary"
            sx={{ fontSize: { xs: 20, md: 24 } }}
          />
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
          >
            Context
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {template && (
            <Chip
              size="small"
              label={template.category}
              variant="outlined"
              sx={{
                fontSize: '0.6rem',
                height: 20,
                textTransform: 'capitalize',
                borderColor: alpha(accent, 0.4),
                color: accent,
              }}
            />
          )}
          {isMobile && (
            <IconButton size="small" onClick={() => setMobileContextOpen(false)} sx={{ p: 0.5 }}>
              <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', p: { xs: 1.5, md: 2 } }}>
        {/* Template Selection */}
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            color: 'text.secondary',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontSize: '0.65rem',
            display: 'block',
            mb: 1,
          }}
        >
          Templates
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2.5 }}>
          {builtInTemplates.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              isSelected={templateId === tpl.id}
              onSelect={(id) => {
                selectTemplate(id);
                if (isMobile) setMobileContextOpen(false);
              }}
              theme={theme}
              compact
            />
          ))}
          {/* Add Report Button */}
          <Paper
            elevation={0}
            onClick={() => {
              onClose();
              onNavigateBuilder();
            }}
            sx={{
              p: 1.5,
              borderRadius: 2.5,
              border: '2px dashed',
              borderColor: alpha(theme.palette.primary.main, 0.25),
              bgcolor: alpha(theme.palette.primary.main, 0.03),
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: alpha(theme.palette.primary.main, 0.06),
              },
            }}
          >
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                color: 'primary.main',
              }}
            >
              <AppIcon name="AddRounded" fallback={AddRoundedIcon} sx={{ fontSize: 18 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700, fontSize: '0.78rem', color: 'primary.main' }}
              >
                Add Custom Report
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>
                Build from scratch or agent API
              </Typography>
            </Box>
          </Paper>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Filters */}
        {template && (
          <Box sx={{ mb: 2.5 }}>
            <FilterBar
              template={template}
              filters={filters}
              setFilter={setFilter}
              clearFilters={clearFilters}
            />
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Report Info */}
        {template && snapshot && (
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: 'text.secondary',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                fontSize: '0.65rem',
                display: 'block',
                mb: 1,
              }}
            >
              Report Info
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AppIcon
                  name="AccessTime"
                  fallback={AccessTimeIcon}
                  sx={{ fontSize: 14, color: 'text.secondary' }}
                />
                <Typography variant="caption" color="text.secondary">
                  {freshness || 'Computing...'}
                </Typography>
              </Box>
              {version && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AppIcon
                    name="Insights"
                    fallback={InsightsIcon}
                    sx={{ fontSize: 14, color: 'text.secondary' }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    v{version.slice(0, 8)}
                  </Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AppIcon
                  name="Dashboard"
                  fallback={DashboardIcon}
                  sx={{ fontSize: 14, color: 'text.secondary' }}
                />
                <Typography variant="caption" color="text.secondary">
                  {template.sections.length} sections
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      {/* Export Actions Footer */}
      {template && snapshot && (
        <Box
          sx={{
            p: { xs: 1.5, md: 2 },
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              color: 'text.secondary',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              fontSize: '0.6rem',
              display: 'block',
              mb: 1,
            }}
          >
            Export
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Button
              fullWidth
              variant="contained"
              size="small"
              disableElevation
              startIcon={<AppIcon name="PictureAsPdf" fallback={PictureAsPdfIcon} />}
              onClick={() => handleExport('pdf')}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.78rem',
                justifyContent: 'flex-start',
                bgcolor: alpha('#E53935', 0.12),
                color: '#E53935',
                '&:hover': { bgcolor: alpha('#E53935', 0.2) },
              }}
            >
              Professional PDF
            </Button>
            <Button
              fullWidth
              variant="contained"
              size="small"
              disableElevation
              startIcon={<AppIcon name="TableChart" fallback={TableChartIcon} />}
              onClick={() => handleExport('csv')}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.78rem',
                justifyContent: 'flex-start',
                bgcolor: alpha('#43A047', 0.12),
                color: '#43A047',
                '&:hover': { bgcolor: alpha('#43A047', 0.2) },
              }}
            >
              CSV Spreadsheet
            </Button>
            <Button
              fullWidth
              variant="contained"
              size="small"
              disableElevation
              startIcon={<AppIcon name="Slideshow" fallback={SlideshowIcon} />}
              onClick={() => handleExport('presentation')}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.78rem',
                justifyContent: 'flex-start',
                bgcolor: alpha('#AB47BC', 0.12),
                color: '#AB47BC',
                '&:hover': { bgcolor: alpha('#AB47BC', 0.2) },
              }}
            >
              AI Presentation
              <Chip
                label="AI"
                size="small"
                sx={{
                  ml: 'auto',
                  height: 16,
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  bgcolor: alpha(theme.palette.primary.main, 0.15),
                  color: 'primary.main',
                }}
              />
            </Button>
          </Box>
        </Box>
      )}
    </>
  );

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullScreen
        PaperProps={{
          sx: {
            bgcolor: 'background.default',
            backgroundImage: 'none',
            height: { xs: '100dvh', md: '100%' },
            maxHeight: { xs: '100dvh', md: '100%' },
            pt: { xs: 'env(safe-area-inset-top, 0px)', md: 0 },
          },
        }}
        transitionDuration={300}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            maxHeight: { xs: '100dvh', md: '100%' },
            bgcolor: 'background.default',
            overflow: 'hidden',
          }}
        >
          {/* ── HEADER ── */}
          <Box
            sx={{
              px: { xs: 1.25, sm: 3 },
              py: { xs: 0.75, sm: 1.5 },
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: { xs: 0.5, sm: 2 },
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              zIndex: 10,
              minHeight: { xs: 44, sm: 56 },
              flexShrink: 0,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: { xs: 0.75, sm: 2 },
                minWidth: 0,
                flex: 1,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: { xs: 0.5, sm: 1 },
                  flexShrink: 0,
                }}
              >
                <Box
                  sx={{
                    width: { xs: 28, sm: 32 },
                    height: { xs: 28, sm: 32 },
                    borderRadius: 1.5,
                    bgcolor: accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    boxShadow: `0 4px 10px ${alpha(accent, 0.3)}`,
                  }}
                >
                  <AppIcon fallback={IconComp} sx={{ fontSize: { xs: 15, sm: 18 } }} />
                </Box>
                <Typography
                  variant="h6"
                  fontWeight={700}
                  sx={{
                    letterSpacing: '-0.02em',
                    fontSize: { xs: '0.9rem', sm: '1.25rem' },
                    whiteSpace: 'nowrap',
                  }}
                >
                  Report Studio
                </Typography>
              </Box>

              <Divider
                orientation="vertical"
                flexItem
                sx={{
                  height: 20,
                  my: 'auto',
                  mx: { xs: 0, sm: 1 },
                  display: { xs: 'none', sm: 'block' },
                }}
              />

              {/* Template Selector */}
              {template && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: { xs: 1, sm: 1.5 },
                    py: 0.5,
                    borderRadius: 2,
                    bgcolor: alpha(accent, 0.08),
                    border: '1px solid',
                    borderColor: alpha(accent, 0.2),
                    maxWidth: { xs: 180, sm: 'none' },
                  }}
                >
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      borderRadius: 1,
                      bgcolor: alpha(accent, 0.15),
                      color: accent,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AppIcon fallback={IconComp} sx={{ fontSize: 12 }} />
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      fontSize: { xs: '0.78rem', sm: '0.88rem' },
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {template.name}
                  </Typography>
                </Box>
              )}

              <Chip
                label="AI"
                size="small"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.65rem',
                  letterSpacing: 0.4,
                  color: 'primary.main',
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  border: '1px solid',
                  borderColor: alpha(theme.palette.primary.main, 0.25),
                  display: { xs: 'none', sm: 'flex' },
                }}
              />
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: { xs: 0.25, sm: 0.75 },
                flexShrink: 0,
              }}
            >
              {template && snapshot && (
                <Tooltip title="Refresh data">
                  <IconButton
                    size="small"
                    onClick={refresh}
                    disabled={loading}
                    aria-label="Refresh report data"
                    sx={{ p: { xs: 0.5, sm: 1 } }}
                  >
                    <AppIcon
                      name="Refresh"
                      fallback={RefreshIcon}
                      sx={{
                        fontSize: { xs: 18, sm: 20 },
                        animation: loading ? `${speakingPulse} 1s infinite` : 'none',
                      }}
                    />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Print report">
                <IconButton
                  size="small"
                  onClick={() => window.print()}
                  aria-label="Print report"
                  sx={{ p: { xs: 0.5, sm: 1 }, display: { xs: 'none', sm: 'flex' } }}
                >
                  <AppIcon name="Print" fallback={PrintIcon} sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
              <IconButton
                size="small"
                onClick={onClose}
                aria-label="Close report studio"
                sx={{
                  bgcolor: alpha(theme.palette.action.hover, 0.4),
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: { xs: 20, sm: 24 } }} />
              </IconButton>
            </Box>
          </Box>

          {/* ── CONTROL BAR ── */}
          <Box
            sx={{
              px: { xs: 1.25, sm: 3 },
              py: { xs: 0.5, sm: 1 },
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 0.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              minHeight: { xs: 36, sm: 44 },
              flexShrink: 0,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Chip
                icon={
                  snapshot ? (
                    <AppIcon name="CheckCircle" fallback={CheckCircleIcon} />
                  ) : loading ? (
                    <CircularProgress size={14} />
                  ) : (
                    <AppIcon name="GraphicEqRounded" fallback={GraphicEqRoundedIcon} />
                  )
                }
                label={snapshot ? 'Data loaded' : loading ? 'Loading...' : 'Ready'}
                size="small"
                color={snapshot ? 'success' : loading ? 'primary' : 'default'}
                variant={snapshot ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: 600,
                  px: 0.5,
                  fontSize: { xs: '0.68rem', sm: '0.78rem' },
                  height: { xs: 26, sm: 30 },
                }}
              />
              {freshness && (
                <Chip
                  icon={<AppIcon name="AccessTime" fallback={AccessTimeIcon} />}
                  label={freshness}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontWeight: 500,
                    fontSize: { xs: '0.65rem', sm: '0.72rem' },
                    height: { xs: 24, sm: 28 },
                  }}
                />
              )}
              {snapshot?.source &&
                (() => {
                  const sourceMeta = {
                    server: { label: 'Live (database)', color: 'success' },
                    client: { label: 'Computed in browser', color: 'info' },
                    'local-cache': { label: 'Local cache - not live data', color: 'warning' },
                  }[snapshot.source] || { label: snapshot.source, color: 'default' };
                  return (
                    <Tooltip
                      title={
                        snapshot.source === 'server'
                          ? 'Aggregated from the database on the server.'
                          : snapshot.source === 'client'
                            ? 'API unreachable - aggregated live from the database in your browser.'
                            : 'API unreachable and database empty - showing data cached in this browser. Not guaranteed current.'
                      }
                    >
                      <Chip
                        label={sourceMeta.label}
                        size="small"
                        color={sourceMeta.color}
                        variant={snapshot.source === 'local-cache' ? 'filled' : 'outlined'}
                        sx={{ height: 22, fontSize: '0.6rem', fontWeight: 600 }}
                      />
                    </Tooltip>
                  );
                })()}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.25, sm: 0.75 } }}>
              <Tooltip title={livePreview ? 'Live preview on' : 'Live preview off'}>
                <IconButton
                  size="small"
                  onClick={() => setLivePreview(!livePreview)}
                  color={livePreview ? 'primary' : 'default'}
                  sx={{ p: { xs: 0.5, sm: 0.75 } }}
                >
                  {livePreview ? (
                    <AppIcon
                      name="Visibility"
                      fallback={VisibilityIcon}
                      sx={{ fontSize: { xs: 16, sm: 18 } }}
                    />
                  ) : (
                    <AppIcon
                      name="VisibilityOff"
                      fallback={VisibilityOffIcon}
                      sx={{ fontSize: { xs: 16, sm: 18 } }}
                    />
                  )}
                </IconButton>
              </Tooltip>
              {/* Mobile: icon only for settings */}
              <Tooltip title="Settings & Filters">
                <IconButton
                  size="small"
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  sx={{
                    p: { xs: 0.5, sm: 0.75 },
                    color: settingsOpen ? 'primary.main' : 'text.secondary',
                    bgcolor: settingsOpen ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                    borderRadius: 1.5,
                    display: { xs: 'flex', sm: 'none' },
                  }}
                >
                  <AppIcon name="TuneOutlined" fallback={TuneOutlinedIcon} sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              {/* Desktop: text button */}
              <Tooltip title="Settings & Filters">
                <Button
                  size="small"
                  startIcon={<AppIcon name="TuneOutlined" fallback={TuneOutlinedIcon} />}
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  sx={{
                    textTransform: 'none',
                    color: settingsOpen ? 'primary.main' : 'text.secondary',
                    bgcolor: settingsOpen ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                    borderRadius: 2,
                    display: { xs: 'none', sm: 'inline-flex' },
                    fontSize: '0.8rem',
                  }}
                >
                  Settings
                </Button>
              </Tooltip>
            </Box>
          </Box>

          {/* ── SETTINGS PANEL (Collapsible) ── */}
          <Collapse in={settingsOpen} sx={{ flexShrink: 0 }}>
            <Box
              sx={{
                p: { xs: 1.5, sm: 2.5 },
                bgcolor: 'background.paper',
                borderBottom: '1px solid',
                borderColor: 'divider',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                maxHeight: { xs: '30vh', sm: 'none' },
                overflowY: { xs: 'auto', sm: 'visible' },
              }}
            >
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
                  gap: { xs: 1.5, sm: 3 },
                  alignItems: 'start',
                }}
              >
                <Box>
                  <Typography
                    variant="subtitle2"
                    fontWeight={700}
                    sx={{ mb: 1, fontSize: { xs: '0.75rem', sm: '0.85rem' } }}
                  >
                    Preview
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={livePreview}
                        onChange={(e) => setLivePreview(e.target.checked)}
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                        Live preview
                      </Typography>
                    }
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                        Auto-refresh
                      </Typography>
                    }
                  />
                </Box>
                <Box>
                  <Typography
                    variant="subtitle2"
                    fontWeight={700}
                    sx={{ mb: 1, fontSize: { xs: '0.75rem', sm: '0.85rem' } }}
                  >
                    Display
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {['compact', 'standard', 'detailed'].map((mode) => (
                      <Chip
                        key={mode}
                        label={mode}
                        size="small"
                        clickable
                        color={displayMode === mode ? 'primary' : 'default'}
                        variant={displayMode === mode ? 'filled' : 'outlined'}
                        onClick={() => setDisplayMode(mode)}
                        aria-pressed={displayMode === mode}
                        sx={{ textTransform: 'capitalize', fontSize: '0.72rem' }}
                      />
                    ))}
                  </Box>
                </Box>
                <Box sx={{ gridColumn: { xs: 'span 2', sm: 'span 2' } }}>
                  <Typography
                    variant="subtitle2"
                    fontWeight={700}
                    sx={{ mb: 1, fontSize: { xs: '0.75rem', sm: '0.85rem' } }}
                  >
                    Quick Actions
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={
                        <AppIcon name="Print" fallback={PrintIcon} sx={{ fontSize: 14 }} />
                      }
                      onClick={() => window.print()}
                      sx={{ textTransform: 'none', fontSize: '0.72rem', borderRadius: 2 }}
                    >
                      Print
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color={shareCopied ? 'success' : 'primary'}
                      startIcon={
                        <AppIcon name="Share" fallback={ShareIcon} sx={{ fontSize: 14 }} />
                      }
                      onClick={handleShareLink}
                      sx={{ textTransform: 'none', fontSize: '0.72rem', borderRadius: 2 }}
                    >
                      {shareCopied ? 'Link copied!' : 'Share Link'}
                    </Button>
                    {template && snapshot && (
                      <>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={
                            <AppIcon
                              name="PictureAsPdf"
                              fallback={PictureAsPdfIcon}
                              sx={{ fontSize: 14 }}
                            />
                          }
                          onClick={() => handleExport('pdf')}
                          sx={{ textTransform: 'none', fontSize: '0.72rem', borderRadius: 2 }}
                        >
                          PDF
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={
                            <AppIcon
                              name="Slideshow"
                              fallback={SlideshowIcon}
                              sx={{ fontSize: 14 }}
                            />
                          }
                          onClick={() => handleExport('presentation')}
                          sx={{ textTransform: 'none', fontSize: '0.72rem', borderRadius: 2 }}
                        >
                          AI Slides
                        </Button>
                      </>
                    )}
                  </Box>
                </Box>
              </Box>
            </Box>
          </Collapse>

          {/* ── MAIN CONTENT (SPLIT VIEW) ── */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              overflow: 'hidden',
              flexDirection: 'row',
              minHeight: 0,
            }}
          >
            {/* ── LEFT PANEL: REPORT CONTENT ── */}
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                bgcolor: alpha(theme.palette.background.default, 0.4),
                minHeight: 0,
                minWidth: 0,
                overflow: 'hidden',
              }}
            >
              {/* Report Sections - Scrollable */}
              <Box
                ref={reportScrollRef}
                sx={{
                  flex: 1,
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  p: { xs: 1.5, sm: 3 },
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  minHeight: 0,
                }}
              >
                {/* Error - differentiate auth / rate-limit / server, offer retry */}
                {error && (
                  <Alert
                    severity={errorStatus === 429 ? 'warning' : 'error'}
                    action={
                      <Button
                        color="inherit"
                        size="small"
                        onClick={refresh}
                        startIcon={<AppIcon name="Refresh" fallback={RefreshIcon} />}
                      >
                        Retry
                      </Button>
                    }
                    sx={{ borderRadius: 2 }}
                  >
                    {errorStatus === 401
                      ? 'Your session expired. Sign in again, then retry.'
                      : errorStatus === 429
                        ? 'Rate limit reached. Wait a moment and retry.'
                        : error}
                  </Alert>
                )}

                {/* Report Content */}
                {template && loading && !snapshot ? (
                  Array.from({ length: template.sections.length }).map((_, i) => (
                    <BentoCard key={i} title={<Skeleton width={120} />} icon={DescriptionIcon}>
                      <SectionSkeleton />
                    </BentoCard>
                  ))
                ) : template && snapshot ? (
                  <>
                    <AiNarrative
                      snapshot={snapshot}
                      kpis={snapshot.kpis}
                      alerts={
                        snapshot.alerts ||
                        snapshot.agentAlerts ||
                        snapshot.goalAlerts ||
                        snapshot.kbAlerts ||
                        snapshot.qualityAlerts ||
                        snapshot.pulseAlerts
                      }
                      template={template}
                      computedAt={snapshot.computedAt || computedAt}
                    />
                    <Box
                      className="report-section-nav"
                      sx={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 5,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 0.5,
                        py: 1,
                        mb: 1,
                        bgcolor: isDark
                          ? alpha(theme.palette.background.default, 0.85)
                          : alpha(theme.palette.background.default, 0.85),
                        backdropFilter: 'blur(8px)',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      {template.sections.map((section) => (
                        <Chip
                          key={section.id}
                          label={section.label}
                          size="small"
                          onClick={() => scrollToSection(section.id)}
                          aria-label={`Jump to ${section.label} section`}
                          sx={{
                            fontWeight: 600,
                            cursor: 'pointer',
                            bgcolor: alpha(accent, 0.08),
                            color: accent,
                            '&:hover': { bgcolor: alpha(accent, 0.18) },
                          }}
                        />
                      ))}
                    </Box>
                    {template.sections.map((section, i) => {
                      const sectionIcon =
                        section.type === SECTION_TYPES.RANKED_TABLE
                          ? TableChartIcon
                          : AssessmentIcon;
                      return (
                        <Box
                          key={section.id}
                          ref={(el) => {
                            if (el) sectionRefs.current[section.id] = el;
                          }}
                          role="region"
                          aria-label={section.label}
                          sx={{
                            animation: `${slideUp} 0.4s ease-out`,
                            animationDelay: `${i * 0.06}s`,
                            animationFillMode: 'both',
                          }}
                        >
                          <BentoCard
                            title={section.label}
                            icon={sectionIcon}
                            iconColor={accent}
                            delay={i * 0.05}
                          >
                            <SectionRenderer
                              section={section}
                              data={snapshot}
                              onDrill={handleDrill}
                              scope={template.id}
                              loading={loading && !snapshot}
                              displayMode={displayMode}
                            />
                          </BentoCard>
                        </Box>
                      );
                    })}
                  </>
                ) : !template ? (
                  <Box sx={{ mt: { xs: 4, sm: 8 }, textAlign: 'center', opacity: 0.6, px: 1 }}>
                    <Box sx={{ mb: 1.5 }}>
                      <AiOrb size={48} state="idle" />
                    </Box>
                    <Typography
                      variant="h6"
                      fontWeight={600}
                      gutterBottom
                      sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                    >
                      Select a template to begin
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ maxWidth: 400, mx: 'auto', fontSize: { xs: '0.8rem', sm: '0.875rem' } }}
                    >
                      Choose a report template from the sidebar, or describe what you need using the
                      input below.
                    </Typography>
                  </Box>
                ) : null}
              </Box>

              {/* Mobile: Context toggle bar */}
              {isMobile && template && (
                <Box
                  onClick={() => setMobileContextOpen(true)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    py: 0.6,
                    px: 2,
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                    borderTop: '1px solid',
                    borderColor: alpha(theme.palette.primary.main, 0.2),
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    flexShrink: 0,
                    '&:active': { bgcolor: alpha(theme.palette.primary.main, 0.18) },
                  }}
                >
                  <Badge
                    badgeContent={builtInTemplates.length}
                    color="primary"
                    sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', minWidth: 18, height: 18 } }}
                  >
                    <AppIcon
                      name="BoltRounded"
                      fallback={BoltRoundedIcon}
                      sx={{ fontSize: 18, color: 'primary.main' }}
                    />
                  </Badge>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, color: 'primary.main', fontSize: '0.75rem' }}
                  >
                    Templates & Export
                  </Typography>
                  <AppIcon
                    name="ExpandMoreRounded"
                    fallback={ExpandMoreRoundedIcon}
                    sx={{ fontSize: 16, color: 'primary.main', transform: 'rotate(180deg)' }}
                  />
                </Box>
              )}

              {/* AI Input Area */}
              <ReportInputBar theme={theme} selectTemplate={selectTemplate} setFilter={setFilter} />
            </Box>

            {/* ── RIGHT PANEL: CONTEXT (Desktop) ── */}
            {!isMobile && (
              <Box
                sx={{
                  width: { md: 340, lg: 380 },
                  bgcolor: 'background.default',
                  borderLeft: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {contextContent}
              </Box>
            )}
          </Box>

          {/* ── MOBILE CONTEXT DRAWER ── */}
          {isMobile && (
            <Drawer
              anchor="bottom"
              open={mobileContextOpen}
              onClose={() => setMobileContextOpen(false)}
              PaperProps={{
                sx: {
                  borderRadius: '16px 16px 0 0',
                  maxHeight: '80vh',
                  bgcolor: 'background.default',
                },
              }}
              ModalProps={{ keepMounted: true }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1, pb: 0.5 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    bgcolor: 'text.disabled',
                    opacity: 0.4,
                  }}
                />
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: 'calc(80vh - 16px)',
                  overflow: 'hidden',
                }}
              >
                {contextContent}
              </Box>
            </Drawer>
          )}
        </Box>
      </Dialog>
      {/* Export Progress */}
      <FormDialog
        open={!!exportProgress}
        onClose={() => {}}
        title={
          exportProgress === 'presentation'
            ? 'Generating AI Presentation...'
            : exportProgress === 'pdf'
              ? 'Building Professional PDF...'
              : 'Exporting CSV Data...'
        }
        subtitle={
          exportProgress === 'presentation'
            ? 'Creating slides with graphs and AI insights'
            : 'This will download automatically'
        }
        icon={
          exportProgress === 'pdf'
            ? PictureAsPdfIcon
            : exportProgress === 'presentation'
              ? SlideshowIcon
              : TableChartIcon
        }
        maxWidth="xs"
        fullWidth={false}
        hideFooter
        contentDividers={false}
        contentSx={{ textAlign: 'center', py: 4, minWidth: 320 }}
        disableEscapeKeyDown
      >
        <Box sx={{ mb: 2 }}>
          {exportProgress === 'presentation' ? (
            <AiOrb size={40} state="searching" />
          ) : exportProgress === 'pdf' ? (
            <AppIcon
              name="PictureAsPdf"
              fallback={PictureAsPdfIcon}
              sx={{ fontSize: 40, color: '#E53935' }}
            />
          ) : (
            <AppIcon
              name="TableChart"
              fallback={TableChartIcon}
              sx={{ fontSize: 40, color: '#43A047' }}
            />
          )}
        </Box>
        <LinearProgress sx={{ mt: 2, borderRadius: 2 }} />
      </FormDialog>
      <DrillDownDrawer
        open={Boolean(drillTarget)}
        title={drillTarget?.title}
        subtitle={template?.name}
        payload={drillTarget?.payload}
        onClose={() => setDrillTarget(null)}
      />
    </>
  );
}

// ─── AI Input Bar (bottom of report view) ────────────────────────────────────

function ReportInputBar({ theme, selectTemplate, setFilter }) {
  const isDark = theme.palette.mode === 'dark';
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setProcessing(true);
    setTimeout(() => {
      const intent = parseReportIntent(text);
      if (intent?.primaryTemplate) selectTemplate(intent.primaryTemplate.id);
      if (intent?.filters) Object.entries(intent.filters).forEach(([k, v]) => setFilter(k, v));
      setProcessing(false);
      setInput('');
    }, 500);
  }, [input, selectTemplate, setFilter]);

  return (
    <Box
      sx={{
        p: { xs: 0.75, sm: 2 },
        bgcolor: 'background.paper',
        borderTop: '1px solid',
        borderColor: 'divider',
        flexShrink: 0,
        pb: { xs: 'calc(6px + env(safe-area-inset-bottom, 0px))', sm: 2 },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          display: 'flex',
          alignItems: 'center',
          p: { xs: '3px 6px', sm: '4px 8px' },
          borderRadius: { xs: 2.5, sm: 3 },
          border: '1px solid',
          borderColor: alpha(theme.palette.primary.main, 0.3),
          bgcolor: alpha(theme.palette.background.default, 0.5),
          transition: 'all 0.2s',
          '&:focus-within': {
            borderColor: 'primary.main',
            boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.15)}`,
          },
        }}
      >
        <Box sx={{ flexShrink: 0, ml: 0.25 }}>
          {processing ? <CircularProgress size={14} /> : <AiOrb size={28} state="idle" />}
        </Box>
        <InputBase
          placeholder="Describe what you need..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          fullWidth
          multiline
          maxRows={3}
          sx={{
            px: { xs: 0.75, sm: 1.5 },
            fontSize: { xs: '0.85rem', sm: '0.9rem' },
            '& .MuiInputBase-input::placeholder': { color: 'text.secondary', opacity: 0.7 },
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Tooltip title="Generate">
          <span>
            <IconButton
              onClick={handleSubmit}
              disabled={!input.trim() || processing}
              size="small"
              sx={{
                bgcolor: input.trim() ? 'primary.main' : 'action.disabledBackground',
                color: input.trim() ? '#fff' : 'text.disabled',
                '&:hover': { bgcolor: input.trim() ? 'primary.dark' : 'action.disabledBackground' },
                transition: 'all 0.2s',
                width: { xs: 32, sm: 36 },
                height: { xs: 32, sm: 36 },
              }}
            >
              <AppIcon
                name="SendRounded"
                fallback={SendRoundedIcon}
                sx={{ fontSize: { xs: 16, sm: 18 } }}
              />
            </IconButton>
          </span>
        </Tooltip>
      </Paper>
      {/* Quick prompts row */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1, px: 0.5 }}>
        {QUICK_PROMPTS.slice(0, 4).map((qp) => (
          <Chip
            key={qp.label}
            icon={
              <AppIcon
                name="LightbulbOutlined"
                fallback={LightbulbOutlinedIcon}
                sx={{ fontSize: 12 }}
              />
            }
            label={qp.label}
            size="small"
            variant="outlined"
            onClick={() => {
              setInput(qp.prompt);
            }}
            sx={{
              fontWeight: 500,
              fontSize: '0.65rem',
              cursor: 'pointer',
              borderColor: alpha(theme.palette.divider, 0.6),
              '&:hover': {
                borderColor: 'primary.main',
                color: 'primary.main',
                bgcolor: alpha(theme.palette.primary.main, 0.06),
              },
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ReportPage({ embedded = false } = {}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const Wrapper = embedded ? Box : PageLayout;
  const wrapperProps = embedded
    ? { sx: { width: '100%' } }
    : {
        title: 'Reports',
        subtitle:
          'Generate professional reports from live platform data. Describe what you need or pick a template.',
        showTitleBlock: false,
      };
  const [studioOpen, setStudioOpen] = useState(false);

  // ── Tab state (URL-synced) ────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const [reportTab, setReportTab] = useState(() => {
    const t = searchParams.get('tab');
    return t === 'llm' ? t : 'reports';
  });

  useEffect(() => {
    const t = searchParams.get('tab');
    if (['reports', 'llm'].includes(t)) setReportTab(t);
  }, [searchParams]);

  const handleReportTabChange = useCallback(
    (value) => {
      setReportTab(value);
      setSearchParams({ tab: value }, { replace: true });
    },
    [setSearchParams]
  );

  const {
    template,
    templateId,
    builtInTemplates,
    selectTemplate,
    filters,
    setFilter,
    clearFilters,
    snapshot,
    loading,
    error,
    errorStatus,
    freshness,
    version,
    computedAt,
    autoRefresh,
    setAutoRefresh,
    refresh,
  } = useReport();

  // Auto-open studio when template is selected
  useEffect(() => {
    if (templateId && template) setStudioOpen(true);
  }, [templateId, template]);

  const handleOpenStudio = useCallback(() => setStudioOpen(true), []);
  const handleCloseStudio = useCallback(() => setStudioOpen(false), []);

  const reportsBody = (
    <>
      {/* ── Tab Navigation ──────────────────────────────────────── */}
      <Box data-tour-block="reports-tab-nav" data-tour-label="Reports vs LLM" sx={{ display: 'flex', alignItems: 'center', mb: '10px' }}>
        <Box
          sx={{
            display: 'flex',
            bgcolor: alpha(theme.palette.text.primary, 0.04),
            p: 0.5,
            borderRadius: 3,
            width: { xs: '100%', md: 'auto' },
          }}
        >
          {[
            { id: 'reports', label: 'Reports', icon: AssessmentIcon },
            { id: 'llm', label: 'LLM', icon: InsightsIcon },
          ].map((t) => (
            <Button
              key={t.id}
              startIcon={<AppIcon fallback={t.icon} sx={{ fontSize: 18 }} />}
              onClick={() => handleReportTabChange(t.id)}
              fullWidth={isMobile}
              sx={{
                borderRadius: 2.5,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.85rem',
                px: 2,
                minHeight: 36,
                transition: 'all 0.2s',
                bgcolor:
                  reportTab === t.id ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                color: reportTab === t.id ? 'primary.main' : 'text.secondary',
                boxShadow:
                  reportTab === t.id
                    ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}`
                    : 'none',
                '&:hover': {
                  bgcolor:
                    reportTab === t.id
                      ? alpha(theme.palette.primary.main, 0.15)
                      : alpha(theme.palette.text.primary, 0.05),
                  color: reportTab === t.id ? 'primary.main' : 'text.primary',
                },
              }}
            >
              {t.label}
            </Button>
          ))}
        </Box>
      </Box>
      {/* ── LLM Tab ───────────────────────────────────────────── */}
      {reportTab === 'llm' && <LlmReportsTab />}
      {/* ── Standard Reports Tab ──────────────────────────────── */}
      {reportTab === 'reports' && (
        <>
          {/* AI Report Builder */}
          <Paper
            data-tour-block="reports-ai-builder"
            data-tour-label="AI report builder"
            elevation={0}
            sx={{
              mb: 2,
              borderRadius: 3,
              border: '1px solid',
              borderColor: alpha(theme.palette.primary.main, 0.2),
              bgcolor: isDark
                ? alpha(theme.palette.background.paper, 0.6)
                : theme.palette.background.paper,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: { xs: 1.5, sm: 2 },
                py: 1.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: isDark
                  ? alpha(theme.palette.primary.main, 0.06)
                  : alpha(theme.palette.primary.main, 0.03),
              }}
            >
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  Reports
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Tell me what you need -- I&apos;ll find the best template or build a personalized
                  report
                </Typography>
              </Box>
              <Chip
                label="AI"
                size="small"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.68rem',
                  letterSpacing: 0.4,
                  color: 'primary.main',
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  border: '1px solid',
                  borderColor: alpha(theme.palette.primary.main, 0.25),
                }}
              />
            </Box>
            <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Paper
                elevation={0}
                onClick={handleOpenStudio}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  p: '10px 16px',
                  borderRadius: 20,
                  border: '1px solid',
                  borderColor: alpha(theme.palette.primary.main, 0.25),
                  bgcolor: alpha(theme.palette.primary.main, 0.05),
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: createHoverGlowShadow(theme),
                    transform: 'translateY(-1px)',
                  },
                }}
              >
                <Box sx={{ flexShrink: 0 }}>
                  <AiOrb size={32} state="idle" />
                </Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ ml: 1.5, flex: 1, opacity: 0.7 }}
                >
                  Click to open Report Studio...
                </Typography>
                <AppIcon
                  name="Fullscreen"
                  fallback={FullscreenIcon}
                  sx={{ fontSize: 20, color: 'text.secondary', opacity: 0.5 }}
                />
              </Paper>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
                {QUICK_PROMPTS.map((qp) => (
                  <Chip
                    key={qp.label}
                    icon={
                      <AppIcon
                        name="LightbulbOutlined"
                        fallback={LightbulbOutlinedIcon}
                        sx={{ fontSize: 14 }}
                      />
                    }
                    label={qp.label}
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      const intent = parseReportIntent(qp.prompt);
                      if (intent?.primaryTemplate) selectTemplate(intent.primaryTemplate.id);
                      setStudioOpen(true);
                    }}
                    sx={{
                      fontWeight: 500,
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      borderColor: alpha(theme.palette.divider, 0.8),
                      transition: 'all 0.15s',
                      '&:hover': {
                        borderColor: 'primary.main',
                        bgcolor: alpha(theme.palette.primary.main, 0.06),
                        color: 'primary.main',
                      },
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Paper>

          {/* Template Selector -- Always Visible */}
          <Box sx={{ mb: '10px' }}>
            <BentoCard
              noHeader
              iconColor={CATEGORY_COLORS[template?.category] || theme.palette.primary.main}
            >
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, 1fr)',
                    md: 'repeat(3, 1fr)',
                    lg: 'repeat(5, 1fr)',
                  },
                  gap: 1.5,
                  mb: template ? 2 : 0,
                }}
              >
                {builtInTemplates.map((tpl, i) => (
                  <Box
                    key={tpl.id}
                    sx={{
                      animation: `${slideUp} 0.4s ease-out`,
                      animationDelay: `${i * 0.06}s`,
                      animationFillMode: 'both',
                    }}
                  >
                    <TemplateCard
                      tpl={tpl}
                      isSelected={templateId === tpl.id}
                      onSelect={(id) => {
                        selectTemplate(id);
                        setStudioOpen(true);
                      }}
                      theme={theme}
                    />
                  </Box>
                ))}
                {/* Add Report Card */}
                <Box
                  sx={{
                    animation: `${slideUp} 0.4s ease-out`,
                    animationDelay: `${builtInTemplates.length * 0.06}s`,
                    animationFillMode: 'both',
                  }}
                >
                  <Paper
                    elevation={0}
                    onClick={() => navigate('/reports/builder')}
                    sx={{
                      p: 2,
                      borderRadius: 2.5,
                      border: '2px dashed',
                      borderColor: alpha(theme.palette.primary.main, 0.3),
                      bgcolor: isDark
                        ? alpha(theme.palette.primary.main, 0.04)
                        : alpha(theme.palette.primary.main, 0.02),
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 130,
                      '&:hover': {
                        borderColor: 'primary.main',
                        transform: 'translateY(-2px)',
                        boxShadow: createHoverGlowShadow(theme),
                        bgcolor: alpha(theme.palette.primary.main, 0.06),
                      },
                    }}
                  >
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        color: 'primary.main',
                        mb: 1,
                      }}
                    >
                      <AppIcon name="AddRounded" fallback={AddRoundedIcon} sx={{ fontSize: 24 }} />
                    </Box>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 700, color: 'primary.main', textAlign: 'center' }}
                    >
                      Add Report
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ textAlign: 'center', lineHeight: 1.3, mt: 0.5 }}
                    >
                      Build a custom report from scratch or agent data
                    </Typography>
                  </Paper>
                </Box>
              </Box>
              {templateId && template && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    pt: 1.5,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <AppIcon
                    name="Insights"
                    fallback={InsightsIcon}
                    sx={{
                      fontSize: 16,
                      color: CATEGORY_COLORS[template.category] || 'primary.main',
                    }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Active:{' '}
                    <span
                      style={{
                        color: CATEGORY_COLORS[template.category] || theme.palette.primary.main,
                      }}
                    >
                      {template.name}
                    </span>
                  </Typography>
                  <Chip
                    label={template.category}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      bgcolor: alpha(
                        CATEGORY_COLORS[template.category] || theme.palette.primary.main,
                        0.1
                      ),
                      color: CATEGORY_COLORS[template.category] || theme.palette.primary.main,
                    }}
                  />
                  <Box sx={{ ml: 'auto' }}>
                    <Button
                      size="small"
                      variant="contained"
                      disableElevation
                      startIcon={
                        <AppIcon
                          name="Fullscreen"
                          fallback={FullscreenIcon}
                          sx={{ fontSize: 16 }}
                        />
                      }
                      onClick={handleOpenStudio}
                      sx={{
                        borderRadius: 2,
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        px: 2,
                      }}
                    >
                      Open Studio
                    </Button>
                  </Box>
                </Box>
              )}
            </BentoCard>
          </Box>

          {/* Empty State */}
          {!template && (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <AppIcon
                name="Assessment"
                fallback={AssessmentIcon}
                sx={{ fontSize: 56, color: alpha(theme.palette.text.secondary, 0.15), mb: 1.5 }}
              />
              <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                Describe what you need above, or select a template to get started
              </Typography>
            </Box>
          )}

          {/* Full-Screen Report Studio Dialog */}
          <ReportStudioDialog
            open={studioOpen}
            onClose={handleCloseStudio}
            template={template}
            templateId={templateId}
            builtInTemplates={builtInTemplates}
            selectTemplate={selectTemplate}
            filters={filters}
            setFilter={setFilter}
            clearFilters={clearFilters}
            snapshot={snapshot}
            loading={loading}
            error={error}
            errorStatus={errorStatus}
            freshness={freshness}
            version={version}
            computedAt={computedAt}
            autoRefresh={autoRefresh}
            setAutoRefresh={setAutoRefresh}
            refresh={refresh}
            theme={theme}
            onNavigateBuilder={() => navigate('/reports/builder')}
          />
        </>
      )}
      <style>{`
        @media print {
          body { background: white !important; }
          nav, header, [data-sidebar], [data-topbar] { display: none !important; }
          .MuiDrawer-root { display: none !important; }
        }
      `}</style>
    </>
  );

  // Header only (per design): give Reports a Projects-style icon+title header card, but leave
  // its tabs and AI-builder body exactly where they are. Embedded mode stays header-less.
  return (
    <Wrapper {...wrapperProps}>
      {embedded ? (
        reportsBody
      ) : (
        <BentoCard title="Reports" icon={AssessmentIcon} explain noTour plainHeader noPadding>
          {reportsBody}
        </BentoCard>
      )}
    </Wrapper>
  );
}
