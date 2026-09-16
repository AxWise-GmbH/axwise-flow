import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import BaseBlock, { relTime } from './BaseBlock.jsx';

export default function DashboardBlock({ block, onOpen }) {
  const c = block.compact || {};
  const enhanced = { ...block, entityType: 'dashboard' };

  return (
    <BaseBlock
      icon={DashboardRoundedIcon}
      title={c.name || 'Dashboard'}
      metaLines={[
        typeof c.widget_count === 'number' ? `${c.widget_count} widgets` : null,
        c.updated_at ? `Updated ${relTime(c.updated_at)}` : null,
      ]}
      block={enhanced}
      onOpen={onOpen}
    />
  );
}
