// Task Manager views (Category toolbar menu) and common task tags — mirrors /task-manager UX.

/** Scope views opened by the Category icon in Task Manager */
export const TASK_MANAGER_SCOPES = [
  { id: 'all', label: 'All', description: 'Every task in your workspace' },
  {
    id: 'partners',
    label: 'Partner Tasks',
    shortLabel: 'Partner',
    description: 'Work tied to partner accounts',
  },
  { id: 'team', label: 'Team Tasks', shortLabel: 'Team', description: 'Internal team assignments' },
  {
    id: 'projects',
    label: 'Projects Tasks',
    shortLabel: 'Projects',
    description: 'Tasks grouped under projects',
  },
  {
    id: 'agents',
    label: 'AI Agent Tasks',
    shortLabel: 'AI Agents',
    description: 'Tasks owned or run by agents',
  },
];

/** Common category tags applied to tasks (filter + chips on cards) */
export const TASK_MANAGER_TAGS = [
  'Legal',
  'Finance',
  'Sales',
  'Reports',
  'Ops',
  'Marketing',
  'Support',
  'Engineering',
  'Product',
  'Compliance',
  'HR',
  'General',
  'AI Agents',
];
