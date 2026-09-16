import { useState } from 'react';
import { Box, Typography, Chip, Collapse, IconButton, useTheme, alpha } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { currentGoalTaskAttempt } from './currentGoalTaskAttempt';

import AppIcon from '../icons/AppIcon';

const STATUS_CONFIG = {
  done: { icon: TaskAltIcon, color: 'success.main', label: 'Done' },
  inProgress: { icon: HourglassEmptyIcon, color: 'info.main', label: 'Running' },
  todo: { icon: RadioButtonUncheckedIcon, color: 'text.disabled', label: 'Pending' },
  failed: { icon: ErrorOutlineIcon, color: 'error.main', label: 'Failed' },
  cancelled: { icon: ErrorOutlineIcon, color: 'text.disabled', label: 'Cancelled' },
};

export default function GoalTaskList({ tasks = [], goal, compact = false }) {
  const theme = useTheme();
  const [expandedTask, setExpandedTask] = useState(null);
  const currentTasks = currentGoalTaskAttempt(goal, tasks);

  if (currentTasks.length === 0) {
    return (
      <Box sx={{ py: 2, textAlign: 'center' }}>
        <AppIcon
          name="TaskAlt"
          fallback={TaskAltIcon}
          sx={{ fontSize: 28, color: 'text.disabled', mb: 0.5 }}
        />
        <Typography
          variant="caption"
          sx={{ color: 'text.disabled', display: 'block', fontSize: '0.68rem' }}
        >
          No tasks yet
        </Typography>
      </Box>
    );
  }

  // Group by phase
  const phases = goal?.plan?.phases || [];
  const grouped = {};
  for (const task of currentTasks) {
    const phaseIdx = task.data?.phase_index ?? 0;
    if (!grouped[phaseIdx]) grouped[phaseIdx] = [];
    grouped[phaseIdx].push(task);
  }

  const phaseIndices = Object.keys(grouped).map(Number).sort();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: compact ? 0.5 : 1 }}>
      {phaseIndices.map((phaseIdx) => {
        const phaseTasks = grouped[phaseIdx];
        const phase = phases[phaseIdx];
        const doneCount = phaseTasks.filter((t) => t.status === 'done').length;

        return (
          <Box key={phaseIdx}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  fontSize: compact ? '0.6rem' : '0.7rem',
                  color: 'text.secondary',
                }}
              >
                Phase {phaseIdx + 1}
                {phase ? `: ${phase.name}` : ''}
              </Typography>
              <Chip
                label={`${doneCount}/${phaseTasks.length}`}
                size="small"
                sx={{ fontSize: '0.5rem', height: 16 }}
                color={doneCount === phaseTasks.length ? 'success' : 'default'}
              />
            </Box>
            {phaseTasks.map((task) => {
              const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;
              const Icon = cfg.icon;
              const hasOutput = task.data?.output;
              const isExpanded = expandedTask === task.id;

              return (
                <Box key={task.id} sx={{ mb: 0.25 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      p: compact ? 0.5 : 0.75,
                      borderRadius: 1,
                      bgcolor: alpha(theme.palette.action.hover, 0.3),
                    }}
                  >
                    <AppIcon
                      fallback={Icon}
                      sx={{ fontSize: 14, color: cfg.color, flexShrink: 0 }}
                    />
                    <Typography
                      variant="caption"
                      sx={{ fontSize: compact ? '0.58rem' : '0.68rem', flex: 1 }}
                      noWrap
                    >
                      {task.title}
                    </Typography>
                    {task.assigned_to && (
                      <Typography
                        variant="caption"
                        sx={{ fontSize: '0.55rem', color: 'text.disabled' }}
                        noWrap
                      >
                        {task.assigned_to}
                      </Typography>
                    )}
                    {hasOutput && (
                      <IconButton
                        size="small"
                        onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                        sx={{ p: 0.25 }}
                      >
                        {isExpanded ? (
                          <AppIcon
                            name="ExpandLess"
                            fallback={ExpandLessIcon}
                            sx={{ fontSize: 14 }}
                          />
                        ) : (
                          <AppIcon
                            name="ExpandMore"
                            fallback={ExpandMoreIcon}
                            sx={{ fontSize: 14 }}
                          />
                        )}
                      </IconButton>
                    )}
                  </Box>
                  {hasOutput && (
                    <Collapse in={isExpanded}>
                      <Box
                        sx={{
                          p: 1,
                          ml: 2.5,
                          borderLeft: '2px solid',
                          borderColor: 'divider',
                          mt: 0.25,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.62rem',
                            color: 'text.secondary',
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.4,
                          }}
                        >
                          {task.data.output.slice(0, 500)}
                          {task.data.output.length > 500 ? '...' : ''}
                        </Typography>
                      </Box>
                    </Collapse>
                  )}
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}
