import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Chip,
  Button,
  CircularProgress,
  alpha,
  useTheme,
} from '@mui/material';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { listGoals } from '../../../services/goalService';
import { buildOrgDeepLink } from './orgDrawerConstants';

import AppIcon from '../../icons/AppIcon';

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
        p: 1.5,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: alpha(theme.palette.success.main, 0.2),
        cursor: 'pointer',
        mb: 1,
        '&:hover': { borderColor: alpha(theme.palette.success.main, 0.45) },
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
        {goal.title || '(untitled goal)'}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {completedAt ? `Completed ${new Date(completedAt).toLocaleDateString()}` : 'Completed'}
        {goal.spent_usd > 0 ? ` · $${Number(goal.spent_usd).toFixed(2)}` : ''}
      </Typography>
      {deployment && (
        <Chip
          size="small"
          label="Deployed"
          color="success"
          sx={{ mt: 0.75, height: 20, fontSize: '0.65rem' }}
        />
      )}
    </Paper>
  );
}

export default function OrgResultsTab({ orgId }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    listGoals('completed')
      .then((data) => {
        if (cancelled) return;
        const completed = (Array.isArray(data) ? data : [])
          .filter((g) => g.org_id === orgId)
          .sort((a, b) => {
            const ta = new Date(a.data?.completed_at || a.updated_at || 0).getTime();
            const tb = new Date(b.data?.completed_at || b.updated_at || 0).getTime();
            return tb - ta;
          });
        setGoals(completed);
      })
      .catch(() => {
        if (!cancelled) setGoals([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const totals = useMemo(() => {
    const deployments = goals.filter((g) => !!g.data?.deployment_url).length;
    const totalSpent = goals.reduce((s, g) => s + Number(g.spent_usd || 0), 0);
    return { count: goals.length, deployments, totalSpent };
  }, [goals]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (goals.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <AppIcon
          name="RocketLaunchOutlined"
          fallback={RocketLaunchOutlinedIcon}
          sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }}
        />
        <Typography color="text.secondary" variant="body2">
          No completed goals for this organization yet
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <SummaryTile label="Completed" value={totals.count} color={theme.palette.success.main} />
        <SummaryTile
          label="Deployments"
          value={totals.deployments}
          color={theme.palette.info.main}
        />
        <SummaryTile
          label="Spend"
          value={`$${totals.totalSpent.toFixed(2)}`}
          color={theme.palette.primary.main}
        />
      </Stack>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button
          size="small"
          endIcon={<AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 14 }} />}
          onClick={() =>
            navigate(buildOrgDeepLink('/job-pool', orgId, { tab: 'goals', status: 'completed' }))
          }
          sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.75rem' }}
        >
          View all in Job Pool
        </Button>
      </Box>
      {goals.slice(0, 8).map((g) => (
        <GoalResultCard key={g.id} goal={g} onOpen={() => navigate(`/job-pool?goalId=${g.id}`)} />
      ))}
      {goals.length > 8 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', textAlign: 'center', mt: 1 }}
        >
          + {goals.length - 8} more — open Job Pool to see all
        </Typography>
      )}
    </>
  );
}
