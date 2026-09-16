import { useTheme } from '@mui/material';
import CheckBoxOutlineBlankRoundedIcon from '@mui/icons-material/CheckBoxOutlineBlankRounded';
import BaseBlock, { relTime, statusColor } from './BaseBlock.jsx';

export default function TaskBlock({ block, onOpen }) {
  const theme = useTheme();
  const c = block.compact || {};
  const sc = statusColor(theme, c.status);
  const enhanced = { ...block, entityType: 'task' };

  return (
    <BaseBlock
      icon={CheckBoxOutlineBlankRoundedIcon}
      iconColor={sc}
      title={c.title || 'Task'}
      subtitle={c.priority ? `priority: ${c.priority}` : ''}
      chips={[{ label: c.status || 'todo', color: sc }]}
      metaLines={[c.due_date ? `Due ${relTime(c.due_date)}` : null]}
      block={enhanced}
      onOpen={onOpen}
    />
  );
}
