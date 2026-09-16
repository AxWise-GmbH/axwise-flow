// Slug → bespoke page component map.

import AgentsPage from './AgentsPage';
import ConsiliumPage from './ConsiliumPage';
import SimpleModePage from './SimpleModePage';
import InvestmentsPage from './InvestmentsPage';
import OrganizationsPage from './OrganizationsPage';
import RequestsPage from './RequestsPage';
import ToolsPage from './ToolsPage';
import CommunicatorPage from './CommunicatorPage';

export const CONTROL_PAGES = {
  agents: AgentsPage,
  consilium: ConsiliumPage,
  'simple-mode': SimpleModePage,
  investments: InvestmentsPage,
  organizations: OrganizationsPage,
  requests: RequestsPage,
  tools: ToolsPage,
  communicator: CommunicatorPage,
};
