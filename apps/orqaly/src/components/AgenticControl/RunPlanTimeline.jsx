import { Box, Chip, Divider, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import BentoCard from '../Common/BentoCard';
import EmptyState from '../Common/EmptyState';

const STATUS_COLORS = {
  succeeded: 'success',
  completed: 'success',
  running: 'info',
  queued: 'default',
  proposed: 'default',
  awaiting_approval: 'warning',
  waiting_for_customer: 'warning',
  failed: 'error',
  outcome_unknown: 'error',
  cancelled: 'default',
  skipped: 'default',
};

function statusLabel(status) {
  return String(status || 'unknown').replaceAll('_', ' ');
}

function formatWhen(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function RunPlanTimeline({
  run,
  events = [],
  eventsUnavailableReason,
  planUnavailableReason,
}) {
  const steps = run?.steps || run?.plan?.steps || run?.execution_steps || [];

  return (
    <BentoCard
      title="Plan and timeline"
      subtitle="Planned work and immutable observed activity"
      icon={AccountTreeOutlinedIcon}
      noPadding
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1fr)' },
        }}
      >
        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
          <Typography variant="overline" color="text.secondary">
            Execution plan
          </Typography>
          {planUnavailableReason ? (
            <EmptyState
              dense
              icon={AccountTreeOutlinedIcon}
              title="Run details unavailable"
              description={planUnavailableReason}
            />
          ) : steps.length === 0 ? (
            <EmptyState
              dense
              icon={AccountTreeOutlinedIcon}
              title={run ? 'No plan steps' : 'No run linked'}
              description={
                run
                  ? 'The selected run has not published an executable plan version.'
                  : 'Plan steps appear after a materialized Agent is linked to a run.'
              }
            />
          ) : (
            <List disablePadding aria-label="Execution plan steps">
              {steps.map((step, index) => {
                const status = step.status || step.state;
                const name =
                  step.business_label ||
                  step.businessLabel ||
                  step.title ||
                  step.name ||
                  step.node_id ||
                  `Step ${index + 1}`;
                const owner =
                  step.agent_name || step.agentName || step.assigned_role || step.assigned_agent_id;
                return (
                  <ListItem
                    key={step.step_id || step.id || `${name}-${index}`}
                    disableGutters
                    alignItems="flex-start"
                    sx={{ py: 1 }}
                  >
                    <Box
                      aria-hidden="true"
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        bgcolor: 'action.selected',
                        display: 'grid',
                        placeItems: 'center',
                        mr: 1.25,
                        mt: 0.25,
                        flexShrink: 0,
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {index + 1}
                      </Typography>
                    </Box>
                    <ListItemText
                      primary={name}
                      secondary={owner ? `Assigned to ${owner} (AI)` : 'Assignment not provided'}
                    />
                    <Chip
                      size="small"
                      color={STATUS_COLORS[status] || 'default'}
                      label={statusLabel(status)}
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>

        <Divider sx={{ display: { xs: 'block', lg: 'none' } }} />
        <Box
          sx={{
            p: { xs: 1.5, sm: 2 },
            borderLeft: { xs: 'none', lg: '1px solid' },
            borderColor: { lg: 'divider' },
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <HistoryOutlinedIcon fontSize="small" color="action" />
            <Typography variant="overline" color="text.secondary">
              Live activity
            </Typography>
          </Stack>
          {eventsUnavailableReason ? (
            <EmptyState
              dense
              icon={HistoryOutlinedIcon}
              title="Activity data unavailable"
              description={eventsUnavailableReason}
            />
          ) : events.length === 0 ? (
            <EmptyState
              dense
              icon={HistoryOutlinedIcon}
              title="No activity yet"
              description="Events appear only after the control plane records them."
            />
          ) : (
            <List disablePadding aria-label="Run activity timeline">
              {events.map((event, index) => {
                const label =
                  event.business_label ||
                  event.businessLabel ||
                  event.message ||
                  event.event_type_label ||
                  'Run event';
                const actor = event.actor_label || event.actorLabel || event.actor;
                const when = formatWhen(event.created_at || event.createdAt || event.timestamp);
                return (
                  <ListItem
                    key={event.event_id || event.id || `${label}-${index}`}
                    disableGutters
                    alignItems="flex-start"
                    sx={{ py: 1 }}
                  >
                    <ListItemText
                      primary={label}
                      secondary={[when, actor].filter(Boolean).join(' · ') || 'Time not provided'}
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>
      </Box>
    </BentoCard>
  );
}
