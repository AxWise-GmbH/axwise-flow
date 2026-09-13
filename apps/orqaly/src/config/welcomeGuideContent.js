// Content for the in-app Welcome Guide pop-up (src/components/Onboarding/WelcomeGuide.jsx).
//
// All user-facing copy lives here so wording can be reviewed and edited without
// touching component logic. Branding: "Orqaly" (the public product name).
// Style: plain hyphens only, no em or en dashes.
//
// Each section references a self-contained "Demo" mockup from src/components/Public/demo/.
// Those components are theme-aware, prop-free, and dependency-light, so the guide can show a
// real preview of the actual product UI for every feature.

import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined';

import DemoSimpleMode from '../components/Public/demo/DemoSimpleMode';
import DemoGoalPipeline from '../components/Public/demo/DemoGoalPipeline';
import DemoGoalLaunch from '../components/Public/demo/DemoGoalLaunch';
import DemoConsilium from '../components/Public/demo/DemoConsilium';
import DemoAgentHub from '../components/Public/demo/DemoAgentHub';
import DemoToolsMcp from '../components/Public/demo/DemoToolsMcp';
import DemoKnowledgeBase from '../components/Public/demo/DemoKnowledgeBase';
import DemoMarketplace from '../components/Public/demo/DemoMarketplace';
import DemoWorkflow from '../components/Public/demo/DemoWorkflow';
import DemoTokenTracking from '../components/Public/demo/DemoTokenTracking';
import DemoAgentAudit from '../components/Public/demo/DemoAgentAudit';
import DemoGoalResults from '../components/Public/demo/DemoGoalResults';
import DemoToolsTrust from '../components/Public/demo/DemoToolsTrust';

// Panel 1 - the one-paragraph pitch, with a live home-screen preview.
export const WELCOME_INTRO = {
  kicker: 'Welcome to Orqaly',
  iconName: 'AutoAwesome',
  FallbackIcon: AutoAwesomeOutlinedIcon,
  Demo: DemoSimpleMode,
  title: 'Describe a goal. Get a finished result.',
  body:
    'Orqaly is an AI workforce, not a single chatbot. You describe what you want in plain ' +
    'language and set a budget. An AI board (the Consilium) plans it, assembles a team of ' +
    'specialist agents, gives them the right tools, and runs the work for you. You watch it ' +
    'happen live, then review, rate and refine the result. This guide walks you through the ' +
    'whole platform and shows you where to start.',
};

// Panel 2 - how it all connects. The component renders the stages as a chain of
// chips with arrows, the supporting systems beneath, then a real pipeline preview.
export const WELCOME_FLOW = {
  kicker: 'How it all connects',
  iconName: 'HubOutlined',
  FallbackIcon: HubOutlinedIcon,
  Demo: DemoGoalPipeline,
  title: 'One loop runs everything',
  intro:
    'Every piece of Orqaly serves a single loop. Learn this and the rest of the platform ' +
    'falls into place.',
  stages: [
    { label: 'Goal', caption: 'your ask, plus a budget' },
    { label: 'Consilium', caption: 'the AI board plans it' },
    { label: 'Team', caption: 'led by a team lead' },
    { label: 'Agents', caption: 'run tasks in parallel' },
    { label: 'Tools', caption: 'web, email, code, design' },
    { label: 'Result', caption: 'reviewed and rated' },
  ],
  supportingTitle: 'Supporting systems that touch every stage',
  supporting: [
    'Knowledge Base is the memory agents read from for context',
    'Communicator delivers results to chat, Telegram, voice and email',
    'Finances and LLM Usage meter every dollar and token spent',
    'Audit Log records every move, immutably',
    'Marketplace stocks ready-made agents, tools and templates',
    'Workflows run this same loop on a schedule or a trigger',
  ],
  previewLabel: 'A real goal moving through the pipeline',
};

// Panel 3 - the chapter hub. Each card previews and expands into a focused explanation.
export const WELCOME_CHAPTERS = [
  {
    id: 'goals',
    iconName: 'TrackChangesOutlined',
    FallbackIcon: TrackChangesOutlinedIcon,
    Demo: DemoGoalLaunch,
    title: 'Goals',
    summary: 'How you ask for work.',
    body:
      'A goal is a plain-language request with a budget, for example "Write a one-page ' +
      'competitor summary for the EU coffee-pod market." Keep your first one small and ' +
      'concrete. The budget is a hard spending cap, so the work stops before it overruns.',
    where: 'Find it on the Dashboard hero prompt, and review past goals on the Goals page.',
  },
  {
    id: 'consilium',
    iconName: 'GroupsOutlined',
    FallbackIcon: GroupsOutlinedIcon,
    Demo: DemoConsilium,
    title: 'The Consilium',
    summary: 'Your AI board.',
    body:
      'The Consilium is a council of specialist AI agents that plans your goal. It checks ' +
      'whether the goal is feasible, writes the spec, splits it into tasks and picks the team. ' +
      'You set the goal; the board decides the plan. It is not a human board and you do not ' +
      'steer it task by task.',
    where: 'Find it under Consilium.',
  },
  {
    id: 'agents',
    iconName: 'SmartToyOutlined',
    FallbackIcon: SmartToyOutlinedIcon,
    Demo: DemoAgentHub,
    title: 'Agents and teams',
    summary: 'Who does the work.',
    body:
      'An agent is an AI worker that owns one task. The board groups agents into a team led by ' +
      'a team lead. Agents have memory, so they remember earlier work, can use tools, and are ' +
      'rated after each run so they improve over time.',
    where: 'Find them in the Agent Hub.',
  },
  {
    id: 'tools',
    iconName: 'BuildOutlined',
    FallbackIcon: BuildOutlinedIcon,
    Demo: DemoToolsMcp,
    title: 'Tools',
    summary: 'What agents use to act.',
    body:
      'Tools are connectable capabilities such as web search, email, code, browsing or design. ' +
      '"MCP" is just the standard for plugging them in. Some tools need an API key, so a goal ' +
      'can pause and ask you for one before it continues.',
    where: 'Find them under Tools.',
  },
  {
    id: 'knowledge-base',
    iconName: 'MenuBookOutlined',
    FallbackIcon: MenuBookOutlinedIcon,
    Demo: DemoKnowledgeBase,
    title: 'Knowledge Base',
    summary: 'Give agents context.',
    body:
      'Upload documents, links and notes, and agents search them while planning and working. ' +
      'It is a search-and-memory layer, not a chatbot, so you do not chat with it directly. ' +
      'Good context here means agents repeat less work and stay on-brand.',
    where: 'Find it under Knowledge Base.',
  },
  {
    id: 'marketplace',
    iconName: 'StorefrontOutlined',
    FallbackIcon: StorefrontOutlinedIcon,
    Demo: DemoMarketplace,
    title: 'Marketplace',
    summary: 'Hire ready-made, or sell your own.',
    body:
      'Install pre-built agents, tools, skills and whole business templates in one click. It is ' +
      'a two-sided economy: creators publish and earn 85 percent of the revenue. Installed ' +
      'items are snapshots, so later updates to the original do not change your copy.',
    where: 'Find it under Marketplace.',
  },
  {
    id: 'workflows',
    iconName: 'ExtensionOutlined',
    FallbackIcon: ExtensionOutlinedIcon,
    Demo: DemoWorkflow,
    title: 'Workflows vs goals',
    summary: 'One-time vs repeatable.',
    body:
      'A goal is a one-time request. A workflow is a repeatable automation that runs on a ' +
      'trigger or schedule, for example "when a form is submitted, draft a reply and email ' +
      'it." Use a goal to get something done once; use a workflow for recurring work.',
    where: 'Find it under Workflow.',
  },
  {
    id: 'costs',
    iconName: 'RequestQuoteOutlined',
    FallbackIcon: RequestQuoteOutlinedIcon,
    Demo: DemoTokenTracking,
    title: 'Costs and budgets',
    summary: 'Stay in control of spend.',
    body:
      'Each goal has a budget that acts as a hard cap. Finances shows spend by goal, agent, ' +
      'team or project, and LLM Usage breaks down token cost and latency by provider. Raise a ' +
      'budget if a goal halts because it hit the cap.',
    where: 'Find them under Finances and LLM Usage.',
  },
  {
    id: 'transparency',
    iconName: 'VisibilityOutlined',
    FallbackIcon: VisibilityOutlinedIcon,
    Demo: DemoAgentAudit,
    title: 'Transparency',
    summary: 'Nothing is a black box.',
    body:
      'Every action an agent takes is recorded in an immutable, append-only Audit Log, so you ' +
      'can always see who did what and when. You rate each result on a 5-star scale, and that ' +
      'feedback feeds the next iteration. There is no undo, only a new action.',
    where: 'Find it under Audit Log.',
  },
  {
    id: 'modes',
    iconName: 'TuneOutlined',
    FallbackIcon: TuneOutlinedIcon,
    Demo: DemoSimpleMode,
    title: 'Simple vs Advanced mode',
    summary: 'Start simple, graduate later.',
    body:
      'Simple Mode is the default: a clean dock and a guided cockpit built for getting started. ' +
      'Advanced Mode adds a full sidebar with organizations, teams, roles, billing and every ' +
      'operational page. Switch any time from the account menu, and switch back whenever you ' +
      'like.',
    where: 'Toggle it from the account menu in the top bar.',
  },
];

// Panel 4 - the concrete starting path, with a result preview.
export const WELCOME_START = {
  kicker: 'Where to start',
  iconName: 'RocketLaunchOutlined',
  FallbackIcon: RocketLaunchOutlinedIcon,
  Demo: DemoGoalResults,
  title: 'Your first goal in about 15 minutes',
  steps: [
    'Stay in Simple Mode (the default) for your first session.',
    'Open Setup and add one LLM API key. This is bring-your-own-key, so Orqaly never reads it.',
    'On the Dashboard, write one small, concrete goal and set a modest budget.',
    'Watch the pipeline: feasibility, plan, team, tools, then execution, live.',
    'If a step asks for a tool credential, add it or pick a tool that needs none.',
    'When it finishes, review the result, give it a rating, and try one-click Refine.',
  ],
  ctaPrimary: 'Start setup',
  ctaSecondary: 'Explore the platform',
};

// Panel 5 - key terms.
export const WELCOME_GLOSSARY = {
  kicker: 'Key terms',
  iconName: 'SchoolOutlined',
  FallbackIcon: SchoolOutlinedIcon,
  title: 'The words you will see',
  terms: [
    { term: 'Goal', def: 'A plain-language request with a budget. The unit of work you submit.' },
    {
      term: 'Consilium',
      def: 'The AI board that plans your goal. You set goals; it decides the plan.',
    },
    { term: 'Agent', def: 'An AI worker that owns one task. It has memory and can be rated.' },
    { term: 'Team lead', def: 'The agent that coordinates the team assembled for your goal.' },
    {
      term: 'Tool / MCP',
      def: 'A capability an agent uses, like web search or email. MCP is how tools plug in.',
    },
    { term: 'Knowledge Base', def: 'The documents agents search for context. Search, not chat.' },
    { term: 'Budget', def: 'A hard spending cap per goal. Work halts before it overruns.' },
    {
      term: 'Deliverable',
      def: 'A goal output. Versioned, so new versions never overwrite old ones.',
    },
    {
      term: 'BYOK / BYOS',
      def: 'Bring Your Own Key or Storage. Your keys and data stay on your side.',
    },
    {
      term: 'Simple / Advanced',
      def: 'Simple is the guided default. Advanced unlocks the full admin sidebar.',
    },
  ],
};

// Panel 6 - operators / self-hosters (clearly separated track), with a trust/keys preview.
export const WELCOME_OPERATORS = {
  kicker: 'For operators and self-hosters',
  iconName: 'DnsOutlined',
  FallbackIcon: DnsOutlinedIcon,
  Demo: DemoToolsTrust,
  title: 'Running your own Orqaly',
  intro:
    'Most people can skip this. It is for those setting up or operating an instance rather ' +
    'than just using one.',
  points: [
    {
      label: 'Providers and keys (BYOK)',
      body: 'Add LLM provider keys in Setup or Settings. Keys are stored encrypted and Orqaly cannot read your prompts.',
    },
    {
      label: 'Storage (BYOS)',
      body: 'Point Orqaly at your own Supabase bucket or Amazon S3 so your data stays on your side.',
    },
    {
      label: 'Personal database',
      body: 'Connect Supabase, PostgreSQL or another database so agents can read and write your own data.',
    },
    {
      label: 'Local models',
      body: 'Connect Ollama or a local OpenAI-compatible endpoint to keep cheap or private work in-house.',
    },
    {
      label: 'Workspace and roles',
      body: 'Your top-level organization is your workspace. Roles and permissions are enforced at the database level.',
    },
  ],
  ctaPrimary: 'Open setup',
};

// Panel order, used for navigation and the step dots.
export const WELCOME_PANELS = [
  { id: 'intro', kind: 'intro' },
  { id: 'flow', kind: 'flow' },
  { id: 'chapters', kind: 'chapters' },
  { id: 'start', kind: 'start' },
  { id: 'glossary', kind: 'glossary' },
  { id: 'operators', kind: 'operators' },
];
