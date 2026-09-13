/**
 * ConciliumDecisionBlock — inline card for a Consilium decision/evaluation.
 */
import { useTheme } from '@mui/material';
import GavelRoundedIcon from '@mui/icons-material/GavelRounded';
import BaseBlock, { relTime, statusColor } from './BaseBlock.jsx';

export default function ConciliumDecisionBlock({ block, onOpen }) {
  const theme = useTheme();
  const c = block?.compact || {};
  const approved = c.approved === true;
  const statusLabel = approved ? 'APPROVED' : c.approved === false ? 'REJECTED' : 'OPEN';
  return (
    <BaseBlock
      icon={GavelRoundedIcon}
      iconColor={theme.palette.secondary?.light || theme.palette.primary.light}
      title={c.topic || c.decision || 'Decision'}
      subtitle={c.decision && c.topic ? c.decision : undefined}
      chips={[{ label: statusLabel, color: statusColor(theme, statusLabel) }]}
      metaLines={[c.created_at ? relTime(c.created_at) : null]}
      block={block}
      onOpen={onOpen}
    />
  );
}
