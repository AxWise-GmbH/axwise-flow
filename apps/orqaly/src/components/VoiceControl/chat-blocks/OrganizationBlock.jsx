import { Box, Typography, useTheme } from '@mui/material';
import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded';
import BaseBlock from './BaseBlock.jsx';
import { composerInk, composerInkAlpha } from '../../../theme/composerSurface';

function renderTree(nodes, ink, dimInk, depth = 0) {
  if (!Array.isArray(nodes)) return null;
  return nodes.map((n) => (
    <Box key={n.id || n.name} sx={{ pl: depth * 1.5 }}>
      <Typography variant="caption" sx={{ color: ink, display: 'block' }}>
        └ {n.name}{' '}
        <Box component="span" sx={{ color: dimInk }}>
          [{n.org_type}]
        </Box>
      </Typography>
      {n.children && renderTree(n.children, ink, dimInk, depth + 1)}
    </Box>
  ));
}

export default function OrganizationBlock({ block, onOpen }) {
  const theme = useTheme();
  const ink = composerInk(theme);
  const dimInk = composerInkAlpha(theme, 0.45);
  const c = block.compact || {};
  const e = block.expanded || null;
  const enhanced = { ...block, entityType: 'organization' };

  const expandedNode = e?.tree ? <Box>{renderTree(e.tree, ink, dimInk)}</Box> : null;

  return (
    <BaseBlock
      icon={ApartmentRoundedIcon}
      title={c.name || 'Organization'}
      chips={c.org_type ? [{ label: c.org_type }] : []}
      metaLines={[typeof c.subsidiary_count === 'number' ? `${c.subsidiary_count} total` : null]}
      expandedNode={expandedNode}
      block={enhanced}
      onOpen={onOpen}
    />
  );
}
