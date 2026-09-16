import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { buildHref, buildState, openBuildQuestions } from './workflow-build-presentation.js';

function cardState(build, solution) {
  if (solution) {
    if (solution.lastError || ['deployment_unknown', 'outcome_unknown'].includes(solution.status))
      return {
        label: 'Needs attention',
        color: 'warning',
        next: 'Check the last confirmed state before running again.',
      };
    const states = {
      active: {
        label: 'Ready to run',
        color: 'success',
        next: 'Open the workflow to run it, see results or ask for a change.',
      },
      paused: {
        label: 'Paused',
        color: 'default',
        next: 'Production calls are paused. Your workflow and results are saved.',
      },
      ready: {
        label: 'Not active yet',
        color: 'info',
        next: 'Check the test results, then turn on this version when ready.',
      },
      deploying: {
        label: 'Preparing runtime',
        color: 'info',
        next: 'Waiting for the isolated runtime to confirm this version.',
      },
      draft: {
        label: 'Ready for setup',
        color: 'default',
        next: 'The reviewed workflow is saved. Deployment still needs your approval.',
      },
    };
    return (
      states[solution.status] || {
        label: 'Status unavailable',
        color: 'warning',
        next: 'Open the workflow to check its saved state.',
      }
    );
  }
  if (build.solutionId)
    return {
      label: 'Workflow saved',
      color: 'success',
      next: 'Open the workflow to see its current runtime status and results.',
    };
  if (['failed', 'cancelled', 'unsupported'].includes(build.status))
    return buildState(build.status);
  if (build.testEvidence?.status === 'outcome_unknown')
    return {
      label: 'Needs attention',
      color: 'warning',
      next: 'The last execution is unconfirmed. Check its evidence before retrying.',
    };
  if (['queued', 'running'].includes(build.testEvidence?.status)) return buildState('testing');
  if (['designing', 'testing', 'repairing'].includes(build.progress?.stage))
    return buildState(build.progress.stage);
  return buildState(build.status);
}

export function WorkflowBuildCard({ build, solution, onOpenWorkflow, onOpenBuild }) {
  const state = cardState(build, solution);
  const question = build && !build.solutionId ? openBuildQuestions(build)[0] : null;
  const solutionId = solution?.id || build?.solutionId;
  const name =
    solution?.name ||
    (build?.name && build.name !== 'Workflow build' ? build.name : 'Your workflow');
  const description = solution?.purpose || build?.purpose || build?.instruction;
  const target = solutionId
    ? `/workspace/solutions/${encodeURIComponent(solutionId)}`
    : buildHref(build.id);
  return (
    <Paper
      component="article"
      variant="outlined"
      aria-label={`Workflow: ${name}`}
      sx={{
        p: 2,
        borderRadius: 2,
        borderColor: question ? 'warning.main' : 'divider',
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ sm: 'center' }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <Typography variant="subtitle2">{name}</Typography>
            <Chip size="small" color={state.color} label={state.label} />
          </Stack>
          <Typography variant="body2" sx={{ mt: 1, overflowWrap: 'anywhere' }}>
            {description}
          </Typography>
          <Typography
            variant="body2"
            color={question ? 'text.primary' : 'text.secondary'}
            sx={{ mt: 0.5 }}
          >
            {question?.prompt || state.next}
          </Typography>
        </Box>
        <Button
          component={RouterLink}
          to={target}
          onClick={(event) => {
            if (
              (solutionId ? onOpenWorkflow : onOpenBuild) &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey
            ) {
              event.preventDefault();
              if (solutionId) onOpenWorkflow(solutionId);
              else onOpenBuild(build.id);
            }
          }}
          variant={question ? 'contained' : 'outlined'}
          sx={{ flexShrink: 0 }}
        >
          {question ? 'Answer & continue' : solutionId ? 'Open workflow' : 'View draft'}
        </Button>
      </Stack>
    </Paper>
  );
}
