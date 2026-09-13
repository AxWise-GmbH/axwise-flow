import { useEffect, useState } from 'react';
import { Box, Stepper, Step, StepButton, alpha, useTheme } from '@mui/material';
import { createHoverGlowShadow, GLOW_SPEC } from '../../theme/hoverGlow';
import { stepEntranceSx } from '../../theme/wizardGlow';
import WizardStepIcon from '../../components/Common/WizardStepIcon';

/**
 * Horizontal, non-linear setup stepper. Steps fade/slide in one by one on mount,
 * and each numbered circle glows on hover (the platform's primary halo). Any step
 * can be clicked to jump to it. Scrolls horizontally on small screens.
 */
export default function SetupStepper({ steps, current, onJump }) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(t);
  }, []);

  return (
    <Box
      sx={{
        overflowX: 'auto',
        py: 0.5,
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
    >
      <Stepper
        nonLinear
        activeStep={current}
        alternativeLabel
        sx={{
          minWidth: 520,
          '& .MuiStepConnector-line': {
            borderColor: alpha(tint, 0.35),
            transition: 'border-color 250ms ease',
          },
          '& .Mui-active .MuiStepConnector-line, & .Mui-completed .MuiStepConnector-line': {
            borderColor: tint,
          },
        }}
      >
        {steps.map((s, i) => (
          <Step key={s.key} completed={s.done}>
            <StepButton
              color="inherit"
              onClick={() => onJump(i)}
              icon={<WizardStepIcon active={current === i} completed={s.done} number={i + 1} />}
              sx={{
                ...stepEntranceSx(mounted, i),
                '& .MuiStepLabel-label': { fontWeight: 600, fontSize: '0.8rem' },
                '& .MuiStepLabel-iconContainer': {
                  borderRadius: '50%',
                  transition: `box-shadow ${GLOW_SPEC.transitionMs}ms ease`,
                },
                '&:hover .MuiStepLabel-iconContainer': { boxShadow: createHoverGlowShadow(theme) },
              }}
            >
              {s.label}
            </StepButton>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
}
