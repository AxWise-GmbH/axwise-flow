import { useTheme } from '@mui/material';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import BaseBlock, { statusColor } from './BaseBlock.jsx';

export default function PartnerBlock({ block, onOpen }) {
  const theme = useTheme();
  const c = block.compact || {};
  const sc = statusColor(theme, c.status);
  const enhanced = { ...block, entityType: 'partner' };

  return (
    <BaseBlock
      icon={GroupRoundedIcon}
      iconColor={sc}
      title={c.name || 'Partner'}
      subtitle={c.team ? `team: ${c.team}` : ''}
      chips={[
        c.agreement ? { label: c.agreement } : null,
        c.status ? { label: c.status, color: sc } : null,
      ].filter(Boolean)}
      block={enhanced}
      onOpen={onOpen}
    />
  );
}
