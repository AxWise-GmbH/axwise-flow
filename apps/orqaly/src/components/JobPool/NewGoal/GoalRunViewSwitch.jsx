import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import GlassIcon from '../../icons/GlassIcon';
import useGoalRunView from './useGoalRunView';

const CHOICES = [
  {
    value: 'thread',
    label: 'Thread',
    icon: 'ForumOutlined',
    fallback: ForumOutlinedIcon,
    hint: 'Watch the run report into the conversation you wrote it in.',
  },
  {
    value: 'dashboard',
    label: 'Dashboard',
    icon: 'DashboardOutlined',
    fallback: DashboardOutlinedIcon,
    hint: 'Pipeline, Work Log, Report and Result on one screen.',
  },
];

/**
 * Pick how a running goal is shown.
 *
 * Both shapes ship so they can be compared on real runs. The thread keeps one
 * surface from first sentence to deliverable; the dashboard trades that
 * continuity for density when a run is long or goes wrong.
 */
export default function GoalRunViewSwitch({ size = 'small' }) {
  const { view, setView } = useGoalRunView();

  return (
    <ToggleButtonGroup
      exclusive
      size={size}
      value={view}
      onChange={(_, next) => next && setView(next)}
      aria-label="How to show the run"
      sx={{
        '& .MuiToggleButton-root': {
          textTransform: 'none',
          fontSize: '0.7rem',
          fontWeight: 600,
          px: 1.25,
          py: 0.4,
          gap: 0.6,
          borderRadius: '8px !important',
          border: '1px solid !important',
        },
      }}
    >
      {CHOICES.map((choice) => (
        <ToggleButton key={choice.value} value={choice.value} aria-label={choice.label}>
          <Tooltip title={choice.hint}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <GlassIcon name={choice.icon} fallback={choice.fallback} size={14} />
              {choice.label}
            </span>
          </Tooltip>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export { CHOICES as GOAL_RUN_VIEW_CHOICES };
