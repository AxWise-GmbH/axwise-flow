/**
 * The Arena guide's step catalog — same shape as the Assistant wizard's
 * setupSteps: { key, label, short, icon, Card, required, desc }.
 *
 * `short` is the stepper circle label; `label` + `desc` head the active step.
 * Completion is never stored: useArenaGuide derives each step's done flag from
 * the data the step produces (op=guide-progress).
 */
import CorporateFareRoundedIcon from '@mui/icons-material/CorporateFareRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import PaidRoundedIcon from '@mui/icons-material/PaidRounded';

import DepartmentsCard from './cards/DepartmentsCard';
import StackQuizCard from './cards/StackQuizCard';
import ConnectStackCard from './cards/ConnectStackCard';
import DevBriefsCard from './cards/DevBriefsCard';
import TeamCard from './cards/TeamCard';
import RatesCard from './cards/RatesCard';

export const ARENA_GUIDE_STEPS = [
  {
    key: 'departments',
    label: 'Which departments do you run?',
    short: 'Depts',
    icon: CorporateFareRoundedIcon,
    Card: DepartmentsCard,
    required: true,
    desc: 'Arena keeps score by department. Tick the ones your company actually runs.',
  },
  {
    key: 'stack',
    label: 'What does your company work in?',
    short: 'Stack',
    icon: ChecklistRoundedIcon,
    Card: StackQuizCard,
    required: true,
    desc: 'Tick the software your team uses every day - you do not need to know how anything connects.',
  },
  {
    key: 'connect',
    label: 'Connect what you ticked',
    short: 'Connect',
    icon: LinkRoundedIcon,
    Card: ConnectStackCard,
    required: true,
    desc: 'Each connection is read-only: Arena sees what your team delivered and by whom. It never changes anything.',
  },
  {
    key: 'briefs',
    label: 'For the rest, a brief for your developer',
    short: 'Briefs',
    icon: EditNoteRoundedIcon,
    Card: DevBriefsCard,
    required: true,
    desc: 'Tools we cannot connect by button get exact written instructions your developer can follow.',
  },
  {
    key: 'team',
    label: 'Your people, and their AI counterparts',
    short: 'Team',
    icon: GroupsRoundedIcon,
    Card: TeamCard,
    required: true,
    desc: 'Name who does the work today. Each role gets an agent that runs the same jobs, so Arena can compare.',
  },
  {
    key: 'rates',
    label: 'What your people cost',
    short: 'Rates',
    icon: PaidRoundedIcon,
    Card: RatesCard,
    required: false,
    desc: 'Optional. Without it Arena shows time and quality, just no money.',
  },
];
