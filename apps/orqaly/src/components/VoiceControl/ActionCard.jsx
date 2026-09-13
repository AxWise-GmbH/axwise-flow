/**
 * ActionCard — renders a copilot PROPOSED (confirmation-gated) action as a
 * message + primary button (Create Goal / Retry Workflow / ...) + Cancel.
 *
 * The card owns its own status (pending -> confirming -> done|error|cancelled).
 * On confirm it calls onConfirm(proposal) which resolves the pending action on
 * the backend and returns { status, blocks }.
 */
import { useState } from 'react';
import { Box, Button, Typography, Chip, CircularProgress, useTheme, alpha } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import { composerInk, composerInkAlpha } from '../../theme/composerSurface';

// tool -> primary button label
const ACTION_LABELS = {
  'goal.create': 'Create Goal',
  'goal.pause': 'Pause Goal',
  'goal.resume': 'Resume Goal',
  'goal.cancel': 'Cancel Goal',
  'goal.updateBudget': 'Update Budget',
  'task.create': 'Create Task',
  'workflow.create': 'Create Workflow',
  'workflow.execute': 'Start Workflow',
  'workflow.retry': 'Retry Workflow',
  'workflow.toggle': 'Toggle Workflow',
  'pulse.create': 'Add Pulse',
  'pulse.fireNow': 'Fire Pulse',
  'pulse.pause': 'Pause Pulse',
  'pulse.resume': 'Resume Pulse',
  'loop.pauseResume': 'Update Loop',
  'agent.pause': 'Pause Agent',
  'agent.resume': 'Resume Agent',
  'kb.create': 'Save to Knowledge Base',
  'org.createSubsidiary': 'Create Organization',
};

function labelFor(tool) {
  if (ACTION_LABELS[tool]) return ACTION_LABELS[tool];
  const parts = String(tool || '').split('.');
  const verb = (parts[1] || 'run').replace(/([A-Z])/g, ' $1');
  const noun = parts[0] || '';
  return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${noun}`.trim();
}

const DESTRUCTIVE = /(delete|archive|cancel|clearAll|terminate)/i;

// Args worth showing under the tool name, in the order they read best. Anything
// not listed here falls back to the first few keys of the args object.
const PREVIEW_FIELDS = {
  'goal.create': ['title', 'budget_usd', 'complexity'],
};
const GENERIC_PREVIEW_LIMIT = 3;
const HIDDEN_ARGS = new Set(['organization_id', 'org_id', 'excludeConversationId']);

function formatArgValue(key, value) {
  if (value === null || value === undefined || value === '') return '';
  if (key === 'budget_usd' || key === 'budget') return `$${value}`;
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

/**
 * The values this action would run with. goal.create is proposed before the
 * copilot knows the title or the budget, so the ones it filled in itself are
 * flagged - a placeholder must not read as a decision the user made.
 */
export function buildArgPreview(tool, args, draftFields = []) {
  if (!args || typeof args !== 'object') return [];
  const keys =
    PREVIEW_FIELDS[tool] ||
    Object.keys(args)
      .filter((k) => !HIDDEN_ARGS.has(k))
      .slice(0, GENERIC_PREVIEW_LIMIT);
  return keys
    .map((key) => ({
      key,
      text: formatArgValue(key, args[key]),
      draft: Array.isArray(draftFields) && draftFields.includes(key),
    }))
    .filter((f) => f.text);
}

export default function ActionCard({ proposal, onConfirm, onCancel }) {
  const theme = useTheme();
  const [status, setStatus] = useState('pending'); // pending | confirming | done | error | cancelled
  const [error, setError] = useState('');

  const tool = proposal?.tool || '';
  const risk = proposal?.riskLevel || 'medium';
  const destructive = DESTRUCTIVE.test(tool) || risk === 'high' || risk === 'critical';
  const preview = buildArgPreview(tool, proposal?.args, proposal?.draftFields);
  const primaryColor = destructive ? theme.palette.error : theme.palette.primary;

  const handleConfirm = async () => {
    if (status !== 'pending' || !proposal?.pendingCallId) {
      if (!proposal?.pendingCallId) setError('This action expired. Ask me again.');
      return;
    }
    setStatus('confirming');
    try {
      const res = await onConfirm?.(proposal);
      if (res && (res.status === 'approved' || res.ok)) {
        setStatus('done');
      } else {
        setStatus('error');
        setError(res?.error || res?.status || 'Could not complete the action.');
      }
    } catch (e) {
      setStatus('error');
      setError(e?.message || 'Could not complete the action.');
    }
  };

  const handleCancel = () => {
    setStatus('cancelled');
    onCancel?.(proposal);
  };

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(primaryColor.main, 0.35),
        bgcolor: alpha(primaryColor.main, 0.06),
        p: 1.25,
        mt: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
            <Typography variant="body2" sx={{ color: composerInk(theme), fontWeight: 600 }}>
              {proposal?.summary || labelFor(tool)}
            </Typography>
            <Chip
              size="small"
              label={risk}
              sx={{
                height: 16,
                fontSize: '0.6rem',
                bgcolor: alpha(primaryColor.light, 0.18),
                color: primaryColor.light,
                '& .MuiChip-label': { px: 0.6 },
              }}
            />
          </Box>
          <Typography variant="caption" sx={{ color: composerInkAlpha(theme, 0.5) }}>
            {tool}
          </Typography>
          {preview.length > 0 && (
            <Box
              data-testid="action-args"
              sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, mt: 0.25 }}
            >
              {preview.map((f, i) => (
                <Box key={f.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {i > 0 && (
                    <Typography variant="caption" sx={{ color: composerInkAlpha(theme, 0.25) }}>
                      ·
                    </Typography>
                  )}
                  <Typography
                    variant="caption"
                    sx={{ color: composerInkAlpha(theme, f.draft ? 0.45 : 0.75) }}
                  >
                    {f.text}
                  </Typography>
                  {f.draft && (
                    <Chip
                      size="small"
                      label="draft"
                      sx={{
                        height: 14,
                        fontSize: '0.55rem',
                        bgcolor: composerInkAlpha(theme, 0.08),
                        color: composerInkAlpha(theme, 0.5),
                        '& .MuiChip-label': { px: 0.5 },
                      }}
                    />
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      {status === 'done' && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            mt: 1,
            color: theme.palette.success.light,
          }}
        >
          <CheckCircleRoundedIcon sx={{ fontSize: 16 }} />
          <Typography variant="caption">Done</Typography>
        </Box>
      )}
      {status === 'cancelled' && (
        <Typography
          variant="caption"
          sx={{ color: composerInkAlpha(theme, 0.4), mt: 1, display: 'block' }}
        >
          Cancelled
        </Typography>
      )}
      {status === 'error' && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            mt: 1,
            color: theme.palette.error.light,
          }}
        >
          <ErrorRoundedIcon sx={{ fontSize: 16 }} />
          <Typography variant="caption">{error}</Typography>
        </Box>
      )}

      {(status === 'pending' || status === 'confirming') && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <Button
            size="small"
            variant="contained"
            disabled={status === 'confirming'}
            onClick={handleConfirm}
            startIcon={
              status === 'confirming' ? <CircularProgress size={12} color="inherit" /> : null
            }
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              bgcolor: primaryColor.main,
              '&:hover': { bgcolor: primaryColor.dark },
            }}
          >
            {labelFor(tool)}
          </Button>
          <Button
            size="small"
            onClick={handleCancel}
            disabled={status === 'confirming'}
            sx={{ textTransform: 'none', color: composerInkAlpha(theme, 0.6) }}
          >
            Cancel
          </Button>
        </Box>
      )}
    </Box>
  );
}
