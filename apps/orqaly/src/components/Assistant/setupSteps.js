/**
 * Shared definition of the AI-assistant setup capabilities. Consumed by both
 * the step-by-step wizard (AssistantSetupWizard) and the conversational support
 * chat (AssistantSetupChatDialog) so the two views stay in lock-step on labels,
 * icons, order and which step is required.
 *
 * `required` marks the activation gate: configuring the BYOK Core (keys) is
 * the one must-have - everything else is optional and can be added later, so it
 * leads the list. The `keys` id is persisted in assistant_setup; only the
 * display name is "Core" (matching the /assistant page's Core card).
 */
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import DatasetRoundedIcon from '@mui/icons-material/DatasetRounded';
import QuizRoundedIcon from '@mui/icons-material/QuizRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import ByokByosCard from './cards/ByokByosCard';
import DataCard from './cards/DataCard';
import CompanyBriefCard from './cards/CompanyBriefCard';
import InsightsCard from './cards/InsightsCard';
import ChannelConnectCard from './cards/ChannelConnectCard';
import VoiceCard from './cards/VoiceCard';

export const ASSISTANT_SETUP_STEPS = [
  {
    key: 'keys',
    label: 'Keys & storage (BYOK/BYOS)',
    short: 'Core',
    icon: KeyRoundedIcon,
    Card: ByokByosCard,
    required: true,
    desc: 'Pick the AI model and storage that power the assistant - its Core. Required to finish.',
  },
  {
    key: 'data',
    label: 'Add your data',
    short: 'Data',
    icon: DatasetRoundedIcon,
    Card: DataCard,
    desc: 'Bring in company info, contacts, files or notes so the assistant knows your business.',
  },
  {
    key: 'brief',
    label: 'Company brief',
    short: 'Brief',
    icon: QuizRoundedIcon,
    Card: CompanyBriefCard,
    desc: 'Answer a few quick questions so the assistant understands your goals and tone of voice.',
  },
  {
    key: 'insights',
    label: 'Insights & first steps',
    short: 'Insights',
    icon: InsightsRoundedIcon,
    Card: InsightsCard,
    desc: 'Generate a first-30-days plan and see what the assistant suggests doing first.',
  },
  {
    key: 'channel',
    label: 'Connect a channel',
    short: 'Channel',
    icon: ForumRoundedIcon,
    Card: ChannelConnectCard,
    desc: 'Link a Telegram or Slack bot so your assistant can message you and your customers.',
  },
  {
    key: 'voice',
    label: 'Voice - talk & listen',
    short: 'Voice',
    icon: GraphicEqRoundedIcon,
    Card: VoiceCard,
    desc: 'Talk to your assistant and hear human-like replies. Use a local Voicebox, or the built-in voice.',
  },
];
