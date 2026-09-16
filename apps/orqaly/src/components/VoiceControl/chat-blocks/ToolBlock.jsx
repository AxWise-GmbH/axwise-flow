import { useTheme } from '@mui/material';
import BuildRoundedIcon from '@mui/icons-material/BuildRounded';
import BaseBlock, { statusColor } from './BaseBlock.jsx';

export default function ToolBlock({ block, onOpen }) {
  const theme = useTheme();
  const c = block.compact || {};
  const sc = statusColor(theme, c.status);
  const enhanced = { ...block, entityType: 'tool' };

  return (
    <BaseBlock
      icon={BuildRoundedIcon}
      iconColor={sc}
      title={c.name || 'Tool'}
      subtitle={c.connection_type ? `${c.connection_type}` : ''}
      chips={c.status ? [{ label: c.status, color: sc }] : []}
      block={enhanced}
      onOpen={onOpen}
    />
  );
}
