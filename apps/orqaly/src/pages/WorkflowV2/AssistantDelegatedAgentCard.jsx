import { Box, Chip, Link, Paper, Stack, Typography } from '@mui/material';
import { AgentAvatar } from '../GcpWorkspace/AgentAvatar.jsx';
import { TaskDisclosure } from './TaskDisclosure.jsx';

/** Identity belongs to the Agent; the task card owns progress and approvals. */
export function AssistantDelegatedAgentCard({ part, agent = null }) {
  const persistent = part.lifetime === 'persistent';
  const personaVersion = part.executorPersona?.version || 'axwise_executor_persona_v1';
  const legacyUnverified = part.executorPersona?.status === 'legacy_unverified';
  // Directory presentation may change; execution authority still comes from the saved part.
  const avatar = agent?.id === part.id ? agent.avatar : null;
  return (
    <Paper
      component="section"
      variant="outlined"
      data-testid="assistant-delegated-agent-card"
      aria-label={`Delegated Agent: ${part.name}`}
      sx={{ p: 1.5, borderRadius: 2, overflow: 'hidden' }}
    >
      <Stack spacing={1}>
        <Stack direction="row" alignItems="center" gap={1.25}>
          <AgentAvatar avatar={avatar} name={part.name} size={40} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Task managed by
            </Typography>
            <Link
              href={`/agent-hub/${encodeURIComponent(part.id)}`}
              color="inherit"
              underline="hover"
              sx={{ display: 'block', fontWeight: 700, overflowWrap: 'anywhere' }}
            >
              {part.name}
            </Link>
          </Box>
          <Chip
            size="small"
            variant="outlined"
            label={persistent ? 'Reusable profile' : 'Temporary'}
          />
        </Stack>
        <Link href={`/agent-hub/${encodeURIComponent(part.id)}`} variant="body2">
          View Agent solutions & controls
        </Link>
        {legacyUnverified ? (
          <Typography variant="caption" color="warning.main">
            Legacy Agent · runtime binding was not recorded or verified.
          </Typography>
        ) : null}
        <TaskDisclosure title="Agent permissions & task context">
          <Typography variant="body2">
            {persistent
              ? 'Reusable profile; long-term memory not connected.'
              : 'Temporary profile. Preview expiry is within 90 days; automatic cleanup when the task ends is not connected.'}
          </Typography>
          <Typography variant="body2">
            Memory: {part.memoryScope?.label || 'This chat and Goal only'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {legacyUnverified
              ? 'Declared capabilities are unverified; external actions were not connected.'
              : part.capabilities?.externalActions === true
                ? 'Only specifically approved external action connections may be used.'
                : 'Research, planning, documents and approval gates are available. External actions are not connected on this Agent yet.'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {legacyUnverified
              ? `AxWise executor · ${personaVersion} · legacy metadata; runtime binding was not recorded or verified`
              : `AxWise executor · ${personaVersion} · fixed profile contract bound to this Goal`}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {part.runtime?.label || 'Orqaly GCP + AxWise'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Profile edits apply to new assignments. To change this task, use its scope approval
            controls or advanced details.
          </Typography>
        </TaskDisclosure>
      </Stack>
    </Paper>
  );
}
