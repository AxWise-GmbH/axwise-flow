import { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import GlassIcon from '../../icons/GlassIcon';
import { availableGoalActions, runGoalAction } from '../../Goals/goalActions';

/**
 * The controls that belong to a blocked message, inside the message.
 *
 * A thread that reports a problem and then offers nothing is a dead end: the
 * user has to leave, find the goal elsewhere and work out which button applies.
 * These are the same handlers the team lead chat runs, so behaviour matches
 * wherever a goal is resolved from.
 *
 * Nothing here refetches. The run is already on Supabase Realtime with a 5s
 * poll behind it, so the stage log updates on its own; the button only has to
 * report that the request went through.
 */
export default function GoalRunActions({ actions, goal, onResult = null, onReviewContext = null }) {
  const theme = useTheme();
  // 'idle' | 'running' | 'done' | 'error', keyed by action index
  const [state, setState] = useState({});
  const [errors, setErrors] = useState({});
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState('');

  // Only what the server would accept for this goal as it stands. A control
  // that returns 400 is worse than no control: the message looks actionable and
  // the click leaves the user exactly where they were.
  const offered = availableGoalActions(actions, goal);
  if (!offered.length || !goal?.id) return null;

  const run = async (action, index) => {
    setState((s) => ({ ...s, [index]: 'running' }));
    const params = action.field ? { ...action.params, [action.field]: draft } : action.params;
    const result = await runGoalAction({ ...action, params }, goal);
    setState((s) => ({ ...s, [index]: result.ok ? 'done' : 'error' }));
    if (!result.ok) setErrors((e) => ({ ...e, [index]: result.error }));
    if (result.ok) {
      setOpen(null);
      setDraft('');
    }
    onResult?.(result, action);
  };

  const click = (action, index) => {
    // Gate 1 is a contract review, not a one-click acknowledgement. The Simple
    // thread opens the full canonical scope dialog so the user can inspect the
    // packet before the approval service is called.
    if (action.type === 'approve_context' && typeof onReviewContext === 'function') {
      onReviewContext();
      return;
    }
    // An action that needs a value asks for it first, in place.
    if (action.field && open !== index) {
      setOpen(index);
      setDraft(String(action.params?.[action.field] ?? ''));
      return;
    }
    run(action, index);
  };

  return (
    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {offered.map((action, index) => {
          const status = state[index] || 'idle';
          const primary = index === 0;
          return (
            <Button
              key={action.type + index}
              size="small"
              disabled={status === 'running' || status === 'done'}
              onClick={() => click(action, index)}
              startIcon={
                status === 'running' ? (
                  <CircularProgress size={11} thickness={6} color="inherit" />
                ) : status === 'done' ? (
                  <GlassIcon name="Check" fallback={CheckIcon} size={12} />
                ) : null
              }
              sx={{
                textTransform: 'none',
                fontSize: '0.68rem',
                fontWeight: 650,
                py: 0.3,
                px: 1.15,
                minHeight: 0,
                borderRadius: 1.5,
                border: '1px solid',
                borderColor:
                  primary && status === 'idle'
                    ? alpha(theme.palette.primary.main, 0.4)
                    : alpha(theme.palette.divider, 0.9),
                bgcolor:
                  primary && status === 'idle'
                    ? alpha(theme.palette.primary.main, 0.12)
                    : 'transparent',
                color:
                  status === 'error'
                    ? 'error.main'
                    : status === 'done'
                      ? 'text.secondary'
                      : primary
                        ? 'primary.main'
                        : 'text.secondary',
                '&.Mui-disabled': { color: 'text.disabled' },
              }}
            >
              {status === 'done' ? `${action.label} sent` : action.label}
            </Button>
          );
        })}
      </Box>

      {open !== null && (
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
          <TextField
            autoFocus
            size="small"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') run(offered[open], open);
              if (e.key === 'Escape') setOpen(null);
            }}
            placeholder={offered[open].placeholder || 'Type a value'}
            inputProps={{
              'aria-label': offered[open].label,
              inputMode: offered[open].field === 'new_budget_usd' ? 'decimal' : 'text',
            }}
            sx={{
              flex: 1,
              '& .MuiInputBase-root': { fontSize: '0.72rem', borderRadius: 1.5 },
              '& .MuiInputBase-input': { py: 0.6 },
            }}
          />
          <Button
            size="small"
            onClick={() => run(offered[open], open)}
            disabled={!draft.trim()}
            sx={{ textTransform: 'none', fontSize: '0.68rem', fontWeight: 650, minHeight: 0 }}
          >
            Confirm
          </Button>
        </Box>
      )}

      {Object.entries(errors)
        .filter(([index]) => state[index] === 'error')
        .map(([index, message]) => (
          <Typography key={index} variant="caption" sx={{ color: 'error.main' }}>
            {offered[index]?.label} did not go through: {message}
          </Typography>
        ))}
    </Box>
  );
}
