import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import BaseBlock, { relTime } from './BaseBlock.jsx';

export default function CommunicatorThreadBlock({ block, onOpen }) {
  const c = block.compact || {};
  const enhanced = { ...block, entityType: 'communicator-thread' };

  return (
    <BaseBlock
      icon={ForumRoundedIcon}
      title={c.channel_name || 'Thread'}
      subtitle={c.platform || ''}
      metaLines={[c.last_message_at ? relTime(c.last_message_at) : null]}
      block={enhanced}
      onOpen={onOpen}
    />
  );
}
