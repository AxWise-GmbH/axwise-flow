import { useState } from 'react';
import { Box, Typography, Paper, Chip, Divider, Button, alpha } from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import OrgArchitectureDialog from '../OrgArchitectureDialog';

import AppIcon from '../../icons/AppIcon';

export default function OrgTeamsTab({
  org,
  teams,
  agents,
  childOrgs,
  concilium,
  orgTeamMap,
  orgAgentMap,
  allTeams,
  allAgents,
  getTypeColor,
  getTypeLabel,
}) {
  const [archOpen, setArchOpen] = useState(false);
  const orgId = org?.id;

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Teams ({teams.length})
        </Typography>
        {(teams.length > 0 || agents.length > 0) && (
          <Button
            size="small"
            startIcon={
              <AppIcon
                name="AccountTreeOutlined"
                fallback={AccountTreeOutlinedIcon}
                sx={{ fontSize: 16 }}
              />
            }
            onClick={() => setArchOpen(true)}
            sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.72rem' }}
          >
            Org chart
          </Button>
        )}
      </Box>
      {teams.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No teams assigned
        </Typography>
      ) : (
        teams.map((team) => (
          <Paper
            key={team.id}
            elevation={0}
            sx={{
              p: 1.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              mb: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <AppIcon
              name="GroupsOutlined"
              fallback={GroupsOutlinedIcon}
              sx={{ fontSize: 20, color: '#059669' }}
            />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {team.name}
              </Typography>
              {team.description && (
                <Typography variant="caption" color="text.secondary">
                  {team.description}
                </Typography>
              )}
            </Box>
          </Paper>
        ))
      )}
      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        Agents ({agents.length})
      </Typography>
      {agents.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No agents assigned
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
          {agents.map((agent) => (
            <Paper
              key={agent.agent_id || agent.id}
              elevation={0}
              sx={{
                p: 1.25,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <AppIcon
                name="SmartToyOutlined"
                fallback={SmartToyOutlinedIcon}
                sx={{ fontSize: 18, color: '#5B8DEF' }}
              />
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.75rem' }} noWrap>
                {agent.role || agent.name || agent.agent_id || agent.id}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}
      {childOrgs.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Subsidiaries ({childOrgs.length})
          </Typography>
          {childOrgs.map((child) => (
            <Paper
              key={child.id}
              elevation={0}
              sx={{
                p: 1.25,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                mb: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <AppIcon
                name="CorporateFareOutlined"
                fallback={CorporateFareOutlinedIcon}
                sx={{ fontSize: 18, color: getTypeColor(child.org_type) }}
              />
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {child.name}
                </Typography>
                <Chip
                  label={getTypeLabel(child.org_type)}
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: '0.55rem',
                    bgcolor: alpha(getTypeColor(child.org_type), 0.1),
                    color: getTypeColor(child.org_type),
                  }}
                />
              </Box>
            </Paper>
          ))}
        </>
      )}
      <OrgArchitectureDialog
        open={archOpen}
        onClose={() => setArchOpen(false)}
        org={org}
        consiliumBoards={concilium}
        orgTeamMap={orgTeamMap}
        orgAgentMap={orgAgentMap}
        allTeams={allTeams}
        allAgents={allAgents}
      />
    </>
  );
}
