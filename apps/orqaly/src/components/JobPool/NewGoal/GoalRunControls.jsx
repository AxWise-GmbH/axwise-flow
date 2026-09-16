/**
 * Stop and start a run from the composer it was typed into.
 *
 * Until now the only way to pause a goal in Simple mode was the Actions
 * dropdown in the top bar - two clicks, and nothing on the goal surface itself
 * said the run could be stopped at all.
 *
 * One button, not two. It shows the thing that will happen next: stop while the
 * run is going, play once it is stopped. A pair would always have had one dead
 * half on screen, and the dead half is the one you are not allowed to press.
 *
 * Stop means pause, not cancel: it writes the existing `paused` status and play
 * puts it back to `active`. Cancel stays in the Actions menu, where ending a
 * goal for good is a deliberate trip rather than a neighbour of the button you
 * reach for to catch your breath.
 *
 * While the run is in neither state the button stays on screen, disabled, with
 * the reason. The server only pauses an `active` goal and only resumes a
 * `paused` one (goals.js handleLifecycle), so a live button at any other moment
 * would return a 409 the user can do nothing about; saying why up front is the
 * same information without the failed call.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  IconButton,
  Snackbar,
  Tooltip,
  alpha,
  useTheme,
} from '@mui/material';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import GlassIcon from '../../icons/GlassIcon';
import useGoalActions from '../../Goals/useGoalActions';
import { retryGoalPickup } from '../../../services/goalService';
import { isTerminalStatus, runStageCopy } from './runStageCopy';

const PICKUP_RETRY_GOAL_STATUSES = new Set([
  'feasibility',
  'analyzing',
  'researching_customer',
  'planning',
  'forming_team',
  'provisioning_tools',
  'estimating',
  'active',
]);
const PICKUP_VERIFICATION_DELAY_MS = 3_000;
const PICKUP_VERIFICATION_INTERVAL_MS = 5_000;
// Keep watching beyond the server's five-minute stale-running lease boundary.
// This lets an open Preview discover a crashed claim and recover its exact
// signed snapshot without turning this component into a permanent poller.
const PICKUP_VERIFICATION_SESSION_MS = 7 * 60_000;
const PICKUP_RETRY_JOB_STATUSES = new Set(['queued', 'running']);
const PICKUP_VERIFICATION_STOP_GOAL_STATUSES = new Set([
  'awaiting_context_approval',
  'awaiting_approval',
  'awaiting_tools',
  'awaiting_po_input',
  'paused',
  'needs_human',
  'pending_validation',
  'completed',
  'failed',
  'cancelled',
]);

export default function GoalRunControls({
  goal = null,
  onRefresh,
  verifyPickupProjection = false,
}) {
  const theme = useTheme();
  const { run, pending, error, clearError } = useGoalActions(goal?.id, { onRefresh });
  const [pickupPending, setPickupPending] = useState(false);
  const [pickupError, setPickupError] = useState('');
  const [pickupCooldownUntil, setPickupCooldownUntil] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const automaticPickupAttempts = useRef(new Set());
  const onRefreshRef = useRef(onRefresh);
  const pickupVerificationSession = useRef(null);

  const status = goal?.status;
  const pickup = goal?.worker_pickup;
  const retryAvailableAt = Date.parse(pickup?.retry_available_at || '');
  const pickupCapability = String(pickup?.capability || '').trim();
  const automaticPickupKey = goal?.id && pickupCapability ? `${goal.id}:${pickupCapability}` : '';
  const hasPreviewPickup = Boolean(
    automaticPickupKey &&
    PICKUP_RETRY_GOAL_STATUSES.has(status) &&
    pickup?.worker_scope === 'preview' &&
    PICKUP_RETRY_JOB_STATUSES.has(pickup?.status)
  );
  const canVerifyPickup = verifyPickupProjection && typeof onRefresh === 'function';
  const mustStopPickupVerification = PICKUP_VERIFICATION_STOP_GOAL_STATUSES.has(status);
  const hasIncompatiblePickupProjection = Boolean(pickup) && !hasPreviewPickup;
  const canRetryPickup = Boolean(
    goal?.id &&
    hasPreviewPickup &&
    Number.isFinite(retryAvailableAt) &&
    clock >= retryAvailableAt &&
    clock >= pickupCooldownUntil
  );

  const handleRetryPickup = useCallback(
    async ({ automatic = false } = {}) => {
      if (!goal?.id) return;
      // A manual click also consumes this job snapshot's automatic attempt, so
      // the post-render effect cannot race the user's fresh top-level request.
      if (automaticPickupKey) automaticPickupAttempts.current.add(automaticPickupKey);
      setPickupPending(true);
      setPickupError('');
      try {
        await retryGoalPickup(goal.id, pickupCapability);
        if (!automatic) {
          // Avoid turning the manual operational recovery into a rapid-fire
          // control. Automatic recovery leaves the button visible as a fallback
          // until Realtime reports that the exact job was claimed.
          const cooldownUntil = Date.now() + 60_000;
          setPickupCooldownUntil(cooldownUntil);
          setClock(Date.now());
        }
        // Automatic recovery is followed by the delayed full-projection loop
        // below. Manual recovery still refreshes immediately for direct UI
        // feedback, then the same loop verifies any queued sibling snapshot.
        if (!automatic) await onRefreshRef.current?.();
      } catch (retryError) {
        setPickupError(retryError?.message || 'Could not wake the Preview worker.');
      } finally {
        setPickupPending(false);
      }
    },
    [automaticPickupKey, goal?.id, pickupCapability]
  );

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  // The API supplies the server-derived retry time. Wake the component exactly
  // when it becomes actionable, even if Realtime is connected and no goal row
  // changes while its internal queue job waits.
  useEffect(() => {
    const current = Date.now();
    const nextTimes = [retryAvailableAt, pickupCooldownUntil].filter(
      (value) => Number.isFinite(value) && value > current
    );
    if (!nextTimes.length) return undefined;
    const timer = setTimeout(() => setClock(Date.now()), Math.min(...nextTimes) - current + 25);
    return () => clearTimeout(timer);
  }, [retryAvailableAt, pickupCooldownUntil, clock]);

  useEffect(() => {
    setPickupCooldownUntil(0);
    setPickupError('');
    setClock(Date.now());
  }, [automaticPickupKey, goal?.id]);

  // Realtime watches the goal row, but worker_pickup is an API projection over
  // agent_jobs. Verify that projection separately. The last valid capability
  // owns a bounded session through brief A -> null -> B projection gaps. The
  // server now projects signed running leases too, and each changed lease gets
  // a fresh capability/session. Serialized timeouts avoid overlapping full
  // goal/message/task refreshes on a slow connection.
  useEffect(() => {
    if (
      !canVerifyPickup ||
      !goal?.id ||
      mustStopPickupVerification ||
      hasIncompatiblePickupProjection
    ) {
      pickupVerificationSession.current = null;
      return undefined;
    }

    const now = Date.now();
    const currentSession = pickupVerificationSession.current;
    if (hasPreviewPickup && automaticPickupKey && currentSession?.key !== automaticPickupKey) {
      pickupVerificationSession.current = {
        key: automaticPickupKey,
        goalId: goal.id,
        expiresAt: now + PICKUP_VERIFICATION_SESSION_MS,
      };
    }

    const session = pickupVerificationSession.current;
    if (!session || session.goalId !== goal.id || session.expiresAt <= now) {
      pickupVerificationSession.current = null;
      return undefined;
    }

    let cancelled = false;
    let timer = null;
    const scheduleNextTick = (delay) => {
      if (cancelled) return;
      const remaining = session.expiresAt - Date.now();
      if (remaining <= 0) {
        if (pickupVerificationSession.current?.key === session.key) {
          pickupVerificationSession.current = null;
        }
        return;
      }
      timer = setTimeout(verifyPickupProjectionTick, Math.min(delay, remaining));
    };
    const verifyPickupProjectionTick = async () => {
      if (Date.now() >= session.expiresAt) {
        if (pickupVerificationSession.current?.key === session.key) {
          pickupVerificationSession.current = null;
        }
        return;
      }
      // Smart Request can stay mounted in a background tab for a long run.
      // Match GoalDetailDialog's polling discipline so hidden tabs do not spend
      // the API budget on a projection the user cannot currently act on.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        scheduleNextTick(PICKUP_VERIFICATION_INTERVAL_MS);
        return;
      }
      try {
        await onRefreshRef.current?.();
      } catch {
        // The snapshot stays mounted after a transient read failure, so the next
        // interval can verify it without turning polling into UI noise.
      } finally {
        scheduleNextTick(PICKUP_VERIFICATION_INTERVAL_MS);
      }
    };

    scheduleNextTick(PICKUP_VERIFICATION_DELAY_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    automaticPickupKey,
    canVerifyPickup,
    goal?.id,
    hasIncompatiblePickupProjection,
    hasPreviewPickup,
    mustStopPickupVerification,
  ]);

  // Vercel Preview has no Cron consumer. Once the server's normal pickup
  // window expires, issue one browser-originated recovery for this exact signed
  // snapshot. Queued work is woken as-is; stale running work is first recovered
  // by an exact server-side lease CAS. The API still rejects Production,
  // human-gated, terminal, fresh, foreign, and raced snapshots.
  useEffect(() => {
    if (!canRetryPickup || pickupPending || !automaticPickupKey) return;
    if (automaticPickupAttempts.current.has(automaticPickupKey)) return;
    automaticPickupAttempts.current.add(automaticPickupKey);
    void handleRetryPickup({ automatic: true });
  }, [automaticPickupKey, canRetryPickup, handleRetryPickup, pickupPending]);

  // A finished goal will never pause or resume again. A permanently dead button
  // would be noise, not information.
  if (isTerminalStatus(status)) return null;

  const started = Boolean(goal?.id);
  const running = status === 'active';
  const paused = status === 'paused';

  // Paused is the only state that offers play; everything else is either a stop
  // or a stop-in-waiting, so the button wears the stop face by default.
  const showPlay = paused;
  const stage = started ? runStageCopy(status).headline.toLowerCase() : '';

  const title = running
    ? 'Stop the goal'
    : paused
      ? 'Start the goal again'
      : !started
        ? 'The goal has not started yet.'
        : `Only a running goal can be stopped - this one is still ${stage}.`;

  const tone = showPlay ? theme.palette.success.main : theme.palette.warning.main;
  const disabled = (!running && !paused) || Boolean(pending);
  const displayedError = pickupError || error;
  const clearDisplayedError = () => {
    setPickupError('');
    clearError();
  };

  return (
    <>
      <Tooltip title={title}>
        {/* span keeps the tooltip working while the button is disabled - which
            is most of a run, and exactly when the reason matters */}
        <span>
          <IconButton
            size="small"
            onClick={() => run(showPlay ? 'resume' : 'pause')}
            disabled={disabled}
            aria-label={showPlay ? 'Start the goal' : 'Stop the goal'}
            sx={{
              border: '1px solid',
              borderColor: disabled ? alpha(theme.palette.text.primary, 0.12) : alpha(tone, 0.35),
              borderRadius: 2,
              color: disabled ? 'text.disabled' : tone,
              p: 0.5,
              '&:hover': { bgcolor: alpha(tone, 0.1) },
            }}
          >
            {pending ? (
              <CircularProgress size={16} sx={{ color: 'text.disabled' }} />
            ) : (
              <GlassIcon
                name={showPlay ? 'PlayCircleOutlined' : 'StopCircleOutlined'}
                fallback={showPlay ? PlayCircleOutlinedIcon : StopCircleOutlinedIcon}
                size={16}
              />
            )}
          </IconButton>
        </span>
      </Tooltip>

      {canRetryPickup && (
        <Tooltip
          title={
            pickup?.status === 'running'
              ? 'This Preview worker stopped reporting progress. Recover its stale running lease.'
              : 'This Preview run has waited too long for a worker. Retry the existing queued job.'
          }
        >
          <span>
            <Button
              size="small"
              variant="outlined"
              onClick={() => handleRetryPickup()}
              disabled={pickupPending}
              startIcon={
                pickupPending ? (
                  <CircularProgress size={14} sx={{ color: 'text.disabled' }} />
                ) : (
                  <ReplayOutlinedIcon sx={{ fontSize: 16 }} />
                )
              }
              sx={{
                ml: 0.5,
                borderColor: alpha(theme.palette.info.main, 0.35),
                borderRadius: 2,
                color: theme.palette.info.main,
                minWidth: 0,
                px: 1,
                py: 0.35,
                textTransform: 'none',
                fontSize: '0.75rem',
                lineHeight: 1.25,
                '&:hover': { bgcolor: alpha(theme.palette.info.main, 0.1) },
              }}
            >
              {pickupPending
                ? pickup?.status === 'running'
                  ? 'Recovering worker…'
                  : 'Waking worker…'
                : pickup?.status === 'running'
                  ? 'Recover worker'
                  : 'Retry pickup'}
            </Button>
          </span>
        </Tooltip>
      )}

      <Snackbar
        open={Boolean(displayedError)}
        autoHideDuration={6000}
        onClose={clearDisplayedError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="error"
          variant="filled"
          onClose={clearDisplayedError}
          sx={{ width: '100%' }}
        >
          {displayedError}
        </Alert>
      </Snackbar>
    </>
  );
}
