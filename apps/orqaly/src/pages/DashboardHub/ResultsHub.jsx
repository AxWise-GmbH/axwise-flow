import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Chip,
  Button,
  IconButton,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import EmptyState from '../../components/Common/EmptyState';
import BentoCard from '../../components/Common/BentoCard';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import { listGoals } from '../../services/goalService';

import AppIcon from '../../components/icons/AppIcon';

const PAGE = 12;

/**
 * Aggregated view of every completed goal's deliverables.
 * Click a card to open the goal detail page where FinalResultsSection
 * renders the rich deliverable groups (code repos, landing pages, etc).
 */
export default function ResultsHub() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listGoals()
      .then((data) => {
        if (cancelled) return;
        const completed = (Array.isArray(data) ? data : [])
          .filter((g) => g.status === 'completed')
          .sort((a, b) => {
            const ta = new Date(a.data?.completed_at || a.updated_at || 0).getTime();
            const tb = new Date(b.data?.completed_at || b.updated_at || 0).getTime();
            return tb - ta;
          });
        setGoals(completed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    const deployments = goals.filter((g) => !!g.data?.deployment_url).length;
    const totalSpent = goals.reduce((s, g) => s + Number(g.spent_usd || 0), 0);
    return { count: goals.length, deployments, totalSpent };
  }, [goals]);

  const slice = useMemo(() => goals.slice(page * PAGE, (page + 1) * PAGE), [goals, page]);
  const hasMore = (page + 1) * PAGE < goals.length;

  if (loading) return <LoadingSpinner message="Loading your results..." />;

  if (goals.length === 0) {
    return (
      <BentoCard
        title="Results live here"
        subtitle="When goals complete, their deliverables (live sites, files, code) appear in this hub."
        icon={RocketLaunchOutlinedIcon}
        iconColor={theme.palette.success.main}
      >
        <EmptyState
          icon={
            <AppIcon
              name="RocketLaunchOutlined"
              fallback={RocketLaunchOutlinedIcon}
              sx={{ fontSize: 48, color: alpha(theme.palette.success.main, 0.6) }}
            />
          }
          title="No completed goals yet"
          description="Once a goal finishes, all its deliverables - landing pages, code, files - show up here in one place."
          action={
            <Button variant="contained" onClick={() => navigate('/dashboard')}>
              Back to Home
            </Button>
          }
        />
      </BentoCard>
    );
  }

  return (
    <Box>
      {/* Mini summary strip */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <SummaryTile
          label="Completed goals"
          value={totals.count}
          color={theme.palette.success.main}
        />
        <SummaryTile
          label="Live deployments"
          value={totals.deployments}
          color={theme.palette.info.main}
        />
        <SummaryTile
          label="Lifetime spend"
          value={`$${totals.totalSpent.toFixed(2)}`}
          color={theme.palette.primary.main}
        />
      </Stack>

      {/* Goal cards grid */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
        }}
      >
        {slice.map((g) => (
          <GoalResultCard key={g.id} goal={g} onOpen={() => navigate(`/job-pool?goalId=${g.id}`)} />
        ))}
      </Box>

      {/* Pagination */}
      {(page > 0 || hasMore) && (
        <Stack direction="row" justifyContent="center" spacing={1.5} sx={{ mt: 3 }}>
          <Button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            sx={{ textTransform: 'none' }}
          >
            ← Previous
          </Button>
          <Typography variant="body2" sx={{ alignSelf: 'center', color: 'text.secondary' }}>
            {page + 1} / {Math.max(1, Math.ceil(goals.length / PAGE))}
          </Typography>
          <Button
            disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)}
            sx={{ textTransform: 'none' }}
          >
            Next →
          </Button>
        </Stack>
      )}
    </Box>
  );
}

function SummaryTile({ label, value, color }) {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
      sx={{
        flex: 1,
        p: 1.75,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: alpha(color, 0.25),
        background: `linear-gradient(135deg, ${alpha(color, 0.06)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          color: 'text.secondary',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          fontSize: '0.7rem',
        }}
      >
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5, color }}>
        {value}
      </Typography>
    </Paper>
  );
}

function GoalResultCard({ goal, onOpen }) {
  const theme = useTheme();
  const deployment = goal.data?.deployment_url;
  const completedAt = goal.data?.completed_at || goal.updated_at;
  const phases = goal.plan?.phases || [];
  const phaseCount = phases.length;

  return (
    <Paper
      elevation={0}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      sx={{
        p: 2,
        borderRadius: 3,
        border: '1px solid',
        borderColor: alpha(theme.palette.success.main, 0.2),
        background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.06)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 60%)`,
        cursor: 'pointer',
        transition: 'transform .2s, border-color .2s, box-shadow .25s',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        '&:hover, &:focus-visible': {
          transform: 'translateY(-2px)',
          borderColor: alpha(theme.palette.success.main, 0.5),
          boxShadow: `0 8px 24px ${alpha(theme.palette.success.main, 0.12)}`,
          outline: 'none',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25 }} noWrap>
            {goal.title || '(untitled goal)'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {completedAt ? `Completed ${new Date(completedAt).toLocaleDateString()}` : 'Completed'}
            {phaseCount > 0 ? ` · ${phaseCount} phases` : ''}
            {goal.spent_usd > 0 ? ` · $${Number(goal.spent_usd).toFixed(2)}` : ''}
          </Typography>
        </Box>
        {deployment && (
          <Tooltip title="Open live deployment">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                window.open(deployment, '_blank', 'noopener');
              }}
              sx={{ color: 'success.main' }}
            >
              <AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        <Chip
          size="small"
          icon={
            <AppIcon
              name="InsightsOutlined"
              fallback={InsightsOutlinedIcon}
              sx={{ fontSize: 14 }}
            />
          }
          label="View deliverables"
          variant="outlined"
          sx={{
            height: 22,
            fontSize: '0.7rem',
            borderColor: alpha(theme.palette.success.main, 0.3),
          }}
        />
        {deployment && (
          <Chip
            size="small"
            label="Deployed"
            color="success"
            variant="filled"
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
        )}
      </Stack>
    </Paper>
  );
}
