import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import ManageSearchOutlinedIcon from '@mui/icons-material/ManageSearchOutlined';
import FormDialog from '../Common/FormDialog';
import AppIcon from '../icons/AppIcon';
import GoalResearchDetailsDialog from './GoalResearchDetailsDialog';
import {
  getGoalResearchBundle,
  hasTranscriptSpan,
  isExternallyVerifiedResearchSource,
} from './researchBundle';
import {
  approveGoalContext,
  getGoalResearchBundle as loadGoalResearchBundle,
  requestGoalContextEvidence,
  reviseGoalContext,
} from '../../services/goalService';
import { cleanGeneratedPresentationText } from '../../utils/generatedPresentationText.js';
import {
  nativeAxwiseScopeActionBinding,
  nativeAxwiseScopeApprovalBlock,
} from '../../../lib/_shared/native-scope-approval.js';

function text(value, fallback = 'Not specified') {
  if (typeof value === 'string' && value.trim()) {
    return cleanGeneratedPresentationText(value) || fallback;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const rendered = value
      .map((item) => text(item, ''))
      .filter(Boolean)
      .join('; ');
    return rendered || fallback;
  }
  if (value && typeof value === 'object') {
    if (typeof value.value === 'string') return text(value.value, fallback);
    const rendered = Object.entries(value)
      .filter(([key, item]) => !key.startsWith('_') && item != null && item !== '')
      .map(([key, item]) => {
        const itemText = text(item, '');
        return itemText ? `${key.replaceAll('_', ' ')}: ${itemText}` : '';
      })
      .filter(Boolean)
      .join(' · ');
    return rendered || fallback;
  }
  return fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
}

const RESEARCH_EXECUTION_PREVIEW_VERSION = 'orqaly_scope_research_execution_preview_v1';
const RESEARCH_DESTINATION = 'Google Gemini API';
const RESEARCH_PURPOSE = 'Scope-bound customer, executor, and evidence research';
const RESEARCH_DATA_CATEGORIES = Object.freeze([
  'Accepted goal/task prose and typed scope/constraints',
  'Business/research brief, questions, geography, and evidence requirements',
  'Executor candidate role/profile/capability fields needed for matching',
  'Generated synthetic participant/interview/persona/PRD content',
  'Public-source snippets and grounded evidence',
]);
const RESEARCH_EXCLUDED_CATEGORIES = Object.freeze([
  'Credentials and API secrets',
  'Payment data',
  'Raw auth/session tokens',
  'Unrelated goals',
]);

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatUsd(value) {
  return `$${value.toFixed(2)} USD`;
}

function formatLatency(value) {
  const minutes = value / 60_000;
  const human = Number.isInteger(minutes)
    ? `${minutes} min`
    : `${Number((value / 1_000).toFixed(1))} sec`;
  return `${value.toLocaleString('en-US')} ms (${human})`;
}

function exactList(value, expected) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function validResearchExecutionPreview(
  preview,
  { proposalDecisionId, scopeHash, contractHash, executionInputsHash, runtimeModel }
) {
  if (
    preview?.version !== RESEARCH_EXECUTION_PREVIEW_VERSION ||
    typeof proposalDecisionId !== 'string' ||
    !proposalDecisionId.trim() ||
    preview.proposal_decision_id !== proposalDecisionId ||
    !/^[a-f0-9]{64}$/.test(String(scopeHash || '')) ||
    preview.scope_hash !== scopeHash ||
    !/^[a-f0-9]{64}$/.test(String(contractHash || '')) ||
    preview.contract_hash !== contractHash ||
    !/^[a-f0-9]{64}$/.test(String(executionInputsHash || '')) ||
    preview.research_execution_inputs_hash !== executionInputsHash ||
    preview.model !== runtimeModel ||
    preview.destination !== RESEARCH_DESTINATION ||
    preview.purpose !== RESEARCH_PURPOSE ||
    !exactList(preview.data_categories, RESEARCH_DATA_CATEGORIES) ||
    !exactList(preview.excluded_categories, RESEARCH_EXCLUDED_CATEGORIES)
  ) {
    return false;
  }

  const { maximum_cost_usd, estimated_cost_usd, maximum_latency_ms, estimated_latency_ms } =
    preview;
  return (
    isFiniteNumber(maximum_cost_usd) &&
    maximum_cost_usd >= 0 &&
    isFiniteNumber(estimated_cost_usd) &&
    estimated_cost_usd >= 0 &&
    estimated_cost_usd <= maximum_cost_usd &&
    isFiniteNumber(maximum_latency_ms) &&
    maximum_latency_ms > 0 &&
    isFiniteNumber(estimated_latency_ms) &&
    estimated_latency_ms > 0 &&
    estimated_latency_ms <= maximum_latency_ms
  );
}

function Detail({ label, children }) {
  return (
    <Box>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', fontSize: '0.67rem', textTransform: 'uppercase' }}
      >
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
        {children}
      </Typography>
    </Box>
  );
}

export default function GoalContextApprovalDialog({
  open,
  onClose,
  goal,
  onAction,
  researchBundleLoader = loadGoalResearchBundle,
}) {
  const theme = useTheme();
  const [mode, setMode] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [researchOpen, setResearchOpen] = useState(false);
  const [loadedResearch, setLoadedResearch] = useState({ goalId: null, bundle: null });
  const contentRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setResearchOpen(false);
      return;
    }

    setMode('');
    setFeedback('');
    setError('');
    setResearchOpen(false);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [goal?.id, open]);

  const intelligence = goal?.data?.axwise_customer_intelligence || {};
  const nativeScopePacket =
    intelligence.scope_packet?.version === 'axwise_scope_packet_v1'
      ? intelligence.scope_packet
      : null;
  const nativeRequirements = list(nativeScopePacket?.ledger?.requirements)
    .map((item) => text(item?.text || item, ''))
    .filter(Boolean);
  const nativeNonGoals = list(nativeScopePacket?.intent?.non_goals)
    .map((item) => text(item, ''))
    .filter(Boolean);
  const nativeAdmission = nativeScopePacket?.admission || {};
  const researchContract = nativeScopePacket?.research_contract || null;
  const researchEvidence = researchContract?.evidence || null;
  const researchMode = researchEvidence?.mode || null;
  const startsResearch = researchMode === 'grounded' || researchMode === 'synthetic';
  const existingEvidenceUnsupported = researchMode === 'existing';
  const researchExecutionPreview = intelligence.research_execution_preview || null;
  const researchExecutionPreviewValid = validResearchExecutionPreview(researchExecutionPreview, {
    proposalDecisionId: intelligence.decision_id,
    scopeHash: nativeScopePacket?.scope_hash,
    contractHash: researchContract?.contract_hash,
    executionInputsHash: intelligence.research_execution_inputs_hash,
    runtimeModel: nativeScopePacket?.runtime?.model,
  });
  const researchProposalLimitsInvalid = startsResearch && !researchExecutionPreviewValid;
  const ownerAcceptance = goal?.data?.scope_admission?.research_acceptance || null;
  const awaitingResearchConsent =
    startsResearch &&
    goal?.data?.scope_admission?.status === 'awaiting_confirmation' &&
    goal?.data?.goal_approvals?.context?.status === 'pending' &&
    !ownerAcceptance;
  const confirmLabel = existingEvidenceUnsupported
    ? 'Research mode unavailable'
    : startsResearch
      ? 'Confirm & start research'
      : 'Confirm & plan';
  const resolution = intelligence.persona_resolution || {};
  const customer = resolution.customer_persona || {};
  const profile = customer.profile || {};
  const trust = customer.trust || {};
  const executor = resolution.ideal_agent_persona || {};
  const evidence = list(customer.evidence);
  const embeddedResearch = getGoalResearchBundle(goal);
  useEffect(() => {
    if (
      !open ||
      !goal?.id ||
      !embeddedResearch.available ||
      typeof researchBundleLoader !== 'function'
    ) {
      return undefined;
    }
    let current = true;
    Promise.resolve(researchBundleLoader(goal.id))
      .then((bundle) => current && setLoadedResearch({ goalId: goal.id, bundle }))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [embeddedResearch.available, goal?.id, open, researchBundleLoader]);
  const research = getGoalResearchBundle(
    goal,
    loadedResearch.goalId === goal?.id ? loadedResearch.bundle : null
  );
  const policyRequiresResearch = nativeScopePacket
    ? startsResearch || existingEvidenceUnsupported
    : goal?.data?.research_policy?.required === true ||
      goal?.data?.research_policy?.grounding_required === true ||
      String(goal?.data?.research_policy?.research_mode || '').startsWith('grounded_');
  const researchRequired =
    policyRequiresResearch ||
    (goal?.data?.research_policy?.research_fail_closed === true && embeddedResearch.available);
  const nativeScopeBlock = nativeAxwiseScopeApprovalBlock(goal);
  const nativeScopeBinding = nativeAxwiseScopeActionBinding(goal);
  const nativeScopeBindingArgs = nativeScopeBinding ? [nativeScopeBinding] : [];
  const materialQuestion = nativeScopeBlock?.materialQuestion || null;
  const typedEvidenceReviewBlocked =
    embeddedResearch.typedEvidence && !research.typedEvidenceDetailsLoaded;
  const researchContextGateBlocked =
    !awaitingResearchConsent &&
    (typedEvidenceReviewBlocked ||
      (researchRequired &&
        (!research.contextGate.status || research.contextGate.status !== 'ready')));
  const typedResearchContractBlocked = existingEvidenceUnsupported || researchProposalLimitsInvalid;
  const contextGateBlocked =
    Boolean(nativeScopeBlock) || typedResearchContractBlocked || researchContextGateBlocked;
  const desiredOutcome =
    profile.desired_outcome ||
    goal?.tech_doc?.success_tiers?.target ||
    list(goal?.tech_doc?.success_criteria)
      .map((item) => text(item, ''))
      .filter(Boolean)
      .join('; ');
  const assumptions = useMemo(
    () =>
      list(trust.limitations).length
        ? list(trust.limitations)
        : intelligence.degraded
          ? [
              intelligence.reason ||
                'AxWise was unavailable; this context comes from the goal brief.',
            ]
          : [],
    [intelligence.degraded, intelligence.reason, trust.limitations]
  );

  if (!goal) return null;

  const finish = (action) => {
    onAction?.(action);
    onClose?.();
  };

  const approve = async () => {
    setLoading('approve');
    setError('');
    try {
      await approveGoalContext(goal.id, ...nativeScopeBindingArgs);
      finish('approved');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading('');
    }
  };

  const submitFeedback = async () => {
    if (!feedback.trim()) {
      setError('Tell AxWise or the planner what needs to change.');
      return;
    }
    setLoading(mode);
    setError('');
    try {
      if (mode === 'evidence') {
        await requestGoalContextEvidence(goal.id, feedback.trim(), ...nativeScopeBindingArgs);
      } else {
        await reviseGoalContext(goal.id, feedback.trim(), ...nativeScopeBindingArgs);
      }
      finish(mode === 'evidence' ? 'evidence_requested' : 'revision_requested');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading('');
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      title="Confirm the proposed scope"
      subtitle={goal.title}
      icon={PsychologyOutlinedIcon}
      iconVariant="info"
      contentRef={contentRef}
      paperSx={{ maxHeight: { xs: 'calc(100dvh - 16px)', sm: '92dvh' } }}
      contentSx={{ minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}
      actions={
        <>
          <Button
            startIcon={<AppIcon name="EditOutlined" fallback={EditOutlinedIcon} />}
            onClick={() => setMode(mode === 'revise' ? '' : 'revise')}
            disabled={!!loading}
            size="small"
            sx={{ textTransform: 'none' }}
          >
            {materialQuestion ? 'Answer AxWise' : 'Request changes'}
          </Button>
          <Button
            startIcon={<AppIcon name="FactCheckOutlined" fallback={FactCheckOutlinedIcon} />}
            onClick={() => setMode(mode === 'evidence' ? '' : 'evidence')}
            disabled={!!loading}
            size="small"
            variant="outlined"
            sx={{ textTransform: 'none' }}
          >
            Ask for evidence
          </Button>
          <Button
            startIcon={<AppIcon name="CheckCircleOutline" fallback={CheckCircleOutlineIcon} />}
            onClick={approve}
            disabled={!!loading || contextGateBlocked}
            size="small"
            variant="contained"
            color="success"
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {loading === 'approve'
              ? startsResearch
                ? 'Starting research…'
                : 'Confirming…'
              : confirmLabel}
          </Button>
        </>
      }
    >
      <Alert severity="info" sx={{ mb: 2, fontSize: '0.78rem' }}>
        Gate 1 of 2. Confirm who the work serves, the problem and outcome before Orqaly plans or
        assigns a team. You will approve the final execution proposal separately.
      </Alert>
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {nativeScopeBlock && (
        <Alert severity={materialQuestion ? 'warning' : 'error'} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            {materialQuestion ? 'AxWise needs one answer' : 'The native scope is not ready'}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
            {materialQuestion || nativeScopeBlock.message}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.75 }}>
            {materialQuestion
              ? 'Use Answer AxWise below. Your answer will rebuild the scope before approval.'
              : 'Request a correction before approving this scope.'}
          </Typography>
        </Alert>
      )}
      {existingEvidenceUnsupported && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            Existing-evidence research is not supported yet
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            This scope cannot be confirmed until AxWise proposes none, synthetic, or grounded
            evidence. Request a scope correction below.
          </Typography>
        </Alert>
      )}
      {researchProposalLimitsInvalid && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            Research authorization details are missing or stale
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            The immutable proposal identity, destination, purpose, data boundary, cost, or latency
            preview does not match this scope. Refresh or request a correction before confirming
            paid research.
          </Typography>
        </Alert>
      )}
      {researchContextGateBlocked && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            Confirm & plan is blocked
          </Typography>
          {(typedEvidenceReviewBlocked
            ? [
                {
                  code: 'typed_evidence_review_not_loaded',
                  message:
                    'Persisted typed facts and calculations must load before this v2 context can be approved.',
                },
              ]
            : research.contextGate.issues?.length
              ? research.contextGate.issues
              : [
                  {
                    code: 'research_quality_gate_missing',
                    message: 'The required AxWise research quality verdict is missing.',
                  },
                ]
          ).map((issue) => (
            <Typography key={issue.code || issue.message} variant="body2" sx={{ mt: 0.5 }}>
              • {text(issue.message, 'A required research quality check did not pass.')}
            </Typography>
          ))}
          <Typography variant="caption" sx={{ display: 'block', mt: 0.75 }}>
            Review the detailed evidence, then request a correction or stronger evidence.
          </Typography>
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
        <Chip
          size="small"
          color={intelligence.degraded ? 'warning' : 'default'}
          label={
            intelligence.degraded
              ? 'AxWise unavailable — Orqaly fallback'
              : `AxWise: ${intelligence.routing_mode || 'routing pending'}`
          }
        />
        <Chip
          size="small"
          color={trust.verified ? 'success' : 'warning'}
          label={trust.status || (intelligence.degraded ? 'degraded' : 'unverified')}
        />
        {intelligence.decision_id && (
          <Chip size="small" variant="outlined" label={`Decision ${intelligence.decision_id}`} />
        )}
        {nativeScopePacket?.scope_hash && (
          <Chip
            size="small"
            variant="outlined"
            label={`Scope ${String(nativeScopePacket.scope_hash).slice(0, 12)}…`}
          />
        )}
        {research.runId && <Chip size="small" variant="outlined" label={`Run ${research.runId}`} />}
        {research.bundleId && (
          <Chip size="small" variant="outlined" label={`Bundle ${research.bundleId}`} />
        )}
        {research.schemaVersion && (
          <Chip size="small" variant="outlined" label={`Contract ${research.schemaVersion}`} />
        )}
        {research.pointer.bundle_hash && (
          <Chip
            size="small"
            variant="outlined"
            label={`Hash ${String(research.pointer.bundle_hash).slice(0, 12)}…`}
          />
        )}
      </Box>

      {intelligence.degraded && (
        <Alert severity="warning" sx={{ mb: 2, fontSize: '0.76rem' }}>
          AxWise did not produce a signed scope for this goal. The proposal below was derived by
          Orqaly from the goal brief and must be verified before planning.
          {intelligence.error_code ? ` Diagnostic: ${intelligence.error_code}.` : ''}
        </Alert>
      )}

      {nativeScopePacket && (
        <Paper
          variant="outlined"
          sx={{ p: 2, mb: 2, bgcolor: alpha(theme.palette.success.main, 0.025) }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.25 }}>
            Canonical AxWise scope
          </Typography>
          <Box
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}
          >
            <Detail label="Objective">{text(nativeScopePacket.intent?.objective)}</Detail>
            <Detail label="Desired outcome">
              {text(nativeScopePacket.intent?.desired_outcome)}
            </Detail>
            <Detail label="Problem">{text(nativeScopePacket.intent?.problem)}</Detail>
            <Detail label="Work shape">
              {list(nativeAdmission.work_types)
                .map((item) => text(item, ''))
                .filter(Boolean)
                .join(', ') || 'Not specified'}
            </Detail>
            <Detail label="Requirements">
              {nativeRequirements.length
                ? nativeRequirements.map((item) => `• ${item}`).join('\n')
                : 'Not specified'}
            </Detail>
            <Detail label="Non-goals">
              {nativeNonGoals.length
                ? nativeNonGoals.map((item) => `• ${item}`).join('\n')
                : 'None declared'}
            </Detail>
            <Detail label="Deliverable">
              {[
                nativeScopePacket.deliverable?.count &&
                  `${nativeScopePacket.deliverable.count} × ${text(nativeScopePacket.deliverable.type, 'artifact')}`,
                text(nativeScopePacket.deliverable?.title_prefix, ''),
                list(nativeScopePacket.deliverable?.required_sections).length
                  ? `Sections: ${list(nativeScopePacket.deliverable.required_sections)
                      .map((item) => text(item, ''))
                      .filter(Boolean)
                      .join(', ')}`
                  : '',
              ]
                .filter(Boolean)
                .join('\n') || 'Not specified'}
            </Detail>
            <Detail label="Success criteria">
              {list(nativeAdmission.success_criteria)
                .map((item) => text(item, ''))
                .filter(Boolean)
                .map((item) => `• ${item}`)
                .join('\n') || 'See the acceptance ledger below.'}
            </Detail>
          </Box>
        </Paper>
      )}

      {researchContract && (
        <Paper
          component="section"
          aria-labelledby="typed-research-contract-title"
          variant="outlined"
          sx={{ p: 2, mb: 2, bgcolor: alpha(theme.palette.info.main, 0.025) }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: { xs: 'flex-start', sm: 'center' },
              justifyContent: 'space-between',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 0.75,
              mb: 1.25,
            }}
          >
            <Box>
              <Typography
                id="typed-research-contract-title"
                variant="subtitle2"
                sx={{ fontWeight: 700 }}
              >
                Research contract you are confirming
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Exact AxWise scope {String(researchContract.contract_hash || '').slice(0, 12)}
                {researchContract.contract_hash ? '…' : ''}
              </Typography>
            </Box>
            <Chip
              size="small"
              color={startsResearch ? 'info' : researchMode === 'none' ? 'default' : 'warning'}
              label={`Evidence: ${researchMode || 'not specified'}`}
            />
          </Box>

          <Box
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}
          >
            <Detail label="Gemini runtime">
              {[
                `Provider: ${text(nativeScopePacket.runtime?.provider)}`,
                `Model: ${text(nativeScopePacket.runtime?.model)}`,
                `Reasoning: ${text(nativeScopePacket.runtime?.reasoning_mode)}`,
                `Output policy: ${text(nativeScopePacket.runtime?.output_policy)}`,
              ].join('\n')}
            </Detail>
            <Detail label="Evidence policy">
              {[
                `Mode: ${text(researchMode)}`,
                `Grounding required: ${researchEvidence?.grounding_required === true ? 'Yes' : 'No'}`,
                `External sources required: ${researchEvidence?.external_sources_required === true ? 'Yes' : 'No'}`,
              ].join('\n')}
            </Detail>
            <Detail label="ISO geographies">
              {list(researchContract.geographies).join(', ') || 'None'}
            </Detail>
            <Detail label="Required outputs">
              {list(researchEvidence?.required_outputs)
                .map((item) => `• ${item}`)
                .join('\n') || 'None'}
            </Detail>
            <Detail label="Executor role slots">
              {list(researchContract.executor_role_slots)
                .map((slot) => `• ${text(slot?.role)} · ${text(slot?.slot_id)}`)
                .join('\n') || 'None'}
            </Detail>
            <Detail label="Research limits">
              {researchExecutionPreviewValid
                ? [
                    `Maximum cost: ${formatUsd(researchExecutionPreview.maximum_cost_usd)}`,
                    `Estimated cost: ${formatUsd(researchExecutionPreview.estimated_cost_usd)}`,
                    `Maximum latency: ${formatLatency(researchExecutionPreview.maximum_latency_ms)}`,
                    `Estimated latency: ${formatLatency(researchExecutionPreview.estimated_latency_ms)}`,
                  ].join('\n')
                : startsResearch
                  ? 'Unavailable — confirmation is blocked'
                  : 'No research run is proposed'}
            </Detail>
            {startsResearch && researchExecutionPreviewValid && (
              <Box
                component="section"
                aria-labelledby="gemini-data-consent-title"
                sx={{
                  gridColumn: '1 / -1',
                  p: 1.25,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: alpha(theme.palette.info.main, 0.25),
                  bgcolor: alpha(theme.palette.info.main, 0.04),
                }}
              >
                <Typography
                  id="gemini-data-consent-title"
                  variant="subtitle2"
                  sx={{ fontWeight: 800, mb: 0.4 }}
                >
                  Data sent to Google Gemini
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '0.78rem', mb: 1 }}>
                  Confirming sends the included data below to{' '}
                  <strong>{researchExecutionPreview.destination}</strong> solely for{' '}
                  {researchExecutionPreview.purpose}.
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 1.25,
                  }}
                >
                  <Detail label="Included data categories">
                    {researchExecutionPreview.data_categories.map((item) => `• ${item}`).join('\n')}
                  </Detail>
                  <Detail label="Excluded data categories">
                    {researchExecutionPreview.excluded_categories
                      .map((item) => `• ${item}`)
                      .join('\n')}
                  </Detail>
                </Box>
              </Box>
            )}
          </Box>
        </Paper>
      )}

      {research.available && (
        <Paper
          variant="outlined"
          sx={{ p: 2, mb: 2, bgcolor: alpha(theme.palette.info.main, 0.025) }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: { xs: 'flex-start', sm: 'center' },
              justifyContent: 'space-between',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 1,
              mb: 1.25,
            }}
          >
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                AxWise research bundle
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {research.completedStages}/{research.stages.length || '—'}{' '}
                {research.hasProviderStageTelemetry ? 'stages' : 'imported outputs'} complete ·{' '}
                {research.counts.sources || 0} sources · {research.counts.participants || 0}{' '}
                participants · {research.counts.interviews || 0} interviews ·{' '}
                {research.counts.customerPersonas || 0} customer personas ·{' '}
                {research.counts.executorPersonas || 0} executor personas
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              startIcon={
                <AppIcon name="ManageSearchOutlined" fallback={ManageSearchOutlinedIcon} />
              }
              onClick={() => setResearchOpen(true)}
              sx={{ textTransform: 'none', flexShrink: 0 }}
            >
              View research details
            </Button>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            <Chip size="small" label={`Status: ${research.status}`} />
            {research.mode && (
              <Chip size="small" variant="outlined" label={`Mode: ${research.mode}`} />
            )}
            <Chip
              size="small"
              variant="outlined"
              label={
                research.coverage.percent == null
                  ? 'Coverage not reported'
                  : `Coverage ${research.coverage.percent}%`
              }
            />
            <Chip
              size="small"
              variant="outlined"
              label={
                research.confidence == null
                  ? 'Confidence not reported'
                  : `Confidence ${research.confidence}%`
              }
            />
            {research.selectedPersonaIds.length > 0 && (
              <Chip
                size="small"
                color="success"
                variant="outlined"
                label={`${research.selectedPersonaIds.length} persona${research.selectedPersonaIds.length === 1 ? '' : 's'} selected`}
              />
            )}
          </Box>
          {research.selectedPersonaIds.length > 0 && (
            <Box sx={{ mt: 1.25 }}>
              <Typography
                variant="caption"
                sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}
              >
                Selected customer personas
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {research.selectedPersonaIds.slice(0, 6).map((personaId) => {
                  const persona = [...research.customerPersonas, ...research.executorPersonas].find(
                    (item) => String(item.id) === String(personaId)
                  );
                  return (
                    <Chip
                      key={personaId}
                      size="small"
                      color="success"
                      variant="outlined"
                      label={persona?.name || personaId}
                    />
                  );
                })}
              </Box>
            </Box>
          )}
          {research.marketSources.length > 0 && (
            <Box sx={{ mt: 1.25 }}>
              <Typography
                variant="caption"
                sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}
              >
                Market sources in this bundle
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.76rem' }}>
                {research.marketSources
                  .slice(0, 4)
                  .map((source) => source.name)
                  .join(' · ')}
                {research.marketSources.length > 4
                  ? ` · +${research.marketSources.length - 4} more`
                  : ''}
              </Typography>
            </Box>
          )}
          {(research.contradictions.length > 0 || research.limitations.length > 0) && (
            <Alert severity="warning" sx={{ mt: 1.25, fontSize: '0.75rem' }}>
              {research.contradictions.length > 0
                ? `${research.contradictions.length} contradiction${research.contradictions.length === 1 ? '' : 's'} reported. `
                : ''}
              {research.limitations.length > 0
                ? `${research.limitations.length} known limitation${research.limitations.length === 1 ? '' : 's'}.`
                : ''}{' '}
              Review these before confirming the proposed scope.
            </Alert>
          )}
        </Paper>
      )}

      <Paper
        variant="outlined"
        sx={{ p: 2, mb: 2, bgcolor: alpha(theme.palette.primary.main, 0.025) }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.25 }}>
          Scope, stakeholder, and problem understanding
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          <Detail label="Affected customer or stakeholder">
            {text(customer.name || goal.tech_doc?.target_audience)}
          </Detail>
          <Detail label="Their role or situation">
            {text(
              customer.decision_role ||
                customer.buyer_role_classification ||
                profile.role ||
                profile.stakeholder_scope
            )}
          </Detail>
          <Detail label="Problem to solve">
            {text(profile.problem || goal.tech_doc?.problem_statement)}
          </Detail>
          <Detail label="Desired outcome">{text(desiredOutcome)}</Detail>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.25 }}>
          Ideal executor for this goal
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          <Detail label="Goal-specific role">{text(executor.role)}</Detail>
          <Detail label="Communication style">{text(executor.communication_style)}</Detail>
          <Detail label="Required capabilities">
            {list(executor.required_capabilities)
              .map((item) => text(item, ''))
              .filter(Boolean)
              .join(', ') || 'Not specified'}
          </Detail>
          <Detail label="Boundaries">
            {list(executor.boundaries || goal.tech_doc?.constraints)
              .map((item) => text(item, ''))
              .filter(Boolean)
              .join('; ') || 'None declared'}
          </Detail>
        </Box>
        {resolution.recommended_agent && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
            Suggested Agent Hub match:{' '}
            {resolution.recommended_agent.agent_name || resolution.recommended_agent.agent_id}
            {resolution.recommended_agent.score != null
              ? ` · fit ${(Number(resolution.recommended_agent.score) * 100).toFixed(0)}%`
              : ''}
          </Typography>
        )}
      </Paper>

      <Divider sx={{ my: 1.5 }} />
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
        Evidence and limitations
      </Typography>
      {evidence.length ? (
        evidence.slice(0, 8).map((item, index) => {
          const external = isExternallyVerifiedResearchSource(item);
          const transcriptSpan = hasTranscriptSpan(item);
          return (
            <Box key={item.reference_id || index} sx={{ mb: 1 }}>
              <Typography variant="body2" sx={{ fontSize: '0.76rem' }}>
                • {item.quote || item.reference_id || 'Evidence reference'}
                {item.speaker ? ` — ${item.speaker}` : ''}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', ml: 1.25, mt: 0.35 }}>
                {external && <Chip size="small" color="success" label="Externally verified" />}
                {transcriptSpan && (
                  <Chip size="small" variant="outlined" label="Transcript span checked" />
                )}
                {!external && (
                  <Chip size="small" variant="outlined" label="Not externally verified" />
                )}
              </Box>
            </Box>
          );
        })
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.76rem' }}>
          No supporting evidence is attached. Treat the proposed scope as a declared working
          assumption.
        </Typography>
      )}
      {evidence.length > 8 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: { xs: 'flex-start', sm: 'center' },
            justifyContent: 'space-between',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 0.75,
            mt: 0.5,
            mb: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            +{evidence.length - 8} more evidence item{evidence.length - 8 === 1 ? '' : 's'} not
            shown in this summary.
          </Typography>
          {research.available && (
            <Button
              size="small"
              onClick={() => setResearchOpen(true)}
              sx={{ textTransform: 'none', flexShrink: 0 }}
            >
              View full research details
            </Button>
          )}
        </Box>
      )}
      {assumptions.map((item, index) => (
        <Alert key={index} severity="warning" sx={{ mt: 1, fontSize: '0.75rem' }}>
          {text(item)}
        </Alert>
      ))}

      {mode && (
        <Box sx={{ mt: 2 }}>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            maxRows={5}
            label={
              mode === 'evidence'
                ? 'What needs stronger evidence?'
                : materialQuestion
                  ? 'Your answer to AxWise'
                  : 'What should be corrected?'
            }
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
            <Button
              onClick={submitFeedback}
              disabled={!!loading || !feedback.trim()}
              variant="contained"
              size="small"
              sx={{ textTransform: 'none' }}
            >
              {loading
                ? 'Sending…'
                : mode === 'evidence'
                  ? 'Send evidence request'
                  : materialQuestion
                    ? 'Send answer'
                    : 'Send correction'}
            </Button>
          </Box>
        </Box>
      )}
      <GoalResearchDetailsDialog
        open={open && researchOpen}
        onClose={() => setResearchOpen(false)}
        goal={goal}
        loadBundle={researchBundleLoader}
      />
    </FormDialog>
  );
}
