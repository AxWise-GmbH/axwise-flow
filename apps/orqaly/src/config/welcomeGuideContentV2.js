// Content for Welcome Guide v2 (story version) - src/components/Onboarding/WelcomeGuideV2.jsx.
//
// v2 reframes the guide as a 10-slide narrative: a welcome, five "how to operate" steps, then
// the reference slides (explore hub, where to start, key terms, operators). Each story slide is a
// clean two-column feature layout: concise text on the left, a real product mockup on the right.
// Branding: "Orqaly". Plain hyphens only.
//
// The reference slides (chapters / start / glossary / operators) reuse v1's panels, which read
// from welcomeGuideContent.js - so they are not duplicated here.

import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import SchemaOutlinedIcon from '@mui/icons-material/SchemaOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import StadiumOutlinedIcon from '@mui/icons-material/StadiumOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import SpeedOutlinedIcon from '@mui/icons-material/SpeedOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';

import DemoSimpleMode from '../components/Public/demo/DemoSimpleMode';
import DemoAssistantSetup from '../components/Public/demo/DemoAssistantSetup';
import DemoOrgStructure from '../components/Public/demo/DemoOrgStructure';
import DemoProcessFlow from '../components/Public/demo/DemoProcessFlow';
import DemoControlCenter from '../components/Public/demo/DemoControlCenter';
import DemoCommChannels from '../components/Public/demo/DemoCommChannels';
import DemoArena from '../components/Public/demo/DemoArena';

// Slide 1 - Welcome.
const V2_INTRO = {
  kicker: 'Welcome to Orqaly',
  iconName: 'AutoAwesome',
  FallbackIcon: AutoAwesomeOutlinedIcon,
  Demo: DemoSimpleMode,
  title: 'Describe a goal. Get a finished result.',
  body:
    'Orqaly is an AI workforce, not a single chatbot. Describe what you want in plain language and ' +
    'an AI organization plans it, does the work, and hands you a result to review. These slides ' +
    'walk you through getting started.',
};

// Slide 2 - Connect Assistant.
const V2_ASSISTANT = {
  kicker: 'Connect Assistant',
  iconName: 'SupportAgentOutlined',
  FallbackIcon: SupportAgentOutlinedIcon,
  Demo: DemoAssistantSetup,
  title: 'An assistant that learns your business',
  body:
    'Start by connecting your assistant. It interviews you about your business in plain language, ' +
    'then helps you set everything up and implement your first goals. No forms to figure out, ' +
    'just a conversation.',
};

// Slide 3 - Organization & Consilium.
const V2_ORG = {
  kicker: 'Organization & Consilium',
  iconName: 'AccountTreeOutlined',
  FallbackIcon: AccountTreeOutlinedIcon,
  Demo: DemoOrgStructure,
  mockupMaxHeight: 460,
  title: 'Create an organization and its board',
  body:
    'Set up your organization, then add a Consilium - an AI board of directors. The board debates, ' +
    'votes and governs every goal, so the business runs with oversight rather than a single agent ' +
    'acting alone.',
};

// Slide 4 - Trust the Process. The loop lives in the illustration (DemoProcessFlow), so the left
// column is just the explainer text - no duplicate timeline.
const V2_PROCESS = {
  kicker: 'Trust the process',
  iconName: 'HubOutlined',
  FallbackIcon: HubOutlinedIcon,
  Demo: DemoProcessFlow,
  mockupMaxHeight: 470,
  title: 'One loop runs everything',
  body:
    'Hand over a goal and the same loop runs end to end - the board hires a team, agents do the work ' +
    'with the right tools, and you review the result. You stay in control without doing the steps ' +
    'yourself.',
};

// Slide 5 - View Reports.
const V2_REPORTS = {
  kicker: 'View Reports',
  iconName: 'InsightsOutlined',
  FallbackIcon: InsightsOutlinedIcon,
  Demo: DemoControlCenter,
  mockupMaxHeight: 470,
  title: 'See and steer the work',
  body: 'Live dashboards keep you in control without chasing updates.',
  bullets: [
    {
      iconName: 'AssignmentTurnedInOutlined',
      FallbackIcon: AssignmentTurnedInOutlinedIcon,
      label: 'Monitor tasks',
      sub: 'Track every goal and task in flight.',
    },
    {
      iconName: 'SchemaOutlined',
      FallbackIcon: SchemaOutlinedIcon,
      label: 'Edit workflows',
      sub: 'Adjust the automations that run the work.',
    },
    {
      iconName: 'ChatOutlined',
      FallbackIcon: ChatOutlinedIcon,
      label: 'Review conversations',
      sub: 'Read what agents said and decided.',
    },
  ],
};

// Slide 6 - Easy Use.
const V2_EASYUSE = {
  kicker: 'Easy use',
  iconName: 'ForumOutlined',
  FallbackIcon: ForumOutlinedIcon,
  Demo: DemoCommChannels,
  title: 'Talk to it from any messenger',
  body:
    'You do not need to sit in the dashboard. Reach the platform from Telegram, Slack, web chat, ' +
    'voice or email - send a goal, get updates, and approve results from wherever you already work.',
};

// Slide 7 - Arena.
const V2_ARENA = {
  kicker: 'Compare in Arena',
  iconName: 'StadiumOutlined',
  FallbackIcon: StadiumOutlinedIcon,
  Demo: DemoArena,
  title: 'See where agents beat doing it by hand',
  body:
    'Arena puts your people and your agents on the same daily job - an SMM pack, a contract ' +
    'review, a payroll run - and shows both results side by side. Rate each one, pick a winner, ' +
    'and Arena keeps score by department so you can see where handing the work over actually pays.',
  bullets: [
    {
      iconName: 'PaidOutlined',
      FallbackIcon: PaidOutlinedIcon,
      label: 'Real cost per job',
      sub: 'What each side cost, once you tell it what your people are paid.',
    },
    {
      iconName: 'SpeedOutlined',
      FallbackIcon: SpeedOutlinedIcon,
      label: 'Time and rework',
      sub: 'How long each took, and how often the result had to be redone.',
    },
    {
      iconName: 'WorkspacePremiumOutlined',
      FallbackIcon: WorkspacePremiumOutlinedIcon,
      label: 'A recommendation, not a decision',
      sub: 'Hand over, assist, or keep human - with every number behind it shown.',
    },
  ],
};

// Final slide - a call to action. Each card navigates to where the action is performed.
const V2_CTA = {
  kicker: 'Get started',
  iconName: 'RocketLaunchOutlined',
  FallbackIcon: RocketLaunchOutlinedIcon,
  title: "Let's make your first step!",
  subtitle: 'Pick one to get going - we will take you straight there.',
  // Each action opens its real dialog via the orch-quick-action window event (see QuickActionDialogs).
  actions: [
    {
      id: 'assistant',
      label: 'Activate Assistant',
      sub: 'Set up your AI assistant.',
      iconName: 'SmartToyOutlined',
      FallbackIcon: SmartToyOutlinedIcon,
    },
    {
      id: 'org',
      label: 'Create Organization',
      sub: 'Set up your workspace.',
      iconName: 'CorporateFareOutlined',
      FallbackIcon: CorporateFareOutlinedIcon,
    },
    {
      id: 'keys',
      label: 'Select AI Core',
      sub: 'Choose how you pay for AI.',
      iconName: 'VpnKeyOutlined',
      FallbackIcon: VpnKeyOutlinedIcon,
    },
    {
      id: 'hire',
      label: 'Hire US',
      sub: 'Get help from our team.',
      iconName: 'GroupsOutlined',
      FallbackIcon: GroupsOutlinedIcon,
    },
  ],
};

// Slide order. Story slides carry their content; reference + cta slides render by kind.
export const WELCOME_V2_PANELS = [
  { id: 'intro', kind: 'story', content: V2_INTRO },
  { id: 'assistant', kind: 'story', content: V2_ASSISTANT },
  { id: 'org', kind: 'story', content: V2_ORG },
  { id: 'process', kind: 'story', content: V2_PROCESS },
  { id: 'reports', kind: 'story', content: V2_REPORTS },
  { id: 'easyuse', kind: 'story', content: V2_EASYUSE },
  { id: 'arena', kind: 'story', content: V2_ARENA },
  { id: 'chapters', kind: 'chapters' },
  { id: 'operators', kind: 'operators' },
  { id: 'cta', kind: 'cta', content: V2_CTA },
];
