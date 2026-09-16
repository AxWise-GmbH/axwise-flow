import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';

/**
 * Current product surface. Descriptions mirror src/config/pageInfo.js (PAGE_INFO)
 * for the live platform - the legacy partner-management pages are intentionally omitted.
 */
export const PAGES_FEATURES = [
  {
    name: 'Home',
    path: '/home',
    icon: HomeOutlinedIcon,
    description:
      'Org-centric cockpit: live metric tiles, active goals, recent activity, and LLM usage at a glance.',
  },
  {
    name: 'Organizations',
    path: '/organizations',
    icon: ApartmentOutlinedIcon,
    description:
      'Step 1 - build the company structure (holdings, subsidiaries, divisions, departments) and attach a Consilium board.',
  },
  {
    name: 'Consilium',
    path: '/consilium',
    icon: ShieldOutlinedIcon,
    description:
      'Step 2 - the AI board that hires agents, forms teams, evaluates quality, and governs operations.',
  },
  {
    name: 'Agents',
    path: '/agent-hub',
    icon: SmartToyOutlinedIcon,
    description:
      'Browse and manage AI agents: profiles, capabilities, ratings, and performance. Hire agents onto goals.',
  },
  {
    name: 'My Agents',
    path: '/my-agents',
    icon: GroupsOutlinedIcon,
    description:
      'Personal agent dashboard: hired agents, teams, job history, and ratings for quick reuse.',
  },
  {
    name: 'Requests',
    path: '/job-pool',
    icon: FlagOutlinedIcon,
    description:
      'Goal orchestration hub: create goals, track the pipeline, and monitor task execution end to end.',
  },
  {
    name: 'Pulse',
    path: '/pulse',
    icon: BoltOutlinedIcon,
    description:
      'Autonomous scheduling - agents wake on an interval, run a work cycle, learn, and sleep.',
  },
  {
    name: 'Communicator',
    path: '/communicator',
    icon: ForumOutlinedIcon,
    description:
      'Command center: AI Agents Room, Controller (messenger commands), Consilium Log, and webhooks.',
  },
  {
    name: 'Knowledge Base',
    path: '/knowledge-base',
    icon: MenuBookOutlinedIcon,
    description:
      'Documents, reports, and research with semantic (pgvector) search. Goal outputs, analyses, and plans.',
  },
  {
    name: 'Workflow',
    path: '/workflow',
    icon: AccountTreeOutlinedIcon,
    description:
      'Visual drag-and-drop workflow builder; automation pipelines linked to goals and projects.',
  },
  {
    name: 'Task Manager',
    path: '/task-manager',
    icon: AssignmentOutlinedIcon,
    description: 'Kanban boards, assignments, deadlines, and priorities across projects and goals.',
  },
  {
    name: 'Marketplace',
    path: '/marketplace',
    icon: StorefrontOutlinedIcon,
    description:
      'Install agent templates, skill packs, tools, and team/org configs. Import from Composio, OpenRouter, Hugging Face.',
  },
  {
    name: 'Tools',
    path: '/tools',
    icon: BuildOutlinedIcon,
    description:
      'Configure API tools (search, email, GitHub, Canva, browser); manage keys and permissions.',
  },
  {
    name: 'Replicators',
    path: '/replicators',
    icon: ContentCopyOutlinedIcon,
    description: 'Generate in-platform control interfaces for any Composio or HTTP API tool.',
  },
  {
    name: 'Investments',
    path: '/investments',
    icon: TrendingUpOutlinedIcon,
    description: 'Deals hub for AI and human investors: publishing, pools, and ROI tracking.',
  },
  {
    name: 'Finances',
    path: '/finances',
    icon: PaidOutlinedIcon,
    description: 'Revenue, expenses, ROI per goal, agent costs, and marketplace transactions.',
  },
  {
    name: 'Dashboards',
    path: '/dashboards',
    icon: DashboardOutlinedIcon,
    description: 'Build, browse, and manage custom dashboards; auto-generate from your data.',
  },
  {
    name: 'Reports',
    path: '/reports',
    icon: AssessmentOutlinedIcon,
    description: 'Generate and view business reports with the Report Builder; export insights.',
  },
  {
    name: 'Campaigns',
    path: '/campaigns',
    icon: CampaignOutlinedIcon,
    description:
      'Marketing vertical: dashboards, audiences, campaigns, content, acquisition, conversion, retention.',
  },
  {
    name: 'Injection Hub',
    path: '/injection-hub',
    icon: HubOutlinedIcon,
    description: 'Integration hub for external services, webhooks, and data pipelines.',
  },
  {
    name: 'Activity Log',
    path: '/audit-log',
    icon: HistoryOutlinedIcon,
    description: 'Full, append-only audit trail of platform actions with filtering.',
  },
  {
    name: 'Permissions',
    path: '/roles',
    icon: AdminPanelSettingsOutlinedIcon,
    description: 'User roles and access control; page/block-level permissions.',
  },
  {
    name: 'Data Hub',
    path: '/data',
    icon: StorageOutlinedIcon,
    description: 'Database stats, backups, topology map, and raw data inspection.',
  },
  {
    name: 'Settings',
    path: '/settings',
    icon: SettingsOutlinedIcon,
    description:
      'Account, profile, security, notifications, and BYOK provider keys (Settings -> Keys).',
  },
];
