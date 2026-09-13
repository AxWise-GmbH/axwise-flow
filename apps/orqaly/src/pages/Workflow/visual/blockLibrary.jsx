/**
 * Block library for visual workflow / funnel builder.
 * Each block has a label and description; the description explains the action when the user clicks to configure.
 */
import LandingIcon from '@mui/icons-material/LandscapeOutlined';
import CampaignIcon from '@mui/icons-material/CampaignOutlined';
import SmsIcon from '@mui/icons-material/SmsOutlined';
import EmailIcon from '@mui/icons-material/EmailOutlined';
import ScheduleIcon from '@mui/icons-material/ScheduleOutlined';
import BoltIcon from '@mui/icons-material/Bolt';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import RepeatIcon from '@mui/icons-material/Repeat';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import MemoryIcon from '@mui/icons-material/Memory';
import SendIcon from '@mui/icons-material/Send';

import AppIcon from '../../../components/icons/AppIcon';

export const FUNNEL_BLOCKS = [
  {
    id: 'landing-page',
    type: 'funnel',
    label: 'Landing page',
    description: 'Select from saved landings or upload now',
    icon: <AppIcon name="LandscapeOutlined" fallback={LandingIcon} sx={{ fontSize: 24 }} />,
  },
  {
    id: 'campaign-attach',
    type: 'funnel',
    label: 'Campaign',
    description: 'Select a campaign (postback & unique links) to attach',
    icon: <AppIcon name="CampaignOutlined" fallback={CampaignIcon} sx={{ fontSize: 24 }} />,
  },
  {
    id: 'sms-sendout',
    type: 'funnel',
    label: 'SMS Send-out',
    description: 'Select SMS provider from list and save',
    icon: <AppIcon name="SmsOutlined" fallback={SmsIcon} sx={{ fontSize: 24 }} />,
  },
  {
    id: 'email-sendout',
    type: 'funnel',
    label: 'E-mail Send-out',
    description: 'Select email provider from list and save',
    icon: <AppIcon name="EmailOutlined" fallback={EmailIcon} sx={{ fontSize: 24 }} />,
  },
  {
    id: 'schedule',
    type: 'funnel',
    label: 'Schedule',
    description: 'Choose date and time',
    icon: <AppIcon name="ScheduleOutlined" fallback={ScheduleIcon} sx={{ fontSize: 24 }} />,
  },
  {
    id: 'actions',
    type: 'funnel',
    label: 'Actions',
    description: 'Use postback data to trigger SMS, email, webhook, or other actions',
    icon: <AppIcon name="Bolt" fallback={BoltIcon} sx={{ fontSize: 24 }} />,
  },
  {
    id: 'send-report-to-system',
    type: 'funnel',
    label: 'Send Data',
    description: 'Send a report to the system when this step runs (summary or full)',
    icon: (
      <AppIcon name="AssessmentOutlined" fallback={AssessmentOutlinedIcon} sx={{ fontSize: 24 }} />
    ),
  },
  {
    id: 'database',
    type: 'funnel',
    label: 'Database',
    description:
      'Select a partner from the database, then select the database that partner is offering',
    icon: <AppIcon name="StorageOutlined" fallback={StorageOutlinedIcon} sx={{ fontSize: 24 }} />,
  },
  {
    id: 'traffic-source',
    type: 'funnel',
    label: 'Traffic Source',
    description: 'Select a traffic source for this workflow step',
    icon: <AppIcon name="PublicOutlined" fallback={PublicOutlinedIcon} sx={{ fontSize: 24 }} />,
  },
];

// ── Agent Builder blocks ─────────────────────────────────────────
export const AGENT_BLOCKS = [
  {
    id: 'domain-tool',
    type: 'agent',
    label: 'Domain Tool',
    description: 'Call a platform tool (partners, finances, campaigns, injection, reports)',
    icon: <AppIcon name="BuildOutlined" fallback={BuildOutlinedIcon} sx={{ fontSize: 24 }} />,
  },
  {
    id: 'cost-guard',
    type: 'agent',
    label: 'Cost Guard',
    description: 'Check remaining budget before proceeding - blocks if over limit',
    icon: <AppIcon name="AttachMoney" fallback={AttachMoneyIcon} sx={{ fontSize: 24 }} />,
  },
  {
    id: 'report',
    type: 'agent',
    label: 'Submit Report',
    description: 'Submit a report to Consilium (activity, completion, or error)',
    icon: (
      <AppIcon name="AssessmentOutlined" fallback={AssessmentOutlinedIcon} sx={{ fontSize: 24 }} />
    ),
  },
  {
    id: 'human-approval',
    type: 'agent',
    label: 'Human Approval',
    description: 'Pause execution and wait for human approval before continuing',
    icon: <AppIcon name="PersonOutline" fallback={PersonOutlineIcon} sx={{ fontSize: 24 }} />,
  },
  {
    id: 'sub-agent',
    type: 'agent',
    label: 'Sub-Agent',
    description: 'Spawn another agent from a blueprint and optionally wait for result',
    icon: <AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} sx={{ fontSize: 24 }} />,
  },
  {
    id: 'loop',
    type: 'agent',
    label: 'Loop',
    description: 'Iterate over a list of items (max iterations enforced)',
    icon: <AppIcon name="Repeat" fallback={RepeatIcon} sx={{ fontSize: 24 }} />,
  },
  {
    id: 'security-check',
    type: 'agent',
    label: 'Security Check',
    description: 'Run security scanner on content before passing to next step',
    icon: <AppIcon name="ShieldOutlined" fallback={ShieldOutlinedIcon} sx={{ fontSize: 24 }} />,
  },
];

// ── AI Agent workflow blocks (auto-generated from Workflow Schema) ────
export const AI_AGENT_BLOCKS = [
  {
    id: 'llm-provider',
    type: 'agent',
    label: 'LLM Provider',
    description: 'AI model provider and configuration (provider, model, temperature, tokens)',
    icon: (
      <AppIcon name="PsychologyOutlined" fallback={PsychologyOutlinedIcon} sx={{ fontSize: 24 }} />
    ),
  },
  {
    id: 'system-prompt',
    type: 'agent',
    label: 'System Prompt',
    description: 'Agent instructions, personality, and behavior directives',
    icon: (
      <AppIcon
        name="DescriptionOutlined"
        fallback={DescriptionOutlinedIcon}
        sx={{ fontSize: 24 }}
      />
    ),
  },
  {
    id: 'memory-config',
    type: 'agent',
    label: 'Memory',
    description: 'Conversation memory type and context window configuration',
    icon: <AppIcon name="Memory" fallback={MemoryIcon} sx={{ fontSize: 24 }} />,
  },
  {
    id: 'agent-tool',
    type: 'agent',
    label: 'Agent Tool',
    description: 'Tool capability assigned to the agent',
    icon: <AppIcon name="BuildOutlined" fallback={BuildOutlinedIcon} sx={{ fontSize: 24 }} />,
  },
  {
    id: 'agent-constraints',
    type: 'agent',
    label: 'Constraints',
    description: 'Cost and rate limit guardrails for the agent',
    icon: <AppIcon name="ShieldOutlined" fallback={ShieldOutlinedIcon} sx={{ fontSize: 24 }} />,
  },
  {
    id: 'agent-output',
    type: 'agent',
    label: 'Output',
    description: 'Agent response and output delivery',
    icon: <AppIcon name="Send" fallback={SendIcon} sx={{ fontSize: 24 }} />,
  },
];

export const ALL_BLOCKS = [...FUNNEL_BLOCKS, ...AGENT_BLOCKS, ...AI_AGENT_BLOCKS];

export function getBlockById(id) {
  return ALL_BLOCKS.find((b) => b.id === id) || null;
}
