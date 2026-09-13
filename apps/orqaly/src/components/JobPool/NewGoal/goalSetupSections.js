import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';

/**
 * The four decisions Goal setup asks for, declared the way the assistant's
 * steps are declared in Assistant/setupSteps.js - so the two panels are the
 * same shape in the source as well as on screen.
 *
 * `done` is a predicate over a plain context object rather than something the
 * drawer computes inline, which is what lets "when is this section settled?"
 * be answered in a test without rendering a drawer.
 *
 * Consilium and Team are mutually exclusive by construction: there is one
 * target, so the tick marks where the goal is actually aimed.
 */
export const GOAL_SETUP_SECTIONS = [
  {
    key: 'org',
    title: 'Organization',
    icon: CorporateFareOutlinedIcon,
    required: true,
    desc: 'Which business this goal belongs to. Everything it produces is filed there.',
    done: ({ orgId, orgs }) => Boolean(orgId) && orgs.some((org) => org?.id === orgId),
  },
  {
    key: 'board',
    title: 'Consilium',
    icon: GavelOutlinedIcon,
    desc: "The AI board that turns this goal into a plan. Leave it to the workspace's own board unless this one needs another.",
    done: ({ target }) => target?.type === 'consilium',
  },
  {
    key: 'workforce',
    title: 'Team or agent',
    icon: GroupsOutlinedIcon,
    desc: 'Hand the goal to one team, one lead or one agent instead of the whole workspace.',
    done: ({ target }) => ['team', 'team_lead', 'agent'].includes(target?.type),
  },
  {
    key: 'axwise',
    title: 'AxWise',
    icon: PsychologyOutlinedIcon,
    desc: 'The cognitive overlay that watches the run. Off, observing, or steering.',
    done: ({ axwise }) => Boolean(axwise?.isAxwiseEnabled),
  },
];
