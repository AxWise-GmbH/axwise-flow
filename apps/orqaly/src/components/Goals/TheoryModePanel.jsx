/**
 * TheoryModePanel — Business projection visualization with 4 time horizons,
 * scenario modeling, competitor analysis, agent insights, action plans,
 * kill/pivot signals, and milestone checklists.
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  CircularProgress,
  Collapse,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  IconButton,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import AutoGraphOutlinedIcon from '@mui/icons-material/AutoGraphOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import PieChartOutlinedIcon from '@mui/icons-material/PieChartOutlined';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import EmojiObjectsOutlinedIcon from '@mui/icons-material/EmojiObjectsOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  ReferenceLine,
} from 'recharts';
import { getGoalProjections, regenerateProjection } from '../../services/goalService';
import { formatCurrency } from '../../utils/formatters';

import AppIcon from '../icons/AppIcon';

const HORIZONS = [
  { key: '1_month', label: '1 Mo' },
  { key: '3_months', label: '3 Mo' },
  { key: '6_months', label: '6 Mo' },
  { key: '1_year', label: '1 Yr' },
];

const SCENARIO_OPTIONS = ['pessimistic', 'expected', 'optimistic'];

function MetricCard({ label, value, sub, icon: Icon, color }) {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(color, 0.18),
        background: `linear-gradient(135deg, ${alpha(color, 0.08)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography
            sx={{
              fontSize: '0.6rem',
              fontWeight: 600,
              color: 'text.secondary',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {label}
          </Typography>
          <Typography
            sx={{ fontSize: '1.15rem', fontWeight: 800, color, lineHeight: 1.2, mt: 0.25 }}
          >
            {value}
          </Typography>
          {sub && (
            <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', mt: 0.25 }}>
              {sub}
            </Typography>
          )}
        </Box>
        {Icon && (
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1.5,
              bgcolor: alpha(color, 0.12),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon sx={{ fontSize: 15, color }} />
          </Box>
        )}
      </Box>
    </Paper>
  );
}

function CompetitorRow({ comp }) {
  const theme = useTheme();
  const threatColor =
    comp.threat_level === 'high'
      ? '#EF4444'
      : comp.threat_level === 'medium'
        ? '#F59E0B'
        : '#10B981';
  return (
    <Paper
      elevation={0}
      sx={{ p: 1.25, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 1 }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
          {comp.name}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            {comp.estimated_revenue}
          </Typography>
          <Chip
            label={comp.threat_level}
            size="small"
            sx={{
              height: 18,
              fontSize: '0.55rem',
              fontWeight: 700,
              bgcolor: alpha(threatColor, 0.12),
              color: threatColor,
            }}
          />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Typography variant="caption" sx={{ color: '#10B981', fontSize: '0.6rem' }}>
          Your edge: {comp.your_advantage_over_them}
        </Typography>
        <Typography variant="caption" sx={{ color: '#EF4444', fontSize: '0.6rem' }}>
          Their edge: {comp.advantage_over_you}
        </Typography>
      </Box>
    </Paper>
  );
}

function AgentCommentCard({ comment }) {
  const theme = useTheme();
  const impactColor =
    { CRITICAL: '#EF4444', HIGH: '#F59E0B', MEDIUM: '#5B8DEF', LOW: '#8B949E' }[comment.impact] ||
    '#8B949E';
  return (
    <Paper
      elevation={0}
      sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 1 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
        <AppIcon
          name="SmartToyOutlined"
          fallback={SmartToyOutlinedIcon}
          sx={{ fontSize: 18, color: '#5B8DEF' }}
        />
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.78rem' }}>
          {comment.agent_name}
        </Typography>
        <Chip label={comment.agent_role} size="small" sx={{ height: 18, fontSize: '0.55rem' }} />
        <Box sx={{ flex: 1 }} />
        <Chip
          label={`${comment.confidence}%`}
          size="small"
          sx={{
            height: 18,
            fontSize: '0.55rem',
            fontWeight: 700,
            bgcolor: alpha('#5B8DEF', 0.1),
            color: '#5B8DEF',
          }}
        />
        <Chip
          label={comment.impact}
          size="small"
          sx={{
            height: 18,
            fontSize: '0.55rem',
            fontWeight: 700,
            bgcolor: alpha(impactColor, 0.12),
            color: impactColor,
          }}
        />
      </Box>
      <Typography
        variant="body2"
        sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.5, mb: 0.5 }}
      >
        "{comment.comment}"
      </Typography>
      {comment.recommendation && (
        <Typography
          variant="caption"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            color: '#10B981',
            fontWeight: 600,
            fontSize: '0.65rem',
          }}
        >
          <AppIcon
            name="EmojiObjectsOutlined"
            fallback={EmojiObjectsOutlinedIcon}
            sx={{ fontSize: 13 }}
          />{' '}
          {comment.recommendation}
        </Typography>
      )}
    </Paper>
  );
}

function KillSignalCard({ signal }) {
  const theme = useTheme();
  const recColor =
    { continue: '#10B981', pivot: '#F59E0B', kill: '#EF4444' }[signal.recommendation] || '#8B949E';
  const recLabel =
    { continue: 'CONTINUE', pivot: 'PIVOT', kill: 'KILL' }[signal.recommendation] || 'N/A';
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(recColor, 0.3),
        bgcolor: alpha(recColor, 0.04),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <AppIcon
          name="WarningAmber"
          fallback={WarningAmberIcon}
          sx={{ fontSize: 18, color: recColor }}
        />
        <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '0.8rem' }}>
          Kill / Pivot Signal
        </Typography>
        <Chip
          label={recLabel}
          size="small"
          sx={{
            height: 20,
            fontSize: '0.6rem',
            fontWeight: 800,
            bgcolor: alpha(recColor, 0.15),
            color: recColor,
          }}
        />
      </Box>
      <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 0.75 }}>
        {signal.reasoning}
      </Typography>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Threshold: <strong>{signal.threshold_value}</strong>
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Trajectory: <strong>{signal.current_trajectory}</strong>
        </Typography>
      </Box>
      {signal.pivot_suggestion && (
        <Typography
          variant="caption"
          sx={{ display: 'block', mt: 0.5, color: '#F59E0B', fontWeight: 600, fontSize: '0.65rem' }}
        >
          Pivot to: {signal.pivot_suggestion}
        </Typography>
      )}
    </Paper>
  );
}

export default function TheoryModePanel({ goalId, projectionType = 'detailed', compact = false }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [projections, setProjections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [activeHorizon, setActiveHorizon] = useState('1_month');
  const [scenario, setScenario] = useState('expected');
  const [expandedSections, setExpandedSections] = useState({
    competitors: false,
    assumptions: false,
  });

  useEffect(() => {
    if (!goalId) return;
    setLoading(true);
    getGoalProjections(goalId)
      .then((data) => setProjections(Array.isArray(data) ? data : []))
      .catch(() => setProjections([]))
      .finally(() => setLoading(false));
  }, [goalId]);

  const projection = useMemo(() => {
    return projections.find((p) => p.projection_type === projectionType) || projections[0] || null;
  }, [projections, projectionType]);

  const horizonData = useMemo(() => {
    if (!projection?.horizons) return null;
    return (
      projection.horizons.find((h) => h.horizon === activeHorizon) || projection.horizons[0] || null
    );
  }, [projection, activeHorizon]);

  const scenarioData = useMemo(() => {
    if (!projection?.scenarios) return null;
    return projection.scenarios[scenario] || null;
  }, [projection, scenario]);

  const filteredComments = useMemo(() => {
    if (!projection?.agent_comments) return [];
    return projection.agent_comments.filter((c) => c.horizon === activeHorizon || !c.horizon);
  }, [projection, activeHorizon]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await regenerateProjection(goalId);
      const data = await getGoalProjections(goalId);
      setProjections(Array.isArray(data) ? data : []);
    } catch {}
    setRegenerating(false);
  };

  const toggleSection = (key) => setExpandedSections((s) => ({ ...s, [key]: !s[key] }));

  // Chart data
  const chartData = useMemo(() => {
    if (!projection?.horizons) return [];
    return HORIZONS.map((h) => {
      const d = projection.horizons.find((x) => x.horizon === h.key);
      return {
        name: h.label,
        min: d?.revenue?.min || 0,
        expected: d?.revenue?.expected || 0,
        max: d?.revenue?.max || 0,
        costs: d?.costs?.total || 0,
      };
    });
  }, [projection]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!projection) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          textAlign: 'center',
        }}
      >
        <AppIcon
          name="AutoGraphOutlined"
          fallback={AutoGraphOutlinedIcon}
          sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }}
        />
        <Typography variant="body2" color="text.secondary">
          Theory Mode projections will appear here after feasibility analysis.
        </Typography>
      </Paper>
    );
  }

  const h = horizonData || {};
  const rev = h.revenue || {};
  const cust = h.customers || {};
  const costs = h.costs || {};

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: alpha(theme.palette.info.main, 0.2),
        overflow: 'hidden',
        mt: 2,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.08)} 0%, transparent 60%)`,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <AppIcon
          name="AutoGraphOutlined"
          fallback={AutoGraphOutlinedIcon}
          sx={{ color: 'info.main', fontSize: 20 }}
        />
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '0.85rem' }}>
            Theory Mode
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
            {projectionType === 'preview'
              ? 'Preview — based on plan'
              : 'Detailed — based on deliverables'}
          </Typography>
        </Box>
        <Tooltip title="Re-generate projections">
          <IconButton size="small" onClick={handleRegenerate} disabled={regenerating}>
            {regenerating ? (
              <CircularProgress size={16} />
            ) : (
              <AppIcon name="Refresh" fallback={RefreshIcon} sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ px: 2, py: 1.5 }}>
        {/* Horizon tabs */}
        <ToggleButtonGroup
          value={activeHorizon}
          exclusive
          onChange={(_, v) => {
            if (v) setActiveHorizon(v);
          }}
          size="small"
          sx={{ mb: 1.5 }}
        >
          {HORIZONS.map((h) => (
            <ToggleButton
              key={h.key}
              value={h.key}
              sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.72rem', px: 1.5 }}
            >
              {h.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Scenario toggle */}
        {projection.scenarios && Object.keys(projection.scenarios).length > 0 && (
          <ToggleButtonGroup
            value={scenario}
            exclusive
            onChange={(_, v) => {
              if (v) setScenario(v);
            }}
            size="small"
            sx={{ mb: 1.5, ml: 1 }}
          >
            {SCENARIO_OPTIONS.map((s) => (
              <ToggleButton
                key={s}
                value={s}
                sx={{
                  textTransform: 'capitalize',
                  fontWeight: 600,
                  fontSize: '0.65rem',
                  px: 1.25,
                  color:
                    s === 'pessimistic'
                      ? '#EF4444'
                      : s === 'optimistic'
                        ? '#10B981'
                        : 'text.primary',
                }}
              >
                {s}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}

        {/* Metric cards */}
        <Box
          sx={{
            display: 'grid',
            gap: 1,
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
            mb: 2,
          }}
        >
          <MetricCard
            label="Revenue"
            value={`$${rev.min || 0} - $${rev.max || 0}`}
            sub={`Expected: $${rev.expected || 0}`}
            icon={AttachMoneyIcon}
            color="#F59E0B"
          />
          <MetricCard
            label="ROI"
            value={`${h.roi_percent > 0 ? '+' : ''}${h.roi_percent || 0}%`}
            sub={`Confidence: ${h.confidence || 0}%`}
            icon={TrendingUpIcon}
            color={h.roi_percent >= 0 ? '#8B5CF6' : '#EF4444'}
          />
          <MetricCard
            label="Customers"
            value={`${cust.min || 0} - ${cust.max || 0}`}
            sub={`Expected: ${cust.expected || 0}`}
            icon={PeopleOutlinedIcon}
            color="#5B8DEF"
          />
          <MetricCard
            label="Market Share"
            value={`${h.market_share_percent || 0}%`}
            icon={PieChartOutlinedIcon}
            color="#059669"
          />
          <MetricCard
            label="Burn Rate"
            value={`$${h.burn_rate_usd_per_day || 0}/day`}
            sub={`Runway: ${h.runway_days || 0}d`}
            icon={LocalFireDepartmentIcon}
            color="#EF4444"
          />
          <MetricCard
            label="Break-even"
            value={`${h.break_even_days || 0} days`}
            sub={`Costs: $${costs.total || 0}/mo`}
            icon={TimerOutlinedIcon}
            color="#06B6D4"
          />
        </Box>

        {/* Growth chart (hidden in compact mode) */}
        {!compact && chartData.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'text.secondary', mb: 1, display: 'block' }}
            >
              Revenue Trajectory
            </Typography>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={alpha(theme.palette.text.primary, 0.06)}
                />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} />
                <YAxis
                  tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                  tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`}
                />
                <ReTooltip
                  contentStyle={{
                    background: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="max" stroke="none" fill={alpha('#10B981', 0.1)} />
                <Area
                  type="monotone"
                  dataKey="expected"
                  stroke="#10B981"
                  fill={alpha('#10B981', 0.2)}
                  strokeWidth={2}
                />
                <Area type="monotone" dataKey="min" stroke="none" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        )}

        {/* Kill/Pivot Signal */}
        {h.kill_signal && h.kill_signal.recommendation && (
          <Box sx={{ mb: 2 }}>
            <KillSignalCard signal={h.kill_signal} />
          </Box>
        )}

        {/* Action Plan */}
        {!compact && h.action_plan?.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'text.secondary', mb: 1, display: 'block' }}
            >
              Action Plan — {HORIZONS.find((x) => x.key === activeHorizon)?.label}
            </Typography>
            {h.action_plan.map((a, i) => {
              const prioColor =
                { critical: '#EF4444', high: '#F59E0B', medium: '#5B8DEF', low: '#8B949E' }[
                  a.priority
                ] || '#8B949E';
              return (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    gap: 1,
                    alignItems: 'flex-start',
                    py: 0.75,
                    borderBottom: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.5),
                  }}
                >
                  <AppIcon
                    name="CheckCircleOutline"
                    fallback={CheckCircleOutlineIcon}
                    sx={{ fontSize: 16, color: 'text.disabled', mt: 0.25 }}
                  />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                      {a.action}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.25 }}>
                      {a.estimated_cost != null && (
                        <Typography variant="caption" color="text.secondary">
                          ${a.estimated_cost}
                        </Typography>
                      )}
                      {a.deadline_description && (
                        <Typography variant="caption" color="text.secondary">
                          {a.deadline_description}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  <Chip
                    label={a.priority}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.5rem',
                      fontWeight: 700,
                      bgcolor: alpha(prioColor, 0.12),
                      color: prioColor,
                    }}
                  />
                </Box>
              );
            })}
          </Box>
        )}

        {/* Milestones */}
        {!compact && h.milestones?.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'text.secondary', mb: 1, display: 'block' }}
            >
              Milestone Checklist
            </Typography>
            {h.milestones.map((m, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', py: 0.5 }}>
                <AppIcon
                  name="CheckCircleOutline"
                  fallback={CheckCircleOutlineIcon}
                  sx={{ fontSize: 15, color: 'text.disabled' }}
                />
                <Typography variant="body2" sx={{ flex: 1, fontSize: '0.73rem' }}>
                  {m.title}
                </Typography>
                {m.deadline_description && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                    {m.deadline_description}
                  </Typography>
                )}
                {m.is_critical && (
                  <Chip
                    label="Critical"
                    size="small"
                    sx={{
                      height: 16,
                      fontSize: '0.5rem',
                      fontWeight: 700,
                      bgcolor: alpha('#EF4444', 0.1),
                      color: '#EF4444',
                    }}
                  />
                )}
              </Box>
            ))}
          </Box>
        )}

        {/* Agent Insights */}
        {filteredComments.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'text.secondary', mb: 1, display: 'block' }}
            >
              Agent Insights
            </Typography>
            {filteredComments.map((c, i) => (
              <AgentCommentCard key={i} comment={c} />
            ))}
          </Box>
        )}

        {/* Competitor Snapshot (hidden in compact) */}
        {!compact && projection.competitors?.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', mb: 1 }}
              onClick={() => toggleSection('competitors')}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                Competitor Snapshot ({projection.competitors.length})
              </Typography>
              <AppIcon
                name="ExpandMore"
                fallback={ExpandMoreIcon}
                sx={{
                  fontSize: 16,
                  color: 'text.secondary',
                  transform: expandedSections.competitors ? 'rotate(180deg)' : 'none',
                  transition: '0.2s',
                }}
              />
            </Box>
            <Collapse in={expandedSections.competitors}>
              {projection.competitors.map((c, i) => (
                <CompetitorRow key={i} comp={c} />
              ))}
            </Collapse>
          </Box>
        )}

        {/* Similar Goals */}
        {!compact && projection.similar_goals?.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'text.secondary', mb: 1, display: 'block' }}
            >
              Similar Goals on Platform
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {projection.similar_goals.map((sg, i) => (
                <Chip
                  key={i}
                  label={`${sg.category}: ${sg.success_rate || 0}% success (${sg.sample_count} goals)`}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.6rem' }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Risks & Opportunities */}
        {(h.risks?.length > 0 || h.opportunities?.length > 0) && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {(h.risks || []).map((r, i) => (
              <Chip
                key={`r${i}`}
                label={r}
                size="small"
                sx={{
                  fontSize: '0.6rem',
                  bgcolor: alpha('#EF4444', 0.08),
                  color: '#EF4444',
                  maxWidth: 220,
                }}
              />
            ))}
            {(h.opportunities || []).map((o, i) => (
              <Chip
                key={`o${i}`}
                label={o}
                size="small"
                sx={{
                  fontSize: '0.6rem',
                  bgcolor: alpha('#10B981', 0.08),
                  color: '#10B981',
                  maxWidth: 220,
                }}
              />
            ))}
          </Box>
        )}

        {/* Assumptions */}
        {!compact && projection.assumptions?.length > 0 && (
          <Box>
            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}
              onClick={() => toggleSection('assumptions')}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                Assumptions ({projection.assumptions.length})
              </Typography>
              <AppIcon
                name="ExpandMore"
                fallback={ExpandMoreIcon}
                sx={{
                  fontSize: 16,
                  color: 'text.secondary',
                  transform: expandedSections.assumptions ? 'rotate(180deg)' : 'none',
                  transition: '0.2s',
                }}
              />
            </Box>
            <Collapse in={expandedSections.assumptions}>
              <Box sx={{ mt: 0.5 }}>
                {projection.assumptions.map((a, i) => (
                  <Typography
                    key={i}
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', fontSize: '0.65rem', py: 0.25 }}
                  >
                    • {a}
                  </Typography>
                ))}
              </Box>
            </Collapse>
          </Box>
        )}

        {/* Comparison badge */}
        {projections.length > 1 && !compact && (
          <Box
            sx={{
              mt: 2,
              pt: 1.5,
              borderTop: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              gap: 1,
              alignItems: 'center',
            }}
          >
            <AppIcon
              name="CompareArrows"
              fallback={CompareArrowsIcon}
              sx={{ fontSize: 16, color: 'text.secondary' }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              {projections.length} projection runs available — preview vs detailed comparison
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
