import { useTheme } from '@mui/material';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import BaseBlock, { relTime, statusColor } from './BaseBlock.jsx';

export default function ProjectBlock({ block, onOpen }) {
  const theme = useTheme();
  const c = block.compact || {};
  const sc = statusColor(theme, c.status);
  const enhanced = { ...block, entityType: 'project' };

  return (
    <BaseBlock
      icon={FolderOpenRoundedIcon}
      iconColor={sc}
      title={c.name || 'Project'}
      chips={[{ label: c.status || 'Active', color: sc }]}
      metaLines={[c.updated_at ? `Updated ${relTime(c.updated_at)}` : null]}
      block={enhanced}
      onOpen={onOpen}
    />
  );
}
