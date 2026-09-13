import { useState, useEffect } from 'react';
import { Box, Button, Typography, Divider, alpha, useTheme } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import WizardStepper from '../../../components/Common/WizardStepper';
import Reveal from '../../../components/Common/Reveal';
import { glowPillSx } from '../../../theme/wizardGlow';
import AppIcon from '../../../components/icons/AppIcon';

/**
 * The Arena guide's step-by-step body — a parameterized sibling of
 * AssistantSetupWizard: the step catalog, the finish label and the finish hint
 * come in as props instead of a hard import, so this file carries no
 * Arena-specific copy at all.
 *
 * Contract per step: { key, label, short, icon, Card, required, desc }.
 * Each Card receives ({ config, onComplete, embedded }) and calls
 * `onComplete(patch)` when its own primary action succeeds; the wizard then
 * persists via `onComplete(key, patch)` and advances. Skip and Next both move
 * forward without acting (Skip renders on optional steps only).
 */
function resolveStepIndex(steps, initialStep) {
  if (typeof initialStep === 'number') {
    return Math.max(0, Math.min(steps.length - 1, initialStep));
  }
  const idx = steps.findIndex((s) => s.key === initialStep);
  return idx >= 0 ? idx : 0;
}

export default function ArenaGuideWizard({
  steps,
  stepsDone = {},
  config,
  onComplete,
  canFinish = true,
  onFinish,
  finishLabel = 'Finish',
  finishHint = '',
  initialStep = 0,
}) {
  const theme = useTheme();
  const [current, setCurrent] = useState(() => resolveStepIndex(steps, initialStep));

  // Re-focus when a caller opens the guide at a specific step (the Arena
  // toolbar's Departments / Rates buttons jump straight to theirs).
  useEffect(() => {
    setCurrent(resolveStepIndex(steps, initialStep));
  }, [steps, initialStep]);

  const active = steps[current];
  const Card = active.Card;
  const ActiveIcon = active.icon;
  const isLast = current === steps.length - 1;

  const advance = () => setCurrent((c) => Math.min(steps.length - 1, c + 1));
  const back = () => setCurrent((c) => Math.max(0, c - 1));

  // The card owns its own primary action; persist then move on automatically.
  const handleComplete = async (patch) => {
    await onComplete(active.key, patch);
    advance();
  };

  const stepperSteps = steps.map((s) => ({
    key: s.key,
    label: s.short,
    done: !!stepsDone[s.key],
  }));

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flexShrink: 0, px: 2, pt: 1.5 }}>
        <WizardStepper steps={stepperSteps} current={current} onJump={setCurrent} />
      </Box>
      <Divider />
      {/* Active step (scrolls) */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2, py: 2 }}>
        <Reveal key={active.key}>
          {/* Section header: icon + title + description live here; the card
              renders headerless (`embedded`) to avoid a duplicate title. */}
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
                Step {current + 1} of {steps.length}
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
              {finishLabel}
            </Button>
            {!canFinish && finishHint && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5 }}
              >
                {finishHint}
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
