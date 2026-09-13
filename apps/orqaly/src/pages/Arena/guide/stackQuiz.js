/**
 * The stack quiz — plain-language questions that map a non-technical answer
 * onto our connectable catalog.
 *
 * Every option either names a catalog id from src/config/mcpToolCatalog.js
 * (we can connect it by button) or is the built-in "something else" free-text
 * escape, which becomes a custom gap row handled by the developer-brief step.
 * Questions carry the departments they matter to, so the quiz only asks about
 * work the company actually said it does.
 *
 * Pure data + pure helpers, fully unit-testable; stackQuiz.test.js proves every
 * catalogId resolves and every department exists.
 */
import { getMcpAppById } from '../../../config/mcpToolCatalog';
import { DEPARTMENT_IDS } from '../../../config/departments';

export const QUIZ = [
  {
    id: 'work-tracking',
    question: 'Where does your team track its work?',
    departments: ['developing', 'management', 'operations', 'marketing'],
    options: [
      { catalogId: 'mcp-jira', label: 'Jira' },
      { catalogId: 'mcp-trello', label: 'Trello' },
      { catalogId: 'mcp-asana', label: 'Asana' },
      { catalogId: 'mcp-linear', label: 'Linear' },
      { catalogId: 'mcp-notion', label: 'Notion' },
    ],
  },
  {
    id: 'customer-questions',
    question: 'Where do customer questions arrive?',
    departments: ['operations', 'marketing'],
    options: [
      { catalogId: 'mcp-zendesk', label: 'Zendesk' },
      { catalogId: 'mcp-intercom', label: 'Intercom' },
      { catalogId: 'mcp-gmail', label: 'Gmail' },
      { catalogId: 'mcp-outlook', label: 'Outlook' },
    ],
  },
  {
    id: 'documents',
    question: 'Where do documents and files live?',
    departments: ['management', 'legal', 'operations', 'marketing', 'developing', 'accountants'],
    options: [
      { catalogId: 'mcp-google-drive', label: 'Google Drive' },
      { catalogId: 'mcp-dropbox', label: 'Dropbox' },
      { catalogId: 'mcp-notion', label: 'Notion' },
      { catalogId: 'mcp-confluence', label: 'Confluence' },
    ],
  },
  {
    id: 'team-chat',
    question: 'Where does your team talk to each other?',
    departments: ['management', 'operations', 'developing', 'marketing'],
    options: [
      { catalogId: 'mcp-slack', label: 'Slack' },
      { catalogId: 'mcp-teams', label: 'Microsoft Teams' },
      { catalogId: 'mcp-discord', label: 'Discord' },
    ],
  },
  {
    id: 'code',
    question: 'Where does your code live?',
    departments: ['developing'],
    options: [
      { catalogId: 'mcp-github', label: 'GitHub' },
      { catalogId: 'mcp-gitlab', label: 'GitLab' },
    ],
  },
  {
    id: 'customers-crm',
    question: 'Where do you keep customers and deals?',
    departments: ['marketing', 'management'],
    options: [
      { catalogId: 'mcp-hubspot', label: 'HubSpot' },
      { catalogId: 'mcp-salesforce', label: 'Salesforce' },
      { catalogId: 'mcp-pipedrive', label: 'Pipedrive' },
    ],
  },
  {
    id: 'money',
    question: 'What handles the money?',
    departments: ['accountants', 'management'],
    options: [
      { catalogId: 'mcp-stripe', label: 'Stripe' },
      { catalogId: 'mcp-quickbooks', label: 'QuickBooks' },
      { catalogId: 'mcp-xero', label: 'Xero' },
    ],
  },
  {
    id: 'schedules',
    question: 'Where do meetings and schedules live?',
    departments: ['management', 'operations', 'legal'],
    options: [
      { catalogId: 'mcp-google-calendar', label: 'Google Calendar' },
      { catalogId: 'mcp-calendly', label: 'Calendly' },
    ],
  },
  {
    id: 'numbers',
    question: 'Where do your numbers and reports live?',
    departments: ['accountants', 'management', 'marketing'],
    options: [
      { catalogId: 'mcp-google-sheets', label: 'Google Sheets' },
      { catalogId: 'mcp-airtable', label: 'Airtable' },
      { catalogId: 'mcp-bigquery', label: 'BigQuery' },
    ],
  },
  {
    id: 'design',
    question: 'Where does design work happen?',
    departments: ['marketing', 'developing'],
    options: [
      { catalogId: 'mcp-figma', label: 'Figma' },
      { catalogId: 'mcp-canva', label: 'Canva' },
    ],
  },
];

/**
 * Questions relevant to the departments the company actually enabled. A
 * company running only its own custom departments matches nothing here, so
 * the quiz falls back to every question rather than going blank.
 */
export function questionsForDepartments(enabledIds = []) {
  const enabled = new Set(enabledIds);
  if (!enabled.size) return QUIZ;
  const matched = QUIZ.filter((q) => q.departments.some((d) => enabled.has(d)));
  return matched.length ? matched : QUIZ;
}

/** Slug for a "something else" answer: 'Monday.com' -> 'custom:monday-com'. */
export function customKey(label) {
  const slug = String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `custom:${slug || 'tool'}`;
}

/**
 * Turn quiz selections into the arena_stack payload.
 * @param {Set<string>} pickedCatalogIds
 * @param {Array<{label: string, department?: string}>} customTools
 * @param {Map<string, string>} [departmentByPick] first department each pick appeared under
 */
export function buildStackRows(pickedCatalogIds, customTools = [], departmentByPick = new Map()) {
  const rows = [];
  for (const id of pickedCatalogIds) {
    const entry = getMcpAppById(id);
    if (!entry) continue; // never send an id the catalog cannot back
    rows.push({
      key: id,
      label: entry.name,
      source: 'catalog',
      department: departmentByPick.get(id) || null,
    });
  }
  for (const tool of customTools) {
    const label = String(tool.label || '').trim();
    if (!label) continue;
    rows.push({
      key: customKey(label),
      label,
      source: 'custom',
      department: tool.department || null,
    });
  }
  return rows;
}

// Guard used by tests: every department named above must be real.
export const QUIZ_DEPARTMENTS = [...new Set(QUIZ.flatMap((q) => q.departments))];
export const KNOWN_DEPARTMENT_IDS = DEPARTMENT_IDS;
