/*
 * Every capability the landing claims, with where it was verified.
 *
 * badge:  'now'        works after sign-in on factory settings
 *         'switch-on'  in the app, off until the user turns it on
 *         'planned'    no code yet; may only appear in the Planned band
 * show:   'card'       one of the three visible lines of its card
 *         'more'       listed under the card's More
 * evidence: path in the desktop source (orqaly-goose, branch orqanix/workspace-redesign),
 *           checked on the date below. Re-check on every desktop release; the public
 *           download, not the source branch, is the reference before this page goes live.
 */

export const CAPABILITIES_CHECKED_ON = '2026-09-19';

export const SWITCH_ON_LABEL = 'you switch it on';

export const CAPABILITY_GROUPS = [
  {
    id: 'work',
    title: 'Work',
    items: [
      {
        text: 'Live plan beside the chat',
        badge: 'now',
        show: 'card',
        evidence: 'ui/desktop/src/orqaly/workspace/RoadmapView.tsx',
      },
      {
        text: 'Every action shown',
        badge: 'now',
        show: 'card',
        evidence: 'ui/desktop/src/orqaly/workspace/ActivityView.tsx',
      },
      {
        text: 'It asks, you tap',
        badge: 'now',
        show: 'card',
        evidence: 'ui/desktop/src/orqaly/ReplyQuestionForm.tsx',
      },
      {
        text: 'A side panel for each request: status, plan, files and results',
        badge: 'now',
        show: 'more',
        evidence: 'ui/desktop/src/orqaly/WorkspacePanel.tsx',
      },
      {
        text: 'Previews the pages and files it builds, inside the app',
        badge: 'now',
        show: 'more',
        evidence: 'ui/desktop/src/orqaly/workspace/FilePreview.tsx',
      },
    ],
  },
  {
    id: 'remember',
    title: 'Remember',
    items: [
      {
        text: 'Chats saved on your Mac',
        badge: 'now',
        show: 'card',
        evidence: 'crates/goose/src/session/mod.rs',
      },
      {
        text: 'Searchable history',
        badge: 'now',
        show: 'card',
        evidence: 'crates/goose/src/session/chat_history_search.rs',
      },
      {
        text: 'Repeat jobs on a schedule',
        badge: 'now',
        show: 'card',
        evidence: 'crates/goose/src/scheduler.rs',
      },
      {
        text: 'History is searchable by you and by the AI',
        badge: 'now',
        show: 'more',
        evidence: 'crates/goose/src/session/chat_history_search.rs',
      },
      {
        text: 'Chats are grouped by the folder you worked in',
        badge: 'now',
        show: 'more',
        evidence: 'ui/desktop/src/components/Layout/SessionRow.tsx',
      },
      {
        text: 'Remembers how you like things done',
        badge: 'switch-on',
        show: 'more',
        evidence: 'ui/desktop/src/components/settings/extensions/bundled-extensions.json',
      },
    ],
  },
  {
    id: 'protect',
    title: 'Protect',
    items: [
      {
        text: 'You set the rules',
        badge: 'now',
        show: 'card',
        evidence: 'ui/desktop/src/components/settings/mode/ModeSection.tsx',
      },
      {
        text: 'Stop any run, any time',
        badge: 'now',
        show: 'card',
        evidence: 'ui/desktop/src/components/ChatInput.tsx',
      },
      {
        text: 'Files stay on your Mac',
        badge: 'now',
        show: 'card',
        evidence: 'ORQALY.md',
      },
      {
        text: 'Approve every action, only the risky ones, or let it run. Choose in Settings',
        badge: 'now',
        show: 'more',
        evidence: 'crates/goose-provider-types/src/goose_mode.rs',
      },
      {
        text: 'What you ask, and the results the AI needs, are sent to the cloud AI',
        badge: 'now',
        show: 'more',
        evidence: 'ORQALY.md',
      },
      {
        text: 'Your sign-in is stored in the macOS Keychain, never in a file',
        badge: 'now',
        show: 'more',
        evidence: 'vendor/orqaly-goose-connector/src/store.mjs',
      },
      {
        text: 'No AI key to manage: model keys stay on our servers',
        badge: 'now',
        show: 'more',
        evidence: 'ORQALY.md',
      },
      {
        text: 'Prompt-attack detection: a suspicious command stops and asks you first',
        badge: 'switch-on',
        show: 'more',
        evidence: 'crates/goose/src/security/mod.rs',
      },
    ],
  },
  {
    id: 'connect',
    title: 'Connect',
    items: [
      {
        text: "Talk, don't type",
        badge: 'now',
        show: 'card',
        evidence: 'ui/desktop/src/orqaly/dictationDefault.ts',
      },
      {
        text: 'Research with sources',
        badge: 'now',
        show: 'card',
        evidence: 'vendor/orqaly-goose-connector/src/mcp.mjs',
      },
      {
        text: '50+ connectors',
        badge: 'now',
        show: 'card',
        evidence: 'ui/desktop/src/components/settings/extensions/bundled-extensions.json',
      },
      {
        text: 'Connectors are switched on one by one; some need your own account or key',
        badge: 'now',
        show: 'more',
        evidence: 'ui/desktop/src/components/settings/extensions/bundled-extensions.json',
      },
      {
        text: 'Flow charts and diagrams drawn in the app',
        badge: 'switch-on',
        show: 'more',
        evidence: 'ui/desktop/src/components/settings/extensions/bundled-extensions.json',
      },
      {
        text: 'Works in 16 languages',
        badge: 'now',
        show: 'more',
        evidence: 'ui/desktop/src/i18n/messages',
      },
    ],
  },
];

// The seven cards of the moving strip on the home page. Owner decision (2026-09-20): shown
// without any "planned" wording. The desktop source had no code for them on 2026-09-19, so
// re-check against the public download before this page goes live.
export const PLANNED = [
  'App lock (PIN, YubiKey)',
  'Password vault',
  'Spoken replies',
  'Built-in browser',
  'Mind map',
  'Business details vault',
  'Project folders',
];

// The strip's own vocabulary: these words may appear inside the strip (.oi-planned) and
// nowhere else on the page, so each of the seven is named exactly once.
export const PLANNED_PATTERN =
  /\bPIN\b|YubiKey|U2F|password vault|voice-to-voice|spoken replies|built-in browser|mind.?map/i;

export const DEVELOPER_LINES = [
  'Writes and edits real files',
  'Runs real commands',
  'Shows every change',
  'Several agents in parallel',
  'Works beside your editor (it is not an IDE)',
];

export const DEVELOPER_EARLY_LINES = [
  'Can use your Mac: see, click, type. Needs Homebrew and macOS permissions',
  'Can drive Chrome through a connector',
  'Local agent API and SDK. No public cloud API',
];

// One short line under each strip card's name, keyed by that name.
export const STRIP_NOTES = {
  'App lock (PIN, YubiKey)': 'Lock the app in one tap with a PIN or a security key.',
  'Password vault': 'Your logins, encrypted, right inside the app.',
  'Spoken replies': 'Talk to it and hear it answer.',
  'Built-in browser': 'Browse yourself, or let the AI browse for you.',
  'Mind map': 'See the whole process as one map.',
  'Business details vault': 'Your key details, kept safe in one place.',
  'Project folders': 'Chats, files and tasks, grouped by project.',
};

// A stable id per strip card, for its words in other languages (cap.strip.<id>.name/.note).
export const STRIP_IDS = {
  'App lock (PIN, YubiKey)': 'lock',
  'Password vault': 'passwords',
  'Spoken replies': 'spoken',
  'Built-in browser': 'browser',
  'Mind map': 'mindmap',
  'Business details vault': 'business',
  'Project folders': 'folders',
};

/** The translation key of a strip card's `name` or `note`. */
export function stripKey(item, field) {
  return `cap.strip.${STRIP_IDS[item] ?? item}.${field}`;
}
