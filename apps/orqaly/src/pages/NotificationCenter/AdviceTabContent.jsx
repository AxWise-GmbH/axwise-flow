import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  Stack,
  Divider,
  alpha,
  useTheme,
} from '@mui/material';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import {
  getActiveNotifications,
  canAutoFix,
  getLearningSummary,
  getNotificationAnalytics,
  getOutcomeSchedule,
  getSystemMetrics,
  getBusinessSuggestions,
  runDueOutcomeMeasurements,
  runNotificationMonitoringCycle,
} from '../../services/aiNotificationActionCenterService';
import { useNavigate } from 'react-router-dom';

import AppIcon from '../../components/icons/AppIcon';

function MetricCard({ label, value, helper, color, icon: Icon }) {
  const theme = useTheme();
  const resolvedColor = color || theme.palette.primary.main;
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        borderRadius: 2.5,
        border: '2px solid',
        borderColor: alpha(resolvedColor, 0.22),
        background: `linear-gradient(135deg, ${alpha(resolvedColor, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
      }}
    >
      <Box
        sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            {label}
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
            {value}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', display: 'block', mt: 0.35 }}
          >
            {helper}
          </Typography>
        </Box>
        {Icon && (
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 2,
              bgcolor: alpha(resolvedColor, 0.16),
              color: resolvedColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon sx={{ fontSize: 18 }} />
          </Box>
        )}
      </Box>
    </Paper>
  );
}

export default function AdviceTabContent() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [lastRun, setLastRun] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await runNotificationMonitoringCycle();
      const measured = runDueOutcomeMeasurements();
      setLastRun({
        at: new Date().toLocaleString(),
        measured: measured.length,
      });
      setReloadKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const analytics = useMemo(() => getNotificationAnalytics('monthly'), [reloadKey]);
  const systemMetrics = useMemo(() => getSystemMetrics(), [reloadKey]);
  const learning = useMemo(() => getLearningSummary(), [reloadKey]);
  const active = useMemo(() => getActiveNotifications({ status: 'active' }), [reloadKey]);
  const priorityMix = useMemo(
    () => ({
      critical: active.filter((n) => n.priority === 'critical').length,
      high: active.filter((n) => n.priority === 'high').length,
      medium: active.filter((n) => n.priority === 'medium').length,
      low: active.filter((n) => n.priority === 'low').length,
    }),
    [active]
  );
  const actionReadiness = useMemo(() => {
    let safeNow = 0;
    let requiresApproval = 0;
    active.forEach((n) => {
      (n.actionOptions || []).forEach((option) => {
        const confidence = n.aiAnalysis?.rootCause?.confidence || 0.8;
        const safe = canAutoFix(
          { ...option, confidence },
          {
            minConfidence: 0.9,
            maxCost: 500,
            allowedRisk: ['minimal', 'low'],
            requiresReversible: true,
            minROI: 10,
          }
        );
        if (safe) safeNow += 1;
        if (option?.implementation?.requiresApproval) requiresApproval += 1;
      });
    });
    return { safeNow, requiresApproval };
  }, [active]);

  const top = useMemo(() => {
    const isDummy = (notification) => {
      const haystack = [
        notification?.trigger?.entity,
        notification?.trigger?.type,
        notification?.aiAnalysis?.situationSummary,
      ]
        .join(' ')
        .toLowerCase();
      return /\bdummy\b|\bdemo\b|\bmock\b/.test(haystack);
    };
    return active
      .filter((n) => !isDummy(n))
      .sort(
        (a, b) =>
          Number(b?.financialImpact?.profitImpactScore || 0) -
          Number(a?.financialImpact?.profitImpactScore || 0)
      )
      .slice(0, 8)
      .map((n) => ({
        id: n.id,
        priority: n.priority,
        entity: n.trigger?.entity,
        type: n.trigger?.type,
        score: n.financialImpact?.profitImpactScore || 0,
        summary: n.aiAnalysis?.situationSummary || '',
        condition: n.trigger?.condition || '',
        confidence: n.aiAnalysis?.rootCause?.confidence || 0,
        if24h: n.aiAnalysis?.impactProjection?.if24h || 0,
        if30d: n.aiAnalysis?.impactProjection?.if30d || n.financialImpact?.projectedMonthly || 0,
        dailyImpact: n.financialImpact?.dailyImpact || 0,
        recommendedActionId: n.recommendedAction || '',
        actionOptions: n.actionOptions || [],
      }));
  }, [active, reloadKey]);
  const schedule = useMemo(() => getOutcomeSchedule().slice(0, 8), [reloadKey]);
  const suggestions = useMemo(() => getBusinessSuggestions(), [reloadKey]);

  return (
    <Box>
      {/* Controls & Status */}
      <Box
        sx={{
          p: { xs: 1.5, sm: 1.75 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: 'divider',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}
          >
            Controls & Status
          </Typography>
          <Chip
            size="small"
            label="BETA"
            color="warning"
            variant="outlined"
            sx={{ fontWeight: 900, letterSpacing: '0.06em' }}
          />
        </Box>
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            flexWrap: 'wrap',
            width: { xs: '100%', sm: 'auto' },
            justifyContent: { xs: 'space-between', sm: 'flex-end' },
          }}
        >
          {lastRun && (
            <Chip
              size="small"
              label={`Last run ${lastRun.at} · outcomes ${lastRun.measured}`}
              variant="outlined"
              sx={{ borderRadius: 1.5, fontWeight: 500 }}
            />
          )}
          <Button
            size="small"
            variant="contained"
            startIcon={<AppIcon name="BoltOutlined" fallback={BoltOutlinedIcon} />}
            onClick={refresh}
            disabled={loading}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
          >
            {loading ? 'Running...' : 'Run Cycle'}
          </Button>
        </Box>
      </Box>
      <Box sx={{ p: { xs: 1.5, sm: 2, md: 2.5 } }}>
        <Paper
          variant="outlined"
          sx={{
            borderRadius: 2.5,
            p: { xs: 1.25, sm: 1.5 },
            mb: 2.5,
            border: '1px solid',
            borderColor: alpha(theme.palette.warning.main, 0.35),
            bgcolor: alpha(theme.palette.warning.main, 0.06),
          }}
        >
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Chip
              size="small"
              label="BETA"
              color="warning"
              sx={{ fontWeight: 900, letterSpacing: '0.06em' }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 900, lineHeight: 1.2 }}>
                AI (beta)
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Run a cycle to refresh alerts and business suggestions from your partners, projects,
                and workflows.
              </Typography>
            </Box>
          </Box>
        </Paper>

        {/* Metrics - always visible (controlled by parent) */}
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              lg: 'repeat(4, minmax(0, 1fr))',
            },
            mb: 2.5,
          }}
        >
          <MetricCard
            label="Revenue Protected"
            value={`$${Number(systemMetrics.totalRevenueProtected || 0).toLocaleString()}`}
            helper="Resolved alerts projected value"
            color={theme.palette.primary.main}
            icon={TrendingUpOutlinedIcon}
          />
          <MetricCard
            label="Net Benefit"
            value={`$${Number(systemMetrics.netBenefit || 0).toLocaleString()}`}
            helper={`ROI ${systemMetrics.averageROI}x`}
            color={theme.palette.success.main}
            icon={CheckCircleOutlineIcon}
          />
          <MetricCard
            label="Active Alerts"
            value={active.length}
            helper={`Critical/High ${active.filter((n) => n.priority === 'critical' || n.priority === 'high').length}`}
            color={theme.palette.warning.main}
            icon={NotificationsActiveOutlinedIcon}
          />
          <MetricCard
            label="Prediction Accuracy"
            value={`${Math.round((systemMetrics.financialPredictionAccuracy || 0) * 100)}%`}
            helper="Learning feedback loop"
            color={theme.palette.primary.main}
            icon={PsychologyOutlinedIcon}
          />
        </Box>

        <Divider sx={{ my: 2.5 }} />

        <Paper
          variant="outlined"
          sx={{
            borderRadius: 2.5,
            p: { xs: 1.5, sm: 1.75 },
            mb: 2.5,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
            <AppIcon
              name="PsychologyOutlined"
              fallback={PsychologyOutlinedIcon}
              sx={{ fontSize: 16, mr: 0.8, verticalAlign: 'text-bottom' }}
            />
            Business suggestions &amp; recommendations
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Actionable ideas based on your partners, projects, and workflows. Run a cycle to
            refresh.
          </Typography>
          {suggestions.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No suggestions yet. Click &quot;Run Cycle&quot; to generate recommendations.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {suggestions.map((s) => (
                <Box
                  key={s.id}
                  sx={{
                    p: 1.25,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 1,
                    flexWrap: 'wrap',
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Chip
                      size="small"
                      label={s.category}
                      sx={{ textTransform: 'capitalize', mb: 0.5 }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {s.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {s.description}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => navigate(s.actionPath)}
                    sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, flexShrink: 0 }}
                  >
                    {s.actionLabel}
                  </Button>
                </Box>
              ))}
            </Stack>
          )}
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            borderRadius: 2.5,
            p: { xs: 1.5, sm: 1.75 },
            mb: 2.5,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
            Operating Knowledge Layer
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Alerts are generated only when profit impact clears threshold and include root-cause
            confidence, projected loss curves, and executable actions.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
            <Chip
              size="small"
              label={`Priority mix C:${priorityMix.critical} H:${priorityMix.high} M:${priorityMix.medium} L:${priorityMix.low}`}
            />
            <Chip
              size="small"
              color="success"
              variant="outlined"
              label={`Safe actions now: ${actionReadiness.safeNow}`}
            />
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={`Approval-required options: ${actionReadiness.requiresApproval}`}
            />
            <Chip
              size="small"
              variant="outlined"
              label={`Revenue at risk: $${Number(analytics.revenueAtRisk || 0).toLocaleString()}`}
            />
          </Box>
        </Paper>

        <Box
          sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', lg: '1.2fr 0.8fr' } }}
        >
          <Paper
            variant="outlined"
            sx={{
              borderRadius: 2.5,
              p: { xs: 1.5, sm: 1.75 },
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
              <AppIcon
                name="NotificationsActiveOutlined"
                fallback={NotificationsActiveOutlinedIcon}
                sx={{ fontSize: 16, mr: 0.8, verticalAlign: 'text-bottom' }}
              />
              Top Active Alerts
            </Typography>
            {top.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No live alerts above configured threshold. Use business suggestions above for
                recommendations.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {top.map((item) => (
                  <Box
                    key={item.id}
                    sx={{ p: 1.25, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 1,
                        alignItems: 'center',
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {item.type}
                      </Typography>
                      <Chip
                        size="small"
                        color={
                          item.priority === 'critical'
                            ? 'error'
                            : item.priority === 'high'
                              ? 'warning'
                              : 'default'
                        }
                        label={`${item.priority} · $${Math.round(item.score).toLocaleString()}`}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {item.entity}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {item.summary}
                    </Typography>
                    {item.condition && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', mt: 0.5 }}
                      >
                        Trigger: {item.condition}
                      </Typography>
                    )}
                    <Box sx={{ mt: 0.8, display: 'flex', gap: 0.6, flexWrap: 'wrap' }}>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`24h: $${Math.round(item.if24h).toLocaleString()}`}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`30d: $${Math.round(item.if30d).toLocaleString()}`}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Daily: $${Math.round(item.dailyImpact).toLocaleString()}`}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Confidence: ${Math.round(item.confidence * 100)}%`}
                      />
                    </Box>
                    {item.actionOptions.length > 0 && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', mt: 0.7 }}
                      >
                        Recommended:{' '}
                        {(
                          item.actionOptions.find((a) => a.id === item.recommendedActionId)
                            ?.description ||
                          item.actionOptions[0]?.description ||
                          ''
                        ).slice(0, 120)}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>

          <Paper
            variant="outlined"
            sx={{
              borderRadius: 2.5,
              p: { xs: 1.5, sm: 1.75 },
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
              <AppIcon
                name="PsychologyOutlined"
                fallback={PsychologyOutlinedIcon}
                sx={{ fontSize: 16, mr: 0.8, verticalAlign: 'text-bottom' }}
              />
              Learning Snapshot
            </Typography>
            <Typography variant="body2" sx={{ mb: 0.8 }}>
              Measured outcomes: <strong>{learning.totalMeasured}</strong>
            </Typography>
            <Typography variant="body2" sx={{ mb: 1.2 }}>
              Financial prediction accuracy:{' '}
              <strong>{Math.round((learning.financialPredictionAccuracy || 0) * 100)}%</strong>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Top patterns
            </Typography>
            <Stack direction="row" spacing={0.7} sx={{ mt: 0.6, mb: 1.2, flexWrap: 'wrap' }}>
              {(learning.topPatterns || []).map((p) => (
                <Chip key={p.pattern} size="small" label={`${p.pattern} (${p.count})`} />
              ))}
              {(!learning.topPatterns || learning.topPatterns.length === 0) && (
                <Typography variant="caption" color="text.secondary">
                  No patterns captured yet.
                </Typography>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Upcoming outcome measurements
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 0.6 }}>
              {schedule.map((s) => (
                <Typography
                  key={`${s.notificationId}-${s.scheduledAt}`}
                  variant="caption"
                  color="text.secondary"
                >
                  {s.notificationId} · {new Date(s.scheduledAt).toLocaleString()}
                </Typography>
              ))}
              {schedule.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  No scheduled measurements.
                </Typography>
              )}
            </Stack>
            <Divider sx={{ my: 1.2 }} />
            <Typography variant="caption" color="text.secondary">
              Model updates
            </Typography>
            <Stack spacing={0.4} sx={{ mt: 0.5 }}>
              {(learning.recentModelUpdates || []).slice(-5).map((u, idx) => (
                <Typography key={`${u}-${idx}`} variant="caption" color="text.secondary">
                  {u}
                </Typography>
              ))}
              {(!learning.recentModelUpdates || learning.recentModelUpdates.length === 0) && (
                <Typography variant="caption" color="text.secondary">
                  No model updates logged yet.
                </Typography>
              )}
            </Stack>
          </Paper>
        </Box>

        <Divider sx={{ my: 2.5 }} />

        {/* Bottom metrics - always visible */}
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
          }}
        >
          <MetricCard
            label="Acceptance Rate"
            value={`${Math.round((analytics.recommendationAcceptance || 0) * 100)}%`}
            helper="Recommendations executed"
            color={theme.palette.primary.main}
            icon={ThumbUpOutlinedIcon}
          />
          <MetricCard
            label="Avg Time to Resolution"
            value={`${Math.round(systemMetrics.avgTimeToResolution || 0)}s`}
            helper="From detection to resolve"
            color={theme.palette.primary.main}
            icon={AccessTimeOutlinedIcon}
          />
          <MetricCard
            label="Auto-fix Success"
            value={`${Math.round((systemMetrics.autoFixSuccessRate || 0) * 100)}%`}
            helper="Safe actions effectiveness"
            color={theme.palette.success.main}
            icon={BuildOutlinedIcon}
          />
        </Box>
      </Box>
    </Box>
  );
}
