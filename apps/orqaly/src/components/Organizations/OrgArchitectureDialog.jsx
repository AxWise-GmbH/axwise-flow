/**
 * OrgArchitectureDialog — management hierarchy tree for an organization.
 * Shows Consilium board → Teams → Agents as a connected org-chart.
 * Props: { open, onClose, org, consiliumBoards, orgTeamMap, orgAgentMap, allTeams, allAgents }
 */
import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, CircularProgress, alpha, useTheme } from '@mui/material';
import FormDialog from '../Common/FormDialog';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import { supabase, hasSupabase } from '../../lib/supabase';

import AppIcon from '../icons/AppIcon';

/* ── Constants ─────────────────────────────────────────────────────────── */
const ORG_TYPE_COLORS = {
  virtual: '#6366F1',
  holding: '#7C3AED',
  subsidiary: '#2563EB',
  division: '#059669',
  department: '#D97706',
};
const STATUS_COLORS = { available: '#22c55e', busy: '#eab308', offline: '#6b7280' };
const NODE_W = 148; // card width px
const NODE_PX = 10; // horizontal padding around each child column
const CONN_H = 22; // vertical connector height px
const CHILD_COL_W = NODE_W + NODE_PX * 2;

/* ── Helpers ────────────────────────────────────────────────────────────── */
function getOrgTypeColor(type) {
  return ORG_TYPE_COLORS[type] || '#888';
}

function getOrgTypeLabel(type) {
  if (!type) return 'Org';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function getAgentIcon(agent) {
  const role = (agent?.role || '').toLowerCase();
  if (
    role.includes('coder') ||
    role.includes('engineer') ||
    role.includes('developer') ||
    role.includes('tech')
  ) {
    return CodeOutlinedIcon;
  }
  return SmartToyOutlinedIcon;
}

/* ── NodeCard ───────────────────────────────────────────────────────────── */
function NodeCard({ node }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        width: NODE_W,
        bgcolor:
          theme.palette.mode === 'dark' ? alpha('#fff', 0.04) : theme.palette.background.paper,
        border: '1px solid',
        borderColor: alpha(node.color, 0.35),
        borderRadius: 2,
        p: 1.25,
        flexShrink: 0,
      }}
    >
      {/* Icon + name */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.4 }}>
        <Box
          sx={{
            width: 26,
            height: 26,
            borderRadius: 1,
            bgcolor: alpha(node.color, 0.15),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <AppIcon fallback={node.Icon} sx={{ fontSize: 14, color: node.color }} />
        </Box>
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, lineHeight: 1.2, color: 'text.primary', fontSize: '0.72rem' }}
          noWrap
        >
          {node.name}
        </Typography>
      </Box>
      {/* Subtitle */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontSize: '0.62rem', display: 'block', mb: 0.5, ml: '34px' }}
        noWrap
      >
        {node.subtitle}
      </Typography>
      {/* Status dot */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: '34px' }}>
        <Box
          sx={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            bgcolor: node.statusColor,
            flexShrink: 0,
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }} noWrap>
          {node.statusLabel}
        </Typography>
      </Box>
    </Box>
  );
}

/* ── TreeNode ───────────────────────────────────────────────────────────── */
function TreeNode({ node, lineColor }) {
  const children = node.children || [];
  const hasChildren = children.length > 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <NodeCard node={node} />

      {hasChildren && (
        <>
          {/* Vertical line down from this node */}
          <Box sx={{ width: 2, height: CONN_H, bgcolor: lineColor, flexShrink: 0 }} />

          {/* Children row with horizontal bar */}
          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'flex-start' }}>
            {/* Horizontal bar: spans from center of first child to center of last */}
            {children.length > 1 && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: `${CHILD_COL_W / 2}px`,
                  right: `${CHILD_COL_W / 2}px`,
                  height: 2,
                  bgcolor: lineColor,
                  pointerEvents: 'none',
                }}
              />
            )}

            {children.map((child) => (
              <Box
                key={child.id}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  px: `${NODE_PX}px`,
                }}
              >
                {/* Vertical drop to each child */}
                <Box sx={{ width: 2, height: CONN_H, bgcolor: lineColor, flexShrink: 0 }} />
                <TreeNode node={child} lineColor={lineColor} />
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

/* ── Tree data builder ──────────────────────────────────────────────────── */
function buildTree({
  org,
  consiliumBoards,
  teamIds,
  agentIds,
  allTeams,
  allAgents,
  teamMembersMap,
}) {
  const orgColor = getOrgTypeColor(org?.org_type);
  const consilium = (consiliumBoards || []).find((b) => b.id === org?.consilium_id);
  const placedAgentIds = new Set();

  // Team nodes with their matching agents
  const teamNodes = teamIds.map((teamId) => {
    const team = allTeams.find((t) => t.id === teamId);
    const memberIds = teamMembersMap[teamId] || [];

    const teamAgentNodes = agentIds
      .filter((aid) => memberIds.some((mid) => mid === aid))
      .map((aid) => {
        placedAgentIds.add(aid);
        const agent = allAgents.find((a) => (a.agent_id || a.id) === aid);
        if (!agent) return null;
        return {
          id: `agent-${aid}`,
          name: agent.role || agent.name || aid,
          subtitle: agent.category || agent.connection_type || 'Agent',
          Icon: getAgentIcon(agent),
          color: '#22c55e',
          statusColor: STATUS_COLORS[agent.availability_status] || STATUS_COLORS.offline,
          statusLabel: agent.availability_status || 'offline',
          children: [],
        };
      })
      .filter(Boolean);

    return {
      id: `team-${teamId}`,
      name: team?.name || 'Team',
      subtitle: `Team · ${memberIds.length} member${memberIds.length !== 1 ? 's' : ''}`,
      Icon: GroupsOutlinedIcon,
      color: '#3B82F6',
      statusColor: team?.isActive !== false ? '#22c55e' : '#6b7280',
      statusLabel: team?.isActive !== false ? 'active' : 'inactive',
      children: teamAgentNodes,
    };
  });

  // Direct agents — not matched to any team
  const directAgentNodes = agentIds
    .filter((aid) => !placedAgentIds.has(aid))
    .map((aid) => {
      const agent = allAgents.find((a) => (a.agent_id || a.id) === aid);
      if (!agent) return null;
      return {
        id: `agent-${aid}`,
        name: agent.role || agent.name || aid,
        subtitle: agent.category || agent.connection_type || 'Agent',
        Icon: getAgentIcon(agent),
        color: '#22c55e',
        statusColor: STATUS_COLORS[agent.availability_status] || STATUS_COLORS.offline,
        statusLabel: agent.availability_status || 'offline',
        children: [],
      };
    })
    .filter(Boolean);

  const rootChildren = [];

  // Consilium as governance node
  if (consilium) {
    rootChildren.push({
      id: `consilium-${consilium.id}`,
      name: consilium.name,
      subtitle: 'Governance · ' + (consilium.status || 'active'),
      Icon: GavelOutlinedIcon,
      color: '#6366F1',
      statusColor: '#6366F1',
      statusLabel: consilium.status || 'active',
      children: [],
    });
  }

  rootChildren.push(...teamNodes);

  if (directAgentNodes.length > 0) {
    if (teamNodes.length > 0) {
      // Wrap loose agents in a "Direct" group node
      rootChildren.push({
        id: 'direct-group',
        name: 'Direct',
        subtitle: `${directAgentNodes.length} direct agent${directAgentNodes.length !== 1 ? 's' : ''}`,
        Icon: SmartToyOutlinedIcon,
        color: '#22c55e',
        statusColor: '#22c55e',
        statusLabel: 'direct',
        children: directAgentNodes,
      });
    } else {
      // No teams — show agents directly under root
      rootChildren.push(...directAgentNodes);
    }
  }

  return {
    id: 'root',
    name: org?.name || 'Organization',
    subtitle: getOrgTypeLabel(org?.org_type) + (org?.industry ? ' · ' + org.industry : ''),
    Icon: CorporateFareOutlinedIcon,
    color: orgColor,
    statusColor: org?.is_active ? '#22c55e' : '#6b7280',
    statusLabel: org?.is_active ? 'active' : 'inactive',
    children: rootChildren,
  };
}

/* ── Main Dialog ────────────────────────────────────────────────────────── */
export default function OrgArchitectureDialog({
  open,
  onClose,
  org,
  consiliumBoards,
  orgTeamMap,
  orgAgentMap,
  allTeams,
  allAgents,
}) {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [teamMembersMap, setTeamMembersMap] = useState({});

  const teamIds = (org && orgTeamMap[org.id]) || [];
  const agentIds = (org && orgAgentMap[org.id]) || [];
  const lineColor = theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';

  const isEmpty = !org?.consilium_id && teamIds.length === 0 && agentIds.length === 0;

  // Fetch team member associations when dialog opens
  useEffect(() => {
    if (!open || teamIds.length === 0 || !hasSupabase()) {
      setTeamMembersMap({});
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const { data } = await supabase
          .from('concilium_team_members')
          .select('team_id, member_id')
          .in('team_id', teamIds);
        const map = {};
        (data || []).forEach((row) => {
          if (!map[row.team_id]) map[row.team_id] = [];
          map[row.team_id].push(row.member_id);
        });
        setTeamMembersMap(map);
      } catch {
        setTeamMembersMap({});
      } finally {
        setLoading(false);
      }
    })();
  }, [open, org?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tree = useMemo(() => {
    if (!org) return null;
    return buildTree({
      org,
      consiliumBoards,
      teamIds,
      agentIds,
      allTeams,
      allAgents,
      teamMembersMap,
    });
  }, [org, consiliumBoards, teamIds, agentIds, allTeams, allAgents, teamMembersMap]);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      title={org?.name || 'Organization'}
      subtitle="Management Architecture"
      icon={CorporateFareOutlinedIcon}
      hideFooter
      contentSx={{ pt: 1, pb: 3, overflowX: 'auto' }}
    >
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : isEmpty ? (
        <Box sx={{ textAlign: 'center', py: 6, color: 'text.disabled' }}>
          <AppIcon
            name="GavelOutlined"
            fallback={GavelOutlinedIcon}
            sx={{ fontSize: 40, mb: 1, opacity: 0.4 }}
          />
          <Typography variant="body2">No structure assigned yet</Typography>
          <Typography variant="caption" color="text.disabled">
            Assign teams or agents to this organization to build the architecture tree.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, minWidth: 'fit-content' }}>
          {tree && <TreeNode node={tree} lineColor={lineColor} />}
        </Box>
      )}
    </FormDialog>
  );
}
