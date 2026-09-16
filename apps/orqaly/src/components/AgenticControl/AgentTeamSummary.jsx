import {
  Alert,
  Box,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import BentoCard from '../Common/BentoCard';
import EmptyState from '../Common/EmptyState';

const STATUS_COLORS = {
  active: 'success',
  running: 'success',
  proposed: 'info',
  paused: 'warning',
  expired: 'default',
  revoked: 'error',
};

function displayStatus(status) {
  return String(status || 'unknown').replaceAll('_', ' ');
}

function memberList(team, agent) {
  const members = team?.members || team?.memberships || team?.agent_members || [];
  if (Array.isArray(members) && members.length > 0) return members;
  return agent ? [agent] : [];
}

export default function AgentTeamSummary({ team, agent, teamReference, teamUnavailableReason }) {
  const members = memberList(team, agent);
  if (!team && members.length === 0) {
    return (
      <BentoCard title="Agent and team" icon={GroupsOutlinedIcon}>
        <EmptyState
          dense
          icon={GroupsOutlinedIcon}
          title="No Agent assigned"
          description="Identity appears here only after the control plane materializes an approved proposal."
        />
      </BentoCard>
    );
  }

  const teamName =
    team?.display_name ||
    team?.displayName ||
    team?.name ||
    agent?.display_name ||
    agent?.displayName ||
    'Selected Agent';
  const teamStatus = team?.state || team?.status || agent?.state || agent?.status;

  return (
    <BentoCard
      title="Agent and team"
      subtitle="Synthetic identities and bounded responsibilities"
      icon={GroupsOutlinedIcon}
      action={
        teamStatus ? (
          <Chip
            size="small"
            color={STATUS_COLORS[teamStatus] || 'default'}
            label={displayStatus(teamStatus)}
          />
        ) : null
      }
    >
      <Typography variant="h6">{teamName}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {team?.purpose ||
          team?.task_summary ||
          (agent?.source_task_id
            ? `Materialized from task ${agent.source_task_id}.`
            : 'Materialized in the current customer scope.')}
      </Typography>
      {teamReference ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Team reference: {teamReference}
        </Typography>
      ) : null}
      <Divider sx={{ my: 1.5 }} />
      <List disablePadding aria-label="Agent team members">
        {members.map((member, index) => {
          const memberAgent = member.agent || member;
          const name =
            memberAgent.display_name ||
            memberAgent.displayName ||
            memberAgent.name ||
            `Agent ${index + 1}`;
          const role = member.role || memberAgent.role;
          const status = memberAgent.state || memberAgent.status || member.state || member.status;
          const personaVersion =
            memberAgent.persona_contract_version ||
            memberAgent.persona_version ||
            memberAgent.personaVersion ||
            memberAgent.persona_version_id;
          const memoryScope =
            member.memory_scope || member.memoryScope || memberAgent.memory_scope_summary;
          const authority =
            member.effect_scope || member.effectScope || memberAgent.authority_summary;

          return (
            <ListItem
              key={memberAgent.agent_id || memberAgent.id || `${name}-${index}`}
              disableGutters
              alignItems="flex-start"
              sx={{ py: 1 }}
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      {name} (AI)
                    </Typography>
                    {role ? (
                      <Chip size="small" variant="outlined" label={displayStatus(role)} />
                    ) : null}
                    {status ? (
                      <Chip
                        size="small"
                        color={STATUS_COLORS[status] || 'default'}
                        label={displayStatus(status)}
                      />
                    ) : null}
                  </Stack>
                }
                secondary={
                  <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
                    {personaVersion ? `Persona ${personaVersion}` : 'Persona version not provided'}
                    {memberAgent.persona_id ? ` · ${memberAgent.persona_id}` : ''}
                    {memoryScope ? ` · Memory: ${memoryScope}` : ''}
                    {authority ? ` · Authority: ${authority}` : ''}
                  </Box>
                }
              />
            </ListItem>
          );
        })}
      </List>
      {teamUnavailableReason ? (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          {teamUnavailableReason}
        </Alert>
      ) : null}
    </BentoCard>
  );
}
