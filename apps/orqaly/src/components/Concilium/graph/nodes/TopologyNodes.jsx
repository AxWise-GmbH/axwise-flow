/**
 * React Flow node components for the Consilium topology graph.
 *
 * A single memoized card renders all four kinds (organization / consilium / team
 * / agent), distinguished by `data.kind`. Styling mirrors the NodeCard in
 * OrgArchitectureDialog. Both a top (target) and bottom (source) handle are
 * present on every node so the free-form editor can connect anything to anything.
 */
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Box, Typography, alpha, useTheme } from '@mui/material';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';

import AppIcon from '../../../icons/AppIcon';

const ORG_TYPE_COLORS = {
  virtual: '#6366F1',
  holding: '#7C3AED',
  subsidiary: '#2563EB',
  division: '#059669',
  department: '#D97706',
};

export const KIND_META = {
  organization: { label: 'Organization', color: '#7C3AED', Icon: CorporateFareOutlinedIcon },
  consilium: { label: 'Consilium', color: '#8B5CF6', Icon: GavelOutlinedIcon },
  team: { label: 'Team', color: '#0EA5E9', Icon: GroupsOutlinedIcon },
  agent: { label: 'Agent', color: '#22C55E', Icon: SmartToyOutlinedIcon },
};

export const STATUS_DOT = {
  active: { color: '#22c55e', label: 'Active' },
  paused: { color: '#eab308', label: 'Paused' },
  inactive: { color: '#6b7280', label: 'Inactive' },
  quarantined: { color: '#ef4444', label: 'Quarantined' },
  disbanded: { color: '#6b7280', label: 'Disbanded' },
};

export const NODE_WIDTH = 180;

function nodeColor(data) {
  if (data?.kind === 'organization') {
    return ORG_TYPE_COLORS[data?.orgType] || KIND_META.organization.color;
  }
  return KIND_META[data?.kind]?.color || '#888';
}

const handleStyle = (theme) => ({
  background: theme.palette.divider,
  width: 9,
  height: 9,
  border: '2px solid',
  borderColor: theme.palette.background.paper,
});

function TopologyNode({ data, selected }) {
  const theme = useTheme();
  const kind = data?.kind || 'agent';
  const meta = KIND_META[kind] || KIND_META.agent;
  const color = nodeColor(data);
  const status = STATUS_DOT[data?.statusKey] || STATUS_DOT.active;

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ top: -5, ...handleStyle(theme) }} />
      <Box
        sx={{
          width: NODE_WIDTH,
          bgcolor:
            theme.palette.mode === 'dark' ? alpha('#fff', 0.04) : theme.palette.background.paper,
          border: '1px solid',
          borderColor: selected ? color : alpha(color, 0.35),
          boxShadow: selected ? `0 0 0 1px ${alpha(color, 0.5)}` : 'none',
          borderRadius: 2,
          p: 1.25,
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.4 }}>
          <Box
            sx={{
              width: 26,
              height: 26,
              borderRadius: 1,
              bgcolor: alpha(color, 0.15),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AppIcon fallback={meta.Icon} sx={{ fontSize: 14, color }} />
          </Box>
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, lineHeight: 1.2, color: 'text.primary', fontSize: '0.72rem' }}
            noWrap
          >
            {data?.label || meta.label}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: '0.62rem', display: 'block', mb: 0.5, ml: '34px' }}
          noWrap
        >
          {data?.subtitle || meta.label}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: '34px' }}>
          <Box
            sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: status.color, flexShrink: 0 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }} noWrap>
            {status.label}
          </Typography>
        </Box>
      </Box>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ bottom: -5, ...handleStyle(theme) }}
      />
    </>
  );
}

const MemoTopologyNode = memo(TopologyNode);

export const nodeTypes = {
  organization: MemoTopologyNode,
  consilium: MemoTopologyNode,
  team: MemoTopologyNode,
  agent: MemoTopologyNode,
};

export default MemoTopologyNode;
