import { Dialog, DialogTitle, DialogContent, Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TaskManager from '../../pages/TaskManager/TaskManager';
import { useTaskManager } from '../../context/TaskManagerContext';

import AppIcon from '../icons/AppIcon';

export default function TaskManagerDialog() {
  const { taskManagerOpen, closeTaskManager } = useTaskManager();

  return (
    <Dialog
      open={taskManagerOpen}
      onClose={closeTaskManager}
      maxWidth={false}
      fullWidth
      sx={{ '& .MuiDialog-paper': { maxWidth: 1200, height: '85vh' } }}
    >
      <DialogTitle
        sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Tasks
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage partner tasks and internal team tasks in one place.
          </Typography>
        </Box>
        <IconButton onClick={closeTaskManager} aria-label="Close Tasks">
          <AppIcon name="Close" fallback={CloseIcon} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 2, overflow: 'hidden' }}>
        <TaskManager embedded />
      </DialogContent>
    </Dialog>
  );
}
