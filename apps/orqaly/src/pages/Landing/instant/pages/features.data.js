/*
 * The Features page, feature by feature. Every item is a normal, equal feature.
 *
 *   today  the main text of the feature
 *   note   optional: a condition in plain words (switched on by you, or needs extra setup)
 *   also   optional: a second capability line, shown under a small "Also" tag
 */

export const FEATURES_CHECKED_ON = '2026-09-19';

// The four features that get a full story of their own on the page, in page order.
export const DEEP_DIVE_IDS = ['workspace', 'flow', 'tracker', 'knowledge'];

export const FEATURES = [
  {
    id: 'workspace',
    icon: 'panel',
    name: 'Workspace panel',
    today:
      'A side panel that reshapes itself around each request: live status, the plan, every file and the final result. It tells you when it needs you. Review there, discuss in chat.',
    evidence: 'ui/desktop/src/orqaly/WorkspacePanel.tsx',
  },
  {
    id: 'flow',
    icon: 'flow',
    name: 'Process flow',
    today: 'A live roadmap shows every stage of the work and which one is running now.',
    note: 'Flow charts and diagrams are drawn in the app once you switch them on.',
    also: 'Mind-map view of the whole process',
    evidence: 'ui/desktop/src/orqaly/workspace/RoadmapView.tsx',
  },
  {
    id: 'tracker',
    icon: 'tracker',
    name: 'Task tracker',
    today:
      'Every move the AI makes, as it happens: grouped by step, with the file, command or error behind each one, and a live timer.',
    also: 'One board for all your agents, in groups and categories, across projects',
    evidence: 'ui/desktop/src/orqaly/workspace/ActivityView.tsx',
  },
  {
    id: 'projects',
    icon: 'folder',
    name: 'Work projects',
    today:
      'A project keeps everything for one piece of work in one place: its chats, knowledge base files, workflows, tasks and results.',
    also: 'Open a project and carry on where you left off, with its files, plan and decisions already in context',
    evidence: 'ui/desktop/src/components/Layout/SessionRow.tsx',
  },
  {
    id: 'knowledge',
    icon: 'book',
    name: 'Knowledge base',
    today: 'Every chat is saved on your Mac and searchable, by you and by the AI.',
    note: 'It can remember how you like things done once you switch memory on.',
    also: 'A structured, encrypted knowledge base of every project, with a short record of your details: name, email, phones, accounts',
    evidence: 'crates/goose/src/session/chat_history_search.rs',
  },
  {
    id: 'voice',
    icon: 'mic',
    name: 'Voice control',
    today: 'Talk instead of typing. Say "submit" and the message is sent.',
    also: 'Spoken replies, so you can talk with it voice to voice',
    evidence: 'ui/desktop/src/orqaly/dictationDefault.ts',
  },
  {
    id: 'browser',
    icon: 'browser',
    name: 'Browser',
    today: 'It previews the pages and files it builds, right inside the app.',
    note: 'With extra setup it can use your Mac (see, click, type) and drive Chrome through a connector.',
    also: 'A built-in browser for you and for agentic browsing',
    evidence: 'ui/desktop/src/orqaly/workspace/FilePreview.tsx',
  },
  {
    id: 'connections',
    icon: 'plug',
    name: 'API and connections',
    today:
      '50+ connectors you switch on one by one, several agents working in parallel, and research on demand with sources you can open.',
    note: 'A local agent API and SDK are early and need setup.',
    also: 'A public cloud API for the cognitive layer and orchestration',
    evidence: 'ui/desktop/src/components/settings/extensions/bundled-extensions.json',
  },
  {
    id: 'lockdown',
    icon: 'lock',
    name: 'Control and lockdown',
    today:
      'You set the rules: approve every action, only the risky ones, or let it run. You can stop any run at any moment.',
    also: 'Instant app lock with a PIN or a security key (U2F, YubiKey)',
    evidence: 'crates/goose-provider-types/src/goose_mode.rs',
  },
  {
    id: 'vault',
    icon: 'key',
    name: 'Passwords',
    today: 'Your Orqanix sign-in is stored in the macOS Keychain, never in a file.',
    also: 'A password vault that keeps your own logins encrypted in the app',
    evidence: 'vendor/orqaly-goose-connector/src/store.mjs',
  },
  {
    id: 'coding',
    icon: 'code',
    name: 'Coding',
    today:
      'It writes and edits real files, runs real commands and shows you every change. It works beside your editor.',
    evidence: 'crates/goose/src/agents/platform_extensions/developer/mod.rs',
  },
  {
    id: 'schedule',
    icon: 'clock',
    name: 'Scaling',
    today: 'Save any job as a recipe, run it again, or let it run on a schedule.',
    evidence: 'crates/goose/src/scheduler.rs',
  },
];
