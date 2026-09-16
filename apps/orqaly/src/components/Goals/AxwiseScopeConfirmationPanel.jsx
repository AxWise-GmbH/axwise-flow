import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Paper,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { acceptGoalCustomerScope, reviseGoalCustomerScope } from '../../services/goalService';
import { isCanonicalAxwiseScopeGoal } from '../../../lib/_shared/scope-chat-intent.js';

export { axwiseScopeChatIntent } from '../../../lib/_shared/scope-chat-intent.js';

export function isAxwiseScopeClarification(goal) {
  const intelligence = goal?.data?.axwise_customer_intelligence;
  return goal?.status === 'awaiting_po_input' && intelligence?.status === 'human_clarification';
}

/** The second AxWise scope gate, after a native scope packet has been built. */
export function isAxwiseContextReview(goal) {
  return goal?.status === 'awaiting_context_approval' && isCanonicalAxwiseScopeGoal(goal);
}

/** A provider generation is active and can still be superseded by a correction. */
export function isAxwiseScopeRebuildActive(goal) {
  return (
    (goal?.status === 'analyzing' || goal?.status === 'researching_customer') &&
    isCanonicalAxwiseScopeGoal(goal)
  );
}

function text(value, fallback = '') {
  if (Array.isArray(value))
    return value
      .map((item) => text(item))
      .filter(Boolean)
      .join('; ');
  if (value && typeof value === 'object') return text(value.value || value.name || value.label);
  return String(value || fallback).trim();
}

export function axwiseScopeForGoal(goal) {
  const intelligence = goal?.data?.axwise_customer_intelligence || {};
  const proposedScope = intelligence.clarification_scope || {};
  const savedConfirmation = intelligence.scope_confirmation || {};
  const acceptedIsCurrent =
    savedConfirmation.status === 'accepted' &&
    savedConfirmation.source_decision_id === intelligence.decision_id &&
    (!proposedScope.scope_hash || savedConfirmation.source_scope_hash === proposedScope.scope_hash);
  const accepted = acceptedIsCurrent ? savedConfirmation : {};
  const scope = accepted.scope || proposedScope;
  const legacyAnswers = Array.isArray(goal?.data?.po_answers) ? goal.data.po_answers : [];
  const legacyAnswer = (index) =>
    text(
      legacyAnswers[index] && typeof legacyAnswers[index] === 'object'
        ? legacyAnswers[index].answer
        : legacyAnswers[index]
    );
  const targetCustomer = text(
    accepted.target_customer ||
      scope.target_customer ||
      legacyAnswer(0) ||
      goal?.tech_doc?.target_audience,
    'Affected customer or stakeholder (inferred, not yet verified)'
  );
  const businessIdea = text(scope.business_idea || goal?.title, 'complete this goal');
  const problem = text(
    accepted.problem || scope.problem || goal?.tech_doc?.problem_statement || goal?.description,
    'the problem described in the request'
  );
  const desiredOutcome = text(
    accepted.desired_outcome ||
      scope.desired_outcome ||
      legacyAnswer(1) ||
      goal?.tech_doc?.success_tiers?.target ||
      goal?.tech_doc?.success_criteria ||
      goal?.description ||
      goal?.title,
    businessIdea
  );
  const constraints = Array.isArray(scope.constraints)
    ? scope.constraints.map((item) => text(item))
    : [];
  const evidence = Array.isArray(scope.evidence) ? scope.evidence : [];
  const summary =
    text(accepted.summary || scope.summary) ||
    `So you want to ${businessIdea} for ${targetCustomer}, who face ${problem}. The intended outcome is ${desiredOutcome}.`;

  return {
    ...scope,
    business_idea: businessIdea,
    target_customer: targetCustomer,
    problem,
    desired_outcome: desiredOutcome,
    constraints,
    evidence,
    routing_reasons: Array.isArray(scope.routing_reasons) ? scope.routing_reasons : [],
    optional_details: accepted.optional_details || legacyAnswer(2) || null,
    summary,
    trust: {
      ...(scope.trust || {}),
      evidence_count: evidence.length,
      verified_evidence_count: evidence.filter((item) => item?.verified === true).length,
      // Scope acceptance must never turn the underlying claims into facts.
      status: 'declared_inferred_unverified',
      verified: false,
    },
  };
}

/** Build the same authenticated, decision/hash-bound payload for card or chat. */
export function axwiseScopeAcceptancePayload(goal, overrides = {}) {
  const scope = axwiseScopeForGoal(goal);
  const intelligence = goal?.data?.axwise_customer_intelligence || {};
  const acceptedTarget = text(overrides.targetCustomer || scope.target_customer);
  const acceptedProblem = text(overrides.problem || scope.problem);
  const acceptedOutcome = text(overrides.desiredOutcome || scope.desired_outcome);
  const optionalDetails = text(
    overrides.optionalDetails === undefined ? scope.optional_details : overrides.optionalDetails
  );
  const summary = `Requested work: ${scope.business_idea}. Intended audience or stakeholder: ${acceptedTarget}. Problem or opportunity: ${acceptedProblem}. Intended outcome: ${acceptedOutcome}.`;

  return {
    id: goal?.id,
    decision_id: intelligence.decision_id,
    scope_hash: scope.scope_hash || null,
    scope: {
      summary,
      target_customer: acceptedTarget,
      problem: acceptedProblem,
      desired_outcome: acceptedOutcome,
      optional_details: optionalDetails || null,
    },
  };
}

/** Bind a preliminary-scope correction to the exact proposal it replaces. */
export function axwiseScopeRevisionPayload(goal, feedback) {
  const scope = axwiseScopeForGoal(goal);
  const intelligence = goal?.data?.axwise_customer_intelligence || {};
  const revision = goal?.data?.scope_revision || {};
  const pendingRevisionHash =
    revision.status === 'pending_rebuild'
      ? revision.replacement_scope_hash || revision.source_scope_hash
      : null;
  return {
    id: goal?.id,
    decision_id: intelligence.decision_id || revision.source_decision_id || null,
    scope_hash:
      pendingRevisionHash ||
      intelligence.scope_confirmation?.source_scope_hash ||
      intelligence.scope_packet?.scope_hash ||
      scope.scope_hash ||
      revision.replacement_scope_hash ||
      revision.source_scope_hash ||
      null,
    generation: intelligence.generation ?? null,
    job_id: intelligence.job_id || null,
    revision_token: revision.revision_token || null,
    feedback: text(feedback),
  };
}

function AxwiseScopeConfirmationForm({ goal, onAnswered }) {
  const theme = useTheme();
  const scope = useMemo(() => axwiseScopeForGoal(goal), [goal]);
  const accepted = goal.data?.axwise_customer_intelligence?.scope_confirmation || {};
  const [editing, setEditing] = useState(false);
  const [targetCustomer, setTargetCustomer] = useState(
    accepted.target_customer || scope.target_customer
  );
  const [problem, setProblem] = useState(accepted.problem || scope.problem);
  const [desiredOutcome, setDesiredOutcome] = useState(
    accepted.desired_outcome || scope.desired_outcome
  );
  const [optionalDetails, setOptionalDetails] = useState(
    accepted.optional_details || scope.optional_details || ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const hasScopeEdits =
    text(targetCustomer) !== text(scope.target_customer) ||
    text(problem) !== text(scope.problem) ||
    text(desiredOutcome) !== text(scope.desired_outcome) ||
    text(optionalDetails) !== text(scope.optional_details);

  const handleProceed = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      if (hasScopeEdits) {
        const feedback = [
          'Rebuild the proposed scope using these owner corrections:',
          `Primary customer or stakeholder: ${text(targetCustomer)}`,
          `Problem: ${text(problem)}`,
          `Desired outcome: ${text(desiredOutcome)}`,
          `Additional context: ${text(optionalDetails) || 'None'}`,
        ].join('\n');
        await reviseGoalCustomerScope(axwiseScopeRevisionPayload(goal, feedback));
      } else {
        await acceptGoalCustomerScope(axwiseScopeAcceptancePayload(goal));
      }
      onAnswered?.();
    } catch (error) {
      setSubmitError(error?.message || 'Could not save and resume this goal.');
    } finally {
      setSubmitting(false);
    }
  };

  const verifiedCount = scope.trust?.verified_evidence_count || 0;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        mb: 2,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: alpha(theme.palette.info.main, 0.3),
        bgcolor: alpha(theme.palette.info.main, 0.04),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem', flex: 1 }}>
          Proposed scope
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          color="warning"
          label="Declared / inferred / unverified"
        />
      </Box>

      <Typography sx={{ fontSize: '0.8rem', lineHeight: 1.55, mb: 1.5 }}>
        {scope.summary}
      </Typography>

      <Box
        sx={{ p: 1.25, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.06), mb: 1.5 }}
      >
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>
          Trust and approvals
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
          {verifiedCount > 0
            ? `${verifiedCount} referenced evidence item${verifiedCount === 1 ? '' : 's'} are marked verified by their source.`
            : 'No external domain facts are verified in this working scope.'}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
          Working assumptions remain unverified. External side effects still require explicit
          approval.
        </Typography>
      </Box>

      {submitError && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {submitError}
        </Alert>
      )}

      <Button
        size="small"
        variant="text"
        onClick={() => setEditing((value) => !value)}
        sx={{ textTransform: 'none', px: 0, mb: editing ? 1 : 0.5 }}
      >
        {editing ? 'Hide scope editor' : 'Edit scope'}
      </Button>

      <Collapse in={editing}>
        <Box sx={{ display: 'grid', gap: 1, mb: 1.5 }}>
          <TextField
            size="small"
            label="Who it is for"
            value={targetCustomer}
            onChange={(event) => setTargetCustomer(event.target.value)}
          />
          <TextField
            size="small"
            label="Problem"
            value={problem}
            onChange={(event) => setProblem(event.target.value)}
          />
          <TextField
            size="small"
            label="Intended outcome"
            value={desiredOutcome}
            onChange={(event) => setDesiredOutcome(event.target.value)}
          />
          <TextField
            size="small"
            multiline
            minRows={2}
            label="Extra context (optional)"
            value={optionalDetails}
            onChange={(event) => setOptionalDetails(event.target.value)}
          />
        </Box>
      </Collapse>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          size="small"
          variant="contained"
          onClick={handleProceed}
          disabled={submitting}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          {submitting ? 'Continuing…' : hasScopeEdits ? 'Rebuild scope' : 'Proceed'}
        </Button>
      </Box>
    </Paper>
  );
}

export default function AxwiseScopeConfirmationPanel(props) {
  const intelligence = props.goal?.data?.axwise_customer_intelligence || {};
  const scopeHash =
    intelligence.clarification_scope?.scope_hash ||
    intelligence.scope_confirmation?.source_scope_hash ||
    'legacy-scope';
  const scopeIdentity = `${intelligence.decision_id || 'missing-decision'}:${scopeHash}`;
  return <AxwiseScopeConfirmationForm key={scopeIdentity} {...props} />;
}
