import { useEffect, useId, useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { ASSISTANT_MODES } from './assistant-modes.js';
import { buildAssistantActivityView, retryAvailability } from './assistant-view-model.js';

const EMPTY_EVENTS = [];

function messageTime(createdAt) {
  const value = new Date(createdAt);
  if (Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(value);
}

function statusCopy(part, route, canStartNewAttempt) {
  if (part.status === 'failed') {
    if (canStartNewAttempt) return 'Orqanix could not complete this attempt.';
    return part.retryable
      ? 'Orqanix paused this turn. Please try again shortly.'
      : 'Orqanix could not complete this turn.';
  }
  if (part.status === 'cancelled') {
    return route === 'AXWISE_ONE_SHOT' ? 'Research stopped.' : 'Response stopped.';
  }
  if (part.status === 'cancel_requested') return 'Stopping…';
  return null;
}

function stepCountLabel(count) {
  return `${count} ${count === 1 ? 'step' : 'steps'}`;
}

function lifecycleSummary(part, route, activity, explicitStatus) {
  const count = stepCountLabel(activity.steps.length);
  if (part.status === 'completed') {
    if (activity.evidenceGap) return `Research completed without verifiable sources · ${count}`;
    if (route === 'AXWISE_ONE_SHOT') return `Research completed · ${count}`;
    if (['PROPOSE_GOAL', 'START_GOAL', 'CONTINUE_GOAL'].includes(route)) {
      return `${activity.headline} · ${count}`;
    }
    return `Response completed · ${count}`;
  }
  if (part.status === 'cancelled') return `${explicitStatus || activity.headline} · ${count}`;
  return explicitStatus || activity.headline;
}

export function AssistantPreparingStatus({ intent = 'assistant' }) {
  const mode = ASSISTANT_MODES[intent] || ASSISTANT_MODES.assistant;
  return (
    <Box component="section" aria-label={`${mode.label} activity`} sx={{ px: 0.25, py: 0.75 }}>
      <Stack direction="row" alignItems="center" gap={1} role="status" aria-live="polite">
        <CircularProgress size={14} thickness={5} color="inherit" aria-hidden />
        <Typography variant="body2" color="text.secondary">
          {intent === 'auto'
            ? 'Choosing the right action…'
            : `Preparing ${mode.label.toLocaleLowerCase()} turn…`}
        </Typography>
      </Stack>
    </Box>
  );
}

export function AssistantOperationStatus({
  part,
  route = 'DIRECT_ANSWER',
  events = EMPTY_EVENTS,
  busy,
  hasResearchEvidence = null,
  onRetry,
  retryAvailable,
}) {
  const contentId = useId();
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [retryClock, setRetryClock] = useState(() => Date.now());
  const activity = useMemo(
    () =>
      buildAssistantActivityView({
        events,
        route,
        status: part.status,
        hasResearchEvidence,
      }),
    [events, hasResearchEvidence, part.status, route]
  );
  const [expanded, setExpanded] = useState(activity.active);
  const availability = retryAvailability(part, retryClock);

  useEffect(() => {
    if (!availability.retryAt || availability.available) return undefined;
    const timer = window.setTimeout(
      () => setRetryClock(Date.now()),
      Math.min(Math.max(0, availability.retryAt - Date.now()) + 25, 2_147_483_647)
    );
    return () => window.clearTimeout(timer);
  }, [availability.available, availability.retryAt]);

  const canStartNewAttempt = part.status === 'failed' && part.retryMode === 'new_attempt';
  const explicitStatus = statusCopy(part, route, canStartNewAttempt);
  const failure = part.status === 'failed';
  const summary = lifecycleSummary(part, route, activity, explicitStatus);
  const stepCount = stepCountLabel(activity.steps.length);

  return (
    <Box
      component="section"
      aria-label={`${activity.mode.label} activity`}
      sx={{
        px: failure ? 1.25 : 0.25,
        py: failure ? 1 : 0.5,
        border: failure ? '1px solid' : 0,
        borderColor: failure ? 'error.main' : 'transparent',
        borderRadius: failure ? 1.5 : 0,
        bgcolor: failure ? 'action.hover' : 'transparent',
      }}
    >
      <Stack spacing={0.5}>
        <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap" minHeight={36}>
          {activity.active ? (
            <CircularProgress size={14} thickness={5} color="inherit" aria-hidden />
          ) : (
            <Box
              aria-hidden
              sx={{
                width: 7,
                height: 7,
                ml: 0.45,
                mr: 0.45,
                borderRadius: '50%',
                bgcolor: failure
                  ? 'error.main'
                  : activity.evidenceGap
                    ? 'warning.main'
                    : 'text.secondary',
              }}
            />
          )}
          <Box sx={{ minWidth: 160, flex: 1 }} role="status" aria-live="polite">
            <Typography
              variant="body2"
              color={failure ? 'error' : activity.evidenceGap ? 'warning.main' : 'text.primary'}
              fontWeight={failure ? 700 : 600}
            >
              {summary}
            </Typography>
          </Box>
          <Button
            type="button"
            size="small"
            color="inherit"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((value) => !value)}
            sx={{
              minWidth: 44,
              minHeight: 36,
              px: 0.75,
              flexShrink: 0,
              color: 'text.secondary',
              textTransform: 'none',
            }}
          >
            {expanded ? 'Hide activity' : `View activity · ${stepCount}`}
          </Button>
          {canStartNewAttempt && retryAvailable ? (
            <Button
              size="small"
              variant="outlined"
              color="error"
              disabled={busy || !availability.available}
              onClick={onRetry}
              sx={{ minHeight: 36, flexShrink: 0, textTransform: 'none' }}
            >
              Retry
            </Button>
          ) : null}
        </Stack>

        <Collapse in={expanded} timeout={reduceMotion ? 0 : 'auto'} unmountOnExit>
          <Box id={contentId} sx={{ pl: 3.1, pt: 0.25, pb: 0.5 }}>
            <Stack component="ol" role="list" spacing={0.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {activity.steps.map((step) => (
                <Stack
                  component="li"
                  key={step.key}
                  direction="row"
                  gap={0.75}
                  alignItems="flex-start"
                >
                  <Box
                    aria-hidden
                    sx={{
                      width: 6,
                      height: 6,
                      mt: 0.75,
                      flexShrink: 0,
                      borderRadius: '50%',
                      border: '1px solid',
                      borderColor:
                        step.state === 'failed'
                          ? 'error.main'
                          : step.state === 'active'
                            ? 'text.primary'
                            : 'text.disabled',
                      bgcolor:
                        step.state === 'failed'
                          ? 'error.main'
                          : step.state === 'completed'
                            ? 'text.secondary'
                            : 'transparent',
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    <Box component="span" sx={{ color: 'text.primary', fontWeight: 650 }}>
                      {step.label}
                    </Box>
                    {step.detail ? ` — ${step.detail}` : null}
                  </Typography>
                </Stack>
              ))}
            </Stack>
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ display: 'block', mt: 0.75, fontSize: '0.6875rem' }}
            >
              Verified execution activity—not private model reasoning.
            </Typography>
          </Box>
        </Collapse>

        {canStartNewAttempt && !availability.available && part.retryAt ? (
          <Typography variant="caption" color="text.secondary" sx={{ pl: 3.1 }}>
            Retry available {messageTime(part.retryAt)}.
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}
