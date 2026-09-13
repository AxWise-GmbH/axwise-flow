import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import AutoGraphOutlinedIcon from '@mui/icons-material/AutoGraphOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import IntegrationInstructionsOutlinedIcon from '@mui/icons-material/IntegrationInstructionsOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import HistoryIcon from '@mui/icons-material/History';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';

export const FEATURE_CATEGORIES = [
  {
    id: 'work-management',
    label: 'Work Management',
    description: 'Organize your team, tasks, and projects',
    color: 'primary',
  },
  {
    id: 'ai-automation',
    label: 'AI & Automation',
    description: 'Let AI agents work for you',
    color: 'secondary',
  },
  {
    id: 'process-workflow',
    label: 'Process & Workflow',
    description: 'Automate and streamline operations',
    color: 'warning',
  },
  {
    id: 'system-insights',
    label: 'System & Insights',
    description: 'Monitor, document, and explore data',
    color: 'info',
  },
];

export const MARKETPLACE_FEATURES = [
  // Work Management
  {
    id: 'partners',
    categoryId: 'work-management',
    label: 'Team & Partners',
    navLabel: 'Partners',
    description: 'Manage team members, collaborators, and partner relationships.',
    iconName: 'PeopleOutlined',
    path: '/partners',
    navSection: 'main',
  },
  {
    id: 'tasks',
    categoryId: 'work-management',
    label: 'Task Manager',
    navLabel: 'Tasks',
    description: 'Create, assign, and track tasks with deadlines and priorities.',
    iconName: 'AssignmentOutlined',
    path: '/task-manager',
    navSection: 'main',
  },
  {
    id: 'projects',
    categoryId: 'work-management',
    label: 'Projects',
    navLabel: 'Projects',
    description: 'Organize work into projects with timelines and deliverables.',
    iconName: 'FolderOutlined',
    path: '/projects',
    navSection: 'main',
  },
  {
    id: 'campaigns',
    categoryId: 'work-management',
    label: 'Campaigns',
    navLabel: 'Campaigns',
    description: 'Plan and track marketing campaigns and performance metrics.',
    iconName: 'CampaignOutlined',
    path: '/campaigns',
    navSection: 'main',
  },
  // AI & Automation
  {
    id: 'agents',
    categoryId: 'ai-automation',
    label: 'AI Agents',
    navLabel: 'Agents',
    description: 'Deploy AI agents that work on your tasks automatically.',
    iconName: 'SmartToyOutlined',
    path: '/agent-hub',
    navSection: 'main',
  },
  {
    id: 'consilium',
    categoryId: 'ai-automation',
    label: 'AI Board',
    navLabel: 'Consilium',
    description: 'Assemble AI agents to discuss strategy and make decisions.',
    iconName: 'GroupsOutlined',
    path: '/consilium',
    navSection: 'main',
  },
  {
    id: 'ai',
    categoryId: 'ai-automation',
    label: 'AI Assistant',
    navLabel: 'AI',
    description: 'Chat with AI for insights, strategy tips, and notifications.',
    iconName: 'AutoGraphOutlined',
    path: '/notification-center',
    navSection: 'bottom',
  },
  // Process & Workflow
  {
    id: 'workflow',
    categoryId: 'process-workflow',
    label: 'Workflow Builder',
    navLabel: 'Workflow',
    description: 'Design visual workflows for multi-step automation.',
    iconName: 'AccountTreeOutlined',
    path: '/workflow',
    navSection: 'main',
  },
  {
    id: 'injection',
    categoryId: 'process-workflow',
    label: 'Data Injection',
    navLabel: 'Injection',
    description: 'Import external data into workflows and agent pipelines.',
    iconName: 'IntegrationInstructionsOutlined',
    path: '/injection-hub',
    navSection: 'main',
  },
  {
    id: 'tools',
    categoryId: 'process-workflow',
    label: 'Tools',
    navLabel: 'Tools',
    description: 'Browse and configure tools for agents and workflows.',
    iconName: 'BuildOutlined',
    path: '/tools',
    navSection: 'main',
  },
  {
    id: 'marketplace',
    categoryId: 'ai-automation',
    label: 'Marketplace',
    navLabel: 'Marketplace',
    description: 'Browse and install agents, skills, tools, teams, and org templates.',
    iconName: 'StorefrontOutlined',
    path: '/marketplace',
    navSection: 'main',
  },
  // System & Insights
  {
    id: 'documentation',
    categoryId: 'system-insights',
    label: 'Documentation',
    navLabel: 'Documentation',
    description: 'Platform guides, API docs, and help articles.',
    iconName: 'MenuBookOutlined',
    path: '/documentation',
    navSection: 'bottom',
  },
  {
    id: 'audit-log',
    categoryId: 'system-insights',
    label: 'Activity Log',
    navLabel: 'Activity Log',
    description: 'Audit trail of all actions taken across the platform.',
    iconName: 'History',
    path: '/audit-log',
    navSection: 'bottom',
  },
  {
    id: 'data',
    categoryId: 'system-insights',
    label: 'Data Explorer',
    navLabel: 'Data',
    description: 'Browse, query, and export raw data tables and records.',
    iconName: 'HubOutlined',
    path: '/data',
    navSection: 'bottom',
  },
];

export const FEATURE_ICON_MAP = {
  PeopleOutlined: PeopleOutlinedIcon,
  AssignmentOutlined: AssignmentOutlinedIcon,
  FolderOutlined: FolderOutlinedIcon,
  CampaignOutlined: CampaignOutlinedIcon,
  SmartToyOutlined: SmartToyOutlinedIcon,
  GroupsOutlined: GroupsOutlinedIcon,
  AutoGraphOutlined: AutoGraphOutlinedIcon,
  AccountTreeOutlined: AccountTreeOutlinedIcon,
  IntegrationInstructionsOutlined: IntegrationInstructionsOutlinedIcon,
  BuildOutlined: BuildOutlinedIcon,
  MenuBookOutlined: MenuBookOutlinedIcon,
  History: HistoryIcon,
  HubOutlined: HubOutlinedIcon,
  StorefrontOutlined: StorefrontOutlinedIcon,
};
