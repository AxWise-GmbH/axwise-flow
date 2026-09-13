import { useTheme } from '@mui/material';
import OutboxRoundedIcon from '@mui/icons-material/OutboxRounded';
import BaseBlock, { statusColor } from './BaseBlock.jsx';

export default function RequestBlock({ block, onOpen }) {
  const theme = useTheme();
  const c = block.compact || {};
  const sc = statusColor(theme, c.status);
  const enhanced = { ...block, entityType: 'request' };

  const title =
    typeof c.text === 'string' && c.text.length > 60
      ? c.text.slice(0, 60) + '…'
      : c.text || 'Request';

  return (
    <BaseBlock
      icon={OutboxRoundedIcon}
      iconColor={sc}
      title={title}
      chips={[
        c.priority ? { label: c.priority } : null,
        c.status ? { label: c.status, color: sc } : null,
      ].filter(Boolean)}
      block={enhanced}
      onOpen={onOpen}
    />
  );
}
