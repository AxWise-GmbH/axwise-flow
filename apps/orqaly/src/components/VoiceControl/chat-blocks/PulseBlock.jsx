/**
 * PulseBlock — inline card for an agent Pulse (automation trigger).
 */
import { useTheme } from '@mui/material';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import BaseBlock, { relTime } from './BaseBlock.jsx';

export default function PulseBlock({ block, onOpen }) {
  const theme = useTheme();
  const c = block?.compact || {};
  const enabled = !!c.enabled;
  return (
    <BaseBlock
      icon={BoltRoundedIcon}
      iconColor={enabled ? theme.palette.success.light : theme.palette.warning.light}
      title={c.title || c.action || 'Pulse'}
      subtitle={c.trigger_type ? `${c.trigger_type} trigger` : undefined}
      chips={[{ label: enabled ? 'ON' : 'OFF', color: enabled ? theme.palette.success.light : theme.palette.warning.light }]}
      metaLines={[
        c.last_fired_at ? `Last: ${relTime(c.last_fired_at)}` : 'Never fired',
        c.action ? `Action: ${c.action}` : null,
      ]}
      block={block}
      onOpen={onOpen}
    />
  );
}
