/**
 * ChatBlock — dispatcher that renders inline entity cards inside chat bubbles.
 *
 * Block payload (from chat-blocks-extractor.js):
 *   { id, type, entityId?, compact: {...}, expanded?: {...}, deepLink? }
 *
 * Compact view is always visible. When `expanded` is present, a chevron toggles
 * an inline expanded view. "Open ↗" calls onOpen({ type, entityId, ... }) which
 * the parent maps to a route via React Router.
 */
import { memo } from 'react';
import { Box, Typography, ThemeProvider, useTheme, alpha } from '@mui/material';
import { withComposerSurfaceTone } from '../../../theme/composerSurface';

import GoalBlock from './GoalBlock.jsx';
import TaskBlock from './TaskBlock.jsx';
import WorkflowBlock from './WorkflowBlock.jsx';
import ReportBlock from './ReportBlock.jsx';
import ProjectBlock from './ProjectBlock.jsx';
import KbDocBlock from './KbDocBlock.jsx';
import OrganizationBlock from './OrganizationBlock.jsx';
import AgentBlock from './AgentBlock.jsx';
import RequestBlock from './RequestBlock.jsx';
import ToolBlock from './ToolBlock.jsx';
import MarketplaceListingBlock from './MarketplaceListingBlock.jsx';
import CommunicatorThreadBlock from './CommunicatorThreadBlock.jsx';
import PartnerBlock from './PartnerBlock.jsx';
import DashboardBlock from './DashboardBlock.jsx';
import EmptyBlock from './EmptyBlock.jsx';
import ShowAllBlock from './ShowAllBlock.jsx';
import PulseBlock from './PulseBlock.jsx';
import LoopBlock from './LoopBlock.jsx';
import ConciliumDecisionBlock from './ConciliumDecisionBlock.jsx';
import InsightsOverviewBlock from './InsightsOverviewBlock.jsx';
import ChartBlock from './ChartBlock.jsx';
import TimelineBlock from './TimelineBlock.jsx';
import ProgressBlock from './ProgressBlock.jsx';

const REGISTRY = {
  goal: GoalBlock,
  task: TaskBlock,
  workflow: WorkflowBlock,
  report: ReportBlock,
  project: ProjectBlock,
  'kb-doc': KbDocBlock,
  organization: OrganizationBlock,
  agent: AgentBlock,
  request: RequestBlock,
  tool: ToolBlock,
  'marketplace-listing': MarketplaceListingBlock,
  'communicator-thread': CommunicatorThreadBlock,
  partner: PartnerBlock,
  dashboard: DashboardBlock,
  empty: EmptyBlock,
  'show-all': ShowAllBlock,
  pulse: PulseBlock,
  loop: LoopBlock,
  'concilium-decision': ConciliumDecisionBlock,
  'insights-overview': InsightsOverviewBlock,
  chart: ChartBlock,
  timeline: TimelineBlock,
  progress: ProgressBlock,
};

function ChatBlockContent({ block, onOpen }) {
  const theme = useTheme();
  if (!block || !block.type) return null;
  const Component = REGISTRY[block.type];
  if (!Component) {
    return (
      <Box
        sx={{
          p: 1,
          borderRadius: 1.5,
          bgcolor: alpha(theme.palette.warning.main, 0.08),
          border: '1px solid',
          borderColor: alpha(theme.palette.warning.main, 0.2),
        }}
      >
        <Typography variant="caption" sx={{ color: theme.palette.warning.light }}>
          (Unknown block type: {block.type})
        </Typography>
      </Box>
    );
  }
  return <Component block={block} onOpen={onOpen} />;
}

function ChatBlock({ block, onOpen, surfaceTone = 'auto' }) {
  const content = <ChatBlockContent block={block} onOpen={onOpen} />;
  if (surfaceTone !== 'light' && surfaceTone !== 'dark') return content;

  return (
    <ThemeProvider theme={(theme) => withComposerSurfaceTone(theme, surfaceTone)}>
      {content}
    </ThemeProvider>
  );
}

export default memo(ChatBlock);
