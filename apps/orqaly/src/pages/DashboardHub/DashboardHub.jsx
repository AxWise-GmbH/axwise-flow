import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  InputBase,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Snackbar,
  Alert,
  Skeleton,
  Collapse,
  useTheme,
  alpha,
} from '@mui/material';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import GlassIcon from '../../components/icons/GlassIcon';
import PageLayout from '../../components/Common/PageLayout';
import { listGoals } from '../../services/goalService';
import { listDashboards } from '../../services/dashboardService';
import { REPORT_TEMPLATES } from '../Reports/reportTemplates';
import { useInstrumentCounts } from '../../hooks/useInstrumentCounts';
import DashboardsArt from './illustrations/DashboardsArt';
import BuildDashboardArt from './illustrations/BuildDashboardArt';
import KnowledgeBaseArt from '../../components/illustrations/pages/KnowledgeBaseArt';
import WorkflowArt from '../../components/illustrations/pages/WorkflowArt';
import TaskManagerArt from '../../components/illustrations/pages/TaskManagerArt';
import ProjectsArt from '../../components/illustrations/pages/ProjectsArt';
import '../Marketplace/MarketplaceLanding.css';

import AppIcon from '../../components/icons/AppIcon';

// Goal status buckets - mirror the values used on the Simple Dashboard
// so the Communicator tile reports the same "live conversations" / "need
// response" / "events · 24h" counts everywhere.
const IN_FLIGHT_STATUSES = [
  'feasibility',
  'analyzing',
  'researching_customer',
  'planning',
  'forming_team',
  'provisioning_tools',
  'estimating',
  'authorizing_execution',
  'active',
  'pending_validation',
];
const ATTENTION_STATUSES = [
  'needs_human',
  'awaiting_tools',
  'awaiting_context_approval',
  'awaiting_approval',
  'awaiting_po_input',
  'paused',
  'failed',
];

/**
 * Reports hub. Single-screen landing reached from the dock at position 3
 * (label: "Reports"). Three entry tiles (Dashboard / Reports / Communicator),
 * a prompt-to-build-a-dashboard block, then an Instruments block linking to
 * Knowledge Base, Workflow, Tasks, and Projects with live item counts.
 *
 * Layout matches SimpleOrganizations showcase: "Your Actions" header with
 * a horizontal scroll row of compact cards, then instruments in a 2×2 grid.
 */
export default function DashboardHub() {
  const [showBuilder, setShowBuilder] = useState(false);
  return (
    <PageLayout title="Reports" showTitleBlock={false}>
      <div className="mkt-landing" data-compact="1">
        <div className="mkt-landing__inner" style={{ paddingBottom: 80 }}>
          <section className="mkt-section">
            <PrimaryTiles />
          </section>

          <section className="mkt-section">
            <h3 className="mkt-hub__section-label">Instruments</h3>
            <InstrumentsBlock />
          </section>

          <ShowMoreToggle open={showBuilder} onToggle={() => setShowBuilder((v) => !v)} />
          <Collapse in={showBuilder} timeout={350}>
            <BuildDashboardBlock />
          </Collapse>
        </div>
      </div>
    </PageLayout>
  );
}

// Plain-text toggle that reveals the BuildDashboardBlock below.
function ShowMoreToggle({ open, onToggle }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: '10px' }}>
      <Box
        component="button"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        sx={{
          background: 'none',
          border: 'none',
          color: 'text.secondary',
          cursor: 'pointer',
          fontSize: '0.85rem',
          fontWeight: 600,
          letterSpacing: '0.04em',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          padding: '8px 14px',
          borderRadius: 999,
          fontFamily: 'inherit',
          transition: 'color .2s',
          '&:hover, &:focus-visible': { color: 'primary.main', outline: 'none' },
        }}
      >
        {open ? 'Show less' : 'Show more'}
        <AppIcon
          name="KeyboardArrowDownRounded"
          fallback={KeyboardArrowDownRoundedIcon}
          sx={{
            fontSize: 18,
            transition: 'transform .25s ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </Box>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────
// Action tile - same pattern as SimpleOrganizations (square icon,
// title/subtitle stack, optional stats footer).
// ─────────────────────────────────────────────────────────────────
function ActionTile({
  title,
  subtitle,
  iconName,
  fallback,
  ariaLabel,
  delay = 0,
  onClick,
  stats = null,
  illustration = null,
}) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };
  return (
    <article
      className="mkt-tile mkt-tile--org-action"
      role="link"
      tabIndex={0}
      aria-label={ariaLabel || `${title} - ${subtitle}`}
      style={{ '--delay': `${delay}ms` }}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty(
          '--mx',
          `${((e.clientX - rect.left) / rect.width) * 100}%`
        );
        e.currentTarget.style.setProperty(
          '--my',
          `${((e.clientY - rect.top) / rect.height) * 100}%`
        );
      }}
    >
      {illustration && (
        <div className="mkt-tile__illustration" aria-hidden="true">
          {illustration}
        </div>
      )}
      <div className="mkt-tile--org-action__body">
        <div className="mkt-tile__icon" aria-hidden="true">
          <GlassIcon name={iconName} fallback={fallback} size={28} />
        </div>
        <h3 className="mkt-tile__title">{title}</h3>
        <p className="mkt-tile__subtitle">{subtitle}</p>
        {Array.isArray(stats) && stats.length > 0 && (
          <div className="org-card__metrics" style={{ marginTop: 8 }}>
            {stats.map((s) => (
              <span key={s.label}>
                <b>{s.value}</b>
                {s.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────
// Compact hub card - horizontal scroll row inside the showcase tile,
// same pattern as OrgCard on SimpleOrganizations.
// ─────────────────────────────────────────────────────────────────
function HubCard({ title, subtitle, metrics, onOpen, ariaLabel }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen?.();
    }
  };

  return (
    <button
      type="button"
      className="org-card hub-card"
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel || `${title}. ${subtitle}`}
    >
      <h4 className="org-card__title">{title}</h4>
      <p className="org-card__sub">{subtitle}</p>
      {Array.isArray(metrics) && metrics.length > 0 && (
        <div className="org-card__metrics">
          {metrics.map((m) => (
            <span key={m.label}>
              <b>{m.value}</b>
              {m.label}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────
// PrimaryTiles - showcase header + horizontal scroll of three entry
// cards (Dashboard / Report / Communication), matching Organizations.
// ─────────────────────────────────────────────────────────────────
function PrimaryTiles() {
  const navigate = useNavigate();
  const [goals, setGoals] = useState([]);
  const [dashboards, setDashboards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listGoals().catch(() => []), listDashboards().catch(() => ({ dashboards: [] }))])
      .then(([goalData, dashData]) => {
        if (cancelled) return;
        setGoals(Array.isArray(goalData) ? goalData : []);
        const list = dashData?.dashboards ?? dashData;
        setDashboards(Array.isArray(list) ? list : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const commMetrics = useMemo(() => {
    const inFlight = goals.filter((g) => IN_FLIGHT_STATUSES.includes(g.status)).length;
    const attention = goals.filter((g) => ATTENTION_STATUSES.includes(g.status)).length;
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const activity24h = goals.filter((g) => {
      const t = g.updated_at || g.created_at;
      return t && new Date(t).getTime() >= dayAgo;
    }).length;
    return { inFlight, attention, activity24h };
  }, [goals]);

  const dashCount = dashboards.length;
  const templateCount = REPORT_TEMPLATES.length;

  const cards = [
    {
      key: 'dashboard',
      title: 'Dashboard',
      subtitle: 'Build your interactive metrics from live data',
      path: '/dashboards',
      metrics: loading
        ? null
        : [
            { label: dashCount === 1 ? 'saved' : 'saved', value: dashCount },
            {
              label: 'live blocks',
              value: dashboards.reduce((n, d) => n + (d?.config?.blocks?.length || 0), 0),
            },
          ],
    },
    {
      key: 'report',
      title: 'Report',
      subtitle: 'Generate professional reports for everything',
      path: '/reports',
      metrics: loading
        ? null
        : [
            { label: templateCount === 1 ? 'template' : 'templates', value: templateCount },
            { label: 'types', value: new Set(REPORT_TEMPLATES.map((t) => t.category)).size },
          ],
    },
    {
      key: 'communication',
      title: 'Communication',
      subtitle: 'Look inside communication, processes and goals',
      path: '/communicator',
      metrics: loading
        ? null
        : [
            { label: 'live', value: commMetrics.inFlight },
            { label: 'need response', value: commMetrics.attention },
            { label: 'events · 24h', value: commMetrics.activity24h },
          ],
    },
  ];

  return (
    <article
      className="mkt-tile mkt-tile--org-showcase mkt-tile--hub-showcase"
      style={{ '--delay': '0ms' }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty(
          '--mx',
          `${((e.clientX - rect.left) / rect.width) * 100}%`
        );
        e.currentTarget.style.setProperty(
          '--my',
          `${((e.clientY - rect.top) / rect.height) * 100}%`
        );
      }}
    >
      <div className="mkt-tile__illustration" aria-hidden="true">
        <DashboardsArt />
      </div>

      <div className="mkt-tile--org-showcase__header">
        <div>
          <h3 className="mkt-tile--org-showcase__title">Your Actions</h3>
          <p className="mkt-tile--org-showcase__sub">
            Tap any card to open dashboards, reports or the communicator.
          </p>
        </div>
      </div>

      <div className="mkt-tile--org-showcase__row">
        {loading
          ? [0, 1, 2].map((i) => (
              <div key={i} className="org-card hub-card" style={{ pointerEvents: 'none' }}>
                <Skeleton variant="text" width="55%" sx={{ fontSize: '0.9rem' }} />
                <Skeleton variant="text" width="90%" sx={{ fontSize: '0.7rem' }} />
                <Skeleton variant="text" width="70%" sx={{ fontSize: '0.65rem', mt: 0.5 }} />
              </div>
            ))
          : cards.map((c) => (
              <HubCard
                key={c.key}
                title={c.title}
                subtitle={c.subtitle}
                metrics={c.metrics}
                onOpen={() => navigate(c.path)}
                ariaLabel={`${c.title} - ${c.subtitle}`}
              />
            ))}
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────
// InstrumentsBlock - quick jumps to the tool pages with live counts.
// ─────────────────────────────────────────────────────────────────
function InstrumentsBlock() {
  const navigate = useNavigate();
  const { counts, loading } = useInstrumentCounts();

  const items = useMemo(
    () => [
      {
        key: 'knowledge_base',
        title: 'Knowlage',
        subtitle: 'Docs, playbooks and reference material for your agents.',
        path: '/knowledge-base',
        iconName: 'MenuBook',
        iconFallback: MenuBookOutlinedIcon,
        illustration: <KnowledgeBaseArt />,
      },
      {
        key: 'workflow',
        title: 'Workflow',
        subtitle: 'Automations and pipelines that run across your org.',
        path: '/workflow',
        iconName: 'AccountTree',
        iconFallback: AccountTreeOutlinedIcon,
        illustration: <WorkflowArt />,
      },
      {
        key: 'tasks',
        title: 'Tasks',
        subtitle: 'Track delivery items and assignments across teams.',
        path: '/task-manager',
        iconName: 'News',
        iconFallback: ChecklistOutlinedIcon,
        illustration: <TaskManagerArt />,
      },
      {
        key: 'projects',
        title: 'Projects',
        subtitle: 'Initiatives, milestones and cross-team workstreams.',
        path: '/projects',
        iconName: 'UncheckAll',
        iconFallback: FolderOutlinedIcon,
        illustration: <ProjectsArt />,
      },
    ],
    []
  );

  return (
    <div className="mkt-grid mkt-grid--hub-instruments">
      {items.map((it, i) => {
        const n = counts[it.key];
        const isLoading = loading || n == null;
        const stats = isLoading
          ? [{ label: 'total', value: '-' }]
          : [{ label: n === 1 ? 'item' : 'items', value: n }];
        return (
          <ActionTile
            key={it.key}
            title={it.title}
            subtitle={it.subtitle}
            iconName={it.iconName}
            fallback={it.iconFallback}
            ariaLabel={`${it.title} - open`}
            delay={i * 60}
            onClick={() => navigate(it.path)}
            illustration={it.illustration}
            stats={stats}
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// BuildDashboardBlock - input + suggestions → opens a refinement
// dialog that asks 2 clarifying questions, then routes to dashboard
// creation with a structured brief.
// ─────────────────────────────────────────────────────────────────
const STARTER_PROMPTS = [
  'Revenue by partner this quarter',
  'Task completion rate over time',
  'Goals shipped this month',
  'Top 5 spending agents',
];

function BuildDashboardBlock() {
  const theme = useTheme();
  const inputRef = useRef(null);
  const [value, setValue] = useState('');
  const [briefOpen, setBriefOpen] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = useCallback((message, severity = 'success') => {
    setToast({ open: true, message, severity });
  }, []);

  const handleSubmit = useCallback(
    (promptText) => {
      const text = (promptText ?? value).trim();
      if (!text) {
        inputRef.current?.focus();
        return;
      }
      setDraftPrompt(text);
      setBriefOpen(true);
    },
    [value]
  );

  return (
    <Box sx={{ mt: '10px' }}>
      <Paper
        elevation={0}
        sx={{
          position: 'relative',
          overflow: 'hidden',
          p: { xs: 2.5, sm: 3 },
          borderRadius: 3,
          border: '1px solid',
          borderColor: alpha(theme.palette.primary.main, 0.25),
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 65%)`,
          animation: 'buildDashIn 700ms cubic-bezier(.22,1,.36,1) both',
          '@keyframes buildDashIn': {
            from: { opacity: 0, transform: 'translateY(10px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: { xs: '60%', sm: '50%', md: '42%' },
            maxWidth: 480,
            height: '130%',
            pointerEvents: 'none',
            color: 'primary.main',
            opacity: 0.15,
            filter: 'brightness(0.55) saturate(0.8)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 65%, black 100%)',
            maskImage: 'linear-gradient(to right, transparent 0%, black 65%, black 100%)',
            '& > svg': { width: '100%', height: '100%', maxHeight: 360, display: 'block' },
          }}
        >
          <BuildDashboardArt />
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            mb: 1.5,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div
            className="mkt-tile__icon"
            aria-hidden="true"
            style={{ marginBottom: 0, flexShrink: 0 }}
          >
            <GlassIcon name="AutoAwesome" fallback={AutoAwesomeOutlinedIcon} size={22} />
          </div>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                fontWeight: 800,
                letterSpacing: '0.09em',
                color: 'primary.main',
                textTransform: 'uppercase',
                fontSize: '0.68rem',
              }}
            >
              Build a dashboard
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, mt: 0.25 }}>
              What do you want to see?
            </Typography>
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.75, lineHeight: 1.45 }}>
          Describe a dashboard or metric in plain English. We'll ask a couple of quick questions and
          build it for you.
        </Typography>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1,
            py: 0.625,
            borderRadius: 999,
            bgcolor: alpha(theme.palette.background.paper, 0.7),
            border: '1px solid',
            borderColor: alpha(theme.palette.primary.main, 0.22),
            transition: 'border-color .2s, box-shadow .2s',
            '&:focus-within': {
              borderColor: theme.palette.primary.main,
              boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.12)}`,
            },
          }}
        >
          <InputBase
            inputRef={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="e.g. Show me my top partners by revenue this quarter"
            inputProps={{
              'aria-label': 'Describe the dashboard you want to see',
              inputMode: 'text',
              enterKeyHint: 'send',
            }}
            sx={{ flex: 1, fontSize: '0.9rem', px: 1.25, py: 0.5 }}
          />
          <IconButton
            aria-label="Build dashboard"
            onClick={() => handleSubmit()}
            disabled={!value.trim()}
            size="small"
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              transition: 'transform .15s, background .15s, opacity .15s',
              '&:hover': { bgcolor: 'primary.dark', transform: 'translateX(2px)' },
              '&.Mui-disabled': {
                opacity: 0.4,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
              },
            }}
          >
            <GlassIcon
              name="ArrowForwardRounded"
              fallback={ArrowForwardRoundedIcon}
              size={18}
              tone={theme.palette.primary.contrastText}
            />
          </IconButton>
        </Box>

        <Box sx={{ mt: 1.75 }}>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mb: 0.875,
              color: 'text.disabled',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontSize: '0.65rem',
              fontWeight: 700,
            }}
          >
            Try
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.875 }}>
            {STARTER_PROMPTS.map((p) => (
              <Box
                key={p}
                component="button"
                type="button"
                onClick={() => {
                  setValue(p);
                  handleSubmit(p);
                }}
                sx={{
                  border: '1px solid',
                  borderColor: alpha(theme.palette.primary.main, 0.25),
                  background: alpha(theme.palette.primary.main, 0.06),
                  color: 'text.primary',
                  borderRadius: 999,
                  px: 1.5,
                  py: 0.75,
                  minHeight: 32,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'border-color .15s, background .15s, transform .15s',
                  '&:hover, &:focus-visible': {
                    borderColor: theme.palette.primary.main,
                    background: alpha(theme.palette.primary.main, 0.12),
                    transform: 'translateY(-1px)',
                    outline: 'none',
                  },
                  '@media (prefers-reduced-motion: reduce)': {
                    '&:hover, &:focus-visible': { transform: 'none' },
                  },
                }}
              >
                {p}
              </Box>
            ))}
          </Box>
        </Box>
      </Paper>

      <DashboardBriefDialog
        open={briefOpen}
        prompt={draftPrompt}
        onClose={() => setBriefOpen(false)}
        onCelebrate={(msg) => showToast(msg, 'success')}
      />

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: { xs: 11, sm: 13 } }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          icon={<GlassIcon name="Star" fallback={AutoAwesomeOutlinedIcon} size={20} tone="#fff" />}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          sx={{ minWidth: 320, alignItems: 'center' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────
// DashboardBriefDialog - two clarifying questions + free-text refine,
// then routes the user to dashboard creation with the assembled brief.
// ─────────────────────────────────────────────────────────────────
const TIME_RANGES = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'qtd', label: 'This quarter' },
  { value: 'ytd', label: 'This year' },
  { value: 'all', label: 'All time' },
];

const CHART_STYLES = [
  { value: 'kpi', label: 'Big numbers' },
  { value: 'bar', label: 'Bar chart' },
  { value: 'line', label: 'Line / trend' },
  { value: 'table', label: 'Table' },
  { value: 'pie', label: 'Pie / donut' },
];

function DashboardBriefDialog({ open, prompt, onClose, onCelebrate }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const [range, setRange] = useState('30d');
  const [style, setStyle] = useState('kpi');
  const [extra, setExtra] = useState('');
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    if (open) {
      setRange('30d');
      setStyle('kpi');
      setExtra('');
      setBuilding(false);
    }
  }, [open, prompt]);

  const handleBuild = () => {
    setBuilding(true);
    const brief = {
      prompt,
      range,
      style,
      extra: extra.trim(),
    };
    try {
      sessionStorage.setItem('orch_dashboard_brief', JSON.stringify(brief));
    } catch {
      /* private mode */
    }

    const shortPrompt = prompt.length > 48 ? `${prompt.slice(0, 45)}…` : prompt;
    onCelebrate?.(`Building your dashboard - “${shortPrompt}” 🎉`);

    setTimeout(() => {
      const params = new URLSearchParams({
        prompt: brief.prompt,
        range: brief.range,
        style: brief.style,
      });
      if (brief.extra) params.set('extra', brief.extra);
      navigate(`/dashboards/new?${params.toString()}`);
      onClose?.();
    }, 600);
  };

  return (
    <Dialog
      open={open}
      onClose={building ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}
    >
      <DialogTitle
        sx={{ fontWeight: 800, pr: 6, display: 'flex', alignItems: 'center', gap: 1.25 }}
      >
        <GlassIcon
          name="AutoAwesome"
          fallback={AutoAwesomeOutlinedIcon}
          size={22}
          tone={theme.palette.primary.main}
        />
        Build a dashboard
        <IconButton
          aria-label="Close"
          onClick={onClose}
          disabled={building}
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <GlassIcon name="Close" fallback={CloseRoundedIcon} size={20} tone="neutral" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Box
          sx={{
            display: 'flex',
            gap: 1.25,
            mb: 2.5,
            p: 1.5,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.06),
            border: '1px solid',
            borderColor: alpha(theme.palette.primary.main, 0.18),
          }}
        >
          <Typography
            sx={{ color: 'primary.main', fontWeight: 800, lineHeight: 1, fontSize: '1.1rem' }}
          >
            “
          </Typography>
          <Typography variant="body2" sx={{ flex: 1, fontStyle: 'italic', color: 'text.primary' }}>
            {prompt}
          </Typography>
        </Box>

        <Typography
          variant="caption"
          sx={{
            display: 'block',
            fontWeight: 800,
            letterSpacing: '0.12em',
            color: 'text.secondary',
            textTransform: 'uppercase',
            mb: 1,
          }}
        >
          1 · Time range
        </Typography>
        <ChipRow options={TIME_RANGES} value={range} onChange={setRange} />

        <Typography
          variant="caption"
          sx={{
            display: 'block',
            fontWeight: 800,
            letterSpacing: '0.12em',
            color: 'text.secondary',
            textTransform: 'uppercase',
            mt: 2.5,
            mb: 1,
          }}
        >
          2 · Chart style
        </Typography>
        <ChipRow options={CHART_STYLES} value={style} onChange={setStyle} />

        <Typography
          variant="caption"
          sx={{
            display: 'block',
            fontWeight: 800,
            letterSpacing: '0.12em',
            color: 'text.secondary',
            textTransform: 'uppercase',
            mt: 2.5,
            mb: 1,
          }}
        >
          3 · Anything else?{' '}
          <Box
            component="span"
            sx={{
              color: 'text.disabled',
              letterSpacing: 0,
              textTransform: 'none',
              fontWeight: 500,
            }}
          >
            (optional)
          </Box>
        </Typography>
        <TextField
          fullWidth
          size="small"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="e.g. group by team, exclude paused goals, show YoY comparison"
          disabled={building}
          multiline
          minRows={2}
          maxRows={4}
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} disabled={building} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={handleBuild}
          variant="contained"
          disabled={building}
          startIcon={
            building ? null : (
              <GlassIcon
                name="AutoAwesome"
                fallback={AutoAwesomeOutlinedIcon}
                size={18}
                tone={theme.palette.primary.contrastText}
              />
            )
          }
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 3 }}
        >
          {building ? 'Building…' : 'Build it'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ChipRow({ options, value, onChange }) {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.875 }}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Box
            key={opt.value}
            component="button"
            type="button"
            aria-pressed={active}
            onClick={() => onChange?.(opt.value)}
            sx={{
              border: '1px solid',
              borderColor: active
                ? theme.palette.primary.main
                : alpha(theme.palette.primary.main, 0.22),
              background: active ? alpha(theme.palette.primary.main, 0.14) : 'transparent',
              color: active ? 'primary.main' : 'text.primary',
              borderRadius: 999,
              px: 1.75,
              py: 0.625,
              minHeight: 34,
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'border-color .15s, background .15s, color .15s',
              '&:hover, &:focus-visible': {
                borderColor: theme.palette.primary.main,
                background: alpha(theme.palette.primary.main, 0.1),
                outline: 'none',
              },
            }}
          >
            {opt.label}
          </Box>
        );
      })}
    </Box>
  );
}
