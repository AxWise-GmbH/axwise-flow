/*
 * The Features page, feature by feature. Every item is a normal, equal feature.
 *
 *   today  the main text of the feature
 *   note   optional: a condition in plain words (switched on by you, or needs extra setup)
 *   also   optional: a second capability line, shown under a small "Also" tag
 */

import { SKIP_KEYS, localeWords, localize } from '../i18n/localize';

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
  {
    id: 'local',
    icon: 'chip',
    name: 'Local inference',
    today:
      'Run open-source models right on your Mac. Search Hugging Face from the app, download a model and chat with it locally.',
    note: 'Each model is a one-time download in setup before its first use.',
    evidence: 'crates/goose-local-inference',
  },
  {
    id: 'prompts',
    icon: 'prompt',
    name: 'Editable system prompts',
    today:
      'Read and rewrite the instructions the AI follows, in plain words, in Settings. Reset any of them to the default at any time.',
    evidence: 'ui/desktop/src/components/settings/PromptsSettingsSection.tsx',
  },
  {
    id: 'providers',
    icon: 'layers',
    name: 'Configurable model providers',
    today:
      'Choose the AI behind the work: Anthropic, OpenAI, Google, OpenRouter, Ollama and more, or add your own provider. Your API keys are encrypted and kept on your Mac.',
    evidence: 'ui/desktop/src/components/settings/providers/ProviderGrid.tsx',
  },
  {
    id: 'scheduler',
    icon: 'calendar',
    name: 'Scheduler',
    today:
      'Pick when a job runs: every morning, every Monday or on your own timetable. It starts on time without you.',
    evidence: 'ui/desktop/src/components/schedule/CronPicker.tsx',
  },
  {
    id: 'sandbox',
    icon: 'box',
    name: 'Sandbox for apps',
    today:
      'Ask for a small app and it builds one. Each app runs in its own sandboxed window with strict security rules.',
    evidence: 'crates/goose/src/agents/platform_extensions/apps.rs',
  },
  {
    id: 'skills',
    icon: 'spark',
    name: 'Skills library',
    today:
      'Skills teach the AI how to do a job your way. Browse them in one place, add your own, and it uses the right one when the job needs it.',
    evidence: 'ui/desktop/src/components/skills/SkillsView.tsx',
  },
];

// Words in other languages: pg.feature.<id>.<field>. The source paths stay as written.
const FEATURE_SKIP = new Set([...SKIP_KEYS, 'evidence']);
const featurePrefix = (feature) => `pg.feature.${feature.id}`;

/** One feature in the current language; `english` keeps the original for logic on the words. */
export function localizeFeature(feature, t) {
  return { ...localize(feature, featurePrefix(feature), t, FEATURE_SKIP), english: feature };
}

export function featureWords() {
  return Object.assign(
    {},
    ...FEATURES.map((feature) => localeWords(feature, featurePrefix(feature), FEATURE_SKIP))
  );
}
