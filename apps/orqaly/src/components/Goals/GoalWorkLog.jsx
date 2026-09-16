/**
 * GoalWorkLog — Unified work log card for the Goal Live Dashboard.
 * Consolidates: Knowledge Base, Tasks, Workflow, Project, Agent Communications.
 */
import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
  Collapse,
  useTheme,
  alpha,
  IconButton,
  Tooltip,
  Button,
  Divider,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import FormDialog from '../Common/FormDialog';
import { reviewBudgetRequest, listBudgetRequests } from '../../services/budgetRequestService';
import { resolveAgentIdentity } from '../../utils/agentIdentity';
import { supabase, hasSupabase } from '../../lib/supabase';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import GoalDeliverables from './GoalDeliverables';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import GlassIcon from '../icons/GlassIcon';
import { formatTechDoc } from '../../utils/goalTruthFormatters';

import AppIcon from '../icons/AppIcon';
import { fmtCriterion } from './_goalFormat';
import { currentGoalTaskAttempt } from './currentGoalTaskAttempt';
import { currentGoalDocuments } from '../../../lib/_shared/goal-document-attempt.js';

function timeAgo(date) {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function fmtDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const TASK_ICONS = {
  planned: (
    <AppIcon name="Schedule" fallback={ScheduleIcon} sx={{ fontSize: 14, color: 'info.main' }} />
  ),
  todo: (
    <AppIcon
      name="RadioButtonUnchecked"
      fallback={RadioButtonUncheckedIcon}
      sx={{ fontSize: 14, color: 'text.disabled' }}
    />
  ),
  done: (
    <AppIcon
      name="CheckCircle"
      fallback={CheckCircleIcon}
      sx={{ fontSize: 14, color: 'success.main' }}
    />
  ),
  inProgress: (
    <AppIcon
      name="HourglassTop"
      fallback={HourglassTopIcon}
      sx={{ fontSize: 14, color: 'info.main' }}
    />
  ),
  running: (
    <AppIcon
      name="HourglassTop"
      fallback={HourglassTopIcon}
      sx={{ fontSize: 14, color: 'info.main' }}
    />
  ),
  failed: (
    <AppIcon
      name="ErrorOutline"
      fallback={ErrorOutlineIcon}
      sx={{ fontSize: 14, color: 'error.main' }}
    />
  ),
  cancelled: (
    <AppIcon
      name="ErrorOutline"
      fallback={ErrorOutlineIcon}
      sx={{ fontSize: 14, color: 'text.disabled' }}
    />
  ),
};

const STATUS_COLOR = {
  done: 'success',
  completed: 'success',
  inProgress: 'info',
  running: 'info',
  executing: 'info',
  planned: 'default',
  todo: 'default',
  pending: 'default',
  failed: 'error',
  cancelled: 'default',
};

const DOC_CATEGORIES = {
  'goal-plan': { label: 'Plans', color: 'info' },
  'goal-output': { label: 'Outputs', color: 'success' },
  'goal-report': { label: 'Reports', color: 'warning' },
  'goal-retrospective': { label: 'Retrospectives', color: 'secondary' },
  'po-tech-doc': { label: 'PO Tech Doc', color: 'primary' },
  'pm-plan': { label: 'PM Plan', color: 'info' },
  'goal-feasibility': { label: 'Analysis', color: 'info' },
  feasibility: { label: 'Feasibility Analysis', color: 'info' },
  proposal: { label: 'Proposal & Estimates', color: 'warning' },
};

const MSG_COLORS = {
  report: 'success.main',
  instruction: 'info.main',
  alert: 'warning.main',
  feedback: 'secondary.main',
  decision: 'primary.main',
};

// Format goal.plan into readable text
function formatPlan(plan) {
  if (!plan) return '';
  const lines = [];
  if (plan.strategy) lines.push(`Strategy:\n${plan.strategy}`);
  if (plan.duration) lines.push(`\nDuration: ${plan.duration}`);
  if (plan.phases?.length) {
    lines.push(`\nPhases (${plan.phases.length} total):`);
    plan.phases.forEach((p, i) => {
      lines.push(`\nPhase ${i + 1}: ${p.name}`);
      if (p.description) lines.push(`  ${p.description}`);
      if (p.jobs?.length) {
        p.jobs.forEach((j) => {
          lines.push(`  • ${j.title}${j.required_role ? ` [${j.required_role}]` : ''}`);
          if (j.description) lines.push(`    ${j.description}`);
        });
      }
    });
  }
  return lines.join('\n') || JSON.stringify(plan, null, 2);
}

function SectionHeader({ icon, title, badge, badgeColor = 'default' }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
      {icon}
      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.78rem', flex: 1 }}>
        {title}
      </Typography>
      {badge != null && (
        <Chip
          label={badge}
          size="small"
          color={badgeColor}
          variant="outlined"
          sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700 }}
        />
      )}
    </Box>
  );
}

// --- Knowledge Base Section ---
function KBSection({ documents, theme }) {
  const [expandedDoc, setExpandedDoc] = useState(null);

  const grouped = {};
  for (const doc of documents) {
    const cat = doc.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(doc);
  }

  if (!documents.length) {
    return (
      <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
        No documents yet
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {Object.entries(grouped).map(([cat, docs]) => {
        const catInfo = DOC_CATEGORIES[cat] || { label: cat, color: 'default' };
        return (
          <Box key={cat}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <Chip
                label={catInfo.label}
                size="small"
                color={catInfo.color}
                variant="outlined"
                sx={{ height: 18, fontSize: '0.55rem', fontWeight: 700 }}
              />
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.6rem' }}>
                ({docs.length})
              </Typography>
            </Box>
            {docs.map((doc) => (
              <Box key={doc.id} sx={{ ml: 1, mb: 0.25 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.04) },
                    borderRadius: 0.5,
                    px: 0.5,
                    py: 0.25,
                  }}
                  onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                >
                  <GlassIcon
                    name="ExpandMore"
                    size={14}
                    tone="neutral"
                    sx={{
                      transform: expandedDoc === doc.id ? 'rotate(0)' : 'rotate(-90deg)',
                      transition: '0.2s',
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.68rem', flex: 1, fontWeight: 600 }}
                    noWrap
                  >
                    {doc.title}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.55rem', color: 'text.disabled', whiteSpace: 'nowrap' }}
                  >
                    {timeAgo(doc.created_at)}
                  </Typography>
                </Box>
                <Collapse in={expandedDoc === doc.id}>
                  <Paper
                    elevation={0}
                    sx={{
                      ml: 2.5,
                      mt: 0.5,
                      mb: 1,
                      p: 1.5,
                      bgcolor: alpha(theme.palette.background.paper, 0.5),
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1.5,
                      maxHeight: 300,
                      overflow: 'auto',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.68rem',
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.6,
                        fontFamily: 'inherit',
                      }}
                    >
                      {doc.content?.slice(0, 5000) || '(empty)'}
                    </Typography>
                  </Paper>
                </Collapse>
              </Box>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

// --- Task Detail Dialog ---
function TaskDetailDialog({ task, open, onClose, theme, profileIndex }) {
  if (!task) return null;
  const statusColor = STATUS_COLOR[task.status] || 'default';
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={task.title}
      icon={AssignmentOutlinedIcon}
      maxWidth="sm"
      contentDividers={false}
      contentSx={{ pt: 0 }}
      primaryLabel="Close"
      onPrimary={onClose}
      hideCancel
    >
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Chip
          label={task.status || 'planned'}
          size="small"
          color={statusColor}
          variant="outlined"
          sx={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'capitalize' }}
        />
        {task.priority && (
          <Chip
            label={task.priority}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.62rem' }}
          />
        )}
        {task.estimate && (
          <Chip
            label={task.estimate}
            size="small"
            variant="outlined"
            icon={
              <AppIcon
                name="Schedule"
                fallback={ScheduleIcon}
                sx={{ fontSize: '12px !important' }}
              />
            }
            sx={{ fontSize: '0.62rem' }}
          />
        )}
        {task.category && (
          <Chip
            label={task.category}
            size="small"
            variant="outlined"
            color="info"
            sx={{ fontSize: '0.62rem' }}
          />
        )}
      </Box>
      {/* Goal + Phase context */}
      {(task.data?.goal_title || task.data?.phase_name) && (
        <Paper
          elevation={0}
          sx={{
            p: 1,
            mb: 2,
            borderRadius: 1.5,
            bgcolor: alpha(theme.palette.info.main, 0.04),
            border: '1px solid',
            borderColor: alpha(theme.palette.info.main, 0.15),
          }}
        >
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            {task.data?.goal_title && (
              <Box>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.54rem', color: 'text.disabled', display: 'block' }}
                >
                  Goal
                </Typography>
                <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 700 }}>
                  {task.data.goal_title}
                </Typography>
              </Box>
            )}
            {task.data?.phase_name && (
              <Box>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.54rem', color: 'text.disabled', display: 'block' }}
                >
                  Phase
                </Typography>
                <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
                  {task.data.phase_index != null ? `${task.data.phase_index + 1}. ` : ''}
                  {task.data.phase_name}
                </Typography>
              </Box>
            )}
            {task.data?.required_role && (
              <Box>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.54rem', color: 'text.disabled', display: 'block' }}
                >
                  Role
                </Typography>
                <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
                  {task.data.required_role}
                </Typography>
              </Box>
            )}
          </Box>
        </Paper>
      )}
      {task.description && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: '0.7rem',
              color: 'text.secondary',
              display: 'block',
              mb: 0.5,
            }}
          >
            Description
          </Typography>
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              bgcolor: alpha(theme.palette.background.default, 0.6),
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography
              variant="caption"
              sx={{ fontSize: '0.68rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
            >
              {task.description}
            </Typography>
          </Paper>
        </Box>
      )}
      {task.assigned_to &&
        (() => {
          const identity = resolveAgentIdentity(
            { id: task.agent_id, name: task.assigned_to, role: task.data?.required_role },
            profileIndex
          );
          const displayName = identity.name || task.assigned_to;
          return (
            <Box
              onClick={() => {
                if (typeof window.__openAgentDetail === 'function')
                  window.__openAgentDetail({
                    id: task.agent_id,
                    name: task.assigned_to,
                    role: task.data?.required_role,
                  });
              }}
              sx={{
                mb: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                cursor: 'pointer',
                borderRadius: 1,
                p: 0.5,
                mx: -0.5,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <GlassIcon name="PersonOutline" size={16} tone="neutral" />
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.7rem', fontWeight: 600, display: 'block' }}
                >
                  {displayName}
                </Typography>
                <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>
                  {identity.position ? `${identity.position} · assigned agent` : 'assigned agent'}
                </Typography>
              </Box>
            </Box>
          );
        })()}
      {task.data?.acceptance_criteria?.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: '0.7rem',
              color: 'text.secondary',
              display: 'block',
              mb: 0.5,
            }}
          >
            Acceptance Criteria
          </Typography>
          <Box sx={{ pl: 1 }}>
            {task.data.acceptance_criteria.map((c, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 0.5, mb: 0.25 }}>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.62rem' }}>
                  •
                </Typography>
                <Typography variant="caption" sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
                  {fmtCriterion(c)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
      {task.data?.tool_requirements?.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: '0.7rem',
              color: 'text.secondary',
              display: 'block',
              mb: 0.5,
            }}
          >
            Tool Requirements
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {task.data.tool_requirements.map((tool, i) => (
              <Chip
                key={i}
                label={tool}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.6rem', height: 20 }}
              />
            ))}
          </Box>
        </Box>
      )}
      {task.output && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: '0.7rem',
              color: 'success.main',
              display: 'block',
              mb: 0.5,
            }}
          >
            Output
          </Typography>
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              bgcolor: alpha(theme.palette.success.main, 0.04),
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: alpha(theme.palette.success.main, 0.2),
              maxHeight: 200,
              overflow: 'auto',
            }}
          >
            <Typography
              variant="caption"
              sx={{ fontSize: '0.68rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
            >
              {typeof task.output === 'string' ? task.output : JSON.stringify(task.output, null, 2)}
            </Typography>
          </Paper>
        </Box>
      )}
      <Divider sx={{ my: 1.5 }} />
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {task.deadline && (
          <Box>
            <Typography
              variant="caption"
              sx={{ fontSize: '0.6rem', color: 'text.disabled', display: 'block' }}
            >
              Deadline
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
              {task.deadline}
            </Typography>
          </Box>
        )}
        {task.created_at && (
          <Box>
            <Typography
              variant="caption"
              sx={{ fontSize: '0.6rem', color: 'text.disabled', display: 'block' }}
            >
              Created
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '0.68rem' }}>
              {fmtDate(task.created_at)}
            </Typography>
          </Box>
        )}
        {task.updated_at && (
          <Box>
            <Typography
              variant="caption"
              sx={{ fontSize: '0.6rem', color: 'text.disabled', display: 'block' }}
            >
              Updated
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '0.68rem' }}>
              {fmtDate(task.updated_at)}
            </Typography>
          </Box>
        )}
      </Box>
    </FormDialog>
  );
}

// --- Phase Detail Dialog ---
function PhaseDetailDialog({ phase, phaseIndex, phaseTasks, open, onClose, goal, theme }) {
  if (!phase) return null;
  const statusColor = STATUS_COLOR[phase.status] || 'default';
  const doneTasks = phaseTasks.filter((t) => t.status === 'done').length;
  const pct = phaseTasks.length > 0 ? Math.round((doneTasks / phaseTasks.length) * 100) : 0;
  const phaseCost =
    goal?.data?.phase_costs?.[phaseIndex]?.total ||
    goal?.phaseBudget?.find((p) => p.phaseIndex === phaseIndex)?.cost;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={phase.name}
      subtitle={`Phase ${phaseIndex + 1}`}
      icon={AccountTreeOutlinedIcon}
      maxWidth="sm"
      contentDividers={false}
      contentSx={{ pt: 0 }}
      primaryLabel="Close"
      onPrimary={onClose}
      hideCancel
    >
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip
          label={phase.status || 'pending'}
          size="small"
          color={statusColor}
          variant="outlined"
          sx={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'capitalize' }}
        />
        {phase.quality_score != null && (
          <Chip
            label={`Quality: ${phase.quality_score}/100`}
            size="small"
            color={
              phase.quality_score >= 70
                ? 'success'
                : phase.quality_score >= 40
                  ? 'warning'
                  : 'error'
            }
            variant="outlined"
            sx={{ fontSize: '0.62rem' }}
          />
        )}
        {phaseCost > 0 && (
          <Typography variant="caption" sx={{ fontSize: '0.62rem', color: 'text.disabled' }}>
            Cost: ${phaseCost.toFixed(4)}
          </Typography>
        )}
      </Box>
      {phase.description && (
        <Typography
          variant="caption"
          sx={{ fontSize: '0.7rem', color: 'text.secondary', display: 'block', mb: 1.5 }}
        >
          {phase.description}
        </Typography>
      )}
      {phaseTasks.length > 0 && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, fontSize: '0.7rem', color: 'text.secondary' }}
            >
              Tasks ({doneTasks}/{phaseTasks.length})
            </Typography>
            <LinearProgress
              variant="determinate"
              value={pct}
              color={pct === 100 ? 'success' : 'info'}
              sx={{ flex: 1, height: 5, borderRadius: 3 }}
            />
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.62rem',
                fontWeight: 700,
                color: pct === 100 ? 'success.main' : 'text.secondary',
              }}
            >
              {pct}%
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {phaseTasks.map((t) => {
              const tStatusColor = STATUS_COLOR[t.status] || 'default';
              return (
                <Box
                  key={t.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    py: 0.5,
                    px: 1,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.3),
                    bgcolor: alpha(theme.palette.background.default, 0.4),
                  }}
                >
                  {TASK_ICONS[t.status] || (
                    <AppIcon
                      name="RadioButtonUnchecked"
                      fallback={RadioButtonUncheckedIcon}
                      sx={{ fontSize: 14, color: 'text.disabled' }}
                    />
                  )}
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: '0.68rem',
                      flex: 1,
                      color: t.status === 'done' ? 'text.secondary' : 'text.primary',
                    }}
                    noWrap
                  >
                    {t.title}
                  </Typography>
                  {t.assigned_to && (
                    <Typography
                      variant="caption"
                      sx={{ fontSize: '0.58rem', color: 'text.disabled' }}
                      noWrap
                    >
                      {t.assigned_to}
                    </Typography>
                  )}
                  <Chip
                    label={t.status || 'planned'}
                    size="small"
                    color={tStatusColor}
                    variant="outlined"
                    sx={{ height: 16, fontSize: '0.5rem', textTransform: 'capitalize' }}
                  />
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
      {phaseTasks.length === 0 && phase.jobs?.length > 0 && (
        <Box>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: '0.7rem',
              color: 'text.secondary',
              display: 'block',
              mb: 1,
            }}
          >
            Planned Jobs ({phase.jobs.length})
          </Typography>
          {phase.jobs.map((j, i) => (
            <Box
              key={i}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                py: 0.4,
                borderBottom: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.1),
              }}
            >
              <AppIcon
                name="Schedule"
                fallback={ScheduleIcon}
                sx={{ fontSize: 13, color: 'text.disabled' }}
              />
              <Typography variant="caption" sx={{ fontSize: '0.68rem', flex: 1 }} noWrap>
                {j.title}
              </Typography>
              {j.required_role && (
                <Typography variant="caption" sx={{ fontSize: '0.58rem', color: 'text.disabled' }}>
                  {j.required_role}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}
    </FormDialog>
  );
}

// --- Tasks Section ---
function TasksSection({ tasks, goal, theme, onTaskClick }) {
  const phases = goal?.plan?.phases || [];
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Group tasks by phase_index
  const tasksByPhase = {};
  for (const t of tasks) {
    const pi = t.data?.phase_index ?? -1;
    if (!tasksByPhase[pi]) tasksByPhase[pi] = [];
    tasksByPhase[pi].push(t);
  }

  // If no actual tasks exist yet, show planned jobs from the PM plan as preview
  if (!totalTasks && phases.length > 0) {
    const planJobs = phases.flatMap((p) => p.jobs || []);
    if (planJobs.length > 0) {
      return (
        <Box>
          <Typography
            variant="caption"
            sx={{ fontSize: '0.6rem', color: 'text.disabled', mb: 0.5, display: 'block' }}
          >
            From PM plan — tasks will be assigned after team formation
          </Typography>
          {phases.map((phase, i) => (
            <Box key={i} sx={{ mb: 1 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, fontSize: '0.65rem', color: 'text.secondary' }}
              >
                Phase {i + 1}: {phase.name}
              </Typography>
              {(phase.jobs || []).map((job, j) => (
                <Box
                  key={j}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1, py: 0.15 }}
                >
                  <AppIcon
                    name="Schedule"
                    fallback={ScheduleIcon}
                    sx={{ fontSize: 14, color: 'text.disabled' }}
                  />
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.65rem', flex: 1, color: 'text.disabled' }}
                    noWrap
                  >
                    {job.title}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.55rem', color: 'text.disabled' }}
                  >
                    {job.required_role || 'general'}
                  </Typography>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      );
    }
    return (
      <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
        No tasks yet
      </Typography>
    );
  }

  if (!totalTasks) {
    return (
      <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
        No tasks yet
      </Typography>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <LinearProgress
          variant="determinate"
          value={pct}
          color={pct === 100 ? 'success' : 'info'}
          sx={{ flex: 1, height: 6, borderRadius: 3 }}
        />
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.65rem',
            fontWeight: 700,
            color: pct === 100 ? 'success.main' : 'text.secondary',
          }}
        >
          {pct}%
        </Typography>
      </Box>
      {phases.map((phase, i) => {
        const phaseTasks = tasksByPhase[i] || [];
        if (!phaseTasks.length) return null;
        const phaseDone = phaseTasks.filter((t) => t.status === 'done').length;
        return (
          <Box key={i} sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.65rem',
                  color: phaseDone === phaseTasks.length ? 'success.main' : 'text.secondary',
                }}
              >
                Phase {i + 1}: {phase.name}
              </Typography>
              <Chip
                label={`${phaseDone}/${phaseTasks.length}`}
                size="small"
                color={phaseDone === phaseTasks.length ? 'success' : 'default'}
                variant="outlined"
                sx={{ height: 16, fontSize: '0.5rem', fontWeight: 700 }}
              />
            </Box>
            {phaseTasks.map((t) => (
              <Paper
                key={t.id}
                variant="outlined"
                onClick={() => onTaskClick?.(t)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  ml: 1,
                  my: 0.5,
                  py: 0.6,
                  px: 1,
                  borderRadius: 2,
                  cursor: onTaskClick ? 'pointer' : 'default',
                  borderLeft: '3px solid',
                  borderLeftColor:
                    t.status === 'done'
                      ? 'success.main'
                      : t.status === 'inProgress'
                        ? 'info.main'
                        : t.status === 'failed'
                          ? 'error.main'
                          : alpha(theme.palette.text.disabled, 0.3),
                  transition: 'all 0.15s',
                  '&:hover': onTaskClick
                    ? {
                        bgcolor: alpha(theme.palette.primary.main, 0.04),
                        borderColor: alpha(theme.palette.primary.main, 0.3),
                        transform: 'translateX(2px)',
                        '& .task-arrow': { opacity: 1 },
                      }
                    : {},
                }}
              >
                {TASK_ICONS[t.status] || (
                  <AppIcon
                    name="RadioButtonUnchecked"
                    fallback={RadioButtonUncheckedIcon}
                    sx={{ fontSize: 14, color: 'text.disabled' }}
                  />
                )}
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: '0.65rem',
                    flex: 1,
                    fontWeight: 600,
                    color: t.status === 'done' ? 'text.secondary' : 'text.primary',
                  }}
                  noWrap
                >
                  {t.title}
                </Typography>
                {t.estimate && (
                  <Chip
                    size="small"
                    label={t.estimate}
                    variant="outlined"
                    sx={{ fontSize: '0.5rem', height: 16, fontWeight: 600 }}
                  />
                )}
                {t.assigned_to && (
                  <Chip
                    size="small"
                    label={t.assigned_to}
                    variant="outlined"
                    color="info"
                    sx={{ fontSize: '0.5rem', height: 16, maxWidth: 100 }}
                  />
                )}
                {t.data?.llmModel && (
                  <Chip
                    size="small"
                    label={t.data.llmModel}
                    variant="outlined"
                    sx={{
                      fontSize: '0.45rem',
                      height: 14,
                      color: 'text.disabled',
                      borderColor: 'divider',
                    }}
                  />
                )}
                <AppIcon
                  name="KeyboardArrowDown"
                  fallback={KeyboardArrowDownIcon}
                  className="task-arrow"
                  sx={{
                    fontSize: 13,
                    color: 'text.disabled',
                    opacity: 0,
                    transform: 'rotate(-90deg)',
                    transition: '0.15s',
                  }}
                />
              </Paper>
            ))}
          </Box>
        );
      })}
      {/* Unphased tasks */}
      {(tasksByPhase[-1] || []).length > 0 && (
        <Box sx={{ mb: 1 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, fontSize: '0.65rem', color: 'text.disabled' }}
          >
            Other
          </Typography>
          {tasksByPhase[-1].map((t) => (
            <Box
              key={t.id}
              onClick={() => onTaskClick?.(t)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                ml: 1,
                py: 0.25,
                px: 0.5,
                borderRadius: 1,
                cursor: onTaskClick ? 'pointer' : 'default',
                '&:hover': onTaskClick ? { bgcolor: alpha(theme.palette.action.hover, 0.06) } : {},
              }}
            >
              {TASK_ICONS[t.status] || (
                <AppIcon
                  name="RadioButtonUnchecked"
                  fallback={RadioButtonUncheckedIcon}
                  sx={{ fontSize: 14, color: 'text.disabled' }}
                />
              )}
              <Typography variant="caption" sx={{ fontSize: '0.65rem', flex: 1 }} noWrap>
                {t.title}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// --- Workflow Section ---
function WorkflowSection({ goal, tasks, theme, onPhaseClick }) {
  const phases = goal?.plan?.phases || [];
  const [wfName, setWfName] = useState(null);

  // Load workflow name if linked
  useEffect(() => {
    if (!goal?.workflow_id || !hasSupabase()) return;
    supabase
      .from('workflows')
      .select('name')
      .eq('id', goal.workflow_id)
      .single()
      .then(({ data }) => setWfName(data?.name || null))
      .catch(() => {});
  }, [goal?.workflow_id]);

  if (!phases.length && !goal?.workflow_id) {
    return (
      <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
        No workflow yet
      </Typography>
    );
  }

  // Group tasks by phase_index for the detail dialog
  const tasksByPhase = {};
  for (const t of tasks || []) {
    const pi = t.data?.phase_index ?? -1;
    if (!tasksByPhase[pi]) tasksByPhase[pi] = [];
    tasksByPhase[pi].push(t);
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      {phases.map((phase, i) => {
        const statusColor =
          phase.status === 'completed'
            ? 'success'
            : phase.status === 'executing'
              ? 'info'
              : phase.status === 'failed'
                ? 'error'
                : 'default';
        const icon =
          phase.status === 'completed' ? (
            <AppIcon
              name="CheckCircle"
              fallback={CheckCircleIcon}
              sx={{ fontSize: 14, color: 'success.main' }}
            />
          ) : phase.status === 'executing' ? (
            <AppIcon
              name="HourglassTop"
              fallback={HourglassTopIcon}
              sx={{ fontSize: 14, color: 'info.main' }}
            />
          ) : phase.status === 'failed' ? (
            <AppIcon
              name="ErrorOutline"
              fallback={ErrorOutlineIcon}
              sx={{ fontSize: 14, color: 'error.main' }}
            />
          ) : (
            <AppIcon
              name="RadioButtonUnchecked"
              fallback={RadioButtonUncheckedIcon}
              sx={{ fontSize: 14, color: 'text.disabled' }}
            />
          );
        const phaseTasks = tasksByPhase[i] || [];
        return (
          <Box
            key={i}
            onClick={() => onPhaseClick?.(phase, i, phaseTasks)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              py: 0.4,
              px: 0.5,
              borderRadius: 1,
              cursor: onPhaseClick ? 'pointer' : 'default',
              '&:hover': onPhaseClick ? { bgcolor: alpha(theme.palette.action.hover, 0.06) } : {},
              transition: 'background 0.15s',
            }}
          >
            {icon}
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.68rem',
                flex: 1,
                fontWeight: phase.status === 'executing' ? 700 : 400,
              }}
            >
              {phase.name}
            </Typography>
            {phase.quality_score != null && (
              <Chip
                label={`${phase.quality_score}/100`}
                size="small"
                color={
                  phase.quality_score >= 70
                    ? 'success'
                    : phase.quality_score >= 40
                      ? 'warning'
                      : 'error'
                }
                variant="outlined"
                sx={{ height: 16, fontSize: '0.5rem', fontWeight: 700 }}
              />
            )}
            {(() => {
              const phaseCost =
                goal.data?.phase_costs?.[i]?.total ||
                goal.phaseBudget?.find((p) => p.phaseIndex === i)?.cost;
              return phaseCost > 0 ? (
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.5rem', color: 'text.disabled', fontWeight: 600 }}
                >
                  ${phaseCost.toFixed(4)}
                </Typography>
              ) : null;
            })()}
            <Chip
              label={phase.status || 'pending'}
              size="small"
              color={statusColor}
              variant="outlined"
              sx={{ height: 16, fontSize: '0.5rem', fontWeight: 600, textTransform: 'capitalize' }}
            />
            {onPhaseClick && (
              <AppIcon
                name="KeyboardArrowDown"
                fallback={KeyboardArrowDownIcon}
                sx={{ fontSize: 13, color: 'text.disabled', transform: 'rotate(-90deg)' }}
              />
            )}
          </Box>
        );
      })}
      {goal.workflow_id && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            mt: 0.75,
            p: 0.75,
            borderRadius: 1.5,
            bgcolor: alpha(theme.palette.info.main, 0.06),
            border: '1px solid',
            borderColor: alpha(theme.palette.info.main, 0.15),
          }}
        >
          <GlassIcon name="AccountTreeOutlined" size={14} tone="info" />
          <Typography
            variant="caption"
            sx={{ fontSize: '0.65rem', fontWeight: 600, flex: 1, color: 'info.main' }}
          >
            Linked: {wfName || 'Workflow'}
          </Typography>
          <Chip
            label="Open Editor"
            size="small"
            icon={<GlassIcon name="OpenInNew" size={12} tone="info" />}
            onClick={() => {
              window.location.href = '/workflow';
            }}
            variant="outlined"
            color="info"
            sx={{ height: 20, fontSize: '0.55rem', cursor: 'pointer' }}
          />
        </Box>
      )}
    </Box>
  );
}

// --- Project Section ---
function ProjectSection({ goal, theme }) {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!goal?.project_id || !hasSupabase()) return;
    setLoading(true);
    supabase
      .from('projects')
      .select(
        'id, name, status, category, partner_id, workflow_id, campaign_id, data, created_at, updated_at'
      )
      .eq('id', goal.project_id)
      .single()
      .then(({ data }) => setProject(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [goal?.project_id]);

  if (!goal?.project_id) {
    return (
      <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
        No project linked yet
      </Typography>
    );
  }

  if (loading) return <LinearProgress sx={{ borderRadius: 2 }} />;

  const STATUS_COLOR = {
    Active: 'success',
    Paused: 'warning',
    Completed: 'info',
    Archived: 'default',
  };
  const p = project || {};
  const fieldStyle = {
    fontSize: '0.6rem',
    fontWeight: 600,
    color: 'text.disabled',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    mb: 0.25,
  };
  const valStyle = { fontSize: '0.72rem', fontWeight: 500 };

  return (
    <>
      <Paper
        variant="outlined"
        onClick={() => setDialogOpen(true)}
        sx={{
          p: 1.5,
          borderRadius: 2,
          cursor: 'pointer',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          '&:hover': { borderColor: 'primary.main', boxShadow: createHoverGlowShadow(theme) },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.primary.main, 0.12),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GlassIcon name="FolderOutlined" size={16} tone="brand" />
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, fontSize: '0.8rem' }} noWrap>
            {p.name || goal.title}
          </Typography>
          <Chip
            label={p.status || 'Active'}
            size="small"
            color={STATUS_COLOR[p.status] || 'default'}
            variant="outlined"
            sx={{ height: 20, fontSize: '0.6rem', fontWeight: 600 }}
          />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
          <Box>
            <Typography sx={fieldStyle}>Category</Typography>
            <Typography sx={valStyle}>{p.category || '—'}</Typography>
          </Box>
          <Box>
            <Typography sx={fieldStyle}>Created</Typography>
            <Typography sx={valStyle}>
              {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Project Detail Dialog */}
      <FormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={p.name || goal.title}
        icon={FolderOutlinedIcon}
        maxWidth="sm"
        titleAdornment={
          <Chip
            label={p.status || 'Active'}
            size="small"
            color={STATUS_COLOR[p.status] || 'default'}
            sx={{ fontWeight: 600 }}
          />
        }
        contentDividers={false}
        actions={
          <>
            <Button
              onClick={() => {
                window.location.href = '/projects';
              }}
              variant="outlined"
              size="small"
              sx={{ borderRadius: 2, textTransform: 'none' }}
            >
              Open in Projects
            </Button>
            <Button
              onClick={() => setDialogOpen(false)}
              variant="contained"
              size="small"
              sx={{ borderRadius: 2, textTransform: 'none' }}
            >
              Close
            </Button>
          </>
        }
      >
        <Box
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 1 }}
        >
          <Box>
            <Typography sx={fieldStyle}>Category</Typography>
            <Typography sx={valStyle}>{p.category || '—'}</Typography>
          </Box>
          <Box>
            <Typography sx={fieldStyle}>Status</Typography>
            <Typography sx={valStyle}>{p.status || 'Active'}</Typography>
          </Box>
          <Box>
            <Typography sx={fieldStyle}>Partner</Typography>
            <Typography sx={valStyle}>{p.partner_id || '—'}</Typography>
          </Box>
          <Box>
            <Typography sx={fieldStyle}>Workflow</Typography>
            <Typography sx={valStyle}>{p.workflow_id || '—'}</Typography>
          </Box>
          <Box>
            <Typography sx={fieldStyle}>Campaign</Typography>
            <Typography sx={valStyle}>{p.campaign_id || '—'}</Typography>
          </Box>
          <Box>
            <Typography sx={fieldStyle}>Created</Typography>
            <Typography sx={valStyle}>
              {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}
            </Typography>
          </Box>
          <Box>
            <Typography sx={fieldStyle}>Updated</Typography>
            <Typography sx={valStyle}>
              {p.updated_at ? new Date(p.updated_at).toLocaleString() : '—'}
            </Typography>
          </Box>
          <Box>
            <Typography sx={fieldStyle}>Goal</Typography>
            <Typography sx={valStyle}>{goal.title}</Typography>
          </Box>
        </Box>
      </FormDialog>
    </>
  );
}

// --- Agent Communications Section ---
function AgentCommsSection({ messages, theme }) {
  const [showAll, setShowAll] = useState(false);
  const [expandedMsg, setExpandedMsg] = useState(null);
  const sorted = [...messages].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const displayed = showAll ? sorted : sorted.slice(0, 5);

  if (!messages.length) {
    return (
      <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
        No agent messages yet
      </Typography>
    );
  }

  return (
    <Box>
      {displayed.map((msg) => (
        <Box key={msg.id}>
          <Box
            onClick={() => setExpandedMsg(expandedMsg === msg.id ? null : msg.id)}
            sx={{
              display: 'flex',
              gap: 0.75,
              py: 0.4,
              borderBottom: '1px solid',
              borderColor: alpha(theme.palette.divider, 0.1),
              cursor: 'pointer',
              borderRadius: 0.5,
              px: 0.25,
              '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.04) },
            }}
          >
            <Box
              sx={{
                width: 3,
                borderRadius: 1,
                bgcolor: MSG_COLORS[msg.message_type] || 'text.disabled',
                flexShrink: 0,
              }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.6rem',
                    color: MSG_COLORS[msg.message_type] || 'text.secondary',
                  }}
                >
                  {msg.sender_name || 'System'}
                </Typography>
                {(msg.channel || msg.team_id) && (
                  <Chip
                    label={msg.channel || 'team'}
                    size="small"
                    variant="outlined"
                    sx={{ height: 14, fontSize: '0.48rem' }}
                  />
                )}
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.5rem', color: 'text.disabled', ml: 'auto' }}
                >
                  {timeAgo(msg.created_at)}
                </Typography>
              </Box>
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.62rem',
                  color: 'text.secondary',
                  lineHeight: 1.3,
                  display: 'block',
                }}
                noWrap={expandedMsg !== msg.id}
              >
                {msg.message}
              </Typography>
            </Box>
          </Box>
          {expandedMsg === msg.id && msg.message?.length > 80 && (
            <Paper
              elevation={0}
              sx={{
                ml: 1.5,
                mt: 0.25,
                mb: 0.5,
                p: 1,
                bgcolor: alpha(theme.palette.background.default, 0.5),
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontSize: '0.65rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}
              >
                {msg.message}
              </Typography>
            </Paper>
          )}
        </Box>
      ))}
      {sorted.length > 5 && (
        <Typography
          variant="caption"
          onClick={() => setShowAll(!showAll)}
          sx={{
            fontSize: '0.6rem',
            color: 'info.main',
            cursor: 'pointer',
            mt: 0.5,
            display: 'block',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {showAll ? 'Show less' : `Show all ${sorted.length} messages`}
        </Typography>
      )}
    </Box>
  );
}

// --- Budget Requests Section ---
const CATEGORY_LABELS = {
  ad_spend: 'Ads',
  service_cost: 'Service',
  tool_license: 'Tool',
  infrastructure: 'Infra',
  operational: 'Ops',
  other: 'Other',
};

function BudgetRequestsSection({ budgetRequests, onReview, theme }) {
  if (!budgetRequests.length) {
    return (
      <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
        No budget requests for this goal
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {budgetRequests.map((req) => {
        const isPending = req.status === 'pending';
        const statusColor =
          req.status === 'approved' ? 'success' : req.status === 'rejected' ? 'error' : 'warning';
        return (
          <Box
            key={req.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              py: 0.5,
              px: 0.75,
              borderRadius: 1,
              border: '1px solid',
              borderColor: alpha(theme.palette[statusColor].main, 0.2),
              bgcolor: alpha(theme.palette[statusColor].main, 0.04),
            }}
          >
            <GlassIcon name="RequestQuoteOutlined" size={16} tone="warning" />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>
                  ${Number(req.amount_usd).toFixed(2)}
                </Typography>
                <Chip
                  label={CATEGORY_LABELS[req.category] || req.category}
                  size="small"
                  variant="outlined"
                  sx={{ height: 16, fontSize: '0.5rem' }}
                />
                {req.agent_name && (
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.55rem', color: 'text.disabled' }}
                  >
                    by {req.agent_name}
                  </Typography>
                )}
              </Box>
              <Typography
                variant="caption"
                sx={{ fontSize: '0.6rem', color: 'text.secondary', display: 'block' }}
                noWrap
              >
                {req.purpose}
              </Typography>
            </Box>
            <Typography
              variant="caption"
              sx={{ fontSize: '0.5rem', color: 'text.disabled', whiteSpace: 'nowrap' }}
            >
              {timeAgo(req.created_at)}
            </Typography>
            {isPending && onReview && (
              <Box sx={{ display: 'flex', gap: 0.25 }}>
                <Tooltip title="Approve">
                  <IconButton
                    size="small"
                    color="success"
                    onClick={() => onReview(req.id, 'approve')}
                    sx={{ p: 0.25 }}
                  >
                    <GlassIcon name="CheckCircleOutline" size={14} tone="success" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Reject">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => onReview(req.id, 'reject')}
                    sx={{ p: 0.25 }}
                  >
                    <GlassIcon name="Close" size={14} tone="error" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
            {!isPending && (
              <Chip
                label={req.status}
                size="small"
                color={statusColor}
                variant="outlined"
                sx={{
                  height: 16,
                  fontSize: '0.5rem',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

// --- Main Component ---
export default function GoalWorkLog({
  goal,
  tasks = [],
  documents = [],
  messages = [],
  logs = [],
  compact = false,
  profileIndex = null,
}) {
  const theme = useTheme();
  const [budgetRequests, setBudgetRequests] = useState([]);
  const currentTasks = currentGoalTaskAttempt(goal, tasks);
  const currentDocuments = currentGoalDocuments(goal, documents);

  // Task detail dialog state
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

  // Phase detail dialog state
  const [selectedPhase, setSelectedPhase] = useState(null);
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(null);
  const [selectedPhaseTasks, setSelectedPhaseTasks] = useState([]);
  const [phaseDialogOpen, setPhaseDialogOpen] = useState(false);

  // Load budget requests for this goal
  useEffect(() => {
    if (!goal?.id) return;
    listBudgetRequests(goal.id)
      .then((data) => setBudgetRequests(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [goal?.id]);

  const handleReviewBudgetRequest = async (id, action) => {
    try {
      await reviewBudgetRequest(id, action);
      setBudgetRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: action === 'approve' ? 'approved' : 'rejected',
                reviewed_at: new Date().toISOString(),
              }
            : r
        )
      );
    } catch (err) {
      console.error('Budget review failed:', err);
    }
  };

  const handleTaskClick = (task) => {
    setSelectedTask(task);
    setTaskDialogOpen(true);
  };

  const handlePhaseClick = (phase, phaseIndex, phaseTasks) => {
    setSelectedPhase(phase);
    setSelectedPhaseIndex(phaseIndex);
    setSelectedPhaseTasks(phaseTasks);
    setPhaseDialogOpen(true);
  };

  if (!goal) return null;

  // Enrich documents with virtual PO Tech Doc and PM Plan from goal data
  const enrichedDocuments = [...currentDocuments];
  const hasPoTechDoc = currentDocuments.some((d) => d.category === 'po-tech-doc');
  const hasPmPlan = currentDocuments.some(
    (d) => d.category === 'pm-plan' || d.category === 'goal-plan'
  );

  // Add Feasibility Analysis report
  const hasFeasibility = currentDocuments.some((d) => d.category === 'feasibility');
  if (
    !hasFeasibility &&
    goal.feasibility_report &&
    Object.keys(goal.feasibility_report).length > 0
  ) {
    const fr = goal.feasibility_report;
    const complexity = ((fr.complexity_score || 0) * 100).toFixed(0);
    const success = ((fr.feasibility?.success_probability || 0) * 100).toFixed(0);
    const content = [
      `# Feasibility Analysis Report\n`,
      `**Recommendation:** ${fr.recommendation || 'N/A'} — ${fr.recommendation_reason || ''}\n`,
      `**Complexity Score:** ${complexity}%`,
      `**Success Probability:** ${success}%`,
      fr.profitability?.revenue_potential
        ? `**Revenue Potential:** ${fr.profitability.revenue_potential}`
        : '',
      fr.profitability?.estimated_token_cost
        ? `**Estimated AI Cost:** $${fr.profitability.estimated_token_cost}`
        : '',
      fr.feasibility?.risk_factors?.length
        ? `\n## Risk Factors\n${fr.feasibility.risk_factors.map((f) => `- ${f}`).join('\n')}`
        : '',
      fr.feasibility?.competitive_analysis
        ? `\n## Competitive Analysis\n${fr.feasibility.competitive_analysis}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    enrichedDocuments.unshift({
      id: 'virtual-feasibility',
      title: 'Feasibility Analysis Report',
      category: 'feasibility',
      content,
      created_at: goal.created_at,
    });
  }

  if (!hasPoTechDoc && goal.tech_doc && Object.keys(goal.tech_doc).length > 0) {
    enrichedDocuments.unshift({
      id: 'virtual-po-tech-doc',
      title: 'PO Technical Document',
      category: 'po-tech-doc',
      content: formatTechDoc(goal.tech_doc),
      created_at: goal.updated_at || goal.created_at,
    });
  }
  if (!hasPmPlan && goal.plan && Object.keys(goal.plan).length > 0) {
    enrichedDocuments.unshift({
      id: 'virtual-pm-plan',
      title: 'PM Planning Document',
      category: 'pm-plan',
      content: formatPlan(goal.plan),
      created_at: goal.updated_at || goal.created_at,
    });
  }

  // Add Proposal/Estimates doc if available
  const hasProposal = currentDocuments.some((d) => d.category === 'proposal');
  if (!hasProposal && goal.proposal && Object.keys(goal.proposal).length > 0) {
    const pr = goal.proposal;
    const est = pr.estimates || {};
    const content = [
      `# Project Proposal & Estimates\n`,
      `**Estimated Time:** ${est.total_estimated_time_minutes || '?'} minutes`,
      `**Estimated Cost:** $${(est.total_estimated_cost_usd || 0).toFixed(4)}`,
      `**Confidence Score:** ${est.confidence_score || '?'}/100`,
      est.per_phase_breakdown?.length
        ? `\n## Per-Phase Breakdown\n${est.per_phase_breakdown.map((p) => `- **${p.phase}:** ~${p.time_minutes}m, $${(p.cost || 0).toFixed(4)}`).join('\n')}`
        : '',
      pr.total_cost
        ? `\n## Total Cost Breakdown\nTokens: $${(pr.total_cost.tokens || 0).toFixed(4)}\nServices: $${(pr.total_cost.services || 0).toFixed(4)}\nPipeline overhead: $${(pr.total_cost.pipeline_overhead || 0).toFixed(4)}\n**Total: $${(pr.total_cost.total || 0).toFixed(4)}**`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    enrichedDocuments.unshift({
      id: 'virtual-proposal',
      title: 'Project Proposal & Estimates',
      category: 'proposal',
      content,
      created_at: goal.updated_at || goal.created_at,
    });
  }

  const totalTasks = currentTasks.length;
  const doneTasks = currentTasks.filter((t) => t.status === 'done').length;
  const phases = goal?.plan?.phases || [];
  const activePhase = phases.findIndex((p) => p.status === 'executing');
  const completedPhases = phases.filter((p) => p.status === 'completed').length;
  const pendingBR = budgetRequests.filter((r) => r.status === 'pending').length;

  const accordionSx = {
    '&:before': { display: 'none' },
    borderRadius: '8px !important',
    border: '1px solid',
    borderColor: alpha(theme.palette.divider, 0.2),
    mb: 0.75,
    '&.Mui-expanded': { mb: 0.75 },
    bgcolor: 'transparent',
    boxShadow: 'none',
  };

  const sections = [
    {
      id: 'kb',
      icon: <GlassIcon name="Description" size={16} tone="info" />,
      title: 'Knowledge Base',
      badge: enrichedDocuments.length > 0 ? `${enrichedDocuments.length} docs` : null,
      badgeColor: 'info',
      defaultExpanded: true,
      content: <KBSection documents={enrichedDocuments} theme={theme} />,
    },
    {
      id: 'tasks',
      icon: (
        <GlassIcon
          name="AssignmentOutlined"
          size={16}
          tone={totalTasks > 0 && doneTasks === totalTasks ? 'success' : 'warning'}
        />
      ),
      title: 'Tasks',
      badge: totalTasks > 0 ? `${doneTasks}/${totalTasks}` : null,
      badgeColor: doneTasks === totalTasks && totalTasks > 0 ? 'success' : 'default',
      defaultExpanded: true,
      content: (
        <TasksSection
          tasks={currentTasks}
          goal={goal}
          theme={theme}
          onTaskClick={handleTaskClick}
        />
      ),
    },
    {
      id: 'workflow',
      icon: (
        <GlassIcon
          name="AccountTreeOutlined"
          size={16}
          tone={activePhase >= 0 ? 'info' : completedPhases > 0 ? 'success' : 'neutral'}
        />
      ),
      title: 'Workflow',
      badge:
        phases.length > 0
          ? activePhase >= 0
            ? `Phase ${activePhase + 1}/${phases.length}`
            : `${completedPhases}/${phases.length}`
          : null,
      badgeColor: completedPhases === phases.length && phases.length > 0 ? 'success' : 'default',
      defaultExpanded: false,
      content: (
        <WorkflowSection
          goal={goal}
          tasks={currentTasks}
          theme={theme}
          onPhaseClick={handlePhaseClick}
        />
      ),
    },
    {
      id: 'project',
      icon: (
        <GlassIcon name="FolderOutlined" size={16} tone={goal.project_id ? 'success' : 'neutral'} />
      ),
      title: 'Project',
      badge: goal.project_id ? 'Linked' : null,
      badgeColor: 'success',
      defaultExpanded: false,
      content: <ProjectSection goal={goal} theme={theme} />,
    },
    {
      id: 'budget',
      icon: (
        <GlassIcon
          name="RequestQuoteOutlined"
          size={16}
          tone={pendingBR > 0 ? 'warning' : budgetRequests.length > 0 ? 'success' : 'neutral'}
        />
      ),
      title: 'Budget Requests',
      badge:
        pendingBR > 0
          ? `${pendingBR} pending`
          : budgetRequests.length > 0
            ? `${budgetRequests.length}`
            : null,
      badgeColor: pendingBR > 0 ? 'warning' : 'default',
      defaultExpanded: pendingBR > 0,
      content: (
        <BudgetRequestsSection
          budgetRequests={budgetRequests}
          onReview={handleReviewBudgetRequest}
          theme={theme}
        />
      ),
    },
    {
      id: 'deliverables',
      icon: (
        <GlassIcon
          name="InventoryOutlined"
          size={16}
          tone={(goal.data?.deliverables?.length || 0) > 0 ? 'success' : 'neutral'}
        />
      ),
      title: 'Deliverables',
      badge:
        (goal.data?.deliverables?.length || 0) > 0
          ? `${goal.data.deliverables.length} outputs`
          : null,
      badgeColor: 'success',
      defaultExpanded: (goal.data?.deliverables?.length || 0) > 0,
      content:
        (goal.data?.deliverables?.length || 0) > 0 ? (
          <GoalDeliverables deliverables={goal.data.deliverables} compact goalId={goal.id} />
        ) : (
          <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
            No deliverables yet — outputs appear as phases complete.
          </Typography>
        ),
    },
    {
      id: 'comms',
      icon: (
        <GlassIcon name="SmartToy" size={16} tone={messages.length > 0 ? 'brand' : 'neutral'} />
      ),
      title: 'Agent Communications',
      badge: messages.length > 0 ? `${messages.length} msgs` : null,
      badgeColor: 'secondary',
      defaultExpanded: messages.length > 0,
      content: <AgentCommsSection messages={messages} theme={theme} />,
    },
  ];

  return (
    <>
      <Paper
        elevation={0}
        sx={{ p: compact ? 1.5 : 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
      >
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 700,
            fontSize: '0.82rem',
            mb: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
          }}
        >
          Work Log
          {totalTasks > 0 && (
            <Chip
              label={`${doneTasks}/${totalTasks} tasks`}
              size="small"
              color={doneTasks === totalTasks ? 'success' : 'default'}
              variant="outlined"
              sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700 }}
            />
          )}
          {enrichedDocuments.length > 0 && (
            <Chip
              label={`${enrichedDocuments.length} docs`}
              size="small"
              color="info"
              variant="outlined"
              sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700 }}
            />
          )}
        </Typography>

        {sections.map((section) => (
          <Accordion
            key={section.id}
            defaultExpanded={section.defaultExpanded}
            disableGutters
            sx={accordionSx}
          >
            <AccordionSummary
              expandIcon={<GlassIcon name="ExpandMore" size={16} tone="neutral" />}
              sx={{ minHeight: 36, '&.Mui-expanded': { minHeight: 36 }, px: 1.5, py: 0 }}
            >
              <SectionHeader
                icon={section.icon}
                title={section.title}
                badge={section.badge}
                badgeColor={section.badgeColor}
              />
            </AccordionSummary>
            <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1 }}>{section.content}</AccordionDetails>
          </Accordion>
        ))}
      </Paper>

      {/* Task Detail Dialog */}
      <TaskDetailDialog
        task={selectedTask}
        open={taskDialogOpen}
        onClose={() => setTaskDialogOpen(false)}
        theme={theme}
        profileIndex={profileIndex}
      />

      {/* Phase Detail Dialog */}
      <PhaseDetailDialog
        phase={selectedPhase}
        phaseIndex={selectedPhaseIndex}
        phaseTasks={selectedPhaseTasks}
        open={phaseDialogOpen}
        onClose={() => setPhaseDialogOpen(false)}
        goal={goal}
        theme={theme}
      />
    </>
  );
}
