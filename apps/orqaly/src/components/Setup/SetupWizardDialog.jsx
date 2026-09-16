import { Dialog, Box, IconButton, Typography, alpha, useTheme, useMediaQuery } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SetupWizard from '../../pages/Setup/SetupWizard';

import AppIcon from '../icons/AppIcon';

/**
 * The full Setup wizard (Workspace, Database, Keys, Storage, Local LLM) in a pop-up, used by the
 * Welcome Guide "Select AI Core" quick action. The Dialog unmounts its children when closed (MUI
 * default), so the wizard's useSetupProgress only runs while open. Props: open, onClose.
 */
export default function SetupWizardDialog({ open, onClose }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const tint = theme.palette.primary.main;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={fullScreen}
      slotProps={{
        paper: { sx: { borderRadius: fullScreen ? 0 : 3, overflow: 'hidden' } },
        backdrop: { sx: { backdropFilter: 'blur(4px)', bgcolor: alpha('#000', 0.6) } },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 2, sm: 3 },
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography sx={{ fontWeight: 800 }}>Set up your workspace</Typography>
        <IconButton
          aria-label="Close setup"
          onClick={onClose}
          size="small"
          sx={{
            color: 'text.secondary',
            '&:hover': { color: 'text.primary', bgcolor: alpha(tint, 0.08) },
          }}
        >
          <AppIcon name="CloseRounded" fallback={CloseRoundedIcon} fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ p: { xs: 2, sm: 3 }, maxHeight: { xs: 'none', sm: '76vh' }, overflowY: 'auto' }}>
        <SetupWizard />
      </Box>
    </Dialog>
  );
}
