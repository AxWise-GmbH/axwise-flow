// Slug → bespoke page component map.

import KnowledgeBasePage from './KnowledgeBasePage';
import WorkflowPage from './WorkflowPage';
import TaskManagerPage from './TaskManagerPage';
import ProjectsPage from './ProjectsPage';
import ReportsPage from './ReportsPage';
import DashboardsPage from './DashboardsPage';
import ReplicatorsPage from './ReplicatorsPage';

export const INSTRUMENT_PAGES = {
  'knowledge-base': KnowledgeBasePage,
  workflow: WorkflowPage,
  'task-manager': TaskManagerPage,
  projects: ProjectsPage,
  reports: ReportsPage,
  dashboards: DashboardsPage,
  replicators: ReplicatorsPage,
};
