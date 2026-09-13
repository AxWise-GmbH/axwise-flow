import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Paper,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  alpha,
  useTheme,
} from '@mui/material';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import SummarizeOutlinedIcon from '@mui/icons-material/SummarizeOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import FunctionsOutlinedIcon from '@mui/icons-material/FunctionsOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import PageLayout from '../../components/Common/PageLayout';
import { useAuth } from '../../context/AuthContext';
import {
  getStrategyData,
  getKpiEngineering,
  getAiRecommendation,
} from '../../services/strategyService';
import { saveStrategySnapshot, loadStrategySnapshots } from '../../services/strategyCenterBackend';
import { logAction, buildAgentMeta } from '../../services/auditLogBackend';
import { formatMonthYear, parseMonthYear } from '../Partners/utils/periodMetrics';
import BusinessDecompositionBlock from './components/BusinessDecompositionBlock';
import ActionKpiMappingBlock from './components/ActionKpiMappingBlock';
import KpiEngineeringBlock from './components/KpiEngineeringBlock';
import PredictiveScenariosBlock from './components/PredictiveScenariosBlock';
import AiRecommendationBlock from './components/AiRecommendationBlock';
import RoiModelBlock from './components/RoiModelBlock';
import ExecutiveSummaryBlock from './components/ExecutiveSummaryBlock';

import AppIcon from '../../components/icons/AppIcon';

function shiftPeriod(period, diffMonths) {
  const dt = new Date(period.year, period.month - 1 + diffMonths, 1);
  return {
    month: dt.getMonth() + 1,
    year: dt.getFullYear(),
    key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`,
    label: `${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`,
  };
}

const TABS = [
  { key: 'summary', label: 'Executive Summary', icon: SummarizeOutlinedIcon },
  { key: 'decomposition', label: 'Business Decomposition', icon: AccountTreeOutlinedIcon },
  { key: 'actionKpi', label: 'Action → KPI', icon: HubOutlinedIcon },
  { key: 'kpiEng', label: 'KPI Engineering', icon: FunctionsOutlinedIcon },
  { key: 'scenarios', label: 'Predictive Scenarios', icon: TrendingUpOutlinedIcon },
  { key: 'aiRec', label: 'AI Recommendation', icon: SmartToyOutlinedIcon },
  { key: 'roi', label: 'ROI Model', icon: AccountBalanceOutlinedIcon },
  { key: 'history', label: 'History', icon: HistoryOutlinedIcon },
];

export default function StrategyCenter({ embed = false, agentContext = null }) {
  const theme = useTheme();
  const { user } = useAuth();
  const [period, setPeriod] = useState(formatMonthYear(new Date()));
  const [tab, setTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const initialViewLogged = useRef(false);

  const effectivePeriod = useMemo(
    () => parseMonthYear(period) || parseMonthYear(formatMonthYear(new Date())),
    [period]
  );
  const periodKey = effectivePeriod?.key || null;

  // Track page view (once on mount)
  useEffect(() => {
    if (initialViewLogged.current) return;
    initialViewLogged.current = true;
    logAction({
      action: 'page_view',
      entity: 'strategy_center',
      details: 'Strategy Center page viewed',
      meta: { tab: 'summary', period, periodKey, ...buildAgentMeta(agentContext) },
    });
  }, [period, periodKey, agentContext]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getStrategyData(periodKey);
      setData(result);
      // Save snapshot to database for history
      if (user?.uid && result) {
        saveStrategySnapshot({
          userId: user.uid,
          periodKey: periodKey || effectivePeriod?.key || '',
          periodLabel: effectivePeriod?.label || period,
          payload: {
            summary: result.summary,
            currentMetrics: result.currentMetrics,
            scenarios: result.scenarios,
            roi: result.roi,
          },
        });
      }
    } catch (err) {
      setError(err?.message || 'Failed to load strategy data');
    } finally {
      setLoading(false);
    }
  }, [periodKey, user?.uid, effectivePeriod?.key, effectivePeriod?.label, period]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Track tab change
  const handleTabChange = useCallback(
    (_, v) => {
      setTab(v);
      logAction({
        action: 'tab_change',
        entity: 'strategy_center',
        details: `Switched to ${v} tab`,
        meta: { tab: v, period, periodKey, ...buildAgentMeta(agentContext) },
      });
    },
    [period, periodKey, agentContext]
  );

  // Track period change
  const handlePeriodChange = useCallback(
    (e) => {
      const newPeriod = e.target.value;
      setPeriod(newPeriod);
      logAction({
        action: 'period_change',
        entity: 'strategy_center',
        details: `Period changed to ${newPeriod}`,
        meta: { period: newPeriod, tab, ...buildAgentMeta(agentContext) },
      });
    },
    [tab, agentContext]
  );

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const items = await loadStrategySnapshots({ limit: 50 });
      setHistoryItems(items);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  const handleViewSnapshot = useCallback((item) => {
    const payload = item.payload || {};
    const metrics = payload.currentMetrics;
    const scn = payload.scenarios;
    if (payload.summary || scn || payload.roi || metrics) {
      setData({
        summary: payload.summary,
        scenarios: scn,
        roi: payload.roi,
        currentMetrics: metrics,
        decomposition: null,
        actionKpi: null,
        kpiEng: getKpiEngineering(metrics),
        aiRec: getAiRecommendation([], [], [], metrics, scn),
      });
      setPeriod(item.period_label || '');
      setTab('summary');
    }
  }, []);

  const periods = useMemo(() => {
    const now = new Date();
    const options = [];
    for (let i = 0; i < 12; i++) {
      const p = shiftPeriod({ month: now.getMonth() + 1, year: now.getFullYear() }, -i);
      options.push({ value: p.label, key: p.key });
    }
    return options;
  }, []);

  if (loading && !data) {
    return embed ? <LoadingSpinner /> : <LoadingSpinner fullScreen />;
  }

  const periodBar = (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel>Period</InputLabel>
        <Select value={period} onChange={handlePeriodChange} label="Period">
          {periods.map((p) => (
            <MenuItem key={p.key} value={p.value}>
              {p.value}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <AppIcon
        name="TimelineOutlined"
        fallback={TimelineOutlinedIcon}
        sx={{ color: theme.palette.primary.main, fontSize: 22 }}
      />
    </Stack>
  );

  const content = (
    <>
      {periodBar}
      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}
      <Tabs
        value={tab}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 },
        }}
      >
        {TABS.map((t) => (
          <Tab
            key={t.key}
            value={t.key}
            label={t.label}
            icon={t.icon ? <AppIcon fallback={t.icon} sx={{ fontSize: 18 }} /> : null}
            iconPosition="start"
          />
        ))}
      </Tabs>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' },
          gap: 2,
          animation: theme.animations?.fadeInUp,
        }}
      >
        {tab === 'summary' && data?.summary && (
          <Box sx={{ gridColumn: '1 / -1' }}>
            <ExecutiveSummaryBlock data={data.summary} />
          </Box>
        )}
        {tab === 'decomposition' && data?.decomposition && (
          <Box sx={{ gridColumn: '1 / -1' }}>
            <BusinessDecompositionBlock data={data.decomposition} />
          </Box>
        )}
        {tab === 'actionKpi' && data?.actionKpi && (
          <Box sx={{ gridColumn: '1 / -1' }}>
            <ActionKpiMappingBlock data={data.actionKpi} />
          </Box>
        )}
        {tab === 'kpiEng' && data?.kpiEng && (
          <Box sx={{ gridColumn: '1 / -1' }}>
            <KpiEngineeringBlock data={data.kpiEng} />
          </Box>
        )}
        {tab === 'scenarios' && data?.scenarios && (
          <Box sx={{ gridColumn: '1 / -1' }}>
            <PredictiveScenariosBlock data={data.scenarios} />
          </Box>
        )}
        {tab === 'aiRec' && data?.aiRec && (
          <Box sx={{ gridColumn: '1 / -1' }}>
            <AiRecommendationBlock data={data.aiRec} />
          </Box>
        )}
        {tab === 'roi' && data?.roi && (
          <Box sx={{ gridColumn: '1 / -1' }}>
            <RoiModelBlock data={data.roi} />
          </Box>
        )}
        {tab === 'history' && (
          <Box sx={{ gridColumn: '1 / -1' }}>
            <Paper
              elevation={0}
              sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                Strategy Center History
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Past snapshots saved when you viewed Strategy Center. Activity is also logged to the
                Activity Log.
              </Typography>
              {historyLoading ? (
                <Typography variant="body2" color="text.secondary">
                  Loading history…
                </Typography>
              ) : historyItems.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No snapshots yet. View Strategy Center with a period to save snapshots.
                </Typography>
              ) : (
                <List disablePadding>
                  {historyItems.map((item) => (
                    <ListItem key={item.id} divider sx={{ borderRadius: 1 }}>
                      <ListItemText
                        primary={`${item.period_label} - ${new Date(item.created_at).toLocaleString()}`}
                        secondary={item.period_key || ''}
                      />
                      <ListItemSecondaryAction>
                        <Button
                          size="small"
                          startIcon={
                            <AppIcon name="VisibilityOutlined" fallback={VisibilityOutlinedIcon} />
                          }
                          onClick={() => handleViewSnapshot(item)}
                        >
                          View
                        </Button>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </Paper>
          </Box>
        )}
      </Box>

      {data && (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Typography variant="caption" color="text.secondary">
            Last updated for {effectivePeriod?.label || period}. Data from partners, projects,
            workflows.
          </Typography>
        </Box>
      )}
    </>
  );

  if (embed) {
    return content;
  }

  return (
    <PageLayout
      title="Strategy Center"
      subtitle="Business decomposition, Action→KPI mapping, KPI engineering, predictive scenarios, AI recommendation, ROI model"
      action={
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Period</InputLabel>
            <Select value={period} onChange={handlePeriodChange} label="Period">
              {periods.map((p) => (
                <MenuItem key={p.key} value={p.value}>
                  {p.value}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <AppIcon
            name="TimelineOutlined"
            fallback={TimelineOutlinedIcon}
            sx={{ color: theme.palette.primary.main, fontSize: 22 }}
          />
        </Stack>
      }
    >
      {content}
    </PageLayout>
  );
}
