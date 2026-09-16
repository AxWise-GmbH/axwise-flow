import { useState } from 'react';
import {
  Button,
  Typography,
  Box,
  Chip,
  LinearProgress,
  Collapse,
  TextField,
  Alert,
  Divider,
  useTheme,
  alpha,
} from '@mui/material';
import FormDialog from '../Common/FormDialog';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import EditIcon from '@mui/icons-material/Edit';
import CancelIcon from '@mui/icons-material/Cancel';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import {
  approveGoal,
  requestGoalChanges,
  cancelGoal,
  rebuildGoalTeam,
} from '../../services/goalService';
import {
  AUTHORIZATION_ISSUE_KINDS,
  classifyAuthorizationIssues,
  summarizeAuthorizationIssues,
} from '../../../lib/_shared/authorization-issues.js';

import AppIcon from '../icons/AppIcon';

export default function GoalProposalDialog({ open, onClose, goal, onAction }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  if (!goal) return null;

  const proposal = goal.proposal || {};
  const feasibility = goal.feasibility_report || {};
  const techDoc = goal.tech_doc || {};
  const plan = goal.plan || {};
  const phases = plan.phases || [];
  const estimates = proposal.estimates || {};
  const totalCost = proposal.total_cost || {};
  const intelligence =
    proposal.customer_intelligence || goal.data?.axwise_customer_intelligence || {};
  const resolution = intelligence.persona_resolution || {};
  const customer = resolution.customer_persona || {};
  const trust = customer.trust || {};
  const executor = resolution.ideal_agent_persona || {};
  const axwiseDecision = proposal.axwise_orchestration || goal.data?.axwise_orchestration || {};
  const assignments = proposal.assignments || [];
  const authorizationManifest =
    goal.data?.execution_authorization?.manifest ||
    goal.data?.goal_approvals?.execution?.snapshot?.authorization_manifest ||
    {};
  const authorizationIssues = Array.isArray(authorizationManifest.issues)
    ? authorizationManifest.issues
    : [];
  const authorizationBlocked = authorizationManifest.valid === false;
  // The manifest speaks in codes because it is hashed. Translate for the user,
  // using the proposal's assignments for task titles and agent names.
  const authorizationSummary = summarizeAuthorizationIssues(authorizationIssues, {
    assignments: goal.proposal?.assignments || [],
  });
  const authorizationIsStructural =
    classifyAuthorizationIssues(authorizationIssues).kind === AUTHORIZATION_ISSUE_KINDS.STRUCTURAL;
  const systemEnrichments = authorizationManifest.system_enrichments || [];
  const axwiseAssignmentCount = Object.keys(axwiseDecision.assignments || {}).length;
  const axwiseApplied = axwiseDecision.applied === true;
  const axwiseFeasible = axwiseDecision.feasible === true;
  const axwiseRejections = Array.isArray(axwiseDecision.rejections)
    ? axwiseDecision.rejections
    : [];

  const handleApprove = async () => {
    setLoading('approve');
    setError('');
    try {
      await approveGoal(goal.id);
      onAction?.('approved');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading('');
    }
  };

  const handleRequestChanges = async () => {
    if (!feedback.trim()) return setError('Please describe what you want changed');
    setLoading('changes');
    setError('');
    try {
      await requestGoalChanges(goal.id, feedback.trim());
      setFeedback('');
      setShowFeedback(false);
      onAction?.('changes_requested');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading('');
    }
  };

  const handleRebuildTeam = async () => {
    setLoading('rebuild');
    setError('');
    try {
      await rebuildGoalTeam(goal.id);
      onAction?.('team_rebuild_requested');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading('');
    }
  };

  const handleCancel = async () => {
    setLoading('cancel');
    try {
      await cancelGoal(goal.id);
      onAction?.('cancelled');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading('');
    }
  };

  const successProb = feasibility.feasibility?.success_probability;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      title="Proposal Review"
      subtitle={goal.title}
      icon={AssignmentTurnedInIcon}
      iconVariant="info"
      actions={
        <>
          <Button
            startIcon={<AppIcon name="Cancel" fallback={CancelIcon} />}
            onClick={handleCancel}
            disabled={!!loading}
            color="error"
            size="small"
            sx={{ textTransform: 'none', fontSize: '0.78rem' }}
          >
            Cancel
          </Button>

          <Box sx={{ flex: 1 }} />

          {showFeedback ? (
            <Button
              startIcon={<AppIcon name="Edit" fallback={EditIcon} />}
              onClick={handleRequestChanges}
              disabled={loading === 'changes' || !feedback.trim()}
              variant="outlined"
              size="small"
              sx={{ textTransform: 'none', fontSize: '0.78rem' }}
            >
              {loading === 'changes' ? 'Sending...' : 'Submit Changes'}
            </Button>
          ) : (
            <Button
              startIcon={<AppIcon name="Edit" fallback={EditIcon} />}
              onClick={() => setShowFeedback(true)}
              disabled={!!loading}
              variant="outlined"
              size="small"
              sx={{ textTransform: 'none', fontSize: '0.78rem' }}
            >
              Request Changes
            </Button>
          )}

          {authorizationBlocked && authorizationIsStructural && (
            <Button
              onClick={handleRebuildTeam}
              disabled={Boolean(loading)}
              variant="outlined"
              size="small"
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', borderRadius: 2 }}
            >
              {loading === 'rebuild' ? 'Rebuilding...' : 'Rebuild team'}
            </Button>
          )}

          <Button
            startIcon={<AppIcon name="CheckCircle" fallback={CheckCircleIcon} />}
            onClick={handleApprove}
            disabled={loading === 'approve' || authorizationBlocked}
            variant="contained"
            color="success"
            size="small"
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', borderRadius: 2 }}
          >
            {loading === 'approve' ? 'Approving...' : 'Approve & Start'}
          </Button>
        </>
      }
    >
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2, fontSize: '0.8rem' }}>
          {error}
        </Alert>
      )}
      {authorizationBlocked && (
        <Alert severity="error" sx={{ mb: 2, fontSize: '0.78rem' }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', mb: 0.75 }}>
            Execution cannot start yet.
          </Typography>
          {authorizationSummary.items.length === 0 && (
            <Typography sx={{ fontSize: '0.78rem' }}>
              The execution team could not be authorized for this plan.
            </Typography>
          )}
          {authorizationSummary.items.map((item, index) => (
            <Box key={`${item.code}-${index}`} sx={{ mb: 0.75 }}>
              <Typography sx={{ fontSize: '0.78rem' }}>{item.headline}</Typography>
              <Typography sx={{ fontSize: '0.72rem', opacity: 0.85 }}>{item.remedy}</Typography>
            </Box>
          ))}
          {authorizationSummary.hidden > 0 && (
            <Typography sx={{ fontSize: '0.72rem', opacity: 0.85 }}>
              And {authorizationSummary.hidden} more.
            </Typography>
          )}
        </Alert>
      )}
      <Alert severity="info" sx={{ mb: 2, fontSize: '0.78rem' }}>
        Gate 2 of 2. Approve the exact Orqaly execution plan, team, tools, budget and preparatory
        actions below. AxWise recommendations are shown separately. Any material change invalidates
        this approval.
      </Alert>
      {/* Summary Card */}
      <Box
        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}
      >
        {/* Cost */}
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.background.default, 0.5),
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}
          >
            Estimated Cost
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.3rem' }}>
            ${(totalCost.total || estimates.total_estimated_cost_usd || 0).toFixed(2)}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
            Tokens: ${(totalCost.tokens || 0).toFixed(2)} | Analysis: $
            {(totalCost.pipeline_overhead || 0).toFixed(2)}
          </Typography>
        </Box>

        {/* Time */}
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.background.default, 0.5),
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}
          >
            Estimated Time
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.3rem' }}>
            ~{estimates.total_estimated_time_minutes || '?'} min
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
            {phases.length} phases | {phases.reduce((s, p) => s + (p.jobs?.length || 0), 0)} tasks
          </Typography>
        </Box>
      </Box>
      {/* Success probability */}
      {successProb != null && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontSize: '0.72rem' }}>
              Success Probability
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 600 }}>
              {(successProb * 100).toFixed(0)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={successProb * 100}
            sx={{ height: 6, borderRadius: 3, bgcolor: alpha(theme.palette.success.main, 0.1) }}
          />
        </Box>
      )}
      {(customer.name || goal.tech_doc?.target_audience) && (
        <Box
          sx={{
            p: 1.5,
            mb: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.info.main, 0.035),
          }}
        >
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mb: 0.75 }}
          >
            <Typography variant="subtitle2" sx={{ fontSize: '0.8rem', fontWeight: 700 }}>
              Confirmed customer context
            </Typography>
            <Chip size="small" label={trust.status || intelligence.routing_mode || 'declared'} />
            {intelligence.decision_id && (
              <Chip size="small" variant="outlined" label={`Context ${intelligence.decision_id}`} />
            )}
          </Box>
          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
            <strong>{customer.name || goal.tech_doc?.target_audience}</strong> ·{' '}
            {customer.profile?.problem ||
              goal.tech_doc?.problem_statement ||
              'Problem not specified'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Goal execution persona: {executor.role || 'Customer-aligned specialist'}
          </Typography>
        </Box>
      )}
      {/* Team */}
      {proposal.team?.members?.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}
          >
            Team
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
            {proposal.team.members.map((m, i) => (
              <Chip
                key={i}
                label={`${m.name} (${m.role})`}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.72rem' }}
              />
            ))}
          </Box>
        </Box>
      )}
      {axwiseDecision.decision_id && (
        <Box
          sx={{
            p: 1.5,
            mb: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: axwiseApplied ? 'success.main' : 'warning.main',
            bgcolor: alpha(
              axwiseApplied ? theme.palette.success.main : theme.palette.warning.main,
              0.035
            ),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
              AxWise recommendation
            </Typography>
            <Chip size="small" variant="outlined" label={axwiseDecision.decision_id} />
            <Chip size="small" label={axwiseDecision.enforcement || 'shadow'} />
            <Chip
              size="small"
              color={axwiseFeasible ? 'success' : 'warning'}
              label={axwiseFeasible ? 'Executable' : 'Not executable'}
            />
            <Chip
              size="small"
              color={axwiseApplied ? 'success' : 'default'}
              label={axwiseApplied ? 'Applied by Orqaly' : 'Not applied'}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            AxWise covered {axwiseAssignmentCount} of {assignments.length} planned tasks.
            {!axwiseApplied
              ? ' The assignments below come from Orqaly’s approved local authorization manifest.'
              : ''}
          </Typography>
          {axwiseRejections.length > 0 && (
            <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
              {axwiseRejections.length} AxWise validation issue
              {axwiseRejections.length === 1 ? '' : 's'} require review.
            </Typography>
          )}
        </Box>
      )}
      {assignments.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              Orqaly authorized task assignments
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              label="Local authorization manifest"
              sx={{ height: 19, fontSize: '0.62rem' }}
            />
          </Box>
          {assignments.map((assignment) => (
            <Box
              key={assignment.task_id || assignment.step_id}
              sx={{ display: 'flex', gap: 1, py: 0.5, alignItems: 'flex-start' }}
            >
              <Typography variant="body2" sx={{ fontSize: '0.75rem', flex: 1 }}>
                {assignment.task}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
                {assignment.agent_name || assignment.role || 'Unassigned'}
                {assignment.assignment_rationale?.score != null
                  ? ` · ${(Number(assignment.assignment_rationale.score) * 100).toFixed(0)}% fit`
                  : ''}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      {systemEnrichments.length > 0 && (
        <Box
          sx={{
            p: 1.5,
            mb: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.warning.main, 0.035),
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}
          >
            Preparatory actions after approval
          </Typography>
          {systemEnrichments.map((enrichment) => (
            <Box key={enrichment.id} sx={{ mt: 0.75 }}>
              <Typography variant="body2" sx={{ fontSize: '0.76rem', fontWeight: 700 }}>
                {enrichment.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Services: {enrichment.external_services?.join(', ') || 'Orqaly only'}
                {enrichment.llm?.provider && enrichment.llm?.model
                  ? ` · Model: ${enrichment.llm.provider}/${enrichment.llm.model}`
                  : ''}
                {enrichment.effects?.length ? ` · ${enrichment.effects.join('; ')}` : ''}
              </Typography>
              {enrichment.source_urls?.length > 0 && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', overflowWrap: 'anywhere' }}
                >
                  Declared sources: {enrichment.source_urls.join(', ')}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}
      {/* Phase timeline */}
      <Box sx={{ mb: 2 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            mb: 1,
            display: 'block',
          }}
        >
          Phases
        </Typography>
        {phases.map((p, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Chip
              label={i + 1}
              size="small"
              sx={{ width: 24, height: 24, fontSize: '0.7rem', fontWeight: 700 }}
            />
            <Typography variant="body2" sx={{ fontSize: '0.8rem', flex: 1 }}>
              {p.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
              {p.jobs?.length || 0} tasks
            </Typography>
          </Box>
        ))}
      </Box>
      {/* Expand full proposal */}
      <Button
        size="small"
        onClick={() => setExpanded(!expanded)}
        endIcon={
          expanded ? (
            <AppIcon name="ExpandLess" fallback={ExpandLessIcon} />
          ) : (
            <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />
          )
        }
        sx={{ textTransform: 'none', fontSize: '0.78rem', mb: 1 }}
      >
        {expanded ? 'Hide Details' : 'View Full Proposal'}
      </Button>
      <Collapse in={expanded}>
        <Divider sx={{ mb: 2 }} />

        {/* PO Analysis */}
        {techDoc.problem_statement && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 0.5 }}>
              Problem Statement
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
              {techDoc.problem_statement}
            </Typography>
          </Box>
        )}

        {/* Acceptance Criteria */}
        {techDoc.acceptance_tests?.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 0.5 }}>
              Acceptance Criteria
            </Typography>
            {techDoc.acceptance_tests.map((t, i) => (
              <Typography
                key={i}
                variant="body2"
                sx={{ fontSize: '0.75rem', color: 'text.secondary', pl: 1 }}
              >
                Phase {(t.phase || 0) + 1}: {t.test}
              </Typography>
            ))}
          </Box>
        )}

        {/* Risks */}
        {techDoc.risks?.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 0.5 }}>
              Risks
            </Typography>
            {techDoc.risks.map((r, i) => (
              <Box key={i} sx={{ pl: 1, mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                  <Chip
                    label={r.severity || 'medium'}
                    size="small"
                    sx={{ fontSize: '0.6rem', height: 18, mr: 0.5 }}
                  />
                  {r.risk}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* Per-phase cost breakdown */}
        {estimates.per_phase_breakdown?.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 0.5 }}>
              Cost Breakdown
            </Typography>
            {estimates.per_phase_breakdown.map((p, i) => (
              <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', pl: 1 }}>
                <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                  {p.phase}
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  ${(p.cost || 0).toFixed(2)} | ~{p.time_minutes || '?'}min
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* Feasibility details */}
        {feasibility.feasibility?.risk_factors?.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 0.5 }}>
              Feasibility Risks
            </Typography>
            {feasibility.feasibility.risk_factors.map((r, i) => (
              <Typography
                key={i}
                variant="body2"
                sx={{ fontSize: '0.75rem', color: 'text.secondary', pl: 1 }}
              >
                - {r}
              </Typography>
            ))}
          </Box>
        )}
        {(proposal.tools?.required?.length > 0 || proposal.governance) && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 0.5 }}>
              Tools & guardrails
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              Required tools: {proposal.tools?.required?.join(', ') || 'None declared'}
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              Orqaly revalidates agent ownership, permissions, tools, budget and both approval
              snapshots before execution.
            </Typography>
          </Box>
        )}
      </Collapse>
      {/* Request Changes feedback */}
      <Collapse in={showFeedback}>
        <TextField
          fullWidth
          label="What should be changed?"
          placeholder="Describe your feedback..."
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          multiline
          minRows={2}
          maxRows={4}
          sx={{ mt: 1, '& .MuiInputBase-input': { fontSize: '0.85rem' } }}
        />
      </Collapse>
    </FormDialog>
  );
}
