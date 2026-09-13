import { useState } from 'react';
import { Box, Button, Snackbar, Alert, alpha, useTheme } from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { useNavigate } from 'react-router-dom';
import GlassIcon from '../icons/GlassIcon';
import GoalActionsMenu from '../Goals/GoalActionsMenu';
import useGoalActions from '../Goals/useGoalActions';
import { useRunningGoal } from '../../context/RunningGoalContext';
import { clearOpenGoalId } from '../../hooks/useOpenGoal';
import { resetGoalSetup } from '../../hooks/useGoalSetup';

/**
 * The running goal's Actions menu, in the fixed top bar.
 *
 * It used to sit in the thread's own header, which scrolls with the
 * conversation: on any run longer than a screen the only control that can
 * pause, cancel or hand the goal off scrolled out of reach exactly when the run
 * was long enough to want it. Here it does not move.
 *
 * Renders nothing when no page has published a goal, which is most of the time.
 *
 * The menu it opens is the Simple one: no Goal View toggle (the run header has
 * its own Thread/Dashboard switch) and no Talk with Team-Lead (the composer
 * under the thread already is that).
 *
 * Beside it, "+ New". A goal is a place you stay in until you leave it
 * deliberately, so this is the deliberate way out: it hands the surface back
 * its empty composer. The run it leaves is not cancelled - it keeps going, and
 * History reopens it.
 */
export default function TopBarGoalActions() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const { goal, handlers } = useRunningGoal();
  const { run, pending, error, clearError } = useGoalActions(goal?.id, {
    onRefresh: handlers.onRefresh,
    onLeave: handlers.onLeave,
  });

  if (!goal?.id) return null;

  const openGoal = () => handlers.onOpenGoal?.(goal.id);
  const startNewGoal = () => {
    // The shell must own the durable way out. A page callback is useful for
    // cleaning up its local thread, but it can be absent or stale while a new
    // deployment replaces the page below the fixed top bar. Clear both pieces
    // of cross-page goal state here, then open the canonical create route.
    clearOpenGoalId();
    resetGoalSetup();
    setAnchor(null);
    try {
      handlers.onLeave?.();
    } finally {
      navigate('/job-pool?action=create');
    }
  };

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        onClick={(event) => setAnchor(event.currentTarget)}
        disabled={Boolean(pending)}
        endIcon={<GlassIcon name="ArrowDropDown" fallback={ArrowDropDownIcon} size={16} />}
        sx={{
          flexShrink: 0,
          textTransform: 'none',
          fontSize: '0.74rem',
          fontWeight: 600,
          borderRadius: 2,
          borderColor: alpha(theme.palette.text.primary, 0.18),
          color: 'text.primary',
        }}
      >
        {pending ? 'Working…' : 'Actions'}
      </Button>

      {/* Named, not a glyph. A bare + in a glass circle read as one more
          decoration in a row of them; the word says what it does without a
          hover, and it sits in the same outlined shape as Actions. */}
      <Button
        size="small"
        variant="outlined"
        onClick={startNewGoal}
        sx={{
          flexShrink: 0,
          textTransform: 'none',
          fontSize: '0.74rem',
          fontWeight: 600,
          borderRadius: 2,
          borderColor: alpha(theme.palette.text.primary, 0.18),
          color: 'text.primary',
          px: 1.1,
          minWidth: 0,
        }}
      >
        + New
      </Button>

      <GoalActionsMenu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        goal={goal}
        onAction={run}
        onSetupTools={openGoal}
        onCloseDialog={handlers.onLeave}
        onHeal={openGoal}
        // Adopt, implement, pulse and workflow each open their own dialog and
        // belong to the full goal view. Hand off rather than half-build them.
        onOpenDialog={openGoal}
        onOpenContinuation={(id) => handlers.onOpenGoal?.(id)}
        fullView
        onToggleFullView={openGoal}
        simple
      />

      {/* The thread used to show this inline, under the header the button was
          in. From the top bar there is no such place, and a failed Pause that
          says nothing leaves the user unsure whether the run is still going. */}
      <Snackbar
        open={Boolean(error)}
        autoHideDuration={6000}
        onClose={clearError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Box>
          <Alert severity="error" onClose={clearError} sx={{ fontSize: '0.8rem' }}>
            {error}
          </Alert>
        </Box>
      </Snackbar>
    </>
  );
}
