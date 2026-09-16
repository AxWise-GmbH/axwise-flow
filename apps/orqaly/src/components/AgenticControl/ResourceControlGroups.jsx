import { Alert, Box, Button, CircularProgress, Stack, Tooltip, Typography } from '@mui/material';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import BentoCard from '../Common/BentoCard';

const GROUPS = [
  {
    key: 'run',
    title: 'Run controls',
    description: 'Affect only this execution run.',
    actions: [
      { key: 'pause', label: 'Pause run' },
      { key: 'resume', label: 'Resume run' },
      { key: 'cancel', label: 'Cancel remaining work', color: 'error' },
    ],
  },
  {
    key: 'agent',
    title: 'Agent controls',
    description: 'Affect this delegated Agent across its work.',
    actions: [
      { key: 'pause', label: 'Pause Agent' },
      { key: 'resume', label: 'Resume Agent' },
      { key: 'revoke', label: 'Revoke Agent', color: 'error' },
    ],
  },
  {
    key: 'schedule',
    title: 'Schedule controls',
    description: 'Affect the attached recurring or monitored work.',
    actions: [
      { key: 'activate', label: 'Activate schedule' },
      { key: 'runNow', apiAction: 'run-now', label: 'Run now' },
      { key: 'pause', label: 'Pause schedule' },
      { key: 'resume', label: 'Resume schedule' },
    ],
  },
];

function groupResourceId(group, { run, agent, schedule }) {
  if (group === 'run') return run?.run_id || run?.id;
  if (group === 'agent') return agent?.agent_id || agent?.id || run?.agent_id;
  return schedule?.schedule_id || schedule?.id || run?.schedule_id;
}

function disabledReason(disabledReasons, group, action) {
  return (
    disabledReasons?.[`${group}.${action}`] ||
    disabledReasons?.[`${group}.${action === 'runNow' ? 'run-now' : action}`] ||
    'This control is not available in the current state.'
  );
}

export default function ResourceControlGroups({
  run,
  agent,
  schedule,
  controls = {},
  disabledReasons = {},
  unavailableReason,
  pendingAction,
  onControl,
}) {
  return (
    <BentoCard
      title="Customer controls"
      subtitle="Run, Agent and schedule authority stay separate"
      icon={TuneOutlinedIcon}
    >
      {unavailableReason ? (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          {unavailableReason}
        </Alert>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
          gap: 1.5,
        }}
      >
        {GROUPS.map((group) => {
          const resourceId = groupResourceId(group.key, { run, agent, schedule });
          const groupControls = controls[group.key] || {};
          return (
            <Box
              key={group.key}
              component="section"
              aria-labelledby={`${group.key}-controls-title`}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}
            >
              <Typography
                id={`${group.key}-controls-title`}
                variant="subtitle1"
                sx={{ fontWeight: 700 }}
              >
                {group.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {resourceId
                  ? group.description
                  : `No ${group.key} reference is available from this response.`}
              </Typography>
              <Stack spacing={1} sx={{ mt: 1.5 }}>
                {group.actions.map((action) => {
                  const enabled = Boolean(resourceId && groupControls[action.key] === true);
                  const actionId = `${group.key}.${action.key}`;
                  const isPending = pendingAction === actionId;
                  const button = (
                    <Button
                      fullWidth
                      key={action.key}
                      variant="outlined"
                      color={action.color || 'primary'}
                      disabled={!enabled || Boolean(pendingAction)}
                      onClick={() =>
                        onControl?.(group.key, action.apiAction || action.key, resourceId)
                      }
                      startIcon={
                        isPending ? <CircularProgress size={16} color="inherit" /> : undefined
                      }
                      sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
                    >
                      {isPending ? 'Applying…' : action.label}
                    </Button>
                  );
                  return enabled ? (
                    button
                  ) : (
                    <Tooltip
                      key={action.key}
                      title={disabledReason(disabledReasons, group.key, action.key)}
                    >
                      <Box component="span" sx={{ display: 'block' }}>
                        {button}
                      </Box>
                    </Tooltip>
                  );
                })}
              </Stack>
            </Box>
          );
        })}
      </Box>
    </BentoCard>
  );
}
