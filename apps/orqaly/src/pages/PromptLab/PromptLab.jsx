import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  IconButton,
  LinearProgress,
  Collapse,
  Alert,
  Snackbar,
  Card,
  CardContent,
  CardActions,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import CollectionsBookmarkOutlinedIcon from '@mui/icons-material/CollectionsBookmarkOutlined';
import DesignServicesOutlinedIcon from '@mui/icons-material/DesignServicesOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import MetricsStrip from '../../components/Common/MetricsStrip';
import PillTabStrip from '../../components/Common/PillTabStrip';
import LibraryUniverse from './LibraryUniverse';
const SketchTab = lazy(() => import('./SketchTab.jsx'));
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import {
  listOptimizationRuns,
  listActiveExperiments,
  getStrategyInsights,
  promoteVariant,
  cancelExperiment,
} from '../../services/promptLabService';

import AppIcon from '../../components/icons/AppIcon';

const STATUS_COLORS = {
  running: '#2563EB',
  completed: '#059669',
  failed: '#DC2626',
};

const STRATEGY_COLORS = {
  CLARITY: '#7C3AED',
  SPECIFICITY: '#2563EB',
  STRUCTURE: '#059669',
  EFFICIENCY: '#D97706',
};

// ── Run Card (replaces table row for mobile-friendly layout) ─────────────

function RunCard({ run, expanded, onToggle, theme }) {
  const date = new Date(run.started_at).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const statusColor = STATUS_COLORS[run.status] || '#888';

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 0.75,
        borderRadius: 2,
        overflow: 'hidden',
        transition: 'border-color 0.15s',
        '&:hover': { borderColor: alpha(statusColor, 0.3) },
      }}
    >
      <Box
        onClick={onToggle}
        sx={{
          p: 1.25,
          cursor: 'pointer',
          '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.02) },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
          <Chip
            label={run.run_type}
            size="small"
            sx={{ height: 18, fontSize: '0.62rem', fontWeight: 600 }}
          />
          <Chip
            label={run.status}
            size="small"
            sx={{
              height: 18,
              fontSize: '0.6rem',
              fontWeight: 600,
              bgcolor: alpha(statusColor, 0.12),
              color: statusColor,
            }}
          />
          <Typography
            variant="caption"
            sx={{ color: 'text.disabled', ml: 'auto', fontSize: '0.65rem' }}
          >
            {date}
          </Typography>
          <IconButton size="small" sx={{ p: 0.25 }}>
            {expanded ? (
              <AppIcon name="ExpandLess" fallback={ExpandLessIcon} sx={{ fontSize: 15 }} />
            ) : (
              <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} sx={{ fontSize: 15 }} />
            )}
          </IconButton>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem' }}>
            Analyzed: <b>{run.agents_analyzed ?? '-'}</b>
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem' }}>
            Optimized: <b>{run.agents_optimized ?? '-'}</b>
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem' }}>
            Cost: <b>${(run.total_cost_usd || 0).toFixed(4)}</b>
          </Typography>
        </Box>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ px: 1.25, pb: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              display: 'block',
              mt: 0.75,
            }}
          >
            Report
          </Typography>
          <Box
            sx={{
              mt: 0.5,
              p: 1,
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.text.primary, 0.03),
              fontSize: '0.7rem',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              maxHeight: 250,
              overflow: 'auto',
              lineHeight: 1.4,
            }}
          >
            {run.report ? JSON.stringify(run.report, null, 2) : 'No report data'}
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
}

// ── Tab: Optimization History ────────────────────────────────────────────────

function OptimizationHistory() {
  const theme = useTheme();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRun, setExpandedRun] = useState(null);

  useEffect(() => {
    listOptimizationRuns()
      .then(({ runs: r }) => {
        setRuns(r);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LinearProgress sx={{ mt: 1 }} />;
  if (!runs.length) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <AppIcon
          name="AutoFixHighOutlined"
          fallback={AutoFixHighOutlinedIcon}
          sx={{ fontSize: 36, color: 'text.disabled', mb: 1, opacity: 0.4 }}
        />
        <Typography color="text.secondary" sx={{ fontSize: '0.82rem' }}>
          No optimization runs yet.
        </Typography>
        <Typography variant="caption" color="text.disabled">
          First cycle runs automatically at 2 AM UTC daily.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 1 }}>
      {runs.map((run) => (
        <RunCard
          key={run.id}
          run={run}
          theme={theme}
          expanded={expandedRun === run.id}
          onToggle={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
        />
      ))}
    </Box>
  );
}

// ── Tab: Active Experiments ──────────────────────────────────────────────────

function ActiveExperiments() {
  const theme = useTheme();
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  const load = useCallback(() => {
    setLoading(true);
    listActiveExperiments()
      .then((data) => {
        setExperiments(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handlePromote = async (variantId) => {
    try {
      await promoteVariant(variantId);
      setToast({ open: true, message: 'Variant promoted to active', severity: 'success' });
      load();
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };

  const handleCancel = async (agentId) => {
    try {
      await cancelExperiment(agentId);
      setToast({ open: true, message: 'Experiment cancelled', severity: 'info' });
      load();
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };

  if (loading) return <LinearProgress sx={{ mt: 1 }} />;
  if (!experiments.length) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <AppIcon
          name="ScienceOutlined"
          fallback={ScienceOutlinedIcon}
          sx={{ fontSize: 36, color: 'text.disabled', mb: 1, opacity: 0.4 }}
        />
        <Typography color="text.secondary" sx={{ fontSize: '0.82rem' }}>
          No active experiments.
        </Typography>
        <Typography variant="caption" color="text.disabled">
          Variants are created during the daily optimization cycle (2 AM UTC).
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
        {experiments.map((exp) => (
          <Paper
            key={exp.agent_id}
            variant="outlined"
            sx={{ borderRadius: 2.5, overflow: 'hidden' }}
          >
            <Box sx={{ p: 1.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                <AppIcon
                  name="ScienceOutlined"
                  fallback={ScienceOutlinedIcon}
                  sx={{ fontSize: 16, color: 'text.secondary' }}
                />
                <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
                  {exp.agent_name || 'Unknown Agent'}
                </Typography>
                {exp.agent_category && (
                  <Chip
                    label={exp.agent_category}
                    size="small"
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.58rem' }}
                  />
                )}
              </Box>

              {exp.variants.map((v) => {
                const stratColor = STRATEGY_COLORS[v.optimization_strategy] || '#888';
                const baselineQuality = v.baseline_metrics?.avg_quality_score || 0;
                return (
                  <Box
                    key={v.id}
                    sx={{
                      mb: 1,
                      p: 1,
                      borderRadius: 2,
                      bgcolor: alpha(stratColor, 0.03),
                      border: '1px solid',
                      borderColor: alpha(stratColor, 0.12),
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        mb: 0.5,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Chip
                        label={v.variant_label}
                        size="small"
                        sx={{
                          height: 16,
                          fontSize: '0.58rem',
                          fontWeight: 700,
                          bgcolor: alpha(stratColor, 0.1),
                          color: stratColor,
                        }}
                      />
                      <Chip
                        label={v.optimization_strategy}
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 16,
                          fontSize: '0.55rem',
                          borderColor: stratColor,
                          color: stratColor,
                        }}
                      />
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.disabled', ml: 'auto', fontSize: '0.62rem' }}
                      >
                        {v.test_task_count} task{v.test_task_count === 1 ? '' : 's'}
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary',
                        fontSize: '0.72rem',
                        display: 'block',
                        mb: 0.5,
                        lineHeight: 1.4,
                      }}
                    >
                      {v.change_summary || 'No change summary'}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Typography
                        variant="caption"
                        sx={{ fontSize: '0.6rem', color: 'text.disabled' }}
                      >
                        Baseline: {baselineQuality.toFixed(0)}
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(baselineQuality, 100)}
                        sx={{
                          flex: 1,
                          height: 4,
                          borderRadius: 2,
                          bgcolor: alpha(theme.palette.text.disabled, 0.08),
                        }}
                      />
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={
                          <AppIcon
                            name="CheckCircleOutline"
                            fallback={CheckCircleOutlineIcon}
                            sx={{ fontSize: 12 }}
                          />
                        }
                        onClick={() => handlePromote(v.id)}
                        sx={{
                          fontSize: '0.62rem',
                          textTransform: 'none',
                          borderRadius: 1.5,
                          py: 0.15,
                          px: 1,
                          minWidth: 0,
                        }}
                      >
                        Promote
                      </Button>
                    </Box>
                  </Box>
                );
              })}

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                <Button
                  size="small"
                  color="error"
                  startIcon={
                    <AppIcon
                      name="CancelOutlined"
                      fallback={CancelOutlinedIcon}
                      sx={{ fontSize: 13 }}
                    />
                  }
                  onClick={() => handleCancel(exp.agent_id)}
                  sx={{ fontSize: '0.65rem', textTransform: 'none' }}
                >
                  Cancel
                </Button>
              </Box>
            </Box>
          </Paper>
        ))}
      </Box>
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}

// ── Tab: Strategy Insights (card-based instead of table) ─────────────────────

function StrategyInsights() {
  const theme = useTheme();
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStrategyInsights()
      .then((data) => {
        setStrategies(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LinearProgress sx={{ mt: 1 }} />;
  if (!strategies.length) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <AppIcon
          name="InsightsOutlined"
          fallback={InsightsOutlinedIcon}
          sx={{ fontSize: 36, color: 'text.disabled', mb: 1, opacity: 0.4 }}
        />
        <Typography color="text.secondary" sx={{ fontSize: '0.82rem' }}>
          No strategy data yet.
        </Typography>
        <Typography variant="caption" color="text.disabled">
          Insights accumulate after evaluation cycles complete (every 3 days).
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, mt: 1 }}>
      {strategies.map((s) => {
        const color = STRATEGY_COLORS[s.strategy] || '#888';
        return (
          <Paper
            key={s.strategy}
            variant="outlined"
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: '1px solid',
              borderColor: alpha(color, 0.2),
              background: `linear-gradient(135deg, ${alpha(color, 0.04)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
              <Chip
                label={s.strategy}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  bgcolor: alpha(color, 0.12),
                  color,
                }}
              />
              <Typography
                variant="caption"
                sx={{ ml: 'auto', color: 'text.disabled', fontSize: '0.65rem' }}
              >
                {s.timesUsed} uses
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Box>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontSize: '0.6rem', display: 'block' }}
                >
                  Win Rate
                </Typography>
                <Typography
                  sx={{
                    fontWeight: 800,
                    fontSize: '1rem',
                    color: s.winRate >= 50 ? '#059669' : '#DC2626',
                  }}
                >
                  {s.winRate}%
                </Typography>
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontSize: '0.6rem', display: 'block' }}
                >
                  Quality
                </Typography>
                <Typography
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    color: s.avgQualityDelta >= 0 ? '#059669' : '#DC2626',
                  }}
                >
                  {s.avgQualityDelta >= 0 ? '+' : ''}
                  {s.avgQualityDelta}
                </Typography>
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontSize: '0.6rem', display: 'block' }}
                >
                  Success
                </Typography>
                <Typography
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    color: s.avgSuccessDelta >= 0 ? '#059669' : '#DC2626',
                  }}
                >
                  {s.avgSuccessDelta >= 0 ? '+' : ''}
                  {s.avgSuccessDelta}%
                </Typography>
              </Box>
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

const PROMPT_TABS = [
  { id: 0, label: 'History', icon: AutoFixHighOutlinedIcon },
  { id: 1, label: 'Experiments', icon: ScienceOutlinedIcon },
  { id: 2, label: 'Insights', icon: InsightsOutlinedIcon },
  { id: 3, label: 'Library', icon: CollectionsBookmarkOutlinedIcon },
  { id: 4, label: 'Sketch', icon: DesignServicesOutlinedIcon },
];

export default function PromptLab({ embedded, showMetrics }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [tab, setTab] = useState(0);
  const [summary, setSummary] = useState({ totalRuns: 0, recentRuns: [], experiments: 0 });

  useEffect(() => {
    let cancelled = false;
    Promise.all([listOptimizationRuns(0), listActiveExperiments()])
      .then(([{ runs, total }, experiments]) => {
        if (cancelled) return;
        setSummary({
          totalRuns: total || 0,
          recentRuns: runs || [],
          experiments: (experiments || []).length,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const statCards = useMemo(() => {
    const recent = summary.recentRuns;
    const recentCompleted = recent.filter((r) => r.status === 'completed').length;
    const recentCost = recent.reduce((sum, r) => sum + (Number(r.total_cost_usd) || 0), 0);
    return [
      {
        label: 'Optimization Runs',
        value: summary.totalRuns,
        helper: 'All time',
        color: theme.palette.primary.main,
        icon: AutoFixHighOutlinedIcon,
      },
      {
        label: 'Active Experiments',
        value: summary.experiments,
        helper: 'Currently testing',
        color: theme.palette.info.main,
        icon: ScienceOutlinedIcon,
      },
      {
        label: 'Completed',
        value: recentCompleted,
        helper: 'In last 20 runs',
        color: theme.palette.success.main,
        icon: CheckCircleOutlineIcon,
      },
      {
        label: 'Recent Cost',
        value: `$${recentCost.toFixed(4)}`,
        helper: 'Last 20 runs',
        color: theme.palette.warning.main,
        icon: PaidOutlinedIcon,
      },
    ];
  }, [summary, theme]);

  return (
    <Box>
      {!embedded && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <AppIcon
            name="AutoFixHighOutlined"
            fallback={AutoFixHighOutlinedIcon}
            sx={{ fontSize: 24, color: 'primary.main' }}
          />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.1rem' }}>
              Prompt Lab
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
              Autonomous prompt optimization
            </Typography>
          </Box>
        </Box>
      )}
      <Box>
        <MetricsStrip
          pageKey="prompt-lab"
          cards={statCards}
          showToggle={!embedded}
          showMetrics={embedded ? showMetrics : undefined}
        />

        {/* Pill Tabs - full width */}
        <PillTabStrip
          sx={{
            px: 1.25,
            pt: 1.25,
            pb: 1.25,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          {PROMPT_TABS.map((t) => (
            <Button
              key={t.id}
              startIcon={isMobile ? undefined : <AppIcon fallback={t.icon} sx={{ fontSize: 15 }} />}
              onClick={() => setTab(t.id)}
              sx={{
                borderRadius: 2.5,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: { xs: '0.7rem', sm: '0.8rem' },
                px: { xs: 1, sm: 1.75 },
                minHeight: 32,
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

        <Box sx={{ p: { xs: 1.25, sm: 1.5 } }}>
          {tab === 0 && <OptimizationHistory />}
          {tab === 1 && <ActiveExperiments />}
          {tab === 2 && <StrategyInsights />}
          {tab === 3 && <LibraryUniverse />}
          {tab === 4 && (
            <Suspense fallback={<LinearProgress sx={{ mt: 1 }} />}>
              <SketchTab />
            </Suspense>
          )}
        </Box>
      </Box>
    </Box>
  );
}
