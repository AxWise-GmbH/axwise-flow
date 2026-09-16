import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, Typography, CircularProgress } from '@mui/material';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import SetupCardShell from '../../../../components/Assistant/cards/SetupCardShell';
import AppIcon from '../../../../components/icons/AppIcon';
import {
  fetchArenaStack,
  linkArenaBriefGoal,
  sendBriefToDeveloper,
} from '../../../../services/arenaService';
import { createGoal } from '../../../../services/goalService';

const GAP_STATES = new Set(['gap', 'brief_requested', 'brief_ready', 'handed_over']);

/**
 * What still needs a developer.
 *
 * Normally that is the tools our catalog does not cover. But when connections
 * are switched off for the workspace, a covered tool cannot be connected by
 * button either - it sits at 'selected' forever - so step 3 promises this step
 * will handle it. Honour that promise, or the guide goes all-green having wired
 * nothing.
 */
function needsDeveloper(row, composioConfigured) {
  if (GAP_STATES.has(row.status)) return true;
  return !composioConfigured && row.source === 'catalog' && row.status === 'selected';
}

/** A row with no brief yet - the one state that offers to write one. */
function awaitingBrief(row) {
  return row.status === 'gap' || row.status === 'selected';
}

/** The goal that writes the brief. no_tools + unattended: it runs start to
 *  finish alone and produces a markdown report, never touching provisioning. */
function briefGoalPayload(row) {
  return {
    title: `Integration brief: connect ${row.label} to Orqaly`,
    description: [
      `Write a complete, step-by-step integration brief for an in-house developer who has full access to the company's ${row.label} account, its API documentation, and the ability to create API keys.`,
      '',
      "Purpose: Orqaly's Arena needs read-only evidence of completed work from this tool - which work items were finished, by whom, and when - so the humans' results can be compared with AI agents doing the same jobs. Nothing is ever written back to the tool.",
      '',
      'The brief must contain, in this order:',
      `1. What ${row.label} is and which API surface fits read-only reporting.`,
      '2. How to authenticate, with the minimal read-only scopes or permissions - never more.',
      '3. The exact data to pull: completed work items with assignee and completion time.',
      '4. A suggested environment variable name for the credential.',
      '5. A simple test call the developer can run to prove access works.',
      '6. An explicit list of any assumptions made, and a closing note telling the developer to verify endpoint names against the official documentation before wiring anything.',
      '',
      'Audience: a professional developer. Tone: precise and practical. Format: markdown.',
    ].join('\n'),
    budget_usd: 5,
    mode: 'simple',
    execution_mode: 'auto',
    hitl_mode: 'unattended',
    tool_mode: 'no_tools',
    po_depth: 'quick',
    theory_mode: false,
    executor_type: 'organization',
  };
}

/**
 * Guide step 4 — the tools we cannot connect by button. For each, the AI team
 * writes an integration brief (a real goal through the pipeline), and the
 * finished brief is handed to the in-house developer as a tracked task.
 */
export default function DevBriefsCard({ onComplete, onSkip, embedded }) {
  const [rows, setRows] = useState([]);
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const reload = useCallback(async () => {
    try {
      const data = await fetchArenaStack();
      const gaps = (data.rows || []).filter((r) => needsDeveloper(r, data.composioConfigured));
      setRows(gaps);
      // While any brief is still being written, keep the statuses fresh - the
      // server flips brief_requested to brief_ready when the goal completes.
      const writing = gaps.some((r) => r.status === 'brief_requested');
      clearTimeout(pollRef.current);
      if (writing) pollRef.current = setTimeout(reload, 12_000);
    } catch (err) {
      setError(err.message || 'Could not read your stack');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    return () => clearTimeout(pollRef.current);
  }, [reload]);

  const writeBrief = async (row) => {
    setBusyKey(row.key);
    setError(null);
    try {
      const goal = await createGoal(briefGoalPayload(row));
      const goalId = goal?.goal?.id || goal?.id;
      if (!goalId) throw new Error('The brief could not be started');
      await linkArenaBriefGoal(row.id, goalId);
      await reload();
    } catch (err) {
      setError(err.message || `Could not start the brief for ${row.label}`);
    } finally {
      setBusyKey(null);
    }
  };

  const sendToDeveloper = async (row) => {
    setBusyKey(row.key);
    setError(null);
    try {
      await sendBriefToDeveloper(row.id);
      await reload();
    } catch (err) {
      setError(err.message || 'Could not hand that brief over');
    } finally {
      setBusyKey(null);
    }
  };

  const open = rows.filter((r) => r.status !== 'handed_over');

  return (
    <SetupCardShell
      title="For the rest, we write your developer a brief"
      embedded={embedded}
      primaryLabel={open.length ? 'Continue' : 'Nothing left here - continue'}
      onPrimary={() => onComplete({ briefs: true })}
      busy={false}
      onSkip={onSkip}
      error={error}
    >
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={22} />
        </Box>
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Everything you ticked can connect by button - there is nothing for a developer to do.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {rows.map((row) => (
            <Box key={row.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
                {row.label}
              </Typography>
              {awaitingBrief(row) && (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busyKey === row.key}
                  onClick={() => writeBrief(row)}
                  startIcon={
                    busyKey === row.key ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <AppIcon
                        name="EditNoteRounded"
                        fallback={EditNoteRoundedIcon}
                        sx={{ fontSize: 16 }}
                      />
                    )
                  }
                  sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                >
                  Write the brief
                </Button>
              )}
              {row.status === 'brief_requested' && (
                <Chip
                  size="small"
                  variant="outlined"
                  icon={<CircularProgress size={12} />}
                  label="Being written - a few minutes"
                  sx={{ fontWeight: 600 }}
                />
              )}
              {row.status === 'brief_ready' && (
                <Button
                  size="small"
                  variant="contained"
                  disabled={busyKey === row.key}
                  onClick={() => sendToDeveloper(row)}
                  startIcon={
                    <AppIcon name="SendRounded" fallback={SendRoundedIcon} sx={{ fontSize: 16 }} />
                  }
                  sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                >
                  Save for my developer
                </Button>
              )}
              {row.status === 'handed_over' && (
                <Chip
                  size="small"
                  color="success"
                  variant="outlined"
                  icon={<AppIcon name="CheckCircleRounded" fallback={CheckCircleRoundedIcon} />}
                  label="Saved in Human tasks"
                  sx={{ fontWeight: 700 }}
                />
              )}
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            Writing a brief takes a few minutes and uses your AI budget. Saving it puts the finished
            brief under Human tasks in your account menu - open it there, copy it and pass it to
            your developer yourself. Nothing is emailed anywhere.
          </Typography>
        </Box>
      )}
    </SetupCardShell>
  );
}
