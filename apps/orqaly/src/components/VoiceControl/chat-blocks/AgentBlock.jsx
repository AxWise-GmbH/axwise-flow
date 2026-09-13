import { useTheme } from '@mui/material';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import BaseBlock, { statusColor } from './BaseBlock.jsx';

export default function AgentBlock({ block, onOpen }) {
  const theme = useTheme();
  const c = block.compact || {};
  const sc = statusColor(theme, c.availability);
  const enhanced = { ...block, entityType: 'agent' };

  return (
    <BaseBlock
      icon={SmartToyRoundedIcon}
      iconColor={sc}
      title={c.name || c.id || 'Agent'}
      subtitle={c.role || ''}
      chips={c.availability ? [{ label: c.availability, color: sc }] : []}
      block={enhanced}
      onOpen={onOpen}
    />
  );
}
