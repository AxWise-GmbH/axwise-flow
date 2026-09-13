import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import ApprovalOutlinedIcon from '@mui/icons-material/ApprovalOutlined';
import BentoCard from '../Common/BentoCard';
import EmptyState from '../Common/EmptyState';

function displayValue(value) {
  if (value === null || value === undefined || value === '') return 'Not applicable';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function Detail({ label, value, pre = false }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography
        component={pre ? 'pre' : 'p'}
        variant="body2"
        sx={{
          m: 0,
          mt: 0.25,
          whiteSpace: pre ? 'pre-wrap' : 'normal',
          overflowWrap: 'anywhere',
          fontFamily: pre ? 'monospace' : 'inherit',
        }}
      >
        {displayValue(value)}
      </Typography>
    </Box>
  );
}

const CONTROL_REASON_MESSAGES = {
  expired: 'This approval expired. Refresh or request a new bound plan before execution.',
  already_decided: 'This approval was already decided and cannot be changed.',
  not_authorized: 'Only the bound approver can decide this approval.',
  unsupported_subject: 'This approval type is not supported by the current control plane.',
  run_not_awaiting_approval: 'The run is no longer waiting for this approval.',
  immutable_subject_unavailable: 'The immutable approval subject is unavailable.',
};

function isExactConsentPresentation(presentation) {
  return (
    presentation?.version === 'orqaly_approval_presentation_v1' &&
    Array.isArray(presentation.steps) &&
    presentation.steps.length > 0 &&
    presentation.steps.every(
      (step) =>
        step &&
        typeof step === 'object' &&
        step.operation &&
        step.agent?.personaVersion &&
        step.agent?.delegation &&
        Array.isArray(step.redactedParameterPaths)
    )
  );
}

function approvalBudgetLabel(budget) {
  if (!budget || !Number.isSafeInteger(budget.amountMinor) || !budget.currency) {
    return 'Not available';
  }
  return `${budget.amountMinor} minor units (${budget.currency})`;
}

function ApprovalStep({ step, index }) {
  const action = step.action;
  return (
    <Box
      component="section"
      aria-labelledby={`approval-step-${step.stepId}`}
      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.5 }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Typography id={`approval-step-${step.stepId}`} variant="subtitle1" fontWeight={700}>
          {index + 1}. {step.title}
        </Typography>
        <Chip size="small" variant="outlined" label={step.operation.key} />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {step.humanReadableEffect.summary}
      </Typography>

      {step.redactedParameterPaths.length > 0 ? (
        <Alert severity="warning" sx={{ mt: 1.25 }}>
          Secret values are never shown. Redacted parameter paths:{' '}
          {step.redactedParameterPaths.join(', ')}. The canonical input hash still binds the exact
          submitted parameters.
        </Alert>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
          gap: 1.5,
          mt: 1.5,
        }}
      >
        <Detail label="Operation" value={step.operation} pre />
        <Detail
          label="Canonical parameters (secrets redacted)"
          value={step.canonicalParameters}
          pre
        />
        <Detail label="Canonical input hash" value={step.canonicalInputHash} />
        <Detail label="Agent" value={step.agent.agentId} />
        <Detail label="Executor persona version" value={step.agent.personaVersion} pre />
        <Detail label="Delegated authority" value={step.agent.delegation} pre />
        <Detail label="Execution descriptor" value={step.descriptor} pre />
        <Detail label="Executor binding" value={step.executorBinding} pre />
        <Detail label="Effect" value={step.effectProfile} pre />
        <Detail label="Data egress" value={step.dataEgressProfile} pre />
        <Detail label="Step limits" value={step.limits} pre />
        <Detail label="Step deadline" value={step.deadline} />
        {action ? (
          <>
            <Detail label="External targets" value={action.targets} pre />
            <Detail label="External preconditions" value={action.externalPreconditions} pre />
            <Detail
              label="Connection reference and requested scopes"
              value={action.connection}
              pre
            />
            <Detail label="Provider operation" value={action.providerOperation} pre />
            <Detail label="Idempotency binding" value={action.idempotency} pre />
            <Detail label="Reconciliation" value={action.reconciliation} pre />
            <Detail label="Compensation" value={action.compensation} pre />
            <Detail label="External effect ID" value={action.effectId} />
          </>
        ) : (
          <Detail label="External action" value="None — this step has no provider effect" />
        )}
      </Box>
    </Box>
  );
}

export default function ApprovalPanel({
  approvals = [],
  pendingAction,
  onDecision,
  actionError,
  unavailableReason,
}) {
  const pendingApprovals = approvals.filter(
    (approval) => (approval.status || approval.state || 'pending') === 'pending'
  );

  return (
    <BentoCard
      title="Approvals"
      subtitle="Review the bound plan, identities, limits and external effects"
      icon={ApprovalOutlinedIcon}
    >
      {actionError ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {actionError}
        </Alert>
      ) : null}
      {unavailableReason ? (
        <Alert severity="info">{unavailableReason}</Alert>
      ) : pendingApprovals.length === 0 ? (
        <EmptyState
          dense
          icon={ApprovalOutlinedIcon}
          title="No approval needed now"
          description="A pending plan approval will appear here when the control plane creates one."
        />
      ) : (
        <Stack spacing={1.5}>
          {pendingApprovals.map((approval) => {
            const id = approval.approval_id || approval.id;
            const controls = approval.controls?.approval || {};
            const stateVersion =
              approval.state_version ?? approval.stateVersion ?? approval.version;
            const presentation = approval.presentation || {};
            const hasExactConsent = isExactConsentPresentation(presentation);
            const title = hasExactConsent ? presentation.title : 'Approval details unavailable';
            const expires = hasExactConsent
              ? presentation.expiresAt
              : approval.expires_at || approval.expiresAt;
            const controlReason = controls.reason || null;
            const decisionUnavailable = !hasExactConsent
              ? 'Exact consent details are unavailable, so this approval cannot be decided.'
              : controlReason
                ? CONTROL_REASON_MESSAGES[controlReason] ||
                  'The control plane marked this approval as non-decidable.'
                : '';
            const canApprove = hasExactConsent && controls.approve === true;
            const canReject = hasExactConsent && controls.reject === true;
            const actionKey = `${id}:decision`;
            const isPending = pendingAction === actionKey;

            return (
              <Box
                key={id}
                component="article"
                sx={{ border: '1px solid', borderColor: 'warning.main', borderRadius: 2, p: 2 }}
              >
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="h6">{title}</Typography>
                  <Chip
                    size="small"
                    color={canApprove || canReject ? 'warning' : 'default'}
                    label={controlReason === 'expired' ? 'Approval expired' : 'Approval required'}
                  />
                </Stack>
                {decisionUnavailable ? (
                  <Alert
                    severity={controlReason === 'expired' ? 'warning' : 'info'}
                    sx={{ mt: 1.25 }}
                  >
                    {decisionUnavailable}
                  </Alert>
                ) : null}
                {hasExactConsent ? (
                  <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      Approving authorizes only the identities, operations, targets and limits shown
                      below. Credentials remain behind the connection reference.
                    </Typography>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                        gap: 1.5,
                      }}
                    >
                      <Detail label="Owning Agent" value={presentation.owningAgentId} />
                      <Detail label="Agent team" value={presentation.teamId} />
                      <Detail label="Plan version" value={presentation.planVersion} pre />
                      <Detail
                        label="Plan budget"
                        value={approvalBudgetLabel(presentation.budget)}
                      />
                      <Detail label="Approval expires" value={expires} />
                      <Detail label="Approval binding hash" value={approval.subject_hash} />
                    </Box>
                    {presentation.steps.map((step, index) => (
                      <ApprovalStep key={step.stepId} step={step} index={index} />
                    ))}
                  </Stack>
                ) : null}
                <Divider sx={{ my: 1.5 }} />
                <Stack
                  direction={{ xs: 'column-reverse', sm: 'row' }}
                  spacing={1}
                  justifyContent="flex-end"
                >
                  <Button
                    variant="outlined"
                    color="error"
                    disabled={!canReject || Boolean(pendingAction)}
                    onClick={() => onDecision?.(id, 'reject', stateVersion)}
                    sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="contained"
                    disabled={!canApprove || Boolean(pendingAction)}
                    onClick={() => onDecision?.(id, 'approve', stateVersion)}
                    startIcon={
                      isPending ? <CircularProgress size={16} color="inherit" /> : undefined
                    }
                    sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
                  >
                    {isPending ? 'Applying…' : 'Approve bound plan'}
                  </Button>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </BentoCard>
  );
}
