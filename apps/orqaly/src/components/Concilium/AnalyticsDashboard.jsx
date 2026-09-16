/**
 * AnalyticsDashboard — Summary metrics, evaluation trends, and jobs list.
 */
import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  CircularProgress,
  alpha,
  useTheme,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
  Collapse,
  IconButton,
  Alert,
} from '@mui/material';
import TimelineIcon from '@mui/icons-material/Timeline';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import EmptyState from '../Common/EmptyState';
import { useConciliumAnalytics } from '../../hooks/useConciliumAnalytics';
import { supabase, hasSupabase } from '../../lib/supabase';

import AppIcon from '../icons/AppIcon';

function MetricCard({ label, value, color, icon: Icon, theme }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.25,
        borderRadius: 2,
        border: '1px solid',
        flex: 1,
        minWidth: 120,
        borderColor: alpha(color || theme.palette.primary.main, 0.22),
        background: `linear-gradient(135deg, ${alpha(color || theme.palette.primary.main, 0.08)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.6rem' }}
          >
            {label}
          </Typography>
          <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, lineHeight: 1.15, mt: 0.25 }}>
            {value}
          </Typography>
        </Box>
        {Icon && (
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1.5,
              bgcolor: alpha(color, 0.14),
              color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon sx={{ fontSize: 15 }} />
          </Box>
        )}
      </Box>
    </Paper>
  );
}

function EvalRow({ evaluation, theme, expanded, onToggle }) {
  const ts = evaluation.created_at
    ? new Date(evaluation.created_at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  const score = Number(evaluation.overall_score || 0);
  const cost = Number(evaluation.estimated_cost_usd || evaluation.total_cost_usd || 0);
  const tokens = evaluation.total_tokens || 0;
  const durationSec = evaluation.duration_ms ? (evaluation.duration_ms / 1000).toFixed(1) : null;
  const members = evaluation.member_responses || [];
  const level = evaluation.decision_level;
  const humanReview = evaluation.human_review_required;

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', mb: 0.75 }}>
      {/* Row header — clickable */}
      <Box
        onClick={onToggle}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 0.5, sm: 1 },
          px: { xs: 1, sm: 1.5 },
          py: 0.75,
          cursor: 'pointer',
          flexWrap: 'wrap',
          '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.04) },
        }}
      >
        {/* Status icon */}
        {evaluation.approved ? (
          <AppIcon
            name="CheckCircleOutline"
            fallback={CheckCircleOutlineIcon}
            sx={{ fontSize: 16, color: 'success.main', flexShrink: 0 }}
          />
        ) : evaluation.approved === false ? (
          <AppIcon
            name="CancelOutlined"
            fallback={CancelOutlinedIcon}
            sx={{ fontSize: 16, color: 'error.main', flexShrink: 0 }}
          />
        ) : (
          <AppIcon
            name="HourglassEmpty"
            fallback={HourglassEmptyIcon}
            sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }}
          />
        )}

        {/* Date */}
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.65rem',
            color: 'text.disabled',
            minWidth: { xs: 60, sm: 90 },
            flexShrink: 0,
          }}
        >
          {ts}
        </Typography>

        {/* Summary — truncated */}
        <Typography
          variant="body2"
          sx={{ flex: 1, fontSize: '0.72rem', fontWeight: 600, minWidth: 0 }}
          noWrap
        >
          {evaluation.summary || evaluation.feedback?.slice(0, 80) || 'Evaluation'}
        </Typography>

        {/* Score */}
        <Chip
          label={score.toFixed(1)}
          size="small"
          color={score >= 7 ? 'success' : score >= 4 ? 'warning' : 'error'}
          variant="outlined"
          sx={{ fontSize: '0.6rem', height: 20, fontWeight: 700, flexShrink: 0 }}
        />

        {/* Outcome */}
        <Chip
          label={
            evaluation.approved
              ? 'Approved'
              : evaluation.approved === false
                ? 'Rejected'
                : 'Pending'
          }
          size="small"
          color={
            evaluation.approved ? 'success' : evaluation.approved === false ? 'error' : 'default'
          }
          sx={{ fontSize: '0.55rem', height: 18, fontWeight: 700, flexShrink: 0 }}
        />

        {/* Cost — hidden on mobile */}
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.6rem',
            color: 'text.disabled',
            display: { xs: 'none', sm: 'block' },
            flexShrink: 0,
          }}
        >
          ${cost.toFixed(4)}
        </Typography>

        <IconButton size="small" sx={{ p: 0.25 }}>
          {expanded ? (
            <AppIcon name="ExpandLess" fallback={ExpandLessIcon} sx={{ fontSize: 16 }} />
          ) : (
            <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} sx={{ fontSize: 16 }} />
          )}
        </IconButton>
      </Box>
      {/* Expanded detail */}
      <Collapse in={expanded}>
        <Box
          sx={{ px: { xs: 1, sm: 1.5 }, pb: 1.5, borderTop: '1px solid', borderColor: 'divider' }}
        >
          {/* Metrics row */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1, mb: 1 }}>
            <Box>
              <Typography
                variant="caption"
                sx={{ fontSize: '0.55rem', color: 'text.disabled', fontWeight: 600 }}
              >
                SCORE
              </Typography>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>
                {score.toFixed(1)}/10
              </Typography>
            </Box>
            <Box>
              <Typography
                variant="caption"
                sx={{ fontSize: '0.55rem', color: 'text.disabled', fontWeight: 600 }}
              >
                COST
              </Typography>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>
                ${cost.toFixed(4)}
              </Typography>
            </Box>
            {tokens > 0 && (
              <Box>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.55rem', color: 'text.disabled', fontWeight: 600 }}
                >
                  TOKENS
                </Typography>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>
                  {tokens.toLocaleString()}
                </Typography>
              </Box>
            )}
            {durationSec && (
              <Box>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.55rem', color: 'text.disabled', fontWeight: 600 }}
                >
                  DURATION
                </Typography>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>
                  {durationSec}s
                </Typography>
              </Box>
            )}
            {level && (
              <Box>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.55rem', color: 'text.disabled', fontWeight: 600 }}
                >
                  LEVEL
                </Typography>
                <Chip
                  label={level}
                  size="small"
                  color={level === 'CRITICAL' ? 'error' : level === 'HIGH' ? 'warning' : 'default'}
                  variant="outlined"
                  sx={{ height: 18, fontSize: '0.55rem', fontWeight: 700 }}
                />
              </Box>
            )}
            {humanReview && (
              <Chip
                label="Human Review"
                size="small"
                color="warning"
                sx={{ height: 18, fontSize: '0.55rem', alignSelf: 'flex-end' }}
              />
            )}
          </Box>

          {/* Feedback */}
          {evaluation.feedback && (
            <Box sx={{ mb: 1 }}>
              <Typography
                variant="caption"
                sx={{ fontSize: '0.55rem', color: 'text.disabled', fontWeight: 600 }}
              >
                FEEDBACK
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontSize: '0.72rem', lineHeight: 1.5, color: 'text.secondary', mt: 0.25 }}
              >
                {evaluation.feedback}
              </Typography>
            </Box>
          )}

          {/* Member responses */}
          {members.length > 0 && (
            <Box>
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.55rem',
                  color: 'text.disabled',
                  fontWeight: 600,
                  mb: 0.5,
                  display: 'block',
                }}
              >
                MEMBER VOTES ({members.length})
              </Typography>
              {members.map((m, i) => (
                <Box
                  key={m.memberId || i}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    py: 0.3,
                    borderBottom: i < members.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider',
                  }}
                >
                  {m.approved ? (
                    <AppIcon
                      name="CheckCircleOutline"
                      fallback={CheckCircleOutlineIcon}
                      sx={{ fontSize: 14, color: 'success.main' }}
                    />
                  ) : (
                    <AppIcon
                      name="CancelOutlined"
                      fallback={CancelOutlinedIcon}
                      sx={{ fontSize: 14, color: 'error.main' }}
                    />
                  )}
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, fontSize: '0.65rem', minWidth: 80 }}
                  >
                    {m.memberName || 'Member'}
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>
                    {m.role || ''}
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 700 }}>
                    {(m.overallScore || 0).toFixed(1)}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {/* Model info */}
          {evaluation.model && (
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.55rem',
                color: 'text.disabled',
                fontFamily: 'monospace',
                mt: 0.75,
                display: 'block',
              }}
            >
              {evaluation.provider}/{evaluation.model}
            </Typography>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

export default function AnalyticsDashboard({ theme: themeProp }) {
  const theme = themeProp || useTheme();
  const [period, setPeriod] = useState('daily');
  const { analytics, summary, loading, error } = useConciliumAnalytics(null, period);

  // Jobs/evaluations list
  const [evaluations, setEvaluations] = useState([]);
  const [evalsLoading, setEvalsLoading] = useState(true);
  const [evalsError, setEvalsError] = useState(null);
  const [expandedEval, setExpandedEval] = useState(null);
  const [evalSearch, setEvalSearch] = useState('');
  const [evalFilter, setEvalFilter] = useState('all'); // all | approved | rejected

  useEffect(() => {
    let cancelled = false;
    async function loadEvals() {
      if (!hasSupabase()) {
        setEvalsLoading(false);
        return;
      }
      setEvalsLoading(true);
      setEvalsError(null);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setEvalsLoading(false);
          return;
        }
        const { data, error: qErr } = await supabase
          .from('concilium_evaluations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (qErr) throw qErr;
        if (!cancelled) setEvaluations(data || []);
      } catch (e) {
        console.error('[AnalyticsDashboard] evaluations load failed:', e);
        if (!cancelled) {
          setEvalsError(e.message || 'Failed to load evaluations');
          setEvaluations([]);
        }
      } finally {
        if (!cancelled) setEvalsLoading(false);
      }
    }
    loadEvals();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredEvals = evaluations.filter((e) => {
    if (evalFilter === 'approved' && !e.approved) return false;
    if (evalFilter === 'rejected' && e.approved !== false) return false;
    if (evalSearch) {
      const q = evalSearch.toLowerCase();
      return (
        (e.summary || '').toLowerCase().includes(q) || (e.feedback || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.25, sm: 2 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
          Analytics Overview
        </Typography>
        <Box sx={{ flex: 1 }} />
        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel>Period</InputLabel>
          <Select
            value={period}
            label="Period"
            onChange={(e) => setPeriod(e.target.value)}
            sx={{ borderRadius: 2, fontSize: '0.78rem' }}
          >
            <MenuItem value="hourly">Hourly</MenuItem>
            <MenuItem value="daily">Daily</MenuItem>
            <MenuItem value="weekly">Weekly</MenuItem>
            <MenuItem value="monthly">Monthly</MenuItem>
          </Select>
        </FormControl>
      </Box>
      {(error || evalsError) && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          Couldn't load analytics data: {error || evalsError}
        </Alert>
      )}
      {summary ? (
        <>
          {/* Metric cards */}
          <Box
            sx={{
              display: 'grid',
              gap: 1,
              gridTemplateColumns: {
                xs: 'repeat(2, 1fr)',
                sm: 'repeat(3, 1fr)',
                md: 'repeat(5, 1fr)',
              },
              mb: 2.5,
            }}
          >
            <MetricCard
              label="Total Evaluations"
              value={summary.totalEvaluations}
              color={theme.palette.primary.main}
              icon={GavelOutlinedIcon}
              theme={theme}
            />
            <MetricCard
              label="Approved"
              value={summary.approvedCount}
              color="#059669"
              icon={CheckCircleOutlineIcon}
              theme={theme}
            />
            <MetricCard
              label="Rejected"
              value={summary.rejectedCount}
              color="#DC2626"
              icon={CancelOutlinedIcon}
              theme={theme}
            />
            <MetricCard
              label="Avg Score"
              value={summary.avgScore}
              color="#2563EB"
              icon={BarChartOutlinedIcon}
              theme={theme}
            />
            <MetricCard
              label="Total Cost"
              value={`$${summary.totalCostUsd?.toFixed(4) || '0.0000'}`}
              color="#D97706"
              icon={AccountBalanceWalletOutlinedIcon}
              theme={theme}
            />
          </Box>

          {/* Recent Activity */}
          {analytics.length > 0 && (
            <Paper variant="outlined" sx={{ p: { xs: 1.25, sm: 2 }, borderRadius: 2.5, mb: 2.5 }}>
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}
              >
                <AppIcon
                  name="Timeline"
                  fallback={TimelineIcon}
                  sx={{ fontSize: 18, color: 'info.main' }}
                />{' '}
                Recent Activity ({period})
              </Typography>
              {analytics.slice(0, 10).map((a) => (
                <Box
                  key={a.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.65rem',
                      minWidth: 80,
                      color: 'text.disabled',
                    }}
                  >
                    {a.period_start ? new Date(a.period_start).toLocaleDateString() : '—'}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
                    {a.total_evaluations || 0} evals
                  </Typography>
                  <Chip
                    label={`$${Number.parseFloat(a.total_cost_usd || 0).toFixed(4)}`}
                    size="small"
                    sx={{ height: 20, fontSize: '0.6rem', fontWeight: 600 }}
                  />
                  <Box sx={{ flex: 1 }} />
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', fontSize: '0.6rem' }}
                  >
                    {a.total_tokens || 0} tokens
                  </Typography>
                </Box>
              ))}
            </Paper>
          )}

          {/* ── Consilium Jobs / Evaluations List ── */}
          <Paper variant="outlined" sx={{ p: { xs: 1.25, sm: 2 }, borderRadius: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75, flex: 1 }}
              >
                <AppIcon
                  name="AssignmentOutlined"
                  fallback={AssignmentOutlinedIcon}
                  sx={{ fontSize: 18, color: 'primary.main' }}
                />{' '}
                Evaluation History ({filteredEvals.length})
              </Typography>
              {/* Filter chips */}
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {[
                  { id: 'all', label: 'All' },
                  { id: 'approved', label: 'Approved' },
                  { id: 'rejected', label: 'Rejected' },
                ].map((f) => (
                  <Chip
                    key={f.id}
                    label={f.label}
                    size="small"
                    color={evalFilter === f.id ? 'primary' : 'default'}
                    variant={evalFilter === f.id ? 'filled' : 'outlined'}
                    onClick={() => setEvalFilter(f.id)}
                    sx={{ fontSize: '0.6rem', height: 22, fontWeight: 600, cursor: 'pointer' }}
                  />
                ))}
              </Box>
            </Box>

            {/* Search */}
            <TextField
              size="small"
              fullWidth
              placeholder="Search evaluations..."
              value={evalSearch}
              onChange={(e) => setEvalSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon name="Search" fallback={SearchIcon} sx={{ fontSize: 16 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.78rem' } }}
            />

            {evalsLoading ? (
              <Box sx={{ py: 3, textAlign: 'center' }}>
                <CircularProgress size={24} />
              </Box>
            ) : filteredEvals.length === 0 ? (
              <Box sx={{ py: 3, textAlign: 'center' }}>
                <AppIcon
                  name="GavelOutlined"
                  fallback={GavelOutlinedIcon}
                  sx={{ fontSize: 32, color: 'text.disabled', mb: 0.5 }}
                />
                <Typography variant="body2" color="text.disabled">
                  {evalSearch || evalFilter !== 'all'
                    ? 'No matching evaluations.'
                    : 'No evaluations for your account yet. Run a board evaluation from a goal/job, or check Supabase that rows have your user_id.'}
                </Typography>
                {!evalSearch && evalFilter === 'all' && (
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    sx={{ display: 'block', mt: 1, fontSize: '0.72rem' }}
                  >
                    Form updates (approval thresholds, member tuning) are on the Boards and Members
                    tabs — open New board or Add member.
                  </Typography>
                )}
              </Box>
            ) : (
              <Box>
                {filteredEvals.map((ev) => (
                  <EvalRow
                    key={ev.id}
                    evaluation={ev}
                    theme={theme}
                    expanded={expandedEval === ev.id}
                    onToggle={() => setExpandedEval(expandedEval === ev.id ? null : ev.id)}
                  />
                ))}
              </Box>
            )}
          </Paper>
        </>
      ) : (
        <EmptyState
          icon={TimelineIcon}
          title="No analytics data"
          description="Analytics will appear once evaluations are performed."
        />
      )}
    </Box>
  );
}
