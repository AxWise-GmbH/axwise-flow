import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  TextField,
  MenuItem,
  InputAdornment,
  Collapse,
  useMediaQuery,
  useTheme,
  Alert,
  alpha,
} from '@mui/material';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import StadiumOutlinedIcon from '@mui/icons-material/StadiumOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import EmptyState from '../../components/Common/EmptyState';
import AppIcon from '../../components/icons/AppIcon';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { DEPARTMENTS, DEPARTMENT_BY_ID } from '../../config/departments';
import useArenaLayout from './useArenaLayout';
import useArenaBoard from './useArenaBoard';
import useArenaSetup from './useArenaSetup';
import ArenaLayoutSwitch from './ArenaLayoutSwitch';
import ArenaJobCard from './ArenaJobCard';
import ArenaScoreboard from './ArenaScoreboard';
import ArenaStatCards from './ArenaStatCards';
import ArenaSectionLabel from './ArenaSectionLabel';
import DecisionPanel from './DecisionPanel';
import ExceptionsCard from './ExceptionsCard';
import RegisterResultDialog from './RegisterResultDialog';
import ArenaGuideDialog from './guide/ArenaGuideDialog';
import { rateArenaSide, recordArenaVerdict, runArenaAgent } from '../../services/arenaService';
import { money, duration, DASH } from './arenaFormat';

const VIEWS = [
  { value: 'board', label: 'Board' },
  { value: 'scoreboard', label: 'Scoreboard' },
  { value: 'decide', label: 'Decide' },
];

const STATUSES = [
  { value: 'all', label: 'Any status' },
  { value: 'todo', label: 'To do' },
  { value: 'inProgress', label: 'In progress' },
  { value: 'planned', label: 'Planned' },
  { value: 'done', label: 'Done' },
];

/**
 * Arena (/arena) - your people and your agents on the same daily job.
 *
 * Three views over one dataset: the Board pairs every job, the Scoreboard rolls
 * it up per department, and Decide turns that into a recommendation with every
 * number behind it on show. Arena never reassigns work by itself.
 */
export default function Arena() {
  const theme = useTheme();
  const { simpleMode } = useSimpleMode();
  const [params, setParams] = useSearchParams();
  const { isStacked } = useArenaLayout();
  const [showMetrics, setShowMetrics] = useShowMetrics('arena');

  const [view, setView] = useState('board');
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');

  // "Set up Arena" from the Assistant lands on /arena?setup=1, so the guide is
  // open on the first render rather than flashing the board and then opening.
  // null = closed; otherwise the step key (or index) the guide opens at.
  const [guideStep, setGuideStep] = useState(() => (params.get('setup') === '1' ? 0 : null));
  const [registerFor, setRegisterFor] = useState(null);
  const [notice, setNotice] = useState(null);

  const { configured, reload: reloadSetup, isConfigured } = useArenaSetup();
  const { board, scoreboard, decision, exceptions, loading, error, refetch } = useArenaBoard({
    view,
    department,
    status,
    q,
  });

  // Two corners will not fit in Simple mode's 920px column, nor below md.
  const narrow = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const forcedStacked = narrow || simpleMode;
  const stacked = isStacked || forcedStacked;

  // Drop the one-shot param so a refresh does not reopen the picker.
  useEffect(() => {
    if (params.get('setup') !== '1') return;
    const next = new URLSearchParams(params);
    next.delete('setup');
    setParams(next, { replace: true });
  }, [params, setParams]);

  // Built-ins by name, plus any department the company named itself.
  const departmentOptions = useMemo(() => {
    const enabled = configured.filter((c) => c.enabled);
    const list = enabled.length
      ? enabled.map((c) => ({
          id: c.department,
          label: c.label || DEPARTMENT_BY_ID[c.department]?.label || c.department,
        }))
      : DEPARTMENTS;
    return [{ id: 'all', label: 'All departments' }, ...list];
  }, [configured]);

  const totals = board?.totals;
  const statCards = useMemo(() => {
    const t = totals || {};
    return [
      {
        key: 'jobs',
        label: 'Jobs',
        value: t.jobs ?? 0,
        helper: 'In this window',
        icon: StadiumOutlinedIcon,
        color: theme.palette.primary.main,
      },
      {
        key: 'people',
        label: 'People delivered',
        value: t.people ?? 0,
        helper: 'Registered by your team',
        icon: PersonOutlineOutlinedIcon,
        color: theme.palette.info.main,
      },
      {
        key: 'agents',
        label: 'Agents delivered',
        value: t.agents ?? 0,
        helper: 'Produced by agents',
        icon: SmartToyOutlinedIcon,
        color: theme.palette.secondary?.main || theme.palette.primary.main,
      },
      {
        key: 'decided',
        label: 'Decided',
        value: t.decided ?? 0,
        helper: 'Verdict recorded',
        icon: EmojiEventsOutlinedIcon,
        color: theme.palette.success.main,
      },
      {
        key: 'saved',
        label: 'Agents saved',
        value: t.savedMoney ? money(t.savedMoney) : DASH,
        helper: t.savedMinutes ? duration(t.savedMinutes) : 'Set rates to see money',
        icon: t.savedMoney ? SavingsOutlinedIcon : ScheduleOutlinedIcon,
        color: theme.palette.warning.main,
      },
    ];
  }, [totals, theme]);

  const act = async (fn, msg) => {
    try {
      await fn();
      setNotice(null);
      await refetch();
      if (msg) setNotice({ severity: 'success', text: msg });
    } catch (err) {
      setNotice({ severity: 'error', text: err.message });
    }
  };

  const onRate = (taskId) => (side, rating) =>
    act(() => rateArenaSide({ task_id: taskId, side, rating }));
  const onVerdict = (taskId, winner) => act(() => recordArenaVerdict({ task_id: taskId, winner }));
  const onAction = (job) => (side) => {
    if (side === 'people') setRegisterFor(job);
    else
      act(
        () => runArenaAgent({ task_id: job.taskId, mode: 'mirror' }),
        'Agent queued on that job.'
      );
  };

  const jobs = board?.jobs || [];

  return (
    <PageLayout
      title="Arena"
      subtitle="Your people and your agents on the same daily job."
      showTitleBlock={false}
    >
      <BentoCard
        title="Arena"
        subtitle={showMetrics ? 'People and agents, same job, real numbers' : undefined}
        icon={StadiumOutlinedIcon}
        noPadding
        plainHeader
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
      >
        <Collapse in={showMetrics}>
          <Box sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 0.5 }}>
            <ArenaStatCards cards={statCards} />
          </Box>
        </Collapse>

        {/* Controls: pill tabs, then the filters for whichever view is showing. */}
        <Box
          sx={{
            px: { xs: 1.25, sm: 1.5 },
            pt: 1.25,
            pb: 1.25,
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            flexWrap: 'wrap',
          }}
        >
          <Box
            sx={{
              display: 'inline-flex',
              gap: 0.5,
              p: 0.4,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.text.primary, 0.04),
            }}
          >
            {VIEWS.map((v) => {
              const active = view === v.value;
              return (
                <Button
                  key={v.value}
                  onClick={() => setView(v.value)}
                  size="small"
                  aria-pressed={active}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    px: 1.5,
                    borderRadius: 1.5,
                    minWidth: 0,
                    color: active ? 'primary.main' : 'text.secondary',
                    bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                    '&:hover': {
                      bgcolor: active
                        ? alpha(theme.palette.primary.main, 0.16)
                        : alpha(theme.palette.text.primary, 0.04),
                    },
                  }}
                >
                  {v.label}
                </Button>
              );
            })}
          </Box>

          {view === 'board' && (
            <>
              <TextField
                select
                size="small"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                sx={{ minWidth: 170 }}
                inputProps={{ 'aria-label': 'Department' }}
              >
                {departmentOptions.map((d) => (
                  <MenuItem key={d.id} value={d.id}>
                    {d.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                sx={{ minWidth: 145 }}
                inputProps={{ 'aria-label': 'Job status' }}
              >
                {STATUSES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>
                    {s.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                placeholder="Find a job"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                sx={{ minWidth: 170, flex: 1, maxWidth: 320 }}
                inputProps={{ 'aria-label': 'Find a job' }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <AppIcon
                        name="SearchOutlined"
                        fallback={SearchOutlinedIcon}
                        sx={{ fontSize: 18 }}
                      />
                    </InputAdornment>
                  ),
                }}
              />
            </>
          )}

          <Box sx={{ flex: 1 }} />

          {view === 'board' && (
            <ArenaLayoutSwitch
              forcedStacked={forcedStacked}
              forcedReason={
                simpleMode
                  ? 'Simple mode uses a narrow column, so the two corners stack.'
                  : 'This screen is too narrow for two corners side by side.'
              }
            />
          )}

          <Button
            size="small"
            onClick={() => setGuideStep('rates')}
            startIcon={
              <AppIcon name="PaidOutlined" fallback={PaidOutlinedIcon} sx={{ fontSize: 16 }} />
            }
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Rates
          </Button>
          <Button
            size="small"
            onClick={() => setGuideStep('departments')}
            startIcon={
              <AppIcon name="TuneOutlined" fallback={TuneOutlinedIcon} sx={{ fontSize: 16 }} />
            }
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Departments
          </Button>
          <Button
            size="small"
            onClick={refetch}
            aria-label="Refresh"
            startIcon={
              <AppIcon
                name="RefreshOutlined"
                fallback={RefreshOutlinedIcon}
                sx={{ fontSize: 16 }}
              />
            }
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Refresh
          </Button>
        </Box>

        <Box
          sx={{
            px: { xs: 1.25, sm: 1.5 },
            pb: { xs: 1.25, sm: 1.5 },
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {notice && (
            <Alert severity={notice.severity} onClose={() => setNotice(null)}>
              {notice.text}
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}

          {!loading && !isConfigured && (
            <Alert
              severity="info"
              action={
                <Button
                  size="small"
                  onClick={() => setGuideStep('departments')}
                  sx={{ fontWeight: 700 }}
                >
                  Set up
                </Button>
              }
            >
              Tell Arena which departments you run, and it starts keeping score by department.
            </Alert>
          )}

          {loading ? (
            <LoadingSpinner />
          ) : view === 'decide' ? (
            <>
              <ArenaSectionLabel>The call</ArenaSectionLabel>
              <DecisionPanel
                decision={decision}
                onSetRates={() => setGuideStep('rates')}
                onOpenDepartment={(id) => {
                  setDepartment(id);
                  setView('board');
                }}
              />
              <ExceptionsCard exceptions={exceptions} />
            </>
          ) : view === 'scoreboard' ? (
            <>
              <ArenaSectionLabel>By department</ArenaSectionLabel>
              <ArenaScoreboard scoreboard={scoreboard} loading={loading} />
            </>
          ) : (
            <>
              <ArenaSectionLabel>
                Job list{jobs.length ? ` · ${jobs.length}` : ''}
              </ArenaSectionLabel>

              {jobs.length === 0 ? (
                <EmptyState
                  title="No jobs in this window"
                  description="Arena reads your task list. Once a task has someone assigned, it shows up here with both corners waiting."
                />
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {jobs.map((job) => (
                    <ArenaJobCard
                      key={job.taskId}
                      job={job}
                      stacked={stacked}
                      onRate={onRate(job.taskId)}
                      onVerdict={onVerdict}
                      onAction={onAction(job)}
                    />
                  ))}
                </Box>
              )}

              <ArenaSectionLabel sx={{ mt: 1 }}>By department</ArenaSectionLabel>
              <ArenaScoreboard scoreboard={scoreboard} loading={loading} />
            </>
          )}
        </Box>
      </BentoCard>

      <ArenaGuideDialog
        open={guideStep !== null}
        initialStep={guideStep ?? 0}
        onClose={() => {
          setGuideStep(null);
          reloadSetup();
          refetch();
        }}
        onFinished={() => {
          reloadSetup();
          refetch();
        }}
      />
      <RegisterResultDialog
        open={!!registerFor}
        job={registerFor}
        onClose={() => setRegisterFor(null)}
        onRegistered={refetch}
      />
    </PageLayout>
  );
}
