/**
 * What each line of the run looks like, as a glyph.
 *
 * The thread had five icons for forty kinds of event, chosen by tone: a tick
 * for anything that went well, an exclamation for anything that needs you. Read
 * down the left edge that is a column of identical marks, and the marker - the
 * first thing the eye lands on - carried no information at all. Worse, they
 * were drawn as frosted discs, so at 22px the glyph inside was a smudge.
 *
 * So: one glyph per kind of thing that happened, not per tone. The tone still
 * colours it - green for done, amber for waiting on you, red for stopped - but
 * the shape says what it was: a plan, a team, a tool, money, the board, a
 * question. Tone tells you how to feel; the glyph tells you what about.
 *
 * These are deliberately grouped rather than unique. Thirty-eight distinct
 * pictograms would be a code nobody learns; a dozen recurring ones become
 * readable within a single run.
 *
 * Scope: the Simple goal thread only. Nothing here touches the icon set the
 * rest of the app uses.
 */
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import ChangeCircleOutlinedIcon from '@mui/icons-material/ChangeCircleOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HandymanOutlinedIcon from '@mui/icons-material/HandymanOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PanToolOutlinedIcon from '@mui/icons-material/PanToolOutlined';
import PauseCircleOutlinedIcon from '@mui/icons-material/PauseCircleOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import StarBorderOutlinedIcon from '@mui/icons-material/StarBorderOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';

/**
 * The recurring shapes, named by what they mean rather than by their glyph.
 *
 * Named so a new event picks an existing meaning instead of inventing a
 * thirty-ninth picture.
 */
export const THREAD_GLYPH = {
  start: FlagOutlinedIcon,
  assessed: FactCheckOutlinedIcon,
  brief: DescriptionOutlinedIcon,
  plan: AccountTreeOutlinedIcon,
  question: HelpOutlineOutlinedIcon,
  waiting: PanToolOutlinedIcon,
  approved: TaskAltOutlinedIcon,
  revision: EditOutlinedIcon,
  team: GroupsOutlinedIcon,
  agent: SmartToyOutlinedIcon,
  tools: HandymanOutlinedIcon,
  connect: LinkOutlinedIcon,
  authorize: LockOpenOutlinedIcon,
  locked: LockOutlinedIcon,
  money: PaymentsOutlinedIcon,
  work: BoltOutlinedIcon,
  rated: StarBorderOutlinedIcon,
  again: ReplayOutlinedIcon,
  insight: InsightsOutlinedIcon,
  board: GavelOutlinedIcon,
  published: PublicOutlinedIcon,
  launched: RocketLaunchOutlinedIcon,
  done: CheckCircleOutlineIcon,
  stale: ChangeCircleOutlinedIcon,
  paused: PauseCircleOutlinedIcon,
  stopped: BlockOutlinedIcon,
  failed: ErrorOutlineIcon,
  running: AutorenewOutlinedIcon,
  warn: WarningAmberOutlinedIcon,
  info: InfoOutlinedIcon,
};

/** event_type -> which shape. Tone still supplies the colour. */
export const THREAD_EVENT_GLYPH = {
  goal_created: 'start',
  feasibility_done: 'assessed',
  po_validated: 'brief',
  po_questions_generated: 'question',
  axwise_customer_intelligence_completed: 'insight',
  axwise_customer_intelligence_degraded: 'insight',
  awaiting_context_approval: 'waiting',
  context_approved: 'approved',
  context_auto_approved: 'approved',
  context_revision_requested: 'revision',
  context_approval_invalidated: 'stale',
  plan_created: 'plan',
  plan_role_alignment_incomplete: 'team',
  team_approved: 'team',
  team_coverage_incomplete: 'team',
  tools_provisioned: 'tools',
  tools_provided: 'tools',
  awaiting_tools: 'connect',
  proposal_ready: 'brief',
  awaiting_approval: 'waiting',
  execution_auto_approved: 'approved',
  execution_approval_invalidated: 'stale',
  authorizing_execution: 'authorize',
  execution_blocked_task_authorization: 'locked',
  research_execution_boundary_blocked: 'stale',
  execution_authorization_incomplete: 'locked',
  execution_authorization_inspection_failed: 'locked',
  execution_authorization_binding_failed: 'locked',
  execution_blocked_missing_proposal_approval: 'waiting',
  execution_blocked_missing_context_approval: 'waiting',
  context_approval_required: 'waiting',
  phase_evaluated: 'rated',
  iteration_started: 'again',
  budget_warning: 'money',
  budget_exhausted: 'money',
  agent_warning: 'agent',
  agent_flagged_underperforming: 'agent',
  consilium_reviewed: 'board',
  osja_review_completed: 'board',
  prd_quality_attested: 'rated',
  prd_quality_validation_failed: 'revision',
  prd_quality_repair_started: 'revision',
  prd_quality_repair_completed: 'assessed',
  prd_quality_repair_failed: 'waiting',
  prd_quality_completion_refused: 'stale',
  deployment_published: 'published',
  goal_completed: 'done',
  goal_failed: 'failed',
  goal_cancelled: 'stopped',
  goal_paused: 'paused',
  goal_needs_human: 'waiting',
  goal_resolved_by_human: 'approved',
  goal_healed: 'again',
};

/** goal.status -> which shape, for the one message that says where it stands. */
export const THREAD_BLOCKED_GLYPH = {
  needs_human: 'waiting',
  failed: 'failed',
  awaiting_tools: 'connect',
  paused: 'paused',
};

/** The shape for an event nothing has been mapped for yet. */
const TONE_GLYPH = {
  ok: 'done',
  warn: 'warn',
  error: 'failed',
  accent: 'work',
  info: 'info',
};

/**
 * The glyph for one line of the run.
 *
 * Falls back to the tone so an event type added on the server tomorrow still
 * draws something sensible today - the map is an improvement on the tone, not a
 * precondition for rendering.
 */
export function threadEventGlyph(eventType, tone = 'info') {
  const key = THREAD_EVENT_GLYPH[eventType] || TONE_GLYPH[tone] || 'info';
  return THREAD_GLYPH[key] || THREAD_GLYPH.info;
}

/** The shape for a message that has no event behind it, only a tone. */
export function threadToneGlyph(tone = 'info') {
  return THREAD_GLYPH[TONE_GLYPH[tone] || 'info'] || THREAD_GLYPH.info;
}

export function threadBlockedGlyph(status, tone = 'warn') {
  const key = THREAD_BLOCKED_GLYPH[status] || TONE_GLYPH[tone] || 'info';
  return THREAD_GLYPH[key] || THREAD_GLYPH.info;
}

/**
 * The glyphs that are round enough that turning them reads as turning.
 *
 * Rotation is the clearest "this is happening now" there is, but only on a
 * shape with no upright. Spin a document or a pair of people and it does not
 * read as work in progress, it reads as a rendering fault - so everything else
 * breathes in place instead, and keeps the shape that says what it is.
 */
export const THREAD_SPIN_GLYPHS = new Set([
  THREAD_GLYPH.running,
  THREAD_GLYPH.again,
  THREAD_GLYPH.stale,
]);

/** Whether this glyph should turn rather than breathe while it is live. */
export function threadGlyphSpins(glyph) {
  return THREAD_SPIN_GLYPHS.has(glyph);
}
