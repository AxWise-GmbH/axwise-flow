import { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Popover,
  Box,
  Typography,
  TextField,
  IconButton,
  Checkbox,
  Tooltip,
  Chip,
  alpha,
  useTheme,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import { useDevTasks } from '../../context/DevTasksContext';

import AppIcon from '../icons/AppIcon';

const PAGE_LABELS = {
  '/dashboard': 'Dashboard',
  '/partners': 'Partners',
  '/task-manager': 'Tasks',
  '/workflow': 'Workflow',
  '/projects': 'Projects',
  '/settings': 'Settings',
  '/audit-log': 'Audit Log',
  '/notification-center': 'Notifications',
  '/documentation': 'Documentation',
  '/roles': 'Roles & Permissions',
  '/data': 'Data',
  '/github-pushes': 'GitHub Pushes',
  '/reports': 'Reports',
};

function getPageLabel(path) {
  if (PAGE_LABELS[path]) return PAGE_LABELS[path];
  const parts = path.split('/').filter(Boolean);
  if (parts.length > 1 && PAGE_LABELS[`/${parts[0]}`]) {
    return `${PAGE_LABELS[`/${parts[0]}`]} (detail)`;
  }
  return path;
}

export default function DevTasksPopover({ anchorEl, open, onClose }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const location = useLocation();
  const currentPage = location.pathname;
  const { getPageTasks, addTask, toggleTask, removeTask } = useDevTasks();
  const [newTaskText, setNewTaskText] = useState('');

  const pageTasks = useMemo(() => getPageTasks(currentPage), [getPageTasks, currentPage]);
  const doneCount = pageTasks.filter((t) => t.done).length;

  const handleAdd = () => {
    if (!newTaskText.trim()) return;
    addTask(currentPage, newTaskText);
    setNewTaskText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{
        paper: {
          sx: {
            mt: 1,
            width: 380,
            maxHeight: 520,
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: isDark
              ? '0 12px 40px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.3)'
              : '0 12px 40px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)',
            border: '1px solid',
            borderColor: 'divider',
          },
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: isDark ? alpha('#F59E0B', 0.06) : alpha('#F59E0B', 0.04),
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha('#F59E0B', 0.15),
            color: '#F59E0B',
          }}
        >
          <AppIcon name="CodeOutlined" fallback={CodeOutlinedIcon} sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.3 }}>
            Dev Tasks
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <AppIcon
              name="FolderOutlined"
              fallback={FolderOutlinedIcon}
              sx={{ fontSize: 12, color: 'text.secondary' }}
            />
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontWeight: 500 }}>
              {getPageLabel(currentPage)}
            </Typography>
          </Box>
        </Box>
        {pageTasks.length > 0 && (
          <Chip
            size="small"
            label={`${doneCount}/${pageTasks.length}`}
            sx={{
              height: 22,
              fontSize: '0.7rem',
              fontWeight: 700,
              bgcolor:
                doneCount === pageTasks.length && pageTasks.length > 0
                  ? alpha('#16A34A', 0.15)
                  : alpha('#F59E0B', 0.12),
              color: doneCount === pageTasks.length && pageTasks.length > 0 ? '#16A34A' : '#F59E0B',
            }}
          />
        )}
      </Box>
      {/* Add task input */}
      <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Add a dev task..."
          value={newTaskText}
          onChange={(e) => setNewTaskText(e.target.value)}
          onKeyDown={handleKeyDown}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleAdd}
                  disabled={!newTaskText.trim()}
                  sx={{ color: 'primary.main' }}
                >
                  <AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ),
            sx: { fontSize: '0.85rem', borderRadius: 2 },
          }}
        />
      </Box>
      {/* Task list */}
      <Box
        sx={{
          maxHeight: 340,
          overflowY: 'auto',
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: alpha(theme.palette.text.primary, 0.15),
            borderRadius: 2,
          },
        }}
      >
        {pageTasks.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <AppIcon
              name="CodeOutlined"
              fallback={CodeOutlinedIcon}
              sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
              No dev tasks for this page
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Add tasks to track development work
            </Typography>
          </Box>
        ) : (
          pageTasks.map((task) => (
            <Box
              key={task.id}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 0.5,
                px: 1,
                py: 0.5,
                borderBottom: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.5),
                transition: 'background-color 0.15s',
                '&:hover': { bgcolor: 'action.hover' },
                '&:hover .dev-task-delete': { opacity: 1 },
                '&:last-child': { borderBottom: 'none' },
              }}
            >
              <Checkbox
                checked={task.done}
                onChange={() => toggleTask(currentPage, task.id)}
                size="small"
                sx={{
                  mt: 0.25,
                  color: alpha('#F59E0B', 0.5),
                  '&.Mui-checked': { color: '#16A34A' },
                }}
              />
              <Box sx={{ flex: 1, minWidth: 0, py: 0.75 }}>
                <Typography
                  sx={{
                    fontSize: '0.84rem',
                    fontWeight: 500,
                    lineHeight: 1.5,
                    textDecoration: task.done ? 'line-through' : 'none',
                    color: task.done ? 'text.disabled' : 'text.primary',
                    wordBreak: 'break-word',
                  }}
                >
                  {task.text}
                </Typography>
              </Box>
              <Tooltip title="Remove" arrow>
                <IconButton
                  className="dev-task-delete"
                  size="small"
                  onClick={() => removeTask(currentPage, task.id)}
                  sx={{
                    opacity: 0,
                    transition: 'opacity 0.15s',
                    color: 'text.disabled',
                    mt: 0.25,
                    '&:hover': { color: 'error.main' },
                  }}
                >
                  <AppIcon
                    name="DeleteOutline"
                    fallback={DeleteOutlineIcon}
                    sx={{ fontSize: 16 }}
                  />
                </IconButton>
              </Tooltip>
            </Box>
          ))
        )}
      </Box>
    </Popover>
  );
}
