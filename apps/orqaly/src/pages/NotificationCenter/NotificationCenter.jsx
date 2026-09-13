/**
 * NotificationCenter - Advice & Strategy page.
 * Uses the standard page design pattern (BentoCard + metrics + pill tabs).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Paper,
  Typography,
  Collapse,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';
import AutoGraphOutlinedIcon from '@mui/icons-material/AutoGraphOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import AdviceTabContent from './AdviceTabContent';
import StrategyCenter from '../StrategyCenter/StrategyCenter';
import {
  getActiveNotifications,
  getSystemMetrics,
} from '../../services/aiNotificationActionCenterService';

import AppIcon from '../../components/icons/AppIcon';

const TABS = [
  { id: 'advice', label: 'Advice', icon: AutoGraphOutlinedIcon },
  { id: 'strategy', label: 'Strategy', icon: TimelineOutlinedIcon },
];

export default function NotificationCenter() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchParams, setSearchParams] = useSearchParams();
  const [showMetrics, setShowMetrics] = useShowMetrics('notifications-center');
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get('tab');
    return t === 'strategy' ? 'strategy' : 'advice';
  });

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'strategy' || t === 'advice') setActiveTab(t);
    else setActiveTab('advice');
  }, [searchParams]);

  const handleTabChange = useCallback(
    (value) => {
      setActiveTab(value);
      setSearchParams({ tab: value }, { replace: true });
    },
    [setSearchParams]
  );

  // ── Metrics ────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const active = getActiveNotifications({ status: 'active' });
    const sys = getSystemMetrics();
    return {
      totalAlerts: active.length,
      criticalHigh: active.filter((n) => n.priority === 'critical' || n.priority === 'high').length,
      revenueProtected: Number(sys.totalRevenueProtected || 0),
      predictionAccuracy: Math.round((sys.financialPredictionAccuracy || 0) * 100),
    };
  }, []);

  const statCards = [
    {
      label: 'Active alerts',
      value: metrics.totalAlerts,
      helper: 'Pending notifications',
      color: theme.palette.warning.main,
      icon: NotificationsActiveOutlinedIcon,
    },
    {
      label: 'Critical / High',
      value: metrics.criticalHigh,
      helper: 'Requires attention',
      color: theme.palette.error.main,
      icon: AutoGraphOutlinedIcon,
    },
    {
      label: 'Revenue protected',
      value: `$${metrics.revenueProtected.toLocaleString()}`,
      helper: 'Resolved alerts value',
      color: theme.palette.success.main,
      icon: TrendingUpOutlinedIcon,
    },
    {
      label: 'Prediction accuracy',
      value: `${metrics.predictionAccuracy}%`,
      helper: 'Learning feedback loop',
      color: theme.palette.primary.main,
      icon: PsychologyOutlinedIcon,
    },
  ];

  return (
    <PageLayout title="Notifications" subtitle="" showTitleBlock={false}>
      <BentoCard
        title="Notifications"
        subtitle={showMetrics ? `${metrics.totalAlerts} active alerts` : undefined}
        icon={NotificationsActiveOutlinedIcon}
        iconColor={theme.palette.primary.main}
        noPadding
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
      >
        {/* ── Metrics Cards ────────────────────────────────────── */}
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
                  lg: 'repeat(4, minmax(0, 1fr))',
                },
              }}
            >
              {statCards.map((card) => (
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
                      <AppIcon fallback={card.icon} sx={{ fontSize: 18 }} />
                    </Box>
                  </Box>
                </Paper>
              ))}
            </Box>
          </Box>
        </Collapse>

        <Box sx={{ p: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* ── Tab Bar ──────────────────────────────────────────── */}
          <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, pt: 1.5, pb: 0 }}>
            <Box
              sx={{
                display: 'flex',
                bgcolor: alpha(theme.palette.text.primary, 0.04),
                p: 0.5,
                borderRadius: 3,
                width: { xs: '100%', md: 'auto' },
              }}
            >
              {TABS.map((tab) => (
                <Button
                  key={tab.id}
                  startIcon={<AppIcon fallback={tab.icon} sx={{ fontSize: 18 }} />}
                  onClick={() => handleTabChange(tab.id)}
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
                      activeTab === tab.id ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                    color: activeTab === tab.id ? 'primary.main' : 'text.secondary',
                    boxShadow:
                      activeTab === tab.id
                        ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}`
                        : 'none',
                    '&:hover': {
                      bgcolor:
                        activeTab === tab.id
                          ? alpha(theme.palette.primary.main, 0.15)
                          : alpha(theme.palette.text.primary, 0.05),
                      color: activeTab === tab.id ? 'primary.main' : 'text.primary',
                    },
                  }}
                >
                  {tab.label}
                </Button>
              ))}
            </Box>
          </Box>

          {/* ── Divider ──────────────────────────────────────────── */}
          <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', mt: 1.5 }} />

          {/* ── Tab Content ──────────────────────────────────────── */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {activeTab === 'advice' && <AdviceTabContent />}
            {activeTab === 'strategy' && <StrategyCenter embed />}
          </Box>
        </Box>
      </BentoCard>
    </PageLayout>
  );
}
