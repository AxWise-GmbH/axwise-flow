import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Stack,
  Button,
  Typography,
  Divider,
  CircularProgress,
  useTheme,
  alpha,
} from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useSetupProgress } from './useSetupProgress';
import SetupStepper from './SetupStepper';
import HowItWorksCard from './sections/HowItWorksCard';
import Reveal from '../../components/Common/Reveal';
import { glowPillSx, cardHoverGlowSx } from '../../theme/wizardGlow';
import WorkspaceStep from './steps/WorkspaceStep';
import DatabaseStep from './steps/DatabaseStep';
import KeysStep from './steps/KeysStep';
import StorageStep from './steps/StorageStep';
import LocalLlmStep from './steps/LocalLlmStep';
import AiChatSyncStep from './steps/AiChatSyncStep';
import IdeSyncStep from './steps/IdeSyncStep';

import AppIcon from '../../components/icons/AppIcon';

const STEPS = [
  {
    key: 'workspace',
    label: 'Workspace',
    doneKey: 'workspace',
    required: true,
    Component: WorkspaceStep,
  },
  { key: 'database', label: 'Database', doneKey: 'database', Component: DatabaseStep },
  { key: 'keys', label: 'Keys', doneKey: 'keys', required: true, Component: KeysStep },
  { key: 'storage', label: 'Storage', doneKey: 'storage', Component: StorageStep },
  { key: 'aiChatSync', label: 'AI Chat', doneKey: 'aiChatSync', Component: AiChatSyncStep },
  { key: 'ideSync', label: 'IDE', doneKey: 'ideSync', Component: IdeSyncStep },
  { key: 'local', label: 'Local LLM', doneKey: 'localLlm', Component: LocalLlmStep },
];

export default function SetupWizard() {
  const theme = useTheme();
  const tint = theme.palette.primary.main;
  const navigate = useNavigate();
  const progress = useSetupProgress();
  const [current, setCurrent] = useState(0);

  if (progress.loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const active = STEPS[current];
  const StepComponent = active.Component;
  const isLast = current === STEPS.length - 1;
  const stepperSteps = STEPS.map((s) => ({
    key: s.key,
    label: s.label,
    done: progress[s.doneKey].done,
    optional: !s.required,
  }));

  const goNext = () => setCurrent((c) => Math.min(STEPS.length - 1, c + 1));
  const goBack = () => setCurrent((c) => Math.max(0, c - 1));
  const finish = () => navigate('/dashboard');

  return (
    <Stack spacing={2.5}>
      <Reveal>
        <HowItWorksCard />
      </Reveal>
      <Reveal delay={140}>
        <Box
          sx={{
            p: { xs: 2.5, sm: 3 },
            borderRadius: 3,
            border: '1px solid',
            borderColor: alpha(tint, 0.18),
            background: `linear-gradient(160deg, ${alpha(tint, 0.06)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 75%)`,
            ...cardHoverGlowSx(theme),
          }}
        >
          <SetupStepper steps={stepperSteps} current={current} onJump={setCurrent} />

          <Divider sx={{ my: 2 }} />

          <StepComponent progress={progress} />

          <Divider sx={{ mt: 3, mb: 2 }} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Button
              onClick={goBack}
              disabled={current === 0}
              variant="outlined"
              sx={glowPillSx(theme)}
            >
              Back
            </Button>
            <Box sx={{ flex: 1 }} />
            {isLast ? (
              <Box sx={{ textAlign: 'right' }}>
                <Button
                  onClick={finish}
                  disabled={!progress.allRequiredDone}
                  variant="outlined"
                  sx={glowPillSx(theme, { pulse: progress.allRequiredDone })}
                >
                  Finish setup
                </Button>
                {!progress.allRequiredDone && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 0.75 }}
                  >
                    Complete Workspace and Keys to finish.
                  </Typography>
                )}
              </Box>
            ) : (
              <>
                {!active.required && (
                  <Button onClick={goNext} variant="outlined" sx={glowPillSx(theme)}>
                    Skip
                  </Button>
                )}
                <Button
                  onClick={goNext}
                  variant="outlined"
                  endIcon={
                    <AppIcon name="ArrowForwardRounded" fallback={ArrowForwardRoundedIcon} />
                  }
                  sx={glowPillSx(theme, { pulse: true })}
                >
                  Next
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Reveal>
    </Stack>
  );
}
