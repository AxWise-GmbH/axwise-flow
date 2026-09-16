import { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Card,
  CardContent,
  Chip,
  Divider,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
  Stack,
  useTheme,
  alpha,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import AssignmentIcon from '@mui/icons-material/Assignment';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { TASK_STATUS_LABELS, PRIORITY_COLORS } from '../../../utils/constants';
import { generateId } from '../../../utils/formatters';
import PriorityBarsIcon from '../../../components/Common/PriorityBarsIcon';
import { createHoverGlowShadow } from '../../../theme/hoverGlow';
import FormDialog from '../../../components/Common/FormDialog';

import AppIcon from '../../../components/icons/AppIcon';

const columns = ['todo', 'inProgress', 'done'];

const columnStylesLight = {
  todo: { bg: '#FEF2F2', border: '#FECACA', accent: '#EF4444', label: 'Not Started' },
  inProgress: { bg: '#FFF7ED', border: '#FED7AA', accent: '#F59E0B', label: 'In Progress' },
  done: { bg: '#F0FDF4', border: '#BBF7D0', accent: '#16A34A', label: 'Completed' },
};

// Dark mode - borders and accents; bg set at runtime from theme.palette.background.paper
const columnStylesDark = {
  todo: { border: 'rgba(248, 113, 113, 0.25)', accent: '#F87171', label: 'Not Started' },
  inProgress: { border: 'rgba(251, 191, 36, 0.25)', accent: '#FBBF24', label: 'In Progress' },
  done: { border: 'rgba(74, 222, 128, 0.25)', accent: '#4ADE80', label: 'Completed' },
};

export default function TaskKanban({ open, onClose, partner, onSaveTasks }) {
  const theme = useTheme();
  const [tasks, setTasks] = useState(
    (partner?.tasks || []).map((task) => ({
      ...task,
      taskId: task.taskId || task.id,
      userId: task.userId || partner?.userId || '',
    }))
  );
  const [addingTo, setAddingTo] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [newAssignedTo, setNewAssignedTo] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newDeadline, setNewDeadline] = useState('');
  const [newEstimate, setNewEstimate] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAffiliateNetwork, setNewAffiliateNetwork] = useState('ClickDealer');

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const { source, destination } = result;
    const sourceCol = source.droppableId;
    const destCol = destination.droppableId;

    const updated = [...tasks];
    const taskIndex = updated.findIndex(
      (t) =>
        t.status === sourceCol &&
        tasks.filter((x) => x.status === sourceCol).indexOf(t) === source.index
    );

    // Find the actual task being moved
    const colTasks = updated.filter((t) => t.status === sourceCol);
    const movedTask = colTasks[source.index];
    if (!movedTask) return;

    const movedIdx = updated.indexOf(movedTask);
    updated[movedIdx] = { ...movedTask, status: destCol };
    setTasks(updated);
  };

  const handleAddTask = (column) => {
    if (!newTitle.trim()) return;
    const taskId = generateId('T');
    const task = {
      id: taskId,
      taskId,
      userId: partner.userId,
      title: newTitle.trim(),
      status: column,
      priority: newPriority,
      assignedTo: newAssignedTo.trim(),
      deadline: newDeadline || '',
      estimate: newEstimate.trim(),
      description: newDescription.trim(),
      affiliateNetwork: newAffiliateNetwork,
    };
    setTasks((prev) => [...prev, task]);
    setNewTitle('');
    setNewAssignedTo('');
    setNewPriority('medium');
    setNewDeadline('');
    setNewEstimate('');
    setNewDescription('');
    setNewAffiliateNetwork('ClickDealer');
    setAddingTo(null);
  };

  const handleClose = () => {
    if (onSaveTasks) {
      onSaveTasks(partner.id, tasks);
    }
    setSelectedTask(null);
    onClose();
  };

  const handleTaskFieldChange = (field, value) => {
    setSelectedTask((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSaveTaskChanges = () => {
    if (!selectedTask) return;
    setTasks((prev) =>
      prev.map((task) => (task.id === selectedTask.id ? { ...task, ...selectedTask } : task))
    );
    setSelectedTask(null);
  };

  const handleDeleteTask = async () => {
    if (!selectedTask || !partner) return;
    const taskIdToRemove = selectedTask.id || selectedTask.taskId;
    const idx = tasks.findIndex((t) => t.id === taskIdToRemove || t.taskId === taskIdToRemove);
    if (idx === -1) {
      setSelectedTask(null);
      return;
    }
    const nextTasks = tasks.slice(0, idx).concat(tasks.slice(idx + 1));
    setTasks(nextTasks);
    if (onSaveTasks) await onSaveTasks(partner.id, nextTasks);
    setSelectedTask(null);
  };

  if (!partner) return null;

  const isDark = theme.palette.mode === 'dark';
  const columnStyles = isDark ? columnStylesDark : columnStylesLight;

  return (
    <>
      <FormDialog
        open={open}
        onClose={handleClose}
        title="Task Pipeline"
        subtitle={`${partner.name} · ${tasks.length} tasks`}
        icon={AssignmentIcon}
        maxWidth={false}
        fullWidth
        hideFooter
        paperSx={{
          maxWidth: 1100,
          height: '80vh',
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden',
        }}
        contentDividers={false}
        contentSx={{ p: 2, overflow: 'hidden', pt: 2, px: 2, pb: 2 }}
      >
        <DragDropContext onDragEnd={handleDragEnd}>
          <Box sx={{ display: 'flex', gap: 3, height: '100%', overflow: 'auto', pb: 1 }}>
            {columns.map((col) => {
              const colTasks = tasks.filter((t) => t.status === col);
              const style = columnStyles[col];

              return (
                <Box
                  key={col}
                  sx={{
                    flex: '0 0 340px',
                    bgcolor: isDark ? theme.palette.background.paper : style.bg,
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: style.border,
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                  }}
                >
                  {/* Column header - Not Started / In Progress / Completed + pill count */}
                  <Box
                    sx={{
                      p: 2,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: `1px solid ${style.border}`,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: style.accent }}>
                        {style.label}
                      </Typography>
                      <Chip
                        label={colTasks.length}
                        size="small"
                        sx={{
                          height: 24,
                          fontWeight: 700,
                          borderRadius: 2,
                          bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'background.paper',
                          color: style.accent,
                          border: isDark ? '1px solid rgba(255,255,255,0.08)' : 'none',
                        }}
                      />
                    </Box>
                    <IconButton
                      size="small"
                      onClick={() => setAddingTo(addingTo === col ? null : col)}
                    >
                      <AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Box>
                  {/* Add task form */}
                  {addingTo === col && (
                    <Box sx={{ px: 2, pb: 1 }}>
                      <TextField
                        size="small"
                        fullWidth
                        placeholder="Task title..."
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTask(col)}
                        autoFocus
                        sx={{ mb: 1, '& .MuiInputBase-root': { fontSize: '0.82rem' } }}
                      />
                      <TextField
                        size="small"
                        fullWidth
                        placeholder="Assigned to..."
                        value={newAssignedTo}
                        onChange={(e) => setNewAssignedTo(e.target.value)}
                        sx={{ mb: 1, '& .MuiInputBase-root': { fontSize: '0.82rem' } }}
                      />
                      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        <TextField
                          size="small"
                          type="date"
                          label="Deadline"
                          InputLabelProps={{ shrink: true }}
                          value={newDeadline}
                          onChange={(e) => setNewDeadline(e.target.value)}
                          sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: '0.75rem' } }}
                        />
                        <TextField
                          size="small"
                          placeholder="Estimate (e.g. 6h)"
                          value={newEstimate}
                          onChange={(e) => setNewEstimate(e.target.value)}
                          sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: '0.75rem' } }}
                        />
                      </Box>
                      <TextField
                        size="small"
                        fullWidth
                        multiline
                        minRows={2}
                        placeholder="Description..."
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        sx={{ mb: 1, '& .MuiInputBase-root': { fontSize: '0.78rem' } }}
                      />
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <FormControl size="small" sx={{ minWidth: 120 }}>
                          <Select
                            value={newAffiliateNetwork}
                            onChange={(e) => setNewAffiliateNetwork(e.target.value)}
                            sx={{ fontSize: '0.75rem' }}
                          >
                            {['ClickDealer', 'Mobidea', 'MaxBounty', 'AdCombo'].map((net) => (
                              <MenuItem key={net} value={net} sx={{ fontSize: '0.75rem' }}>
                                {net}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ minWidth: 90 }}>
                          <Select
                            value={newPriority}
                            onChange={(e) => setNewPriority(e.target.value)}
                            sx={{ fontSize: '0.75rem' }}
                          >
                            <MenuItem value="high">High</MenuItem>
                            <MenuItem value="medium">Medium</MenuItem>
                            <MenuItem value="low">Low</MenuItem>
                          </Select>
                        </FormControl>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => handleAddTask(col)}
                          sx={{ fontSize: '0.75rem' }}
                        >
                          Add
                        </Button>
                        <Button
                          size="small"
                          onClick={() => setAddingTo(null)}
                          sx={{ fontSize: '0.75rem' }}
                        >
                          Cancel
                        </Button>
                      </Box>
                    </Box>
                  )}
                  {/* Tasks */}
                  <Droppable droppableId={col}>
                    {(provided, snapshot) => (
                      <Box
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        sx={{
                          flex: 1,
                          overflowY: 'auto',
                          p: 1.5,
                          minHeight: 60,
                          transition: 'background-color 0.2s',
                          bgcolor: snapshot.isDraggingOver
                            ? alpha(style.accent, 0.05)
                            : 'transparent',
                        }}
                      >
                        {colTasks.map((task, idx) => (
                          <Draggable key={task.id} draggableId={task.id} index={idx}>
                            {(provided, snapshot) => (
                              <Card
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => setSelectedTask(task)}
                                elevation={0}
                                sx={{
                                  mb: 1.5,
                                  cursor: 'grab',
                                  borderRadius: 2,
                                  border: '1px solid',
                                  borderColor: snapshot.isDragging ? 'primary.main' : 'divider',
                                  bgcolor: isDark ? 'background.paper' : 'background.paper',
                                  boxShadow: snapshot.isDragging
                                    ? '0 8px 24px rgba(0,0,0,0.25)'
                                    : isDark
                                      ? '0 2px 8px rgba(0,0,0,0.2)'
                                      : '0 2px 4px rgba(0,0,0,0.06)',
                                  transition: 'all 0.2s',
                                  '&:hover': {
                                    borderColor: 'primary.light',
                                    transform: 'translateY(-2px)',
                                    boxShadow: createHoverGlowShadow(theme),
                                  },
                                }}
                              >
                                <CardContent sx={{ p: '16px !important' }}>
                                  {/* Assigned person (top-left, light blue pill) + Priority (top-right, with icon) */}
                                  <Box
                                    sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}
                                  >
                                    <Chip
                                      label={task.assignedTo || 'Unassigned'}
                                      size="small"
                                      sx={{
                                        height: 20,
                                        fontSize: '0.7rem',
                                        maxWidth: 120,
                                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                                        color: 'primary.main',
                                        fontWeight: 600,
                                        borderRadius: 1.5,
                                      }}
                                    />
                                    <Chip
                                      icon={
                                        <PriorityBarsIcon
                                          color={PRIORITY_COLORS[task.priority || 'low']}
                                        />
                                      }
                                      label={(task.priority || 'low').toUpperCase()}
                                      size="small"
                                      sx={{
                                        height: 24,
                                        fontSize: '0.7rem',
                                        bgcolor: isDark
                                          ? alpha(PRIORITY_COLORS[task.priority || 'low'], 0.15)
                                          : `${PRIORITY_COLORS[task.priority || 'low']}20`,
                                        color: PRIORITY_COLORS[task.priority || 'low'],
                                        fontWeight: 700,
                                        borderRadius: 2,
                                        border: '1px solid',
                                        borderColor: alpha(
                                          PRIORITY_COLORS[task.priority || 'low'],
                                          isDark ? 0.35 : 0.4
                                        ),
                                        '& .MuiChip-icon': { ml: 0.5 },
                                        '& .MuiChip-label': { px: 0.75 },
                                      }}
                                    />
                                  </Box>

                                  <Typography
                                    variant="subtitle2"
                                    sx={{ fontWeight: 600, mb: 0.5, lineHeight: 1.3 }}
                                  >
                                    {task.title}
                                  </Typography>

                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{
                                      mb: 1.5,
                                      fontSize: '0.8rem',
                                      display: '-webkit-box',
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {task.description || 'No description'}
                                  </Typography>

                                  <Divider sx={{ my: 1 }} />

                                  {/* Role/assignee (bottom-left) + Deadline (bottom-right) */}
                                  <Box
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      mt: 1,
                                    }}
                                  >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <AppIcon
                                        name="PersonOutline"
                                        fallback={PersonOutlineIcon}
                                        sx={{ fontSize: 16, color: 'text.secondary' }}
                                      />
                                      <Typography variant="caption" color="text.secondary">
                                        {task.assignedTo || 'Unassigned'}
                                      </Typography>
                                    </Box>
                                    {task.deadline && (
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <AppIcon
                                          name="CalendarToday"
                                          fallback={CalendarTodayIcon}
                                          sx={{ fontSize: 14, color: 'text.secondary' }}
                                        />
                                        <Typography variant="caption" color="text.secondary">
                                          {task.deadline}
                                        </Typography>
                                      </Box>
                                    )}
                                  </Box>
                                </CardContent>
                              </Card>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </Box>
                    )}
                  </Droppable>
                </Box>
              );
            })}
          </Box>
        </DragDropContext>
      </FormDialog>
      {/* Edit Task popup - matches Task Manager page layout */}
      {selectedTask && (
        <FormDialog
          open={Boolean(selectedTask)}
          onClose={() => setSelectedTask(null)}
          title="Edit Task"
          icon={EditOutlinedIcon}
          maxWidth="sm"
          footerJustify="space-between"
          actions={
            <>
              <Button
                onClick={handleDeleteTask}
                color="error"
                startIcon={<AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} />}
                sx={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'none' }}
              >
                Delete
              </Button>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Button
                  onClick={() => setSelectedTask(null)}
                  sx={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'text.secondary',
                    textTransform: 'none',
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveTaskChanges}
                  variant="contained"
                  disableElevation
                  sx={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    px: 3,
                    py: 1,
                    borderRadius: 2,
                    textTransform: 'none',
                  }}
                >
                  Save Changes
                </Button>
              </Box>
            </>
          }
        >
          <Stack spacing={3.5}>
            <TextField
              label="Task Title"
              fullWidth
              value={selectedTask.title || ''}
              onChange={(e) => handleTaskFieldChange('title', e.target.value)}
              variant="outlined"
              size="small"
              InputLabelProps={{ shrink: true, sx: { fontSize: '0.8125rem', fontWeight: 600 } }}
              InputProps={{
                sx: { fontSize: '0.9375rem' },
                startAdornment: (
                  <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                    <AppIcon name="Assignment" fallback={AssignmentIcon} sx={{ fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.5 }}>
              <FormControl
                fullWidth
                size="small"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              >
                <InputLabel
                  shrink
                  id="edit-task-priority-label"
                  sx={{ fontSize: '0.8125rem', fontWeight: 600 }}
                >
                  Priority
                </InputLabel>
                <Select
                  labelId="edit-task-priority-label"
                  value={selectedTask.priority || 'medium'}
                  label="Priority"
                  onChange={(e) => handleTaskFieldChange('priority', e.target.value)}
                  displayEmpty
                  sx={{ fontSize: '0.9375rem' }}
                  renderValue={(value) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AppIcon
                        name="FlagOutlined"
                        fallback={FlagOutlinedIcon}
                        sx={{ fontSize: 17, color: 'text.secondary' }}
                      />
                      <span>
                        {(value || 'medium').charAt(0).toUpperCase() + (value || 'medium').slice(1)}
                      </span>
                    </Box>
                  )}
                >
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="low">Low</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Deadline"
                type="date"
                fullWidth
                size="small"
                InputLabelProps={{
                  shrink: true,
                  sx: { fontSize: '0.8125rem', fontWeight: 600 },
                }}
                value={selectedTask.deadline || ''}
                onChange={(e) => handleTaskFieldChange('deadline', e.target.value)}
                InputProps={{
                  sx: { fontSize: '0.9375rem' },
                  startAdornment: (
                    <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                      <AppIcon
                        name="CalendarToday"
                        fallback={CalendarTodayIcon}
                        sx={{ fontSize: 18 }}
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Box>

            <FormControl
              fullWidth
              size="small"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            >
              <InputLabel
                shrink
                id="edit-task-network-label"
                sx={{ fontSize: '0.8125rem', fontWeight: 600 }}
              >
                Affiliate Network
              </InputLabel>
              <Select
                labelId="edit-task-network-label"
                value={selectedTask.affiliateNetwork || 'ClickDealer'}
                label="Affiliate Network"
                onChange={(e) => handleTaskFieldChange('affiliateNetwork', e.target.value)}
                displayEmpty
                sx={{ fontSize: '0.9375rem' }}
              >
                {['ClickDealer', 'Mobidea', 'MaxBounty', 'AdCombo'].map((net) => (
                  <MenuItem key={net} value={net}>
                    {net}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.5 }}>
              <TextField
                label="Assigned To"
                fullWidth
                size="small"
                value={selectedTask.assignedTo || ''}
                onChange={(e) => handleTaskFieldChange('assignedTo', e.target.value)}
                InputLabelProps={{
                  shrink: true,
                  sx: { fontSize: '0.8125rem', fontWeight: 600 },
                }}
                InputProps={{
                  sx: { fontSize: '0.9375rem' },
                  startAdornment: (
                    <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                      <AppIcon
                        name="PersonOutline"
                        fallback={PersonOutlineIcon}
                        sx={{ fontSize: 18 }}
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <TextField
                label="Estimate"
                fullWidth
                size="small"
                value={selectedTask.estimate || ''}
                onChange={(e) => handleTaskFieldChange('estimate', e.target.value)}
                placeholder="e.g. 4h"
                InputLabelProps={{
                  shrink: true,
                  sx: { fontSize: '0.8125rem', fontWeight: 600 },
                }}
                InputProps={{
                  sx: { fontSize: '0.9375rem' },
                  startAdornment: (
                    <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                      <AppIcon name="Schedule" fallback={ScheduleIcon} sx={{ fontSize: 18 }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Box>

            <TextField
              label="Description"
              fullWidth
              multiline
              minRows={4}
              size="small"
              value={selectedTask.description || ''}
              onChange={(e) => handleTaskFieldChange('description', e.target.value)}
              InputLabelProps={{ shrink: true, sx: { fontSize: '0.8125rem', fontWeight: 600 } }}
              InputProps={{
                sx: { fontSize: '0.9375rem', py: 1.25 },
                startAdornment: (
                  <InputAdornment
                    position="start"
                    sx={{ color: 'text.secondary', alignSelf: 'flex-start', mt: 1.5, mr: 0 }}
                  >
                    <AppIcon
                      name="NotesOutlined"
                      fallback={NotesOutlinedIcon}
                      sx={{ fontSize: 18 }}
                    />
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            <Box
              sx={{
                pt: 2,
                px: 2,
                pb: 2,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.primary.main, 0.04),
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, 0.12),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
                <AppIcon
                  name="InfoOutlined"
                  fallback={InfoOutlinedIcon}
                  sx={{ fontSize: 16, color: 'text.secondary' }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  System Info
                </Typography>
              </Box>
              <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                  <Box component="span" sx={{ fontWeight: 600, color: 'text.primary', mr: 0.5 }}>
                    ID:
                  </Box>
                  {selectedTask.taskId || selectedTask.id || '-'}
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                  <Box component="span" sx={{ fontWeight: 600, color: 'text.primary', mr: 0.5 }}>
                    Partner:
                  </Box>
                  {partner?.name || '-'}
                </Typography>
              </Stack>
            </Box>
          </Stack>
        </FormDialog>
      )}
    </>
  );
}
