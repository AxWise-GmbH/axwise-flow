import {
  Dialog,
  Box,
  Avatar,
  Typography,
  IconButton,
  CircularProgress,
  useMediaQuery,
  useTheme,
  alpha,
} from '@mui/material';
import StadiumOutlinedIcon from '@mui/icons-material/StadiumOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AppIcon from '../../../components/icons/AppIcon';
import ArenaGuideWizard from './ArenaGuideWizard';
import { ARENA_GUIDE_STEPS } from './guideSteps';
import useArenaGuide from './useArenaGuide';

/**
 * "Set up Arena" — the guide popup. Same shell as the Assistant setup dialog
 * (icon tile header, stepper, Back/Skip/Next), minus the Steps|Chat toggle:
 * this one is steps only.
 *
 * `initialStep` takes an index or a step key ('departments' | 'rates' | ...),
 * so the Arena toolbar can jump straight to one step.
 */
export default function ArenaGuideDialog({ open, onClose, initialStep = 0, onFinished }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { done, loading, reload } = useArenaGuide({ enabled: open });

  // Completion is derived server-side; a step card finishing just re-derives.
  const handleStepComplete = async () => {
    await reload();
  };

  const handleFinish = () => {
    onFinished?.();
    onClose?.();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: fullScreen ? 0 : 4,
            height: fullScreen ? '100dvh' : '82vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid',
            borderColor: alpha(theme.palette.primary.main, 0.25),
          },
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          flexShrink: 0,
          px: 2.5,
          py: 1.75,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: alpha(theme.palette.primary.main, 0.06),
        }}
      >
        <Avatar
          sx={{
            bgcolor: alpha(theme.palette.primary.main, 0.15),
            color: 'primary.main',
            width: 38,
            height: 38,
          }}
        >
          <AppIcon name="StadiumOutlined" fallback={StadiumOutlinedIcon} />
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, lineHeight: 1.1 }}>Set up Arena</Typography>
          <Typography variant="caption" color="text.secondary">
            Connect your company, add your people, meet their agents
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close">
          <AppIcon name="CloseRounded" fallback={CloseRoundedIcon} />
        </IconButton>
      </Box>

      {loading ? (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <ArenaGuideWizard
          steps={ARENA_GUIDE_STEPS}
          stepsDone={done}
          onComplete={handleStepComplete}
          canFinish
          onFinish={handleFinish}
          finishLabel="Open the Arena"
          initialStep={initialStep}
        />
      )}
    </Dialog>
  );
}
