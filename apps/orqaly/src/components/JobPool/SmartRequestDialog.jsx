/**
 * SmartRequestDialog — Professional 3-step wizard for request creation.
 *
 * Step 1: Tell About You — Structured intake with voice + text, goal questions
 * Step 2: Select a Solution — Animated consilium AI processing, team assembly
 * Step 3: Enjoy Results — Review structured request, confirm & submit
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Tooltip,
  Chip,
  CircularProgress,
  InputAdornment,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stepper,
  Step,
  StepLabel,
  LinearProgress, // used for inline save-progress banner
  Tabs,
  Tab,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Menu,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MicOutlinedIcon from '@mui/icons-material/MicOutlined';
import StopOutlinedIcon from '@mui/icons-material/StopOutlined';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import TipsAndUpdatesOutlinedIcon from '@mui/icons-material/TipsAndUpdatesOutlined';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import AutoGraphOutlinedIcon from '@mui/icons-material/AutoGraphOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import GlassIcon from '../icons/GlassIcon';
import { useVoiceControl } from '../../hooks/useVoiceControl';
import { enqueueAndWait } from '../../services/agentJobService';
import { estimatePipelineCost } from '../../services/pipelineService';
import {
  createGoal,
  createGoalSourceRequestId,
  createSmartRequestDraft,
  acceptGoalCustomerScope,
  approveGoalContext,
  getGoal,
  listGoals,
  preparePhysicalEvidenceProfile,
  reviseGoalContext,
  reviseGoalCustomerScope,
} from '../../services/goalService';
import { implementExisting } from '../../services/goalUnitService';
import { createGoalOrganization, listOrganizations } from '../../services/organizationService';
import { validateFile, formatFileSize } from '../../services/goalFileService';
import { getAllWorkflows } from '../../services/workflowService';
import { pickDefaultOrgId } from '../../utils/defaultOrganization';
import GoalSetupDrawer from './NewGoal/GoalSetupDrawer';
import GoalRunControls from './NewGoal/GoalRunControls';
import { executorPayloadForTarget, isScopedExecutorTarget } from './NewGoal/goalExecutorTarget';
import {
  getGoalSetup,
  resetGoalSetup,
  setGoalSetupOrg,
  useGoalSetup,
} from '../../hooks/useGoalSetup';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ImplementDialog from '../../components/Goals/ImplementDialog';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import {
  SMART_REQUEST_STRUCTURED_DESCRIPTION,
  SMART_REQUEST_STRUCTURED_TITLE,
} from '../Goals/goalModeCopy';
import {
  advancedResearchRequiresGrounding,
  COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES,
  COMMERCIAL_MARKET_LAUNCH_INTENT,
  isCommercialResearchRequest,
  RESEARCH_MODE_OPTIONS,
  resolveAdvancedResearchMode,
} from './researchPolicy';
import {
  confirmMarketScope,
  marketScopeChoices,
  marketScopeReady,
  resolveMarketExpression,
} from '../../../lib/_shared/market-scope.js';
import {
  CATEGORIES,
  INTAKE_QUESTIONS,
  PRIORITIES,
  PRIORITY_STYLES,
} from './NewGoal/newGoalConstants';
import { fadeInUp, pulse, shimmer } from './NewGoal/newGoalAnimations';
import {
  buildAgentRoster,
  buildManualReviewFallback,
  buildSystemPrompt,
  formatAiError,
  withTimeout,
} from './NewGoal/newGoalPrompts';
import {
  assertPreparedPhysicalEvidenceProfile,
  persistEvidenceAndStartGoal,
} from './NewGoal/newGoalSubmit';
import GoalThread from './NewGoal/GoalThread';
import GoalDashboard from './NewGoal/GoalDashboard';
import GoalRunBar from './NewGoal/GoalRunBar';
import useGoalRunView from './NewGoal/useGoalRunView';
import GoalComposer from './NewGoal/GoalComposer';
import { composerRole, composerTalksToLead } from './NewGoal/newGoalTranscript';
import { LEAD_CHAT_CHANNEL } from './NewGoal/goalRunTranscript';
import { sendLeadMessage } from '../../services/goalLeadChatService';
import Step1Professional from './NewGoal/Step1Professional';
import useGoalRealtime from '../../hooks/useGoalRealtime';
import { usePublishRunningGoal } from '../../context/RunningGoalContext';
import {
  axwiseScopeAcceptancePayload,
  axwiseScopeChatIntent,
  axwiseScopeRevisionPayload,
  isAxwiseContextReview,
  isAxwiseScopeClarification,
  isAxwiseScopeRebuildActive,
} from '../Goals/AxwiseScopeConfirmationPanel';
import { nativeAxwiseMaterialQuestion } from '../../../lib/_shared/native-scope-approval.js';
import { nativeAxwiseScopeActionBinding } from '../../../lib/_shared/native-scope-approval.js';

/** Mirrors MAX_ATTACHMENTS in lib/goal-handlers/goal-evidence.js. */
const MAX_GOAL_EVIDENCE_ITEMS = 20;

const SIMPLE_STEPS = ['Describe', 'Progress'];
const PRO_STEPS = ['Brief', 'Progress'];

const MODE_CHOICES = [
  {
    id: 'simple',
    label: 'Simple',
    icon: 'BoltOutlined',
    hint: 'Describe it in a sentence and we handle the rest.',
  },
  {
    id: 'professional',
    label: 'Professional',
    icon: 'PersonOutline',
    hint: 'Four questions, budget, projections and research controls.',
  },
];

// The Professional wizard performs a preliminary LLM interpretation before
// AxWise owns the scope. Keep it available to developers while the product is
// being evaluated, but never expose that parallel scope authority in a
// production build.
export function requestModeChoices(development = import.meta.env.DEV) {
  return development ? MODE_CHOICES : MODE_CHOICES.filter((choice) => choice.id === 'simple');
}

const DEFAULT_TOOL_MODE = 'with_tools';
const DEFAULT_COMPARE_MODELS = {
  claudeOpus: true,
  opusMode: 'subscription',
  gemini: true,
};

// ── Constants ────────────────────────────────────────────────
const STEPS = ['Tell About You', 'Select a Solution', 'Enjoy Results'];

// ── Processing animation stages ──────────────────────────────
const PROCESSING_STAGES = [
  { icon: AutoAwesomeIcon, label: 'Analyzing your request...', duration: 2000 },
  { icon: SmartToyOutlinedIcon, label: 'Assembling AI agents...', duration: 2500 },
  { icon: AssignmentOutlinedIcon, label: 'Assigning tasks & roles...', duration: 2000 },
  { icon: GroupsOutlinedIcon, label: 'Forming your team...', duration: 1500 },
  { icon: CheckCircleOutlineIcon, label: 'Solution ready!', duration: 1000 },
];

// A detailed request already contains more signal than the legacy prefill can
// safely add. Send it straight to the canonical AxWise scope stage instead of
// spending a model call on a second, non-authoritative interpretation first.

export default function SmartRequestDialog({
  open,
  onClose,
  onSubmit,
  initialPrompt,
  initialFiles,
  onOpenGoal,
  // Reopen a goal that already exists instead of creating one. The thread then
  // shows that goal's run history and the composer talks to its team lead, so
  // a past goal can be picked back up where it was left.
  goalId = null,
  // Route out of the goal-setup drawer (its roster's "Assign some" link).
  // Callers that have nowhere to navigate simply omit it, and the drawer says
  // where to go in plain text instead of offering a link that does nothing.
  onOpenEntity = null,
  // 'dialog' is the modal every existing caller gets. 'inline' drops the
  // Dialog chrome so a host can embed the Simple thread in its own surface —
  // the dashboard hero does this, so a goal grows where it was typed instead
  // of a modal landing on top of the screen you were already using.
  variant = 'dialog',
  composerTopSlot = null,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  // down('sm') is the app-wide convention for turning a dialog into a sheet.
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const availableModeChoices = requestModeChoices();
  const professionalModeEnabled = availableModeChoices.some(
    (choice) => choice.id === 'professional'
  );

  // ── Tab mode ────────────────────────────────────────────────
  const [tabMode, setTabMode] = useState('simple'); // 'simple' | 'professional'
  const [modeAnchor, setModeAnchor] = useState(null);
  // Simple has no review screen: Start analyses and submits in one go, so the
  // user lands on the live monitor instead of an editable draft.
  const autoSubmitRef = useRef(false);

  // ── Simple tab state ──────────────────────────────────────
  const [simpleInput, setSimpleInput] = useState('');
  // What was actually sent, kept apart from what is in the box.
  // The composer empties on send - a box still holding the sentence you just
  // sent reads as if nothing happened - but the request bubble and the goal
  // itself are both built from the text, so it has to survive the clear.
  const [submittedText, setSubmittedText] = useState('');
  // The text the goal is built from: what was sent, or what is still being
  // typed before the first send. Declared beside the state because the
  // dependency arrays below are evaluated during render.
  const goalSourceText = (submittedText || simpleInput).trim();
  // The conversation with the team lead once the goal exists. The composer is
  // the same box: before the goal it describes, after it talks to the lead,
  // and this is what the lead half of that talk is built from.
  const [leadChat, setLeadChat] = useState([]);
  const [leadSending, setLeadSending] = useState(false);
  const leadSeqRef = useRef(0);
  const [simplePhase, setSimplePhase] = useState('input'); // 'input' | 'processing' | 'result'
  // When analysis began, so the thread can show how long it has been waiting.
  const [analyzingSince, setAnalyzingSince] = useState(null);
  // Set when the user chooses to start without waiting for the brief; the
  // in-flight analysis is then ignored rather than allowed to overwrite it.
  const skipAnalysisRef = useRef(false);
  const [simpleSuggestions, setSimpleSuggestions] = useState([]);
  const [simpleExtracted, setSimpleExtracted] = useState(null);

  // ── Wizard state (Professional tab) ───────────────────────
  const [activeStep, setActiveStep] = useState(0);

  // Step 1: Intake
  const [answers, setAnswers] = useState({ goal: '', challenges: '', timeline: '', details: '' });
  const [activeField, setActiveField] = useState('goal');

  // Step 2: Processing
  const [processingStage, setProcessingStage] = useState(0);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [aiDone, setAiDone] = useState(false);

  // Step 3: Review
  const [structuredResult, setStructuredResult] = useState(null);
  const [saving, setSaving] = useState(false);
  // User-facing progress message shown in the button + banner during save.
  // Replaces the silent CircularProgress that left users staring at a 12s
  // freeze during compare-mode fan-out with no idea anything was happening.
  const [submitStatus, setSubmitStatus] = useState('');
  const [createdGoal, setCreatedGoal] = useState(null);
  const submittingRef = useRef(false);
  // Compare fan-out is one logical create. Preserve its idempotency key after
  // a timeout/503 so a retry resumes the exact durable children already made.
  const compareCreateIntentRef = useRef(null);

  // Budget & complexity
  const [budgetUsd, setBudgetUsd] = useState(5);
  const [detectedComplexity, setDetectedComplexity] = useState('simple');
  const [executionMode, setExecutionMode] = useState('auto');
  const [theoryMode, setTheoryMode] = useState(false);
  const [researchMode, setResearchMode] = useState('auto');
  const [researchLocation, setResearchLocation] = useState('');
  const [researchMarketConfirmed, setResearchMarketConfirmed] = useState(false);
  const researchModeTouchedRef = useRef(false);
  const [physicalEvidenceRequested, setPhysicalEvidenceRequested] = useState(false);
  const [physicalEvidencePreparation, setPhysicalEvidencePreparation] = useState(null);
  const [physicalEvidencePreparing, setPhysicalEvidencePreparing] = useState(false);
  const [physicalEvidenceError, setPhysicalEvidenceError] = useState('');
  const [physicalEvidenceConfirmedBindingKey, setPhysicalEvidenceConfirmedBindingKey] =
    useState('');
  const physicalEvidenceRequestRef = useRef(0);

  // Dev-only: compare 3 LLMs side-by-side by creating 3 goals with pinned
  // providers. Toggle hidden in prod (only shown on localhost / import.meta.env.DEV).
  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  // Compare-mode goals are flagged local_only — Vercel's cron skips them by
  // design (job-processor.claimNextJob). Only the localhost poller started
  // by `npm run dev:local` claims them. That script injects VITE_API_URL=
  // http://localhost:3001; plain `npm run dev` leaves it undefined and Vite
  // proxies /api straight to prod — so goals submitted then sit queued
  // forever. Gate the compare toggle on that env flag to prevent it.
  const localApi = String(import.meta.env?.VITE_API_URL || '').startsWith('http://localhost');
  const compareSupported = isLocalhost && localApi;
  // Opt-in even on localhost. A deterministic request must create one goal;
  // developers can explicitly enable fan-out when they are comparing models.
  const [compareMode, setCompareMode] = useState(false);
  // opusMode: 'subscription' uses provider:'claude-code' (Claude Max OAuth via
  // ~/.claude — free). 'api' uses provider:'anthropic' (paid API key) so you
  // can A/B the subscription against the real API for the same model.
  const [compareModels, setCompareModels] = useState({
    ...DEFAULT_COMPARE_MODELS,
    // GLM and Qwen removed from compare: GLM's key/endpoint (z.ai key vs the
    // China bigmodel.cn host) 401s, and the Qwen account is in arrears — both
    // are environment/account issues, not the pipeline under test.
  });
  // PM strategy — 'classic' (single-shot evaluator per phase) or 'ralph'
  // (active watchdog + persistent scratchpad). Dev-only toggle, localhost.
  const [pmStrategy, setPmStrategy] = useState('classic');

  // Expected deliverables
  const [expectedResults, setExpectedResults] = useState('');

  // Tool usage preference
  // Auto starts tool-enabled so AxWise can decide which current evidence and
  // capabilities the accepted scope needs. A user can still explicitly bind
  // a run to no_tools or existing_only in Manual setup.
  const [toolMode, setToolMode] = useState(DEFAULT_TOOL_MODE); // 'no_tools' | 'with_tools' | 'existing_only'
  // Setup: Auto or Manual. Client-only. In Auto the dialog simply submits the
  // Auto defaults, so the payload is identical to a Manual user who picked the
  // same values.
  const [setupManual, setSetupManual] = useState(false);
  // Human Approve. Off is the default and maps to hitl_mode 'unattended'.
  const [humanApprove, setHumanApprove] = useState(false);
  // Knowledge Base picks. Only ids travel to the server, which resolves
  // ownership, organization scope and content.
  const [kbSelection, setKbSelection] = useState([]);

  // Workflow
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);

  // Materials & attachments
  const [attachments, setAttachments] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [pastGoals, setPastGoals] = useState([]);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const fileInputRef = useRef(null);

  // Goal destination: standalone | new_business | existing_business.
  // "Standalone" means no business unit; it remains explicitly scoped to the
  // selected execution workspace so AxWise and Agent Hub retain a tenant
  // boundary.
  const [goalDest, setGoalDest] = useState('standalone');
  const [destOrgName, setDestOrgName] = useState('');
  const [destOrgType, setDestOrgType] = useState('holding');
  const [destIndustry, setDestIndustry] = useState('');
  const [showImplement, setShowImplement] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationLoadError, setOrganizationLoadError] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  // The composer's setup drawer. `selectedOrgId` stays the one value the submit
  // path and the Destination block read; the store is mirrored into it so a
  // workspace picked in the drawer and one picked in the thread cannot disagree.
  const [goalSetupOpen, setGoalSetupOpen] = useState(false);
  const goalSetup = useGoalSetup();
  // If goal creation fails after a new workspace was created, reuse that
  // workspace on retry instead of creating a duplicate organization.
  const preparedNewOrgRef = useRef(null);

  // Voice
  const voice = useVoiceControl({
    onListeningEnd: (transcript) => {
      if (tabMode === 'simple' && simplePhase === 'input') {
        setSimpleInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      } else if (tabMode === 'professional' && activeStep === 0) {
        setAnswers((prev) => ({
          ...prev,
          [activeField]: prev[activeField] ? `${prev[activeField]} ${transcript}` : transcript,
        }));
      }
    },
  });

  // Load workflows when dialog opens
  useEffect(() => {
    if (open && workflows.length === 0) {
      getAllWorkflows()
        .then((wfs) => setWorkflows(wfs || []))
        .catch(() => {});
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every goal must enter the pipeline with an organization boundary so
  // AxWise can resolve tenant-scoped evidence and Agent Hub candidates. Load
  // the user's workspaces up front and select the same deterministic default
  // used by the backend (Traktor first, otherwise the oldest active one).
  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    setOrganizationsLoading(true);
    setOrganizationLoadError('');

    listOrganizations()
      .then((result) => {
        if (cancelled) return;
        const orgList = Array.isArray(result)
          ? result
          : Array.isArray(result?.organizations)
            ? result.organizations
            : Array.isArray(result?.data)
              ? result.data
              : Array.isArray(result?.data?.organizations)
                ? result.data.organizations
                : [];
        const activeOrgs = orgList.filter((org) => org?.id && org.is_active !== false);
        setOrganizations(activeOrgs);
        setSelectedOrgId((current) => {
          // A workspace chosen in the setup drawer before the goal existed wins:
          // it is the most recent thing the user actually said about where this
          // goal should run.
          const fromSetup = getGoalSetup().orgId;
          if (fromSetup && activeOrgs.some((org) => org.id === fromSetup)) return fromSetup;
          if (activeOrgs.some((org) => org.id === current)) return current;
          return pickDefaultOrgId(activeOrgs) || '';
        });
        if (activeOrgs.length === 0) {
          setOrganizationLoadError(
            'No active workspace is available. Choose New Business to create one before the goal starts.'
          );
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setOrganizations([]);
        setSelectedOrgId('');
        setOrganizationLoadError(
          `Workspaces could not be loaded: ${error?.message || 'unknown error'}. Retry or create a new business workspace.`
        );
      })
      .finally(() => {
        if (!cancelled) setOrganizationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // The Destination block and the setup drawer are two views of one decision.
  // Whichever moves, the other follows - and the store keeps the choice alive
  // across the hero composer handing the goal over to this dialog.
  const handleSelectedOrgIdChange = useCallback((nextOrgId) => {
    setSelectedOrgId(nextOrgId || '');
    setGoalSetupOrg(nextOrgId || '');
  }, []);

  useEffect(() => {
    if (!goalSetup.orgId) return;
    if (!organizations.some((org) => org.id === goalSetup.orgId)) return;
    setSelectedOrgId((current) => (current === goalSetup.orgId ? current : goalSetup.orgId));
  }, [goalSetup.orgId, organizations]);

  // Chat (for step 2 follow-up)
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [messages, chatLoading]);

  // ── Reset ──────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    voice.stopListening();
    // Simple tab reset
    setSimpleInput('');
    setSubmittedText('');
    setLeadChat([]);
    setLeadSending(false);
    setSimplePhase('input');
    setSimpleSuggestions([]);
    setSimpleExtracted(null);
    setTabMode('simple');
    setModeAnchor(null);
    // Professional tab reset
    setActiveStep(0);
    setAnswers({ goal: '', challenges: '', timeline: '', details: '' });
    setActiveField('goal');
    setProcessingStage(0);
    setAiResult(null);
    setAiError(null);
    setAiDone(false);
    setStructuredResult(null);
    setSaving(false);
    setCreatedGoal(null);
    submittingRef.current = false;
    compareCreateIntentRef.current = null;
    setGoalDest('standalone');
    setDestOrgName('');
    setDestOrgType('holding');
    setDestIndustry('');
    setShowImplement(false);
    setSelectedOrgId('');
    setOrganizationLoadError('');
    preparedNewOrgRef.current = null;
    setExpectedResults('');
    setSelectedWorkflowId(null);
    setToolMode(DEFAULT_TOOL_MODE);
    setSetupManual(false);
    setHumanApprove(false);
    setKbSelection([]);
    setCompareMode(false);
    setCompareModels({ ...DEFAULT_COMPARE_MODELS });
    setPmStrategy('classic');
    setAttachments([]);
    setUploadingFile(false);
    setPastGoals([]);
    setShowGoalPicker(false);
    setBudgetUsd(5);
    setDetectedComplexity('simple');
    setExecutionMode('auto');
    setTheoryMode(false);
    setResearchMode('auto');
    setResearchLocation('');
    setResearchMarketConfirmed(false);
    researchModeTouchedRef.current = false;
    physicalEvidenceRequestRef.current += 1;
    setPhysicalEvidenceRequested(false);
    setPhysicalEvidencePreparation(null);
    setPhysicalEvidencePreparing(false);
    setPhysicalEvidenceError('');
    setPhysicalEvidenceConfirmedBindingKey('');
    setMessages([]);
    setChatInput('');
    setChatLoading(false);
    resetGoalSetup();
    onClose();
  }, [onClose, voice]);

  // Auto-close the success screen after a short delay. Users reported the
  // popup sticking around after the "Create Goal" button spinner finished —
  // the success screen has a manual Close button but the expected UX is
  // auto-dismiss. Keeps the confirmation visible just long enough to
  // register, then calls handleClose() which also resets internal state.
  //
  // Uses a ref to the latest handleClose so the effect isn't re-triggered
  // by handleClose identity changes (its useCallback deps include `voice`
  // which ticks on every render — without the ref indirection the timer
  // was being cleared and re-set in a loop, never firing).
  // showImplement (existing-business flow) keeps the dialog open on purpose.
  //
  // Modal only. Embedded there is nothing to dismiss: onClose tears the goal
  // out of its host, and handleClose resets every piece of Simple state with
  // it. The run vanished a second and a half after it started, taking the
  // stages, the Actions menu and the view switch with it — none of which had
  // ever been on screen long enough to use.
  const handleCloseRef = useRef(handleClose);
  useEffect(() => {
    handleCloseRef.current = handleClose;
  }, [handleClose]);
  useEffect(() => {
    if (variant !== 'dialog') return;
    if (!createdGoal || showImplement) return;
    const t = setTimeout(() => handleCloseRef.current?.(), 1600);
    return () => clearTimeout(t);
  }, [createdGoal, showImplement, variant]);

  // Auto-prefill + auto-analyze useEffect lives below the `handleSimpleAnalyze`
  // useCallback declaration to avoid a temporal-dead-zone error on dashboard
  // load (the dep array evaluates `handleSimpleAnalyze` during render).
  const autoAnalyzedRef = useRef(false);

  // ── Step 1 → Step 2 transition ─────────────────────────────
  const handleProceedToStep2 = useCallback(async () => {
    voice.stopListening();
    setActiveStep(1);
    setProcessingStage(0);
    setAiDone(false);
    setAiError(null);
    // A new Professional analysis must not inherit derived fields from a
    // previous run (including a run completed before Start Over or in the
    // Simple tab). Otherwise a timeout would preserve the stale non-empty
    // title/requirements instead of seeding the manual form from this intake.
    setAiResult(null);
    setStructuredResult(null);
    setExpectedResults('');
    setDetectedComplexity('simple');
    setBudgetUsd(5);
    setMessages([]);
    setChatInput('');

    // Single loading state — no fake delays
    setProcessingStage(0);

    // Call AI
    try {
      const prompt = `User Intake Form:
- Main Goal: ${answers.goal}
- Challenges: ${answers.challenges || 'Not specified'}
- Timeline: ${answers.timeline || 'Not specified'}
- Additional Details: ${answers.details || 'None'}`;

      const result = await enqueueAndWait({
        type: 'run-llm',
        prompt,
        systemPrompt: buildSystemPrompt(buildAgentRoster()),
        temperature: 0.3,
        maxTokens: 1000,
        jsonMode: true,
      });

      if (result.status === 'done' && result.result?.content) {
        let parsed;
        try {
          parsed = JSON.parse(result.result.content);
        } catch {
          const match = result.result.content.match(/\{[\s\S]*\}/);
          parsed = match ? JSON.parse(match[0]) : null;
        }

        if (parsed) {
          setAiResult(parsed);
          setStructuredResult({
            title: parsed.title || '',
            category: parsed.category || 'other',
            priority: parsed.priority || 'medium',
            requirements: parsed.requirements || '',
          });
          setDetectedComplexity(parsed.complexity === 'complex' ? 'complex' : 'simple');
          setBudgetUsd(Math.min(100, Math.max(1, Number(parsed.budget_suggestion) || 5)));
          if (!researchLocation.trim() && typeof parsed.research_market === 'string') {
            setResearchLocation(parsed.research_market.trim().slice(0, 500));
            setResearchMarketConfirmed(false);
          }

          // Show results immediately — no artificial delay
          setProcessingStage(PROCESSING_STAGES.length - 1);
          setAiDone(true);
        } else {
          setAiError('Could not parse AI response. You can proceed with manual entry.');
          setAiDone(true);
        }
      } else {
        setAiError(formatAiError(result.error));
        setAiDone(true);
      }
    } catch (err) {
      console.error('[SmartRequestDialog] AI error:', err);
      setAiError(formatAiError(err.message));
      setAiDone(true);
    }
  }, [answers, researchLocation, voice]);

  // ── Step 2 → Step 3 ───────────────────────────────────────
  const handleProceedToStep3 = useCallback(() => {
    if (!structuredResult && !aiError) return;
    const fallback = buildManualReviewFallback(answers);
    setStructuredResult((current) => ({
      title: current?.title?.trim() ? current.title : fallback.title,
      category: current?.category || fallback.category,
      priority: current?.priority || fallback.priority,
      requirements: current?.requirements?.trim() ? current.requirements : fallback.requirements,
    }));
    setExpectedResults((current) =>
      String(current || '').trim() ? current : fallback.expectedResults
    );
    setActiveStep(2);
  }, [structuredResult, aiError, answers]);

  // ── Chat in Step 2 (refine with AI) ───────────────────────
  const handleChatSend = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    voice.stopListening();
    setChatInput('');
    const updatedMsgs = [...messages, { role: 'user', text }];
    setMessages(updatedMsgs);
    setChatLoading(true);

    try {
      const history = updatedMsgs
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
        .join('\n\n');
      const result = await enqueueAndWait({
        type: 'run-llm',
        prompt: `Previous analysis result: ${JSON.stringify(aiResult)}\n\nUser follow-up conversation:\n${history}\n\nUpdate the structured result based on the user's feedback. Respond with the same JSON format as before.`,
        systemPrompt: buildSystemPrompt(buildAgentRoster()),
        temperature: 0.3,
        maxTokens: 1000,
        jsonMode: true,
      });

      if (result.status === 'done' && result.result?.content) {
        let parsed;
        try {
          parsed = JSON.parse(result.result.content);
        } catch {
          parsed = null;
        }
        if (parsed) {
          setAiResult(parsed);
          setStructuredResult({
            title: parsed.title || '',
            category: parsed.category || 'other',
            priority: parsed.priority || 'medium',
            requirements: parsed.requirements || '',
          });
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              text: `Updated! Title: "${parsed.title}", Priority: ${parsed.priority}. ${parsed.summary || ''}`,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              text: 'I updated the analysis. You can review the changes in the next step.',
            },
          ]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: "Sorry, I couldn't process that. Try again or proceed to review.",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'An error occurred. You can proceed to review and edit manually.',
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, messages, aiResult, voice]);

  // ── Workflow selector (reused in both tabs) ─────────────────
  const renderWorkflowSelector = () => (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.background.default, 0.5),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <GlassIcon
          name="AccountTreeOutlined"
          fallback={AccountTreeOutlinedIcon}
          size={16}
          tone="neutral"
        />
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', flex: 1 }}>
          WORKFLOW (optional)
        </Typography>
        <Button
          size="small"
          onClick={() => window.open('/workflow', '_blank')}
          sx={{ textTransform: 'none', fontSize: '0.65rem', borderRadius: 1.5, minWidth: 0, px: 1 }}
        >
          Open Editor
        </Button>
      </Box>
      <FormControl size="small" fullWidth>
        <Select
          value={selectedWorkflowId || ''}
          onChange={(e) => setSelectedWorkflowId(e.target.value || null)}
          displayEmpty
          sx={{ borderRadius: 2, fontSize: '0.78rem' }}
        >
          <MenuItem value="">
            <Typography sx={{ color: 'text.disabled', fontSize: '0.78rem' }}>
              None — AI generates the plan
            </Typography>
          </MenuItem>
          {workflows.map((wf) => (
            <MenuItem key={wf.id} value={wf.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <Typography sx={{ fontSize: '0.78rem', flex: 1 }} noWrap>
                  {wf.name}
                </Typography>
                <Chip
                  label={`${wf.data?.nodes?.length || 0} nodes`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: '0.55rem' }}
                />
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {selectedWorkflowId && (
        <Typography variant="caption" sx={{ color: 'info.main', mt: 0.75, display: 'block' }}>
          This workflow will be attached to the goal and can guide agent execution.
        </Typography>
      )}
    </Box>
  );

  // ── Tool mode selector (reused in both tabs) ────────────────
  const renderToolModeSelector = () => (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.background.default, 0.5),
      }}
    >
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}
      >
        TOOL USAGE
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {[
          {
            id: 'with_tools',
            label: 'Use Tools',
            desc: 'Agents can use APIs, web search, and external tools',
          },
          { id: 'no_tools', label: 'No Tools', desc: 'LLM knowledge only — no external calls' },
          {
            id: 'existing_only',
            label: 'Existing Only',
            desc: 'Only configured tools + attached materials',
          },
        ].map((opt) => (
          <Chip
            key={opt.id}
            label={opt.label}
            size="small"
            color={toolMode === opt.id ? 'primary' : 'default'}
            variant={toolMode === opt.id ? 'filled' : 'outlined'}
            onClick={() => setToolMode(opt.id)}
            sx={{ fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer' }}
          />
        ))}
      </Box>
      <Typography
        variant="caption"
        sx={{ color: 'text.disabled', mt: 0.75, display: 'block', fontSize: '0.6rem' }}
      >
        {toolMode === 'with_tools'
          ? 'Agents will use all available tools including web search and APIs.'
          : toolMode === 'no_tools'
            ? 'Agents will work only with their built-in knowledge — no external tools.'
            : "Agents will only use tools you've already configured and any attached files."}
      </Typography>
    </Box>
  );

  const effectiveResearchMode = resolveAdvancedResearchMode(
    {
      category: structuredResult?.category,
      title: structuredResult?.title || answers.goal,
      description: `${structuredResult?.requirements || ''} ${answers.challenges || ''} ${answers.details || ''}`,
    },
    researchMode,
    researchModeTouchedRef.current
  );
  const groundingRequired = advancedResearchRequiresGrounding(effectiveResearchMode);
  const commercialMarketLaunch = isCommercialResearchRequest({
    category: structuredResult?.category,
    title: structuredResult?.title || answers.goal,
    description: `${structuredResult?.requirements || ''} ${answers.challenges || ''} ${answers.details || ''}`,
  });
  const unresolvedMarketScope = useMemo(
    () => (researchLocation.trim() ? resolveMarketExpression(researchLocation) : null),
    [researchLocation]
  );
  const researchMarketScope = useMemo(
    () =>
      researchMarketConfirmed && unresolvedMarketScope
        ? confirmMarketScope(unresolvedMarketScope)
        : unresolvedMarketScope,
    [researchMarketConfirmed, unresolvedMarketScope]
  );
  const researchMarketReady = !groundingRequired || marketScopeReady(researchMarketScope);
  const researchMarketChoices = marketScopeChoices(unresolvedMarketScope);

  const renderResearchModeSelector = () => (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.background.default, 0.5),
      }}
    >
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}
      >
        CUSTOMER & MARKET RESEARCH
      </Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={effectiveResearchMode}
        onChange={(_, value) => {
          if (!value) return;
          researchModeTouchedRef.current = true;
          setResearchMode(value);
        }}
        aria-label="Customer and market research mode"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0.75,
          '& .MuiToggleButtonGroup-grouped': { m: 0 },
        }}
      >
        {RESEARCH_MODE_OPTIONS.map((option) => (
          <ToggleButton
            key={option.id}
            value={option.id}
            aria-label={option.label}
            sx={{
              textTransform: 'none',
              px: 1.25,
              border: '1px solid !important',
              borderRadius: '8px !important',
            }}
          >
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', mt: 1, display: 'block', fontSize: '0.68rem' }}
      >
        {RESEARCH_MODE_OPTIONS.find((option) => option.id === effectiveResearchMode)?.description}
      </Typography>
      {!researchModeTouchedRef.current && effectiveResearchMode === 'grounded_deep' && (
        <Typography variant="caption" sx={{ color: 'info.main', display: 'block', mt: 0.5 }}>
          Recommended automatically for this commercial request.
        </Typography>
      )}
      {groundingRequired && (
        <TextField
          fullWidth
          required
          size="small"
          label="Research market / location"
          value={researchLocation}
          onChange={(event) => {
            setResearchLocation(event.target.value);
            setResearchMarketConfirmed(false);
          }}
          placeholder="Estonia, DACH + BENELUX, USA + Canada, or ASEAN"
          helperText="Countries, unions, exclusions and priorities are resolved into auditable country research cells."
          inputProps={{ 'aria-label': 'Research market or location' }}
          sx={{ mt: 1.25 }}
        />
      )}
      {groundingRequired && researchMarketScope?.resolved_scope?.countries?.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
          {researchMarketScope.resolved_scope.countries.map((market) => (
            <Chip
              key={market.country_code}
              size="small"
              color={market.priority === 'primary' ? 'primary' : 'default'}
              variant="outlined"
              label={`${market.country_name}${market.priority === 'primary' ? ' · priority' : ''}`}
            />
          ))}
        </Box>
      )}
      {groundingRequired && researchMarketChoices.length > 0 && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          “{researchLocation}” has multiple definitions. Choose the intended scope:
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
            {researchMarketChoices.map((choice) => (
              <Button
                key={choice.id}
                size="small"
                variant="outlined"
                onClick={() => {
                  setResearchLocation(choice.label);
                  setResearchMarketConfirmed(false);
                }}
              >
                {choice.label}
              </Button>
            ))}
          </Box>
        </Alert>
      )}
      {groundingRequired &&
        researchLocation.trim() &&
        unresolvedMarketScope?.ambiguities?.length > 0 &&
        researchMarketChoices.length === 0 && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            This location cannot yet be expanded safely. Add its country or enter an explicit
            country/market combination; Orqaly will not guess a jurisdiction.
          </Alert>
        )}
      {groundingRequired &&
        unresolvedMarketScope?.confirmation?.required &&
        unresolvedMarketScope?.ambiguities?.length === 0 &&
        !researchMarketConfirmed && (
          <Alert severity="info" sx={{ mt: 1 }}>
            This regional label has a proposed, versioned country definition. Review the country
            chips, then confirm the scope.
            <Box sx={{ mt: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setResearchMarketConfirmed(true)}
              >
                Confirm these countries
              </Button>
            </Box>
          </Alert>
        )}
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
        <Chip
          size="small"
          color={groundingRequired ? 'success' : 'default'}
          variant="outlined"
          label={groundingRequired ? 'Grounding required' : 'Synthetic only'}
        />
        <Chip size="small" color="success" variant="outlined" label="Fallback blocked" />
      </Box>
      <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.75 }}>
        Advanced requests fail closed: planning will not silently continue with a different research
        policy or provider fallback.
      </Typography>
    </Box>
  );

  // ── Materials UI section (reused in both tabs) ──────────────
  // Picker for attaching results from earlier goals. Lifted out of the
  // materials section so Step 1 can place it itself.
  // Localhost-only experiment panels: compare pinned LLMs side by side, and
  // A/B the PM strategy. Hidden in production.
  const renderDevPanels = () => (
    <>
      {/* Dev-only: Compare LLMs side-by-side. Prominent placement on localhost
          so it's hard to miss. Default ON. Submitting with compare mode
          creates one goal per pinned LLM with the title suffixed — e.g.
          (Opus Sub)/(Gemini). */}
      {isLocalhost && (
        <Box
          sx={{
            mb: 2.5,
            p: 2,
            borderRadius: 2,
            border: '2px dashed',
            borderColor: compareMode
              ? theme.palette.warning.main
              : alpha(theme.palette.warning.main, 0.4),
            bgcolor: compareMode
              ? alpha(theme.palette.warning.main, 0.08)
              : alpha(theme.palette.warning.main, 0.02),
            transition: 'all 0.2s',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: compareMode ? 1.5 : 0 }}>
            <Switch
              size="medium"
              checked={compareMode && compareSupported}
              disabled={!compareSupported}
              onChange={(e) => setCompareMode(e.target.checked)}
              slotProps={{ input: { 'aria-label': 'Compare models' } }}
            />
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 800,
                  color: 'warning.main',
                  fontSize: '0.82rem',
                  letterSpacing: '0.04em',
                }}
              >
                🧪 COMPARE MODELS (LOCALHOST DEV)
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                {!compareSupported
                  ? 'Needs the local API worker — see the notice below.'
                  : compareMode
                    ? `Submitting will create ${[compareModels.claudeOpus, compareModels.gemini].filter(Boolean).length} parallel goals — one per pinned LLM.`
                    : 'Off: creates 1 goal using the default provider stack.'}
              </Typography>
            </Box>
          </Box>
          {!compareSupported && (
            <Alert severity="warning" sx={{ mt: 1.5, fontSize: '0.75rem', py: 0.5 }}>
              Compare mode creates goals flagged <code>local_only</code>, which Vercel's cron skips
              by design. Stop this dev server and run <code>npm run dev:local</code>
              instead — it starts the local API on <code>:3001</code> plus a worker that polls{' '}
              <code>process-next</code> every 15s. Otherwise compare goals sit queued forever.
            </Alert>
          )}
          {compareMode && (
            <Box
              sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', pl: 5.5 }}
            >
              <Chip
                label={`Claude Opus ${compareModels.opusMode === 'api' ? '(API)' : '(Sub)'}`}
                size="small"
                onClick={() => setCompareModels((s) => ({ ...s, claudeOpus: !s.claudeOpus }))}
                color={compareModels.claudeOpus ? 'warning' : 'default'}
                variant={compareModels.claudeOpus ? 'filled' : 'outlined'}
                sx={{ fontWeight: 700, fontSize: '0.7rem' }}
              />
              {compareModels.claudeOpus && (
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={compareModels.opusMode}
                  onChange={(_, v) => v && setCompareModels((s) => ({ ...s, opusMode: v }))}
                  sx={{
                    '& .MuiToggleButton-root': {
                      py: 0.25,
                      px: 1,
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      lineHeight: 1,
                      textTransform: 'none',
                      letterSpacing: 0,
                    },
                  }}
                >
                  <ToggleButton
                    value="subscription"
                    title="Use Claude Max subscription via claude-code (free, no API charge)"
                  >
                    Sub
                  </ToggleButton>
                  <ToggleButton
                    value="api"
                    title="Use paid Anthropic API (real apples-to-apples vs other providers)"
                  >
                    API
                  </ToggleButton>
                </ToggleButtonGroup>
              )}
              <Chip
                label="Gemini Flash"
                size="small"
                onClick={() => setCompareModels((s) => ({ ...s, gemini: !s.gemini }))}
                color={compareModels.gemini ? 'warning' : 'default'}
                variant={compareModels.gemini ? 'filled' : 'outlined'}
                sx={{ fontWeight: 700, fontSize: '0.7rem' }}
              />
            </Box>
          )}
        </Box>
      )}

      {/* Dev-only: PM strategy A/B. Classic (single-shot per-phase
          evaluator) vs Ralph (continuous watchdog + persistent scratchpad).
          Select one per goal to compare head-to-head. */}
      {isLocalhost && (
        <Box
          sx={{
            mb: 2.5,
            p: 2,
            borderRadius: 2,
            border: '2px dashed',
            borderColor: alpha(theme.palette.info.main, 0.4),
            bgcolor: alpha(theme.palette.info.main, 0.04),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
            <Box sx={{ fontSize: 22 }}>🧠</Box>
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 800,
                  color: 'info.main',
                  fontSize: '0.82rem',
                  letterSpacing: '0.04em',
                }}
              >
                PM STRATEGY (LOCALHOST DEV)
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                {pmStrategy === 'ralph'
                  ? 'Ralph: continuous watchdog intervenes on stuck tasks, persistent scratchpad across iterations.'
                  : 'Classic: single-shot PM evaluator runs once per phase (default, lower cost).'}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', pl: 4.5 }}>
            <Chip
              label="Classic PM"
              size="small"
              onClick={() => setPmStrategy('classic')}
              color={pmStrategy === 'classic' ? 'info' : 'default'}
              variant={pmStrategy === 'classic' ? 'filled' : 'outlined'}
              sx={{ fontWeight: 700, fontSize: '0.7rem' }}
            />
            <Chip
              label="Ralph PM"
              size="small"
              onClick={() => setPmStrategy('ralph')}
              color={pmStrategy === 'ralph' ? 'info' : 'default'}
              variant={pmStrategy === 'ralph' ? 'filled' : 'outlined'}
              sx={{ fontWeight: 700, fontSize: '0.7rem' }}
            />
          </Box>
        </Box>
      )}
    </>
  );

  const renderPastGoalPicker = () => (
    <Box
      sx={{
        mt: 1,
        maxHeight: 160,
        overflow: 'auto',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.5,
      }}
    >
      {pastGoals.length === 0 ? (
        <Typography variant="caption" sx={{ p: 1, display: 'block', color: 'text.disabled' }}>
          No completed goals found.
        </Typography>
      ) : (
        pastGoals.map((g) => (
          <Box
            key={g.id}
            onClick={() => handleAttachGoalResult(g)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1,
              py: 0.5,
              cursor: 'pointer',
              '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.06) },
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <GlassIcon
              name="FolderOpen"
              fallback={FolderOpenIcon}
              size={14}
              tone={theme.palette.success.main}
            />
            <Typography
              variant="caption"
              sx={{ flex: 1, fontWeight: 600, fontSize: '0.68rem' }}
              noWrap
            >
              {g.title}
            </Typography>
            <Chip
              label={`$${Number(g.budget_usd || 0).toFixed(0)}`}
              size="small"
              variant="outlined"
              sx={{ height: 16, fontSize: '0.5rem' }}
            />
          </Box>
        ))
      )}
    </Box>
  );

  const renderMaterialsSection = () => (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.background.default, 0.5),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <GlassIcon name="AttachFile" fallback={AttachFileIcon} size={16} tone="neutral" />
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', flex: 1 }}>
          MATERIALS & REFERENCES
        </Typography>
        <Button
          size="small"
          startIcon={<GlassIcon name="AttachFile" fallback={AttachFileIcon} size={14} />}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFile}
          sx={{ textTransform: 'none', fontSize: '0.7rem', borderRadius: 1.5 }}
        >
          Upload File
        </Button>
        <Button
          size="small"
          startIcon={<GlassIcon name="FolderOpen" fallback={FolderOpenIcon} size={14} />}
          onClick={loadPastGoals}
          sx={{ textTransform: 'none', fontSize: '0.7rem', borderRadius: 1.5 }}
        >
          From Goals
        </Button>
      </Box>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={handleFileUpload}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.gif,.webp,.svg"
      />

      {attachments.length === 0 ? (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
          Add files or past goal results to give agents deeper context.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {attachments.map((att) => (
            <Box
              key={att.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                py: 0.35,
                px: 0.75,
                borderRadius: 1.5,
                bgcolor: alpha(theme.palette.primary.main, 0.04),
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, 0.1),
              }}
            >
              <GlassIcon
                name="DescriptionOutlined"
                fallback={DescriptionOutlinedIcon}
                size={14}
                tone={
                  att.type === 'goal-result' || att.type === 'goal-reference'
                    ? theme.palette.success.main
                    : theme.palette.info.main
                }
              />
              <Typography
                variant="caption"
                sx={{ flex: 1, fontWeight: 600, fontSize: '0.68rem' }}
                noWrap
              >
                {att.name}
              </Typography>
              {att.size > 0 && (
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.6rem' }}>
                  {formatFileSize(att.size)}
                </Typography>
              )}
              {att.goalTitle && (
                <Chip
                  label="Goal Result"
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ height: 16, fontSize: '0.5rem' }}
                />
              )}
              <IconButton
                size="small"
                onClick={() => handleRemoveAttachment(att.id)}
                sx={{ p: 0.25 }}
              >
                <GlassIcon
                  name="DeleteOutline"
                  fallback={DeleteOutlineIcon}
                  size={14}
                  tone="neutral"
                />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}

      {/* Goal picker dropdown */}
      {uploadingFile && <CircularProgress size={16} sx={{ mt: 0.5 }} />}
    </Box>
  );

  // ── File upload handler ─────────────────────────────────────
  const handleFileUpload = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingFile(true);
    for (const file of files) {
      const err = validateFile(file);
      if (err) {
        setAiError(err);
        continue;
      }
      try {
        // Use a temp ID until goal is created — files re-uploaded after
        const att = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          size: file.size,
          type: file.type,
          ext: file.name.split('.').pop()?.toLowerCase() || '',
          uploadedAt: new Date().toISOString(),
          _file: file, // keep raw file for upload after goal creation
        };
        setAttachments((prev) => [...prev, att]);
      } catch (err2) {
        setAiError(`Upload failed: ${err2.message}`);
      }
    }
    setUploadingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleRemoveAttachment = useCallback((id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const loadPastGoals = useCallback(async () => {
    try {
      const goals = await listGoals('completed');
      setPastGoals(goals || []);
    } catch {
      setPastGoals([]);
    }
    setShowGoalPicker(true);
  }, []);

  const handleAttachGoalResult = useCallback((goal) => {
    const deliverables = goal.data?.deliverables || [];
    const newAtts = deliverables.map((d, i) => ({
      id: `goal-${goal.id}-${i}`,
      name: d.title || `Result from: ${goal.title}`,
      size: 0,
      type: 'goal-result',
      ext: 'result',
      uploadedAt: new Date().toISOString(),
      goalId: goal.id,
      goalTitle: goal.title,
      content: d.output?.slice(0, 5000) || d.summary || '',
    }));
    if (newAtts.length === 0) {
      // No deliverables — attach the goal itself as reference
      newAtts.push({
        id: `goalref-${goal.id}`,
        name: `Goal: ${goal.title}`,
        size: 0,
        type: 'goal-reference',
        ext: 'ref',
        uploadedAt: new Date().toISOString(),
        goalId: goal.id,
        goalTitle: goal.title,
        content: [goal.description, goal.parsed_requirements]
          .filter(Boolean)
          .join('\n\n')
          .slice(0, 3000),
      });
    }
    setAttachments((prev) => [...prev, ...newAtts]);
    setShowGoalPicker(false);
  }, []);

  // Knowledge Base picks share the 20-item evidence budget with uploads and
  // prior-goal references. The server enforces the same cap; mirroring it here
  // stops the user before a submit can fail.
  const remainingEvidenceSlots = Math.max(
    0,
    MAX_GOAL_EVIDENCE_ITEMS - attachments.length - kbSelection.length
  );

  const handleToggleKbDocument = useCallback((row) => {
    setKbSelection((prev) =>
      prev.some((item) => item.id === row.id)
        ? prev.filter((item) => item.id !== row.id)
        : [...prev, { id: row.id, title: row.title, category: row.category }]
    );
  }, []);

  // Thread or dashboard. Both ship so they can be compared on real runs.
  const { isDashboard } = useGoalRunView();

  // The live goal, straight from the source the full goal view uses. Realtime
  // on goal_log, goal_messages and goals, with a polling fallback — and unlike
  // useGoalRunMonitor it carries the agent messages and tasks the thread needs.
  const {
    goal: liveGoal,
    logs: liveLogs,
    messages: liveMessages,
    tasks: liveTasks,
    refresh: refreshGoal,
  } = useGoalRealtime(createdGoal?.id || goalId);

  // Reopening an existing goal. The realtime hook already fetches the goal, its
  // logs, messages and tasks, so adopting what it returns costs no extra request
  // and lights up every path that gates on `createdGoal`.
  const resuming = Boolean(goalId);
  useEffect(() => {
    if (!resuming || !liveGoal || createdGoal) return;
    setCreatedGoal(liveGoal);
  }, [resuming, liveGoal, createdGoal]);

  // Hand off to the full goal view. Hosts that already own goal-detail state
  // pass onOpenGoal; otherwise fall back to the routed page.
  const handleOpenReport = useCallback(
    (id) => {
      // A host that owns goal-detail state decides what happens to the thread,
      // and every one of them opens a popup over it. Closing the thread here
      // too is what made "Full detail" a one-way door: the conversation, its
      // scroll position and its realtime subscription all went with it.
      if (onOpenGoal) {
        onOpenGoal(id);
        return;
      }
      if (typeof window !== 'undefined') window.location.assign(`/goals/${id}`);
      onClose?.();
    },
    [onOpenGoal, onClose]
  );

  // One step index for both modes: 0 while the user is still filling Step 1,
  // 1 as soon as anything is running or created.
  const wizardStep =
    createdGoal || (tabMode === 'simple' ? simplePhase !== 'input' : activeStep > 0) ? 1 : 0;

  const selectedOrganization = organizations.find((org) => org.id === selectedOrgId) || null;
  const destinationOrganizationReady =
    goalDest === 'new_business'
      ? Boolean(destOrgName.trim())
      : !organizationsLoading && Boolean(selectedOrganization);

  const physicalEvidenceOrgId = goalDest === 'new_business' ? '' : selectedOrganization?.id || '';
  const physicalEvidenceBindingKey = useMemo(
    () =>
      JSON.stringify({
        mode: tabMode === 'professional' ? 'advanced' : 'simple',
        org_id: physicalEvidenceOrgId,
        research_mode: effectiveResearchMode,
        research_location: researchLocation.trim(),
        research_market_scope: researchMarketScope || null,
      }),
    [tabMode, physicalEvidenceOrgId, effectiveResearchMode, researchLocation, researchMarketScope]
  );
  const physicalEvidenceBindingKeyRef = useRef(physicalEvidenceBindingKey);
  physicalEvidenceBindingKeyRef.current = physicalEvidenceBindingKey;
  const previousPhysicalEvidenceBindingKeyRef = useRef(physicalEvidenceBindingKey);

  const physicalEvidencePrepareBlocker =
    tabMode !== 'professional'
      ? 'Physical evidence is available only for Professional requests.'
      : !physicalEvidenceOrgId
        ? 'Select an existing execution workspace before preparing this profile.'
        : !['grounded_fast', 'grounded_deep'].includes(effectiveResearchMode)
          ? 'Choose Grounded fast or Grounded deep research.'
          : !researchLocation.trim() || !researchMarketReady
            ? 'Resolve and confirm the research market first.'
            : '';
  const boundPhysicalEvidencePreparation =
    physicalEvidenceRequested &&
    physicalEvidencePreparation?.binding_key === physicalEvidenceBindingKey &&
    !physicalEvidencePreparing
      ? physicalEvidencePreparation
      : null;
  const activePhysicalEvidencePreparation =
    boundPhysicalEvidencePreparation &&
    physicalEvidenceConfirmedBindingKey === physicalEvidenceBindingKey
      ? boundPhysicalEvidencePreparation
      : null;
  const physicalEvidenceSelectionReady =
    !physicalEvidenceRequested || Boolean(activePhysicalEvidencePreparation);

  useEffect(() => {
    const bindingChanged =
      previousPhysicalEvidenceBindingKeyRef.current !== physicalEvidenceBindingKey;
    previousPhysicalEvidenceBindingKeyRef.current = physicalEvidenceBindingKey;
    if (!bindingChanged) return;

    physicalEvidenceRequestRef.current += 1;
    setPhysicalEvidencePreparation(null);
    setPhysicalEvidencePreparing(false);
    setPhysicalEvidenceConfirmedBindingKey('');
    if (tabMode !== 'professional') {
      setPhysicalEvidenceRequested(false);
      setPhysicalEvidenceError('');
    } else if (physicalEvidenceRequested) {
      setPhysicalEvidenceError(
        'The organization, research mode, or market changed. Prepare and confirm the profile again, or turn this option off.'
      );
    }
  }, [physicalEvidenceBindingKey, physicalEvidenceRequested, tabMode]);

  const clearPhysicalEvidenceSelection = useCallback(() => {
    physicalEvidenceRequestRef.current += 1;
    setPhysicalEvidenceRequested(false);
    setPhysicalEvidencePreparation(null);
    setPhysicalEvidencePreparing(false);
    setPhysicalEvidenceError('');
    setPhysicalEvidenceConfirmedBindingKey('');
  }, []);

  const preparePhysicalEvidenceSelection = useCallback(async () => {
    setPhysicalEvidenceRequested(true);
    setPhysicalEvidencePreparation(null);
    setPhysicalEvidenceError('');
    setPhysicalEvidenceConfirmedBindingKey('');
    if (physicalEvidencePrepareBlocker) {
      setPhysicalEvidenceError(physicalEvidencePrepareBlocker);
      return;
    }

    const requestId = ++physicalEvidenceRequestRef.current;
    const requestBindingKey = physicalEvidenceBindingKey;
    setPhysicalEvidencePreparing(true);
    try {
      const prepared = await preparePhysicalEvidenceProfile({
        mode: 'advanced',
        org_id: physicalEvidenceOrgId,
        research_mode: effectiveResearchMode,
        research_location: researchLocation.trim(),
        research_market_scope: researchMarketScope,
        grounding_required: true,
        research_fail_closed: true,
      });
      if (
        requestId !== physicalEvidenceRequestRef.current ||
        requestBindingKey !== physicalEvidenceBindingKeyRef.current
      ) {
        return;
      }
      const canonical = assertPreparedPhysicalEvidenceProfile(prepared, {
        orgId: physicalEvidenceOrgId,
        researchMode: effectiveResearchMode,
      });
      setPhysicalEvidencePreparation({ ...canonical, binding_key: requestBindingKey });
    } catch (error) {
      if (requestId !== physicalEvidenceRequestRef.current) return;
      setPhysicalEvidenceError(
        `Physical evidence profile was not prepared: ${error?.message || 'unknown error'}`
      );
    } finally {
      if (requestId === physicalEvidenceRequestRef.current) {
        setPhysicalEvidencePreparing(false);
      }
    }
  }, [
    physicalEvidencePrepareBlocker,
    physicalEvidenceBindingKey,
    physicalEvidenceOrgId,
    effectiveResearchMode,
    researchLocation,
    researchMarketScope,
  ]);

  const renderPhysicalEvidenceProfileSelector = () => {
    const profile = boundPhysicalEvidencePreparation?.business_evidence_profile;
    const profileConfirmed = Boolean(activePhysicalEvidencePreparation);
    return (
      <Box
        sx={{
          p: 1.5,
          borderRadius: 2,
          border: '1px solid',
          borderColor: profileConfirmed ? 'success.main' : profile ? 'warning.main' : 'divider',
          bgcolor: profileConfirmed
            ? alpha(theme.palette.success.main, 0.05)
            : alpha(theme.palette.background.default, 0.5),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              VERIFIED PHYSICAL-OFFER EVIDENCE
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Default off. Explicitly opt in to require a typed, fail-closed AxWise evidence bundle
              before planning.
            </Typography>
          </Box>
          <Switch
            checked={physicalEvidenceRequested}
            disabled={physicalEvidencePreparing}
            onChange={(event) => {
              if (!event.target.checked) {
                clearPhysicalEvidenceSelection();
                return;
              }
              void preparePhysicalEvidenceSelection();
            }}
            slotProps={{
              input: {
                role: 'switch',
                'aria-label': 'Require verified physical-offer evidence',
              },
            }}
            size="small"
            color="success"
          />
        </Box>

        {!physicalEvidenceRequested && physicalEvidencePrepareBlocker && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
            {physicalEvidencePrepareBlocker}
          </Typography>
        )}
        {physicalEvidencePreparing && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <CircularProgress size={14} />
            <Typography variant="caption" color="text.secondary">
              Preparing and binding the canonical profile…
            </Typography>
          </Box>
        )}
        {physicalEvidenceError && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {physicalEvidenceError}
          </Alert>
        )}
        {physicalEvidenceRequested && !profile && !physicalEvidencePreparing && (
          <Button
            size="small"
            variant="outlined"
            color="success"
            onClick={preparePhysicalEvidenceSelection}
            disabled={Boolean(physicalEvidencePrepareBlocker)}
            sx={{ mt: 1, textTransform: 'none' }}
          >
            Prepare and confirm profile
          </Button>
        )}
        {profile && (
          <Box sx={{ mt: 1.25 }}>
            <Alert severity={profileConfirmed ? 'success' : 'info'} sx={{ mb: 1 }}>
              {profileConfirmed
                ? 'Profile confirmed for this organization, research mode, and market.'
                : 'Review the fixed contract and hashes, then explicitly confirm it.'}
            </Alert>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              <Chip size="small" variant="outlined" label={`Intent: ${profile.intent}`} />
              <Chip size="small" variant="outlined" label={`Model: ${profile.economic_model}`} />
              <Chip size="small" color="success" variant="outlined" label="2 verified offers" />
              <Chip size="small" color="success" variant="outlined" label="1 price difference" />
            </Box>
            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 1, mb: 0.5, color: 'text.secondary', fontWeight: 600 }}
            >
              Required role slots (5)
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {profile.required_role_slots.map((slot, index) => (
                <Chip
                  key={slot}
                  size="small"
                  label={`${slot}: ${boundPhysicalEvidencePreparation.requested_execution_roles[index]}`}
                  sx={{ fontSize: '0.65rem' }}
                />
              ))}
            </Box>
            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 1, color: 'text.secondary', wordBreak: 'break-all' }}
            >
              Profile SHA-256: {boundPhysicalEvidencePreparation.business_evidence_profile_hash}
            </Typography>
            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 0.5, color: 'text.secondary', wordBreak: 'break-all' }}
            >
              Market SHA-256: {boundPhysicalEvidencePreparation.market_scope_hash}
            </Typography>
            {!profileConfirmed && (
              <Button
                size="small"
                variant="contained"
                color="success"
                onClick={() => setPhysicalEvidenceConfirmedBindingKey(physicalEvidenceBindingKey)}
                sx={{ mt: 1.25, textTransform: 'none' }}
              >
                Confirm this evidence profile
              </Button>
            )}
          </Box>
        )}
      </Box>
    );
  };

  const resolveOrganizationForGoal = useCallback(async () => {
    if (goalDest === 'new_business') {
      const name = destOrgName.trim();
      if (!name) {
        throw new Error('Enter a business name so its workspace can be created first.');
      }

      const key = JSON.stringify({ name, type: destOrgType, industry: destIndustry.trim() });
      if (preparedNewOrgRef.current?.key === key && preparedNewOrgRef.current?.org?.id) {
        return preparedNewOrgRef.current.org;
      }

      setSubmitStatus('Creating workspace before the goal…');
      const response = await createGoalOrganization({
        name,
        org_type: destOrgType,
        industry: destIndustry.trim() || null,
        description: `Workspace created for Smart Request: ${name}`,
      });
      const createdOrg = response?.organization || response?.data || response;
      if (!createdOrg?.id) {
        throw new Error('The workspace was not created, so the goal was not started.');
      }

      preparedNewOrgRef.current = { key, org: createdOrg };
      setOrganizations((current) => [
        createdOrg,
        ...current.filter((org) => org.id !== createdOrg.id),
      ]);
      setSelectedOrgId(createdOrg.id);
      setOrganizationLoadError('');
      return createdOrg;
    }

    if (organizationsLoading) {
      throw new Error('Wait for your workspaces to finish loading before creating the goal.');
    }
    if (!selectedOrganization?.id) {
      throw new Error(
        'Select an execution workspace, or choose New Business to create one before the goal starts.'
      );
    }
    return selectedOrganization;
  }, [
    goalDest,
    destOrgName,
    destOrgType,
    destIndustry,
    organizationsLoading,
    selectedOrganization,
  ]);

  // ── Final submit — creates a Goal ───────────────────────────
  const handleFinalSubmit = useCallback(async () => {
    if (submittingRef.current || saving) return;
    // Allow submission when either (a) the AI analysis produced a structured
    // result, or (b) the user typed something in the simple input — the
    // button-enabled guard already honors the same pair, so we mirror it
    // here instead of silently no-oping when only simpleInput is present.
    const rawSimple = goalSourceText;
    const hasStructured = !!structuredResult?.title?.trim();
    if (!hasStructured && !rawSimple) {
      setAiError('Type what you want to achieve, then press Create Goal.');
      return;
    }
    if (groundingRequired && !researchMarketReady) {
      setAiError(
        'Resolve and confirm the Research market in Advanced Settings before creating this grounded request.'
      );
      return;
    }
    if (!physicalEvidenceSelectionReady) {
      setAiError(
        'Prepare and confirm the physical evidence profile for the current organization, research mode, and market before creating this goal, or turn the option off.'
      );
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    setSubmitStatus('Creating goal…');
    const toolInstruction =
      toolMode === 'no_tools'
        ? '\n\nTool Usage: DO NOT use any external tools. Work only with LLM knowledge.'
        : toolMode === 'existing_only'
          ? '\n\nTool Usage: Use ONLY already configured tools and attached materials. Do not search externally.'
          : '';
    const fullText =
      [
        answers.goal || rawSimple,
        answers.challenges && `Challenges: ${answers.challenges}`,
        answers.timeline && `Timeline: ${answers.timeline}`,
        answers.details && `Details: ${answers.details}`,
        expectedResults && `Expected Results: ${expectedResults}`,
      ]
        .filter(Boolean)
        .join('\n\n') + toolInstruction;
    try {
      const goalOrganization = await resolveOrganizationForGoal();
      setSubmitStatus('Creating goal…');
      const fallbackTitle = (answers.goal || rawSimple).slice(0, 100);
      const createdGoal = await withTimeout(
        createSmartRequestDraft({
          title: structuredResult?.title || fallbackTitle,
          description: fullText,
          budget_usd: budgetUsd,
          parsed_category: structuredResult?.category || null,
          parsed_priority: structuredResult?.priority || 'medium',
          parsed_requirements: structuredResult?.requirements || '',
          complexity: detectedComplexity,
          execution_mode: executionMode,
          tool_mode: toolMode,
          org_id: goalOrganization.id,
          // Whatever the setup drawer aimed this at: a board, a saved team, a
          // single agent, or the whole workspace when nothing was picked.
          ...executorPayloadForTarget(goalSetup.target),
          mode: 'advanced',
          po_depth: 'standard',
          // Human Approve off means the pipeline clears its own gates.
          hitl_mode: humanApprove ? 'checkpoints' : 'unattended',
          // Telemetry only: nothing downstream reads it. In Auto the payload is
          // otherwise identical to a Manual user who picked the same values.
          setup_mode: setupManual ? 'manual' : 'auto',
          theory_mode: theoryMode,
          workflow_id: selectedWorkflowId || null,
          research_mode: effectiveResearchMode,
          ...(researchLocation.trim() ? { research_location: researchLocation.trim() } : {}),
          ...(researchMarketScope ? { research_market_scope: researchMarketScope } : {}),
          grounding_required: groundingRequired,
          research_fail_closed: true,
          ...(activePhysicalEvidencePreparation
            ? {
                research_intent: activePhysicalEvidencePreparation.research_intent,
                requested_execution_roles: [
                  ...activePhysicalEvidencePreparation.requested_execution_roles,
                ],
                business_evidence_profile:
                  activePhysicalEvidencePreparation.business_evidence_profile,
                business_evidence_profile_hash:
                  activePhysicalEvidencePreparation.business_evidence_profile_hash,
              }
            : commercialMarketLaunch
              ? {
                  research_intent: COMMERCIAL_MARKET_LAUNCH_INTENT,
                  requested_execution_roles: [...COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES],
                }
              : {}),
        }),
        60000,
        "Goal creation didn't finish within 60s. The goal may have been created server-side — check the Goals list before retrying."
      );

      const goal = await persistEvidenceAndStartGoal(
        createdGoal,
        attachments,
        setSubmitStatus,
        kbSelection.map((item) => item.id)
      );

      // Success is shown only after evidence is durable and the goal has been
      // admitted to the worker queue.
      setSubmitStatus('Saved — finishing up…');
      if (goalDest === 'existing_business') setShowImplement(true);
      setCreatedGoal(goal);
      // Executor targeting belongs to this goal only. Keeping it in the
      // session store would silently route the next unrelated request to the
      // previous team or agent.
      resetGoalSetup();
      onSubmit?.({ goal, type: 'goal' });

      // The organization and catalogue already exist before the goal starts.
      // A business unit is presentation/portfolio structure and can follow.
      try {
        if (goalDest === 'new_business') {
          await implementExisting(goal.id, {
            orgId: goalOrganization.id,
            unitName: `${goalOrganization.name || destOrgName.trim()} — Main`,
          });
        }
      } catch {
        /* non-critical post-creation steps */
      }
    } catch (err) {
      console.error('[SmartRequestDialog] Goal creation error:', err);
      setAiError(`Goal creation failed: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
      setSubmitStatus('');
      submittingRef.current = false;
    }
  }, [
    saving,
    structuredResult,
    goalSourceText,
    expectedResults,
    toolMode,
    theoryMode,
    effectiveResearchMode,
    groundingRequired,
    commercialMarketLaunch,
    physicalEvidenceSelectionReady,
    activePhysicalEvidencePreparation,
    researchMarketReady,
    researchMarketScope,
    researchLocation,
    selectedWorkflowId,
    answers,
    budgetUsd,
    detectedComplexity,
    executionMode,
    humanApprove,
    setupManual,
    onSubmit,
    attachments,
    kbSelection,
    goalDest,
    destOrgName,
    resolveOrganizationForGoal,
    goalSetup.target,
  ]);

  // ── Simple tab: analyze ───────────────────────────────────
  // Accepts an optional `textOverride` so the auto-analyze useEffect can pass
  // `initialPrompt` synchronously (otherwise setSimpleInput hasn't settled yet
  // when we fire and the analyze call would see an empty string).
  const handleSimpleAnalyze = useCallback(
    async (textOverride) => {
      const sourceText = typeof textOverride === 'string' ? textOverride : simpleInput;
      // Hand the sentence to the thread and empty the box in the same commit,
      // so the message reads as having been sent rather than duplicated.
      setSubmittedText(sourceText.trim());
      setSimpleInput('');
      voice.stopListening();
      setSimplePhase('processing');
      setAnalyzingSince(Date.now());
      skipAnalysisRef.current = false;
      setProcessingStage(0);
      setAiDone(false);
      setAiError(null);

      const trimmedSource = sourceText.trim();
      const firstLine = trimmedSource.split(/\r?\n/).find((line) => line.trim()) || trimmedSource;
      // Simple chat is now a lossless handoff to AxWise. No preliminary model
      // call, classification, questionnaire, budget estimate or invented
      // acceptance result is allowed to sit in front of the canonical scope.
      setAiResult(null);
      setStructuredResult({
        title: firstLine.trim().slice(0, 100) || 'Untitled request',
        category: 'other',
        priority: 'medium',
        requirements: trimmedSource,
      });
      setExpectedResults('');
      setSimpleSuggestions([]);
      setSimpleExtracted(null);
      setDetectedComplexity(trimmedSource.length > 240 ? 'complex' : 'simple');
      setProcessingStage(PROCESSING_STAGES.length - 1);
      setAiDone(true);
      setSimplePhase('result');
      // `voice` is intentionally omitted from deps: useVoiceControl() returns a
      // fresh object on every render. Including it makes this callback's
      // identity churn and re-fires any dependent effect — the auto-prefill
      // effect below was the victim (its cleanup cancelled its own pending
      // analyze before it could run, leaving the textarea empty).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [simpleInput]
  );

  /**
   * Give up waiting for the brief and start anyway.
   *
   * Analysis is a convenience, not a gate: the submit path already falls back
   * to the typed text for a title. Offering this after a long wait is what
   * turns a hang into a choice.
   */
  const skipAnalysis = useCallback(() => {
    skipAnalysisRef.current = true;
    const trimmed = goalSourceText;
    setStructuredResult({
      title: trimmed.slice(0, 100) || 'Untitled request',
      category: 'other',
      priority: 'medium',
      requirements: trimmed,
    });
    setExpectedResults(trimmed.slice(0, 300));
    setDetectedComplexity('simple');
    setAiError('Started without the brief. The team will work straight from your description.');
    setAiDone(true);
    setSimplePhase('result');
  }, [goalSourceText]);

  /**
   * The one way a Simple request starts.
   *
   * Simple has no review screen: analysis and submission are a single user
   * action, and `autoSubmitRef` is what carries that intent across the async
   * gap into the effect below that calls handleSimpleSubmit. Both entry points
   * — the Start control and the hero's auto-analyze — must go through here.
   * When the hero path called handleSimpleAnalyze directly it never armed the
   * ref, so a prompt typed on the dashboard analysed, advanced to the monitor
   * with no goal behind it, and stranded the user on a screen whose only
   * button was Close.
   */
  const startSimple = useCallback(
    (text) => {
      autoSubmitRef.current = true;
      return handleSimpleAnalyze(text);
    },
    [handleSimpleAnalyze]
  );

  // Seed simpleInput from initialPrompt when the dialog opens from the hero.
  // Split out from auto-analyze so the textarea is populated even if analyze
  // later fails or is skipped. Keyed off `open` so it runs once per open.
  // Never after the prompt has auto-started: StrictMode runs effects twice in
  // dev, and the second pass of this one used to land after auto-start had
  // emptied the box, putting the sent sentence straight back into it.
  useEffect(() => {
    if (!open) return;
    const trimmed = (initialPrompt || '').trim();
    if (!trimmed) return;
    if (tabMode !== 'simple' || simplePhase !== 'input') return;
    if (autoAnalyzedRef.current) return;
    setSimpleInput((prev) => (prev ? prev : trimmed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt]);

  // Seed attachments from initialFiles when the dialog opens from the hero
  // paperclip button. Merges with any existing attachments to avoid duplicates.
  useEffect(() => {
    if (!open || !initialFiles?.length) return;
    setAttachments((prev) => {
      const existingIds = new Set(prev.map((a) => a.id));
      const newFiles = initialFiles.filter((f) => !existingIds.has(f.id));
      return [...prev, ...newFiles];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFiles]);

  // Read through a ref so the effect below depends only on the props that
  // decide whether to fire. startSimple's identity churns on every keystroke
  // (handleSimpleAnalyze closes over simpleInput), and depending on it is what
  // broke the hero: the sibling effect that seeds simpleInput from
  // initialPrompt re-rendered in the same commit, the dep change tore down this
  // effect, its cleanup set cancelled = true, and the queued microtask returned
  // without ever analysing. autoAnalyzedRef already makes this fire once per
  // open, so there is nothing left for a cancellation flag to protect.
  const startSimpleRef = useRef(startSimple);
  startSimpleRef.current = startSimple;

  // Auto-start when opened with a hero prompt long enough to be a real request.
  useEffect(() => {
    if (!open) {
      autoAnalyzedRef.current = false;
      return;
    }
    if (autoAnalyzedRef.current) return;
    // Reopening an existing goal: there is nothing to analyse, and running the
    // analysis would end in a second goal being created beside the first.
    if (resuming) return;
    const trimmed = (initialPrompt || '').trim();
    if (!trimmed || trimmed.length <= 5) return;
    if (tabMode !== 'simple') return;
    // The footer Start button already waits for a tenant-scoped destination.
    // Hero auto-start must obey the same boundary: firing while workspaces are
    // still loading turns a valid prompt into an immediate, retryable error.
    if (!destinationOrganizationReady) return;
    autoAnalyzedRef.current = true;
    startSimpleRef.current(trimmed);
  }, [open, initialPrompt, tabMode, resuming, destinationOrganizationReady]);

  // ── Simple tab: submit — creates a Goal ─────────────────────
  const handleSimpleSubmit = useCallback(async () => {
    // Noisy log so DevTools tells us the click actually fires even when
    // something below no-ops. Also dumps the three state bits that decide
    // whether we proceed.
    // eslint-disable-next-line no-console
    console.log('[SmartRequestDialog] Create Goal clicked', {
      saving,
      submittingRef: submittingRef.current,
      hasStructured: !!structuredResult?.title,
      simpleInputLength: goalSourceText.length,
    });
    if (saving) return;
    // Self-heal: a prior crashed attempt can leave submittingRef stuck true,
    // which would silently block every future click. Trust `saving` (which
    // resets in finally) as the source of truth.
    if (submittingRef.current) submittingRef.current = false;
    // Safety: if AI analysis didn't produce a structured result, seed from input text
    const result =
      structuredResult ||
      (goalSourceText
        ? {
            title: goalSourceText.slice(0, 100),
            category: 'other',
            priority: 'medium',
            requirements: '',
          }
        : null);
    if (!result) {
      setAiError('Type what you want to achieve, then press Create Goal.');
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    setAiError(null);
    setSubmitStatus('Creating goal…');
    try {
      const goalOrganization = await resolveOrganizationForGoal();
      setSubmitStatus('Creating goal…');
      const simpleToolInstruction =
        toolMode === 'no_tools'
          ? '\n\nTool Usage: DO NOT use any external tools. Work only with LLM knowledge.'
          : toolMode === 'existing_only'
            ? '\n\nTool Usage: Use ONLY already configured tools and attached materials. Do not search externally.'
            : '';
      const simpleDesc =
        [goalSourceText, expectedResults && `Expected Results: ${expectedResults}`]
          .filter(Boolean)
          .join('\n\n') + simpleToolInstruction;
      // Build compare_models array when dev compare mode is on. Sends an
      // array of { provider, model, suffix } — goals.js fans out into N
      // identical goals, each pinned to one LLM via goal.data.test_model.
      // Gate on compareSupported: without a local API worker, these goals
      // (flagged local_only) would sit queued forever. Drop silently and
      // fall back to a single normal goal rather than silently hang.
      const compareSpecs =
        compareMode && compareSupported && attachments.length === 0
          ? [
              compareModels.claudeOpus &&
                (compareModels.opusMode === 'api'
                  ? { provider: 'anthropic', model: 'claude-opus-5', suffix: 'Opus API' }
                  : { provider: 'claude-code', model: 'claude-opus-5', suffix: 'Opus Sub' }),
              compareModels.gemini && {
                // Pin the exact GA model so a comparison cannot drift when the
                // moving "latest" alias changes underneath an existing result.
                provider: 'gemini',
                model: 'gemini-3.8-flash',
                suffix: 'Gemini',
              },
            ].filter(Boolean)
          : null;

      if (compareSpecs?.length > 1) {
        setSubmitStatus(`Creating ${compareSpecs.length} compare goals — fan-out can take 10–30s…`);
      }

      const rawSimpleTitle =
        goalSourceText
          .split(/\r?\n/)
          .find((line) => line.trim())
          ?.trim()
          .slice(0, 100) || 'Untitled request';
      const createPayload = {
        title: rawSimpleTitle,
        description: simpleDesc,
        budget_usd: budgetUsd,
        // Simple prefill is display metadata only. The raw user request is the
        // canonical AxWise input; never let a cheap pre-analysis classification
        // become a second scope authority.
        parsed_category: null,
        parsed_priority: 'medium',
        parsed_requirements: goalSourceText,
        complexity: detectedComplexity,
        execution_mode: executionMode,
        tool_mode: toolMode,
        org_id: goalOrganization.id,
        // Whatever the setup drawer aimed this at: a board, a saved team, a
        // single agent, or the whole workspace when nothing was picked.
        ...executorPayloadForTarget(goalSetup.target),
        mode: 'simple',
        po_depth: 'quick',
        hitl_mode: humanApprove ? 'checkpoints' : 'unattended',
        setup_mode: setupManual ? 'manual' : 'auto',
        theory_mode: theoryMode,
        // Scope admission always depends on AxWise. `auto` lets AxWise decide
        // whether external research adds value; fail-closed prevents a missing
        // provider from being mistaken for an acceptable degraded scope.
        research_mode: 'auto',
        research_fail_closed: true,
        workflow_id: selectedWorkflowId || null,
        ...(compareSpecs?.length ? { compare_models: compareSpecs } : {}),
        ...(isLocalhost && pmStrategy === 'ralph' ? { pm_strategy: 'ralph' } : {}),
      };
      if (compareSpecs?.length) {
        const intentFingerprint = JSON.stringify(createPayload);
        if (compareCreateIntentRef.current?.fingerprint !== intentFingerprint) {
          compareCreateIntentRef.current = {
            fingerprint: intentFingerprint,
            sourceRequestId: createGoalSourceRequestId(),
          };
        }
        createPayload.source_request_id = compareCreateIntentRef.current.sourceRequestId;
      }

      const createResult = await withTimeout(
        (compareSpecs?.length ? createGoal : createSmartRequestDraft)(createPayload),
        60000,
        "Goal creation didn't finish within 60s. The goal may have been created server-side — check the Goals list before retrying."
      );
      // Compare mode returns { goals: [...] }, single mode returns the goal directly.
      const createdGoal = createResult?.goals?.[0] || createResult;
      const goal = compareSpecs?.length
        ? createdGoal
        : await persistEvidenceAndStartGoal(
            createdGoal,
            attachments,
            setSubmitStatus,
            kbSelection.map((item) => item.id)
          );

      // Success is shown only after evidence is durable and the goal has been
      // admitted to the worker queue.
      setSubmitStatus('Saved — finishing up…');
      if (goalDest === 'existing_business') setShowImplement(true);
      setCreatedGoal(goal);
      resetGoalSetup();
      onSubmit?.({ goal, type: 'goal' });

      // Organization scope and evidence are already durable at this point.
      try {
        if (goalDest === 'new_business') {
          await implementExisting(goal.id, {
            orgId: goalOrganization.id,
            unitName: `${goalOrganization.name || destOrgName.trim()} — Main`,
          });
        }
      } catch {
        /* non-critical post-creation steps */
      }
      if (compareSpecs?.length) compareCreateIntentRef.current = null;
    } catch (err) {
      console.error('[SmartRequestDialog] Goal creation error:', err);
      setAiError(`Goal creation failed: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
      setSubmitStatus('');
      submittingRef.current = false;
    }
  }, [
    saving,
    structuredResult,
    goalSourceText,
    expectedResults,
    toolMode,
    budgetUsd,
    detectedComplexity,
    executionMode,
    humanApprove,
    setupManual,
    theoryMode,
    selectedWorkflowId,
    compareMode,
    compareSupported,
    compareModels,
    isLocalhost,
    pmStrategy,
    onSubmit,
    attachments,
    kbSelection,
    goalDest,
    destOrgName,
    goalSetup.target,
    resolveOrganizationForGoal,
  ]);

  // ── Simple tab: talk to the team lead ───────────────────────
  // Once the goal exists the composer stops being Start. What is typed goes to
  // the goal's team lead - the same endpoint GoalLeadChatDialog uses - and the
  // exchange is appended to the thread. The box empties on send for the same
  // reason the first send empties it: text that stays put reads as unsent.
  const appendLeadNote = useCallback((text) => {
    leadSeqRef.current += 1;
    setLeadChat((prev) => [
      ...prev,
      { id: `lead-${leadSeqRef.current}`, sender: 'system', text, at: Date.now() },
    ]);
  }, []);

  // Replay the conversation this goal already had with its team lead. The rows
  // live on goal_messages under the lead channel; the run transcript skips that
  // channel precisely so they can be rendered here, with their action chips.
  //
  // Seeded once. After a send the local append is the record and the realtime
  // rows for that same exchange arrive behind it, so re-seeding would say it
  // all twice.
  const leadSeededRef = useRef(false);
  useEffect(() => {
    if (!resuming || leadSeededRef.current) return;
    const rows = (liveMessages || []).filter((m) => m?.channel === LEAD_CHAT_CHANNEL && m?.message);
    if (!rows.length) return;
    leadSeededRef.current = true;
    setLeadChat(
      rows
        .slice()
        .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
        .map((m) => ({
          id: `lead-past-${m.id}`,
          // sender_name is display copy; metadata.role is the record.
          sender: m.metadata?.role === 'user' ? 'user' : 'lead',
          text: m.message,
          actions: Array.isArray(m.metadata?.actions) ? m.metadata.actions : [],
          at: new Date(m.created_at || 0).getTime(),
        }))
    );
  }, [resuming, liveMessages]);

  const handleLeadSend = useCallback(async () => {
    const text = simpleInput.trim();
    const targetGoalId = liveGoal?.id || createdGoal?.id;
    if (!text || leadSending || !targetGoalId) return;
    voice.stopListening();
    const history = leadChat
      .filter((m) => m.sender !== 'system')
      .map((m) => ({ sender: m.sender, text: m.text }));
    leadSeqRef.current += 1;
    setLeadChat((prev) => [
      ...prev,
      { id: `lead-${leadSeqRef.current}`, sender: 'user', text, at: Date.now() },
    ]);
    setSimpleInput('');
    setLeadSending(true);
    try {
      // Re-read the authoritative row before deciding whether this turn is a
      // question, correction, or approval. Realtime can lag exactly when an
      // AxWise generation crosses a review boundary; classifying its older
      // snapshot could send a correction to generic chat and leave stale scope
      // canonical.
      const scopeGoal = await getGoal(targetGoalId);
      const preliminaryScopeReview = isAxwiseScopeClarification(scopeGoal);
      const nativeScopeReview = isAxwiseContextReview(scopeGoal);
      const activeScopeRebuild = isAxwiseScopeRebuildActive(scopeGoal);
      const nativeScopeBinding = nativeAxwiseScopeActionBinding(scopeGoal);
      const scopeIntent = axwiseScopeChatIntent(text, {
        materialQuestionActive: Boolean(nativeAxwiseMaterialQuestion(scopeGoal)),
      });
      if (
        ((preliminaryScopeReview || nativeScopeReview) && scopeIntent !== 'question') ||
        (activeScopeRebuild && scopeIntent === 'details')
      ) {
        if (scopeIntent === 'proceed') {
          if (preliminaryScopeReview) {
            await acceptGoalCustomerScope(axwiseScopeAcceptancePayload(scopeGoal));
          } else {
            await approveGoalContext(targetGoalId, nativeScopeBinding);
          }
        } else if (preliminaryScopeReview || activeScopeRebuild) {
          await reviseGoalCustomerScope(axwiseScopeRevisionPayload(scopeGoal, text));
        } else {
          await reviseGoalContext(targetGoalId, text, nativeScopeBinding);
        }
        leadSeqRef.current += 1;
        setLeadChat((prev) => [
          ...prev,
          {
            id: `lead-${leadSeqRef.current}`,
            sender: 'lead',
            text:
              scopeIntent === 'proceed'
                ? 'Confirmed the latest proposed scope. I am proceeding with it now.'
                : 'I am rebuilding the proposed scope from that correction. Review the updated scope before you approve it.',
            actions: [],
            at: Date.now(),
          },
        ]);
        await refreshGoal?.();
        return;
      }
      if (activeScopeRebuild && scopeIntent === 'proceed') {
        leadSeqRef.current += 1;
        setLeadChat((prev) => [
          ...prev,
          {
            id: `lead-${leadSeqRef.current}`,
            sender: 'lead',
            text: 'The latest proposed scope is still being prepared. I will ask you to confirm it once the updated scope is ready.',
            actions: [],
            at: Date.now(),
          },
        ]);
        await refreshGoal?.();
        return;
      }
      const res = await sendLeadMessage({ goalId: targetGoalId, message: text, history });
      leadSeqRef.current += 1;
      setLeadChat((prev) => [
        ...prev,
        {
          id: `lead-${leadSeqRef.current}`,
          sender: 'lead',
          text: res?.reply || '(no reply)',
          actions: Array.isArray(res?.actions) ? res.actions : [],
          at: Date.now(),
        },
      ]);
    } catch (err) {
      leadSeqRef.current += 1;
      setLeadChat((prev) => [
        ...prev,
        {
          id: `lead-${leadSeqRef.current}`,
          sender: 'lead',
          text: `I could not answer just now (${err?.message || 'error'}). Try again in a moment.`,
          actions: [],
          at: Date.now(),
        },
      ]);
    } finally {
      setLeadSending(false);
    }
  }, [simpleInput, createdGoal, liveGoal, leadSending, leadChat, voice, refreshGoal]);

  // Simple mode submits as soon as the analysis lands, so Start is a single
  // action. Guarded by a ref rather than state so a re-render mid-flight
  // cannot fire a second create.
  useEffect(() => {
    if (!autoSubmitRef.current) return;
    if (resuming) return;
    if (tabMode !== 'simple' || simplePhase !== 'result') return;
    if (saving || createdGoal) return;
    autoSubmitRef.current = false;
    handleSimpleSubmit();
  }, [tabMode, simplePhase, saving, createdGoal, handleSimpleSubmit, resuming]);

  const canSimpleAnalyze = simpleInput.trim().length > 5;
  const canProceedProfessional = answers.goal.trim().length > 5;
  const canStartStep1 =
    (tabMode === 'simple' ? canSimpleAnalyze : canProceedProfessional) &&
    destinationOrganizationReady;
  const handleStartStep1 = () => {
    if (tabMode === 'simple') return startSimple();
    return handleProceedToStep2();
  };

  const renderGoalDestination = () => (
    <Box
      sx={{
        mt: 1,
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.background.default, 0.5),
      }}
    >
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}
      >
        GOAL DESTINATION
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {[
          { id: 'standalone', label: 'Standalone (workspace-scoped)' },
          { id: 'new_business', label: 'New Business' },
          { id: 'existing_business', label: 'Existing Business' },
        ].map((opt) => (
          <Chip
            key={opt.id}
            label={opt.label}
            size="small"
            color={goalDest === opt.id ? 'primary' : 'default'}
            variant={goalDest === opt.id ? 'filled' : 'outlined'}
            onClick={() => setGoalDest(opt.id)}
            sx={{ fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer' }}
          />
        ))}
      </Box>

      {goalDest === 'new_business' ? (
        <>
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Business Name"
              value={destOrgName}
              onChange={(e) => setDestOrgName(e.target.value)}
              required
              sx={{ flex: 1, minWidth: 150, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <TextField
              size="small"
              label="Industry"
              value={destIndustry}
              onChange={(e) => setDestIndustry(e.target.value)}
              sx={{ flex: 1, minWidth: 120, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            This workspace is created before the goal starts, so AxWise receives the correct tenant
            and Agent Hub boundary from the first pipeline step.
          </Typography>
        </>
      ) : (
        <>
          <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
            <InputLabel id="smart-request-workspace-label">
              {goalDest === 'existing_business' ? 'Organization' : 'Execution workspace'}
            </InputLabel>
            <Select
              labelId="smart-request-workspace-label"
              value={selectedOrgId}
              label={goalDest === 'existing_business' ? 'Organization' : 'Execution workspace'}
              onChange={(event) => setSelectedOrgId(event.target.value)}
              disabled={organizationsLoading || organizations.length === 0}
              inputProps={{ 'aria-label': 'Execution workspace' }}
              sx={{ borderRadius: 2 }}
            >
              {organizations.map((org) => (
                <MenuItem key={org.id} value={org.id}>
                  {org.name || 'Untitled workspace'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {organizationsLoading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <CircularProgress size={14} />
              <Typography variant="caption" color="text.secondary">
                Loading workspaces…
              </Typography>
            </Box>
          )}
          {!organizationsLoading && organizationLoadError && (
            <Alert severity="error" sx={{ mt: 1, py: 0.25, fontSize: '0.75rem' }}>
              {organizationLoadError}
            </Alert>
          )}
          {!organizationLoadError && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {goalDest === 'existing_business'
                ? 'The goal starts inside this organization; you can choose its unit immediately after creation.'
                : 'Standalone means no business unit. The goal still runs inside this selected execution workspace so its Agent Hub roster, evidence, and AxWise decisions remain tenant-scoped.'}
            </Typography>
          )}
        </>
      )}
    </Box>
  );

  // ── Mic button ─────────────────────────────────────────────
  const MicButton = useCallback(
    ({ size = 'medium', sx: sxProp }) => {
      const isListening = voice.state === 'listening';
      return (
        <Tooltip
          title={
            isListening
              ? 'Stop recording'
              : voice.isSupported
                ? 'Speak your answer'
                : 'Voice not supported'
          }
        >
          <span>
            <IconButton
              size={size}
              disabled={!voice.isSupported}
              onClick={isListening ? voice.stopListening : voice.startListening}
              sx={{
                color: isListening ? 'error.main' : 'action.active',
                animation: isListening ? `${pulse} 1.2s ease-in-out infinite` : 'none',
                ...sxProp,
              }}
            >
              {isListening ? (
                <GlassIcon name="StopOutlined" fallback={StopOutlinedIcon} size={24} />
              ) : (
                <GlassIcon name="MicOutlined" fallback={MicOutlinedIcon} size={24} />
              )}
            </IconButton>
          </span>
        </Tooltip>
      );
    },
    [voice]
  );

  // ── STEP 1: Tell About You ─────────────────────────────────
  // ── PROFESSIONAL: Brief step ─────────────────────────────
  const renderStep1 = () => (
    <Box sx={{ animation: `${fadeInUp} 0.4s ease-out` }}>
      {isLocalhost && renderDevPanels()}
      <Step1Professional
        form={step1Form}
        renderMic={(key) => (activeField === key ? <MicButton size="small" /> : null)}
      />
    </Box>
  );

  // ── STEP 2: Select a Solution ──────────────────────────────
  const currentStageData = PROCESSING_STAGES[processingStage] || PROCESSING_STAGES[0];
  const StageIcon = currentStageData.icon;
  const progressPercent = ((processingStage + 1) / PROCESSING_STAGES.length) * 100;

  const renderStep2 = () => (
    <Box
      sx={{
        animation: `${fadeInUp} 0.4s ease-out`,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {/* Processing animation */}
      {!aiDone ? (
        <Box
          sx={{
            textAlign: 'center',
            py: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Box sx={{ position: 'relative', width: 64, height: 64 }}>
            <CircularProgress
              size={64}
              thickness={2}
              sx={{ color: alpha(theme.palette.primary.main, 0.15), position: 'absolute' }}
              variant="determinate"
              value={100}
            />
            <CircularProgress
              size={64}
              thickness={2}
              sx={{ color: 'primary.main', position: 'absolute', animationDuration: '1.2s' }}
            />
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <GlassIcon name="AutoAwesome" fallback={AutoAwesomeIcon} size={24} />
            </Box>
          </Box>
          <Typography variant="body1" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
            Analyzing your request...
          </Typography>
          <Typography variant="caption" color="text.secondary">
            This usually takes 10 - 20 seconds
          </Typography>
        </Box>
      ) : (
        /* Solution ready */
        <Box sx={{ animation: `${fadeInUp} 0.5s ease-out` }}>
          {/* Success header */}
          <Box sx={{ textAlign: 'center', mb: 2.5 }}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                mx: 'auto',
                mb: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: aiError
                  ? alpha(theme.palette.warning.main, 0.12)
                  : alpha(theme.palette.success.main, 0.12),
              }}
            >
              {aiError ? (
                <GlassIcon
                  name="EditOutlined"
                  fallback={EditOutlinedIcon}
                  size={28}
                  tone={theme.palette.warning.main}
                />
              ) : (
                <GlassIcon
                  name="CheckCircleOutline"
                  fallback={CheckCircleOutlineIcon}
                  size={28}
                  tone={theme.palette.success.main}
                />
              )}
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
              {aiError ? 'Review and submit' : SMART_REQUEST_STRUCTURED_TITLE}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {aiError || SMART_REQUEST_STRUCTURED_DESCRIPTION}
            </Typography>
          </Box>

          {aiError && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              AI pre-fill did not finish. Nothing was lost—you can retry now or continue manually
              using the intake you already entered.
            </Alert>
          )}

          {/* Solution preview card */}
          {aiResult && (
            <Box
              sx={{
                p: 2.5,
                borderRadius: 3,
                bgcolor: isDark
                  ? alpha(theme.palette.primary.main, 0.06)
                  : alpha(theme.palette.primary.main, 0.03),
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, 0.15),
                mb: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
                  {aiResult.title}
                </Typography>
                <Chip
                  label={aiResult.priority}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.7rem',
                    bgcolor: PRIORITY_STYLES[aiResult.priority]?.bg || '#F3F4F6',
                    color: PRIORITY_STYLES[aiResult.priority]?.color || '#6B7280',
                  }}
                />
                <Chip
                  label={aiResult.category}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem' }}
                />
              </Box>

              {aiResult.summary && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {aiResult.summary}
                </Typography>
              )}

              {/* Suggested team */}
              {aiResult.suggestedAgents?.length > 0 && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, color: 'text.secondary', mb: 1, display: 'block' }}
                  >
                    SUGGESTED TEAM
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {aiResult.suggestedAgents.map((agent, i) => (
                      <Box
                        key={i}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          p: 1.25,
                          borderRadius: 2,
                          bgcolor: isDark ? alpha('#fff', 0.04) : '#fff',
                          border: '1px solid',
                          borderColor: 'divider',
                          animation: `${fadeInUp} ${0.3 + i * 0.1}s ease-out`,
                        }}
                      >
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                          }}
                        >
                          <GlassIcon
                            name="SmartToyOutlined"
                            fallback={SmartToyOutlinedIcon}
                            size={18}
                          />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                            {agent.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {agent.role}
                          </Typography>
                        </Box>
                        <Chip
                          label="Ready"
                          size="small"
                          color="success"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem', height: 22 }}
                        />
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* Refinement chat */}
          {messages.length > 0 && (
            <Box sx={{ maxHeight: 150, overflow: 'auto', mb: 1.5, px: 0.5 }}>
              {messages.map((msg, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    mb: 1,
                  }}
                >
                  <Box
                    sx={{
                      maxWidth: '80%',
                      px: 1.5,
                      py: 0.75,
                      borderRadius: 2,
                      fontSize: '0.8rem',
                      bgcolor:
                        msg.role === 'user'
                          ? alpha(theme.palette.primary.main, 0.1)
                          : alpha(theme.palette.grey[500], 0.08),
                      border: '1px solid',
                      borderColor:
                        msg.role === 'user' ? alpha(theme.palette.primary.main, 0.2) : 'divider',
                    }}
                  >
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {msg.text}
                    </Typography>
                  </Box>
                </Box>
              ))}
              {chatLoading && (
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mb: 1 }}>
                  <CircularProgress size={12} />
                  <Typography variant="caption" color="text.secondary">
                    Updating...
                  </Typography>
                </Box>
              )}
              <div ref={chatEndRef} />
            </Box>
          )}

          {/* Chat input for refinement */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Want to adjust anything? Type here..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleChatSend();
                }
              }}
              disabled={chatLoading}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.85rem' } }}
            />
            <IconButton
              size="small"
              color="primary"
              onClick={handleChatSend}
              disabled={!chatInput.trim() || chatLoading}
            >
              <GlassIcon name="Send" fallback={SendIcon} size={20} />
            </IconButton>
          </Box>

          {renderGoalDestination()}

          {/* Actions — Create directly or customize. Sticky footer. */}
          <Box
            sx={{
              position: 'sticky',
              bottom: 0,
              mx: -3,
              px: 3,
              pt: 1.5,
              pb: 2,
              mt: 2.5,
              bgcolor: 'background.paper',
              borderTop: '1px solid',
              borderColor: 'divider',
              zIndex: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
            }}
          >
            <Button
              size="small"
              onClick={() => {
                setActiveStep(0);
                setAiDone(false);
                setAiResult(null);
                setMessages([]);
              }}
              sx={{ textTransform: 'none' }}
            >
              Start Over
            </Button>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {aiError && (
                <Button
                  variant="outlined"
                  color="warning"
                  onClick={handleProceedToStep2}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                >
                  Retry analysis
                </Button>
              )}
              <Button
                variant="outlined"
                onClick={handleProceedToStep3}
                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
              >
                {aiError ? 'Continue manually' : 'Customize...'}
              </Button>
              <Button
                variant="contained"
                onClick={researchMarketReady ? handleFinalSubmit : handleProceedToStep3}
                disabled={
                  saving ||
                  !structuredResult?.title ||
                  !destinationOrganizationReady ||
                  !physicalEvidenceSelectionReady
                }
                endIcon={
                  saving ? null : (
                    <GlassIcon
                      name="RocketLaunchOutlined"
                      fallback={RocketLaunchOutlinedIcon}
                      size={20}
                    />
                  )
                }
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  borderRadius: 2,
                  px: 3,
                  background: !saving
                    ? `linear-gradient(135deg, ${theme.palette.success.main}, ${theme.palette.success.dark || theme.palette.success.main})`
                    : undefined,
                }}
              >
                {saving ? (
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} color="inherit" />
                    <Box component="span" sx={{ fontSize: '0.85rem' }}>
                      {submitStatus || 'Creating…'}
                    </Box>
                  </Box>
                ) : researchMarketReady ? (
                  'Create Goal'
                ) : (
                  'Set research market'
                )}
              </Button>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );

  // ── STEP 3: Enjoy Results ──────────────────────────────────
  const renderStep3 = () => (
    <Box
      sx={{
        animation: `${fadeInUp} 0.4s ease-out`,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 1 }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            mx: 'auto',
            mb: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `linear-gradient(135deg, ${theme.palette.success.main}, ${theme.palette.success.dark || theme.palette.success.main})`,
            color: '#fff',
          }}
        >
          <GlassIcon name="AssignmentOutlined" fallback={AssignmentOutlinedIcon} size={28} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
          Review & Submit
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Fine-tune your request before submitting. All fields are editable.
        </Typography>
      </Box>

      {/* Editable fields */}
      <TextField
        label="Title"
        fullWidth
        value={structuredResult?.title || ''}
        onChange={(e) => setStructuredResult((prev) => ({ ...prev, title: e.target.value }))}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />
      <Box sx={{ display: 'flex', gap: 2 }}>
        <FormControl fullWidth>
          <InputLabel>Category</InputLabel>
          <Select
            label="Category"
            value={structuredResult?.category || 'other'}
            onChange={(e) => setStructuredResult((prev) => ({ ...prev, category: e.target.value }))}
            sx={{ borderRadius: 2 }}
          >
            {CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>Priority</InputLabel>
          <Select
            label="Priority"
            value={structuredResult?.priority || 'medium'}
            onChange={(e) => setStructuredResult((prev) => ({ ...prev, priority: e.target.value }))}
            sx={{ borderRadius: 2 }}
          >
            {PRIORITIES.map((p) => (
              <MenuItem key={p} value={p}>
                <Chip
                  label={p.charAt(0).toUpperCase() + p.slice(1)}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    bgcolor: PRIORITY_STYLES[p].bg,
                    color: PRIORITY_STYLES[p].color,
                  }}
                />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      <TextField
        label="Requirements & Deliverables"
        fullWidth
        multiline
        minRows={3}
        maxRows={8}
        value={structuredResult?.requirements || ''}
        onChange={(e) => setStructuredResult((prev) => ({ ...prev, requirements: e.target.value }))}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />
      <TextField
        label="Expected Results"
        fullWidth
        multiline
        minRows={2}
        maxRows={4}
        value={expectedResults}
        onChange={(e) => setExpectedResults(e.target.value)}
        placeholder="e.g. Landing page, market research report, competitor analysis..."
        helperText="What should the agents deliver? Be specific."
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />

      {/* Advanced Settings — collapsible */}
      <Accordion
        defaultExpanded
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: '10px !important',
          '&:before': { display: 'none' },
          bgcolor: 'transparent',
          boxShadow: 'none',
        }}
      >
        <AccordionSummary
          expandIcon={
            <GlassIcon name="ExpandMore" fallback={ExpandMoreIcon} size={20} tone="neutral" />
          }
          sx={{
            minHeight: 42,
            '& .MuiAccordionSummary-content': { m: '8px 0', gap: 1, alignItems: 'center' },
          }}
        >
          <GlassIcon
            name="SettingsOutlined"
            fallback={SettingsOutlinedIcon}
            size={18}
            tone="neutral"
          />
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
            Advanced Settings
          </Typography>
          <Chip
            label={`$${budgetUsd} • ${executionMode}`}
            size="small"
            sx={{ ml: 'auto', mr: 1, height: 20, fontSize: '0.6rem', fontWeight: 600 }}
          />
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Materials & References */}
          {renderMaterialsSection()}

          {/* Workflow */}
          {renderWorkflowSelector()}

          {/* Tool usage */}
          {renderToolModeSelector()}

          {/* Customer and market research policy */}
          {renderResearchModeSelector()}

          {/* Explicit v2 physical-offer evidence profile */}
          {renderPhysicalEvidenceProfileSelector()}

          {/* Budget & Execution Mode */}
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: isDark
                ? alpha(theme.palette.info.main, 0.06)
                : alpha(theme.palette.info.main, 0.03),
              border: '1px solid',
              borderColor: alpha(theme.palette.info.main, 0.15),
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <GlassIcon
                name="AccountBalanceWalletOutlined"
                fallback={AccountBalanceWalletOutlinedIcon}
                size={18}
                tone={theme.palette.info.main}
              />
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                BUDGET & EXECUTION
              </Typography>
              <Chip
                label={detectedComplexity === 'complex' ? 'Complex' : 'Simple'}
                size="small"
                color={detectedComplexity === 'complex' ? 'secondary' : 'success'}
                sx={{ fontWeight: 700, fontSize: '0.65rem', height: 20, ml: 'auto' }}
              />
            </Box>
            <Box sx={{ px: 1 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  mb: 0.5,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Budget: ${budgetUsd}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  AI compute cost limit
                </Typography>
              </Box>
              <Slider
                value={budgetUsd}
                onChange={(_, v) => setBudgetUsd(v)}
                min={1}
                max={100}
                step={1}
                size="small"
                sx={{ color: 'info.main' }}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Button
                size="small"
                variant={executionMode === 'auto' ? 'contained' : 'outlined'}
                onClick={() => setExecutionMode('auto')}
                sx={{ textTransform: 'none', fontSize: '0.75rem', flex: 1, borderRadius: 1.5 }}
              >
                Auto (run immediately)
              </Button>
              <Button
                size="small"
                variant={executionMode === 'manual' ? 'contained' : 'outlined'}
                onClick={() => setExecutionMode('manual')}
                sx={{ textTransform: 'none', fontSize: '0.75rem', flex: 1, borderRadius: 1.5 }}
              >
                Manual (approve first)
              </Button>
            </Box>
          </Box>

          {/* Theory Mode toggle */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1.5,
              borderRadius: 2,
              bgcolor: theoryMode
                ? alpha(theme.palette.info.main, 0.08)
                : alpha(theme.palette.text.primary, 0.03),
              border: '1px solid',
              borderColor: theoryMode ? alpha(theme.palette.info.main, 0.25) : 'divider',
            }}
          >
            <GlassIcon
              name="AutoGraphOutlined"
              fallback={AutoGraphOutlinedIcon}
              size={20}
              tone={theoryMode ? theme.palette.info.main : 'neutral'}
            />
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  color: theoryMode ? 'info.main' : 'text.primary',
                }}
              >
                Theory Mode
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                Business projections: revenue, ROI, competitors, action plans
              </Typography>
            </Box>
            <Switch
              checked={theoryMode}
              onChange={(e) => setTheoryMode(e.target.checked)}
              size="small"
              color="info"
            />
          </Box>

          {renderGoalDestination()}
        </AccordionDetails>
      </Accordion>

      {/* Actions — sticky footer */}
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          mx: -3,
          px: 3,
          pt: 1.5,
          pb: 2,
          mt: 2,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          zIndex: 2,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Button onClick={() => setActiveStep(1)} sx={{ textTransform: 'none' }}>
          Back
        </Button>
        <Button
          variant="contained"
          onClick={handleFinalSubmit}
          disabled={
            saving ||
            !(structuredResult?.title?.trim() || goalSourceText) ||
            !researchMarketReady ||
            !physicalEvidenceSelectionReady ||
            !destinationOrganizationReady
          }
          endIcon={
            saving ? null : (
              <GlassIcon
                name="RocketLaunchOutlined"
                fallback={RocketLaunchOutlinedIcon}
                size={20}
              />
            )
          }
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 2,
            px: 4,
            background: !saving
              ? `linear-gradient(135deg, ${theme.palette.success.main}, ${theme.palette.success.dark || theme.palette.success.main})`
              : undefined,
            '&:hover': {
              background: `linear-gradient(135deg, ${theme.palette.success.dark || theme.palette.success.main}, ${theme.palette.success.main})`,
            },
          }}
        >
          {saving ? (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} color="inherit" />
              <Box component="span" sx={{ fontSize: '0.85rem' }}>
                {submitStatus || 'Creating…'}
              </Box>
            </Box>
          ) : (
            'Create Goal'
          )}
        </Button>
      </Box>
    </Box>
  );

  // ── SIMPLE: Input phase ──────────────────────────────────
  // Everything Step 1 needs, in one object, so the step components stay
  // presentational and both modes are guaranteed to drive the same state.
  const step1Form = {
    simpleInput,
    onSimpleInputChange: setSimpleInput,
    onFocusGoalField: () => setActiveField('goal'),
    answers,
    onAnswerChange: (key, value) => setAnswers((prev) => ({ ...prev, [key]: value })),
    onFocusField: setActiveField,
    setupManual,
    onSetupManualChange: setSetupManual,
    humanApprove,
    onHumanApproveChange: setHumanApprove,
    attachments,
    onUpload: handleFileUpload,
    onRemoveAttachment: handleRemoveAttachment,
    uploadingFile,
    onLoadPastGoals: loadPastGoals,
    kbSelectedIds: kbSelection.map((item) => item.id),
    onToggleKbDocument: handleToggleKbDocument,
    remainingSlots: remainingEvidenceSlots,
    pastGoalPicker: showGoalPicker ? renderPastGoalPicker() : null,
    toolMode,
    onToolModeChange: setToolMode,
    groundedResearchConflict:
      tabMode === 'professional' && toolMode === 'no_tools' && groundingRequired,
    goalDest,
    onGoalDestChange: setGoalDest,
    destOrgName,
    onDestOrgNameChange: setDestOrgName,
    destIndustry,
    onDestIndustryChange: setDestIndustry,
    organizations,
    organizationsLoading,
    organizationLoadError,
    selectedOrgId,
    onSelectedOrgIdChange: handleSelectedOrgIdChange,
  };

  // ── SIMPLE: Live run monitor ─────────────────────────────
  // ── SIMPLE: Describe step ────────────────────────────────
  // Everything the Step 1 thread derives itself from. `structuredResult` is
  // intentionally withheld: lossless Simple handoff no longer prepares a
  // preliminary brief, and rendering its raw title as "Brief ready" merely
  // repeated the user's request before AxWise had confirmed any scope.
  const simpleTranscriptState = {
    simpleInput,
    submittedText,
    simplePhase,
    setupManual,
    humanApprove,
    structuredResult: null,
    extracted: simpleExtracted,
    suggestions: simpleSuggestions,
    budgetUsd,
    complexity: detectedComplexity,
    expectedResults,
    aiError: aiError || '',
    createdGoal,
    organizationLoadError,
    analyzingSince,
    resumed: resuming,
  };

  // Say which of Start's two preconditions is missing. An Enter that silently
  // does nothing while workspaces load is the failure this replaces.
  const simpleBlockedReason = !canSimpleAnalyze
    ? 'Tell us what you want to achieve, in a sentence or two.'
    : organizationsLoading
      ? 'Loading your workspaces…'
      : !destinationOrganizationReady
        ? 'Choose where this goal should run.'
        : '';

  // Hand the running goal to the app shell, so its Actions menu can live in
  // the fixed top bar instead of in a header that scrolls away. Only the
  // embedded variant: the dialog has its own chrome and is not the screen the
  // top bar is heading up.
  usePublishRunningGoal(variant === 'inline' && createdGoal ? liveGoal || createdGoal : null, {
    onRefresh: refreshGoal,
    onOpenGoal: handleOpenReport,
    onLeave: handleClose,
  });

  const simpleComposerRole = composerRole((liveGoal || createdGoal)?.status, {
    hasGoal: Boolean(createdGoal),
    // A failed analysis hands the box back, so the user is not locked out of
    // a retry by a label that says the send is still in flight.
    sent: Boolean(submittedText) && !aiError,
  });
  const simpleComposerTalksToLead = composerTalksToLead(simpleComposerRole);

  const renderSimpleInput = () => (
    <Box
      sx={{
        animation: `${fadeInUp} 0.4s ease-out`,
        ...(variant === 'inline'
          ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }
          : {}),
      }}
    >
      {createdGoal && isDashboard ? (
        <>
          <GoalRunBar goal={liveGoal || createdGoal} />
          {/* The switch rides GoalRunBar now, so both views carry it in the
              same place instead of one having its own row. */}
          <GoalDashboard
            goal={liveGoal || createdGoal}
            logs={liveLogs}
            messages={liveMessages}
            tasks={liveTasks}
            onRefresh={refreshGoal}
            onSetupTools={() => handleOpenReport(createdGoal.id)}
          />
        </>
      ) : (
        <GoalThread
          form={step1Form}
          transcriptState={simpleTranscriptState}
          run={
            createdGoal
              ? {
                  goal: liveGoal || createdGoal,
                  logs: liveLogs,
                  messages: liveMessages,
                  tasks: liveTasks,
                }
              : null
          }
          // From the send onward. The greeting and the empty box stay a column;
          // once the request is gone the thread is a screen to watch.
          wide={Boolean(submittedText) || resuming}
          chat={leadChat}
          chatBusy={leadSending}
          onChatNote={appendLeadNote}
          onScopeAnswered={refreshGoal}
          onOpenReport={handleOpenReport}
          onSkipAnalysis={skipAnalysis}
          header={createdGoal ? <GoalRunBar goal={liveGoal || createdGoal} /> : null}
          fill={variant === 'inline'}
          // Reopened from History, so it opens at the first message rather
          // than the last one said.
          openAtTop={resuming}
          surface={variant === 'inline' ? 'background.default' : 'background.paper'}
          footer={
            <GoalComposer
              value={simpleInput}
              onChange={setSimpleInput}
              // One box, two destinations: Start before the goal exists, the
              // team lead once it does. `sent` is the gap between - nothing to
              // send to yet, and the label says so.
              onSubmit={simpleComposerTalksToLead ? handleLeadSend : handleStartStep1}
              role={simpleComposerRole}
              canSubmit={
                simpleComposerTalksToLead
                  ? simpleInput.trim().length > 0 && !leadSending
                  : simpleComposerRole === 'describe' && canStartStep1
              }
              blockedReason={
                simpleComposerTalksToLead
                  ? ''
                  : simpleComposerRole === 'sent'
                    ? 'Your team lead is being set up. You can ask questions once the goal is running.'
                    : simpleBlockedReason
              }
              busy={simpleComposerTalksToLead ? leadSending : saving}
              voice={voice}
              onAttach={handleFileUpload}
              onOpenSetup={() => setGoalSetupOpen(true)}
              setupScoped={isScopedExecutorTarget(goalSetup.target)}
              remainingSlots={remainingEvidenceSlots}
              // The view switch used to sit here and crowded the box you type
              // in. It belongs with the run it switches, so it rides the run
              // header instead.
              topSlot={composerTopSlot || null}
              // Stop and start the run, in the card's top-right corner. From
              // the send onward only - the same line the thread uses to decide
              // it has become a screen to watch. Before that there is no run to
              // stop, and an empty composer wearing two dead buttons says there
              // is something to stop when there is not.
              topRight={
                Boolean(submittedText) || createdGoal || resuming ? (
                  <GoalRunControls
                    goal={liveGoal || createdGoal}
                    onRefresh={refreshGoal}
                    verifyPickupProjection
                  />
                ) : null
              }
            />
          }
        />
      )}
      <GoalSetupDrawer
        open={goalSetupOpen}
        onClose={() => setGoalSetupOpen(false)}
        onOpenEntity={onOpenEntity}
      />
    </Box>
  );

  // Embedded: no Dialog, no stepper, no header. The host owns the surface and
  // the framing; this contributes the thread and its composer.
  if (variant === 'inline') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }}>
        {renderSimpleInput()}
      </Box>
    );
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        fullScreen={fullScreen}
        slotProps={{
          paper: {
            sx: {
              borderRadius: fullScreen ? 0 : 3,
              overflow: 'hidden',
              // dvh, not vh: mobile browser chrome makes vh overshoot and hides
              // the footer behind the address bar.
              height: fullScreen ? '100dvh' : 'auto',
              maxHeight: fullScreen ? '100dvh' : '90dvh',
              display: 'flex',
              flexDirection: 'column',
            },
          },
        }}
      >
        {/* Top gradient bar */}
        <Box
          sx={{
            height: 4,
            background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.light}, ${theme.palette.secondary?.main || theme.palette.primary.main})`,
            backgroundSize: '200% 100%',
            animation: `${shimmer} 3s linear infinite`,
          }}
        />

        {/* Header: close only. The mode switch lives in the footer, matching
            the Actions control on the goal dialog. */}
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, pt: 1.5 }}>
          <Box sx={{ flex: 1 }} />
          <IconButton size="small" onClick={handleClose} aria-label="Close">
            <GlassIcon name="Close" fallback={CloseIcon} size={18} tone="neutral" />
          </IconButton>
        </Box>

        {/* Step indicator: two steps, both modes */}
        <Box sx={{ px: { xs: 2, sm: 3 }, pt: 1.5, pb: 0.5 }}>
          <Stepper
            activeStep={wizardStep}
            sx={{
              '& .MuiStepLabel-label': { fontSize: { xs: '0.68rem', sm: '0.75rem' } },
              '& .MuiStepConnector-root': { top: 10 },
            }}
          >
            {(tabMode === 'professional' ? PRO_STEPS : SIMPLE_STEPS).map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {/* Step 1 footer. Pinned to the shell rather than duplicated inside each
            render function, so it stays reachable on a full-screen sheet. */}
        {wizardStep === 0 && !createdGoal && (
          <Box
            sx={{
              order: 3,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1.5,
              px: { xs: 2, sm: 3 },
              py: 2,
              borderTop: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              flexWrap: 'wrap',
            }}
          >
            {aiError && (
              <Alert
                severity="warning"
                onClose={() => setAiError(null)}
                sx={{ width: '100%', fontSize: '0.78rem', py: 0.25, mb: 1 }}
              >
                {aiError}
              </Alert>
            )}
            {professionalModeEnabled && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={(event) => setModeAnchor(event.currentTarget)}
                  startIcon={
                    <GlassIcon
                      name={tabMode === 'professional' ? 'PersonOutline' : 'BoltOutlined'}
                      fallback={tabMode === 'professional' ? PersonOutlineIcon : BoltOutlinedIcon}
                      size={16}
                    />
                  }
                  endIcon={<GlassIcon name="ExpandMore" fallback={ExpandMoreIcon} size={16} />}
                  aria-haspopup="menu"
                  sx={{ textTransform: 'none', fontSize: '0.75rem', borderRadius: 2 }}
                >
                  {tabMode === 'professional' ? 'Professional' : 'Simple'}
                </Button>
                <Menu
                  anchorEl={modeAnchor}
                  open={Boolean(modeAnchor)}
                  onClose={() => setModeAnchor(null)}
                  anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                  transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                >
                  {availableModeChoices.map((choice) => (
                    <MenuItem
                      key={choice.id}
                      selected={tabMode === choice.id}
                      onClick={() => {
                        setTabMode(choice.id);
                        setModeAnchor(null);
                      }}
                      sx={{ gap: 1.25, alignItems: 'flex-start', py: 1 }}
                    >
                      <Box sx={{ mt: 0.25 }}>
                        <GlassIcon
                          name={choice.icon}
                          fallback={
                            choice.id === 'professional' ? PersonOutlineIcon : BoltOutlinedIcon
                          }
                          size={18}
                        />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                          {choice.label}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', fontSize: '0.7rem' }}
                        >
                          {choice.hint}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Menu>
              </>
            )}

            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <Button onClick={handleClose} sx={{ textTransform: 'none' }}>
                Cancel
              </Button>
              {/* Simple sends from the composer, so a second Start here would
                  be two controls for one action. Professional still needs it:
                  its Step 1 is a form with no send affordance of its own. */}
              {tabMode === 'professional' && (
                <Button
                  variant="contained"
                  onClick={handleStartStep1}
                  disabled={!canStartStep1}
                  endIcon={
                    <GlassIcon
                      name="RocketLaunchOutlined"
                      fallback={RocketLaunchOutlinedIcon}
                      size={18}
                    />
                  }
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 2,
                    px: 3,
                    minHeight: 44,
                  }}
                >
                  Start
                </Button>
              )}
            </Box>
          </Box>
        )}

        {/* Content */}
        <DialogContent
          sx={{
            // Middle row of the three-row flex shell: header above, footer
            // below, only this scrolls. minHeight 0 is what lets it shrink
            // inside the flex column instead of pushing the footer off-screen.
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            pt: 1.5,
            pb: 2,
            px: { xs: 2, sm: 3 },
            position: 'relative',
          }}
        >
          {/* ── Success screen (Professional only; Simple runs the monitor) ── */}
          {createdGoal && tabMode !== 'simple' ? (
            <Box sx={{ textAlign: 'center', py: 4, animation: `${fadeInUp} 0.5s ease` }}>
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  mx: 'auto',
                  mb: 2,
                  bgcolor: alpha(theme.palette.success.main, 0.12),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <GlassIcon
                  name="CheckCircleOutline"
                  fallback={CheckCircleOutlineIcon}
                  size={36}
                  tone={theme.palette.success.main}
                />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                Goal Created Successfully!
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                {createdGoal.title || 'Your goal'} is now being processed.
              </Typography>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.success.main, 0.08),
                  border: '1px solid',
                  borderColor: alpha(theme.palette.success.main, 0.2),
                  mb: 3,
                }}
              >
                <GlassIcon
                  name="RocketLaunchOutlined"
                  fallback={RocketLaunchOutlinedIcon}
                  size={18}
                  tone={theme.palette.success.main}
                />
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                  Pipeline started — executing phases
                </Typography>
              </Box>
              {createdGoal.budget_usd && (
                <Typography
                  variant="caption"
                  sx={{ display: 'block', color: 'text.disabled', mb: 3 }}
                >
                  Budget: ${createdGoal.budget_usd} · {createdGoal.complexity || 'simple'} ·{' '}
                  {createdGoal.execution_mode || 'auto'}
                </Typography>
              )}
              <Button
                variant="contained"
                onClick={handleClose}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 4 }}
              >
                Close
              </Button>
            </Box>
          ) : (
            <>
              {/* Simple tab */}
              {/* One surface. The run reports into the same thread the goal
                  was written in rather than swapping it for a monitor. */}
              {tabMode === 'simple' && renderSimpleInput()}

              {/* Professional tab */}
              {tabMode === 'professional' && activeStep === 0 && renderStep1()}
              {tabMode === 'professional' && activeStep === 1 && renderStep2()}
              {tabMode === 'professional' && activeStep === 2 && renderStep3()}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Implement in Existing — interview dialog (opens after goal created with existing_business dest) */}
      {createdGoal && showImplement && (
        <ImplementDialog
          open={showImplement}
          onClose={() => setShowImplement(false)}
          goal={createdGoal}
          initialOrganization={selectedOrganization}
          onSuccess={() => {
            setShowImplement(false);
          }}
        />
      )}
    </>
  );
}
