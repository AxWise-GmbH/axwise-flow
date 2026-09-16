/**
 * ResolveNeedsHumanDialog — contextual resolution UI for goals stuck
 * in needs_human / failed / paused status.
 *
 * Analyzes goal.data.failure_reason, suggests the best resolution type
 * with pre-filled data, and lets the user apply it. On submit, calls
 * resolveGoal() which routes to the backend's handleResolve handler.
 *
 * Unlike Retry (full pipeline reset from feasibility), this continues
 * from the current stage with the applied fix — preserving prior work.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  useTheme,
  alpha,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import { resolveGoal } from '../../services/goalService';
import { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL } from '../../config/assistantBrain';

// Map failure_reason pattern → suggested resolution
function suggestResolution(goal) {
  const reason = String(goal?.data?.failure_reason || '').toLowerCase();
  const currentModel = goal?.data?.test_model?.model || '';
  const phases = goal?.plan?.phases || [];
  const deployPhaseIdx = phases.findIndex((p) => {
    const jobs = Array.isArray(p?.jobs) ? p.jobs : [];
    return (
      jobs.some((j) => (j?.deliverable_type || '').toLowerCase() === 'deployment') ||
      /implementation|deploy/i.test(p?.name || '')
    );
  });

  if (/quota|rate.?limit|hit your limit/.test(reason) && /claude|opus/.test(currentModel)) {
    return {
      type: 'switch_model',
      data: { provider: 'anthropic', model: 'claude-sonnet-5' },
      rationale:
        'Opus quota exhausted → switching to Claude Sonnet (same family, different limit).',
    };
  }
  if (/budget/i.test(reason) && /exhaust|reach/.test(reason)) {
    const current = Number(goal?.budget_usd || 0);
    return {
      type: 'increase_budget',
      data: { new_budget_usd: Math.max(current * 2, current + 3) },
      rationale: 'Budget exhausted — double it and resume.',
    };
  }
  if (/max iterations/.test(reason)) {
    const current = Number(goal?.max_iterations || 5);
    return {
      type: 'increase_iterations',
      data: { new_max: current + 3 },
      rationale: 'Max iterations reached — add 3 more attempts.',
    };
  }
  if (/\.map is not a function|\.join is not a function/i.test(reason)) {
    const fallback = currentModel.startsWith('qwen')
      ? { provider: DEFAULT_LLM_PROVIDER, model: DEFAULT_LLM_MODEL }
      : { provider: 'anthropic', model: 'claude-sonnet-5' };
    return {
      type: 'switch_model',
      data: fallback,
      rationale: `LLM returned malformed JSON (likely Qwen array-as-string). Switching to ${fallback.model} which follows the schema more reliably.`,
    };
  }
  if (/no verified live url|deployment verification failed/i.test(reason)) {
    return {
      type: 'retry_from_stage',
      data: { stage: 'execute-phase', phaseIndex: Math.max(deployPhaseIdx, 0) },
      rationale:
        'Deployment phase failed verification. Retry execution of the implementation phase.',
    };
  }
  if (/localization check failed|missing required language/i.test(reason)) {
    return {
      type: 'retry_from_stage',
      data: { stage: 'execute-phase', phaseIndex: Math.max(deployPhaseIdx, 0) },
      rationale:
        'Deployed page missing required languages. Retry Phase 2 with translation emphasis.',
    };
  }
  return {
    type: 'custom_instruction',
    data: { note: '', retry_stage: 'iterate' },
    rationale: 'No auto-diagnosis for this failure — describe what to try differently.',
  };
}

const RESOLUTION_LABELS = {
  increase_budget: 'Increase budget',
  increase_iterations: 'More iterations',
  switch_model: 'Switch model',
  patch_plan: 'Patch plan (advanced)',
  skip_stuck_phase: 'Skip phase',
  retry_from_stage: 'Retry from stage',
  custom_instruction: 'Custom guidance',
};

const MODEL_OPTIONS = [
  { label: 'Gemini 3.8 Flash', provider: DEFAULT_LLM_PROVIDER, model: DEFAULT_LLM_MODEL },
  { label: 'Claude Sonnet 5', provider: 'anthropic', model: 'claude-sonnet-5' },
  {
    label: 'Claude Opus 5 (subscription, localhost)',
    provider: 'claude-code',
    model: 'claude-opus-5',
  },
  { label: 'GLM 5.1', provider: 'glm', model: 'glm-5.1' },
  { label: 'Qwen Max', provider: 'qwen', model: 'qwen-max' },
  { label: 'Groq Llama 3.3 70B', provider: 'groq', model: 'llama-3.3-70b-versatile' },
];

const STAGE_OPTIONS = [
  { value: 'feasibility-analysis', label: 'Feasibility' },
  { value: 'po-analysis', label: 'PO Analysis' },
  { value: 'pm-planning', label: 'PM Planning' },
  { value: 'team-formation', label: 'Team Formation' },
  { value: 'execute-phase', label: 'Execute Phase' },
  { value: 'iterate', label: 'Iterate (re-plan)' },
];

export default function ResolveNeedsHumanDialog({ open, onClose, goal, onResolved }) {
  const theme = useTheme();
  const suggested = useMemo(() => suggestResolution(goal), [goal]);
  const [type, setType] = useState(suggested.type);
  const [data, setData] = useState(suggested.data);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // When the goal changes or dialog reopens, reset to fresh suggestions
  useEffect(() => {
    if (open) {
      const next = suggestResolution(goal);
      setType(next.type);
      setData(next.data);
      setError(null);
    }
  }, [open, goal]);

  if (!goal) return null;

  const failureReason =
    goal.data?.failure_reason ||
    'No failure reason recorded. Goal is stuck — pick a resolution below.';

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await resolveGoal(goal.id, { type, data });
      onResolved?.();
      onClose();
    } catch (err) {
      setError(err?.message || 'Resolution failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderForm = () => {
    switch (type) {
      case 'increase_budget':
        return (
          <TextField
            label="New budget (USD)"
            type="number"
            fullWidth
            value={data.new_budget_usd ?? ''}
            onChange={(e) => setData({ new_budget_usd: Number(e.target.value) })}
            helperText={`Currently $${goal.budget_usd || 0} spent $${Number(goal.spent_usd || 0).toFixed(4)}`}
            inputProps={{ min: 0.1, max: 10000, step: 0.5 }}
            sx={FORM_FIELD_SX}
          />
        );
      case 'increase_iterations':
        return (
          <TextField
            label="New max iterations"
            type="number"
            fullWidth
            value={data.new_max ?? ''}
            onChange={(e) => setData({ new_max: Number(e.target.value) })}
            helperText={`Currently ${goal.iteration || 0} / ${goal.max_iterations || 5}`}
            inputProps={{ min: 1, max: 50 }}
          />
        );
      case 'switch_model':
        return (
          <FormControl fullWidth>
            <InputLabel>New model</InputLabel>
            <Select
              label="New model"
              value={`${data.provider}/${data.model}`}
              onChange={(e) => {
                const opt = MODEL_OPTIONS.find(
                  (o) => `${o.provider}/${o.model}` === e.target.value
                );
                if (opt) setData({ provider: opt.provider, model: opt.model });
              }}
            >
              {MODEL_OPTIONS.map((opt) => (
                <MenuItem
                  key={`${opt.provider}/${opt.model}`}
                  value={`${opt.provider}/${opt.model}`}
                >
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );
      case 'retry_from_stage':
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Retry from stage</InputLabel>
              <Select
                label="Retry from stage"
                value={data.stage || 'iterate'}
                onChange={(e) => setData({ ...data, stage: e.target.value })}
              >
                {STAGE_OPTIONS.map((s) => (
                  <MenuItem key={s.value} value={s.value}>
                    {s.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {data.stage === 'execute-phase' && (
              <TextField
                label="Phase index"
                type="number"
                fullWidth
                value={data.phaseIndex ?? 0}
                onChange={(e) => setData({ ...data, phaseIndex: Number(e.target.value) })}
                inputProps={{ min: 0, max: (goal.plan?.phases?.length || 1) - 1 }}
                helperText={`Phases available: 0–${(goal.plan?.phases?.length || 1) - 1}`}
              />
            )}
          </Box>
        );
      case 'skip_stuck_phase':
        return (
          <TextField
            label="Phase index to skip"
            type="number"
            fullWidth
            value={data.phaseIndex ?? 0}
            onChange={(e) => setData({ phaseIndex: Number(e.target.value) })}
            inputProps={{ min: 0, max: (goal.plan?.phases?.length || 1) - 1 }}
            helperText="Marks this phase completed (skipped) and moves to next phase."
          />
        );
      case 'patch_plan':
        return (
          <TextField
            label="Replacement phases (JSON)"
            multiline
            minRows={6}
            fullWidth
            value={data.phasesJson || JSON.stringify(goal.plan?.phases || [], null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                setData({ phasesJson: e.target.value, phases: parsed });
                setError(null);
              } catch (err) {
                setData({ ...data, phasesJson: e.target.value });
                setError('Invalid JSON');
              }
            }}
            helperText="Edit the plan JSON directly. Must be a valid array of phase objects."
          />
        );
      case 'custom_instruction':
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Guidance for the next attempt"
              multiline
              minRows={3}
              fullWidth
              value={data.note || ''}
              onChange={(e) => setData({ ...data, note: e.target.value })}
              placeholder="e.g. The previous attempt used generic stock photos. This time, use Pexels search 'artisan coffee latvia' for hero image."
            />
            <FormControl fullWidth>
              <InputLabel>Retry from stage</InputLabel>
              <Select
                label="Retry from stage"
                value={data.retry_stage || 'iterate'}
                onChange={(e) => setData({ ...data, retry_stage: e.target.value })}
              >
                {STAGE_OPTIONS.map((s) => (
                  <MenuItem key={s.value} value={s.value}>
                    {s.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        );
      default:
        return null;
    }
  };

  const canSubmit = (() => {
    if (submitting) return false;
    if (type === 'increase_budget') return Number(data.new_budget_usd) > 0;
    if (type === 'increase_iterations') return Number(data.new_max) > 0;
    if (type === 'switch_model') return !!(data.provider && data.model);
    if (type === 'patch_plan')
      return Array.isArray(data.phases) && data.phases.length > 0 && !error;
    if (type === 'skip_stuck_phase') return Number.isInteger(data.phaseIndex);
    if (type === 'retry_from_stage') return !!data.stage;
    if (type === 'custom_instruction') return !!(data.note && data.retry_stage);
    return false;
  })();

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Resolve & resume"
      subtitle="Apply a fix and continue from the current stage — not a full reset."
      icon={AutoFixHighIcon}
      iconVariant="warning"
      primaryLabel={submitting ? 'Applying…' : 'Apply & resume'}
      onPrimary={handleSubmit}
      primaryDisabled={!canSubmit}
      primaryLoading={submitting}
      contentSx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      <Alert severity="warning" sx={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
        <strong>Stuck at:</strong> {goal.status}
        <br />
        {failureReason}
      </Alert>

      <Box>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            mb: 0.5,
            display: 'block',
          }}
        >
          Suggested: {suggested.rationale}
        </Typography>
      </Box>

      <ToggleButtonGroup
        value={type}
        exclusive
        onChange={(_, v) => {
          if (!v) return;
          setType(v);
          // Re-suggest data defaults when switching types
          const fresh = suggestResolution(goal);
          if (fresh.type === v) setData(fresh.data);
          else {
            if (v === 'increase_budget')
              setData({
                new_budget_usd: Math.max(
                  Number(goal.budget_usd || 0) * 2,
                  Number(goal.budget_usd || 0) + 3
                ),
              });
            else if (v === 'increase_iterations')
              setData({ new_max: Number(goal.max_iterations || 5) + 3 });
            else if (v === 'switch_model')
              setData({ provider: DEFAULT_LLM_PROVIDER, model: DEFAULT_LLM_MODEL });
            else if (v === 'retry_from_stage') setData({ stage: 'iterate' });
            else if (v === 'skip_stuck_phase') setData({ phaseIndex: 0 });
            else if (v === 'patch_plan')
              setData({
                phasesJson: JSON.stringify(goal.plan?.phases || [], null, 2),
                phases: goal.plan?.phases || [],
              });
            else if (v === 'custom_instruction') setData({ note: '', retry_stage: 'iterate' });
          }
        }}
        sx={{ flexWrap: 'wrap', gap: 0.5 }}
        size="small"
      >
        {Object.entries(RESOLUTION_LABELS).map(([k, label]) => (
          <ToggleButton
            key={k}
            value={k}
            sx={{
              fontSize: '0.7rem',
              textTransform: 'none',
              px: 1.5,
              py: 0.5,
              border: '1px solid !important',
              borderRadius: '6px !important',
              mr: '4px !important',
            }}
          >
            {label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Box
        sx={{
          p: 2,
          borderRadius: 2,
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
        }}
      >
        {renderForm()}
      </Box>
    </FormDialog>
  );
}
