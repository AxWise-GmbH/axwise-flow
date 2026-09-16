import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import { Avatar } from '@mui/material';

export const AGENT_AVATAR_ICONS = Object.freeze({
  smart_toy: SmartToyOutlinedIcon,
  bolt: BoltOutlinedIcon,
  science: ScienceOutlinedIcon,
  support_agent: SupportAgentOutlinedIcon,
  campaign: CampaignOutlinedIcon,
  code: CodeOutlinedIcon,
});

export const AGENT_AVATAR_OPTIONS = Object.freeze([
  { value: 'smart_toy', label: 'Agent' },
  { value: 'bolt', label: 'Operator' },
  { value: 'science', label: 'Researcher' },
  { value: 'support_agent', label: 'Support' },
  { value: 'campaign', label: 'Communicator' },
  { value: 'code', label: 'Builder' },
]);

export const AGENT_COLOR_OPTIONS = Object.freeze([
  '#6750A4',
  '#3559E0',
  '#087E8B',
  '#2E7D32',
  '#B45F06',
  '#A23B72',
  '#455A64',
]);

function readableTextColor(background) {
  const hex = String(background || '').replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return '#FFFFFF';
  const [red, green, blue] = [0, 2, 4].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16)
  );
  return red * 0.299 + green * 0.587 + blue * 0.114 > 165 ? '#1A1A1A' : '#FFFFFF';
}

export function AgentAvatar({ avatar, name = 'Agent', size = 44 }) {
  const normalized = avatar || { kind: 'icon', value: 'smart_toy', color: '#6750A4' };
  const color = normalized.color || '#6750A4';
  const Icon = AGENT_AVATAR_ICONS[normalized.value] || SmartToyOutlinedIcon;
  return (
    <Avatar
      aria-label={`${name} avatar`}
      sx={{
        width: size,
        height: size,
        bgcolor: color,
        color: readableTextColor(color),
        fontSize: size * 0.48,
      }}
    >
      {normalized.kind === 'emoji' ? normalized.value : <Icon sx={{ fontSize: size * 0.52 }} />}
    </Avatar>
  );
}
