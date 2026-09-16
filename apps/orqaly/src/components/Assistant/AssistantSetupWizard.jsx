import { useState, useEffect } from 'react';
import { Box, Button, Typography, Divider, alpha, useTheme } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { ASSISTANT_SETUP_STEPS as STEPS } from './setupSteps';
import AssistantSetupStepper from './AssistantSetupStepper';
import Reveal from '../Common/Reveal';
import { glowPillSx } from '../../theme/wizardGlow';

import AppIcon from '../icons/AppIcon';

/**
 * Step-by-step wizard view of the assistant setup - mirrors the /setup page
 * experience: a horizontal stepper across the top, one capability per step, and
 * a Back / Next (Finish on the last step) footer. Each capability reuses its
 * existing action card; completing a card persists via `onComplete` and
 * auto-advances. Skip and Next both move forward without acting (optional steps
 * only show Skip). `stepsDone` is the completion map from useAssistantSetup;
 * `canFinish` gates the final Finish button (the assistant's brain must be set).
 */
/** Resolve a step index from either a numeric index or a step key string. */
function resolveStepIndex(initialStep) {
  if (typeof initialStep === 'number') {
    return Math.max(0, Math.min(STEPS.length - 1, initialStep));
  }
  const idx = STEPS.findIndex((s) => s.key === initialStep);
  return idx >= 0 ? idx : 0;
}

export default function AssistantSetupWizard({
  stepsDone = {},
  config,
  onComplete,
  canFinish,
  onFinish,
  initialStep = 0,
}) {
  const theme = useTheme();
  const [current, setCurrent] = useState(() => resolveStepIndex(initialStep));

  // Re-focus the wizard when a caller opens it at a specific step (e.g. the
  // Assistant Console "Edit" buttons). Existing callers pass no initialStep, so
  // this resolves to 0 and preserves current behavior.
  useEffect(() => {
    setCurrent(resolveStepIndex(initialStep));
  }, [initialStep]);

  const active = STEPS[current];
  const Card = active.Card;
  const ActiveIcon = active.icon;
  const isLast = current === STEPS.length - 1;

  const advance = () => setCurrent((c) => Math.min(STEPS.length - 1, c + 1));
  const back = () => setCurrent((c) => Math.max(0, c - 1));

  // The card owns its own primary action; persist then move on automatically.
  const handleComplete = async (patch) => {
    await onComplete(active.key, patch);
    advance();
  };

  const stepperSteps = STEPS.map((s) => ({
    key: s.key,
    label: s.short,
    done: !!stepsDone[s.key],
    optional: !s.required,
  }));

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flexShrink: 0, px: 2, pt: 1.5 }}>
        <AssistantSetupStepper steps={stepperSteps} current={current} onJump={setCurrent} />
      </Box>
      <Divider />
      {/* Active step (scrolls) */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2, py: 2 }}>
        <Reveal key={active.key}>
          {/* Section header: the icon + title + short description live here so the
            user understands the step; the card below renders headerless
            (`embedded`) to avoid a duplicate title. */}
          <Box sx={{ mb: 2, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            {ActiveIcon && (
              <Box
                sx={{
                  flexShrink: 0,
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  color: 'primary.main',
                }}
              >
                <AppIcon fallback={ActiveIcon} sx={{ fontSize: 22 }} />
              </Box>
            )}
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 700, letterSpacing: 0.3 }}
              >
                Step {current + 1} of {STEPS.length}
              </Typography>
              <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2 }}>
                {active.label}
              </Typography>
              {active.desc && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5, lineHeight: 1.45 }}
                >
                  {active.desc}
                </Typography>
              )}
            </Box>
          </Box>
          {/* No onSkip passed - the footer handles navigation so the card shows
            only its own action. */}
          <Card config={config} onComplete={handleComplete} embedded />
        </Reveal>
      </Box>
      <Divider />
      {/* Footer navigation */}
      <Box
        sx={{
          flexShrink: 0,
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <Button onClick={back} disabled={current === 0} variant="outlined" sx={glowPillSx(theme)}>
          Back
        </Button>
        <Box sx={{ flex: 1 }} />
        {isLast ? (
          <Box sx={{ textAlign: 'right' }}>
            <Button
              onClick={onFinish}
              disabled={!canFinish}
              variant="outlined"
              startIcon={<AppIcon name="CheckRounded" fallback={CheckRoundedIcon} />}
              sx={glowPillSx(theme, { pulse: canFinish })}
            >
              Finish
            </Button>
            {!canFinish && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5 }}
              >
                Set the assistant&apos;s Core (Keys &amp; storage) to finish.
              </Typography>
            )}
          </Box>
        ) : (
          <>
            {!active.required && (
              <Button onClick={advance} variant="outlined" sx={glowPillSx(theme)}>
                Skip
              </Button>
            )}
            <Button
              onClick={advance}
              variant="outlined"
              endIcon={<AppIcon name="ArrowForwardRounded" fallback={ArrowForwardRoundedIcon} />}
              sx={glowPillSx(theme, { pulse: true })}
            >
              Next
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}
