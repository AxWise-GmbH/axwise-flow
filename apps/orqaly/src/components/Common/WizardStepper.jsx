import { useEffect, useState } from 'react';
import { Box, Stepper, Step, StepButton, alpha, useTheme } from '@mui/material';
import { createHoverGlowShadow, GLOW_SPEC } from '../../theme/hoverGlow';
import { stepEntranceSx } from '../../theme/wizardGlow';
import WizardStepIcon from './WizardStepIcon';

/**
 * Horizontal, non-linear wizard stepper — the platform's numbered-circle strip
 * (see the Assistant setup and /setup pages, which carry near-identical local
 * copies; this is the promoted, shared one — new wizards consume this).
 *
 * Steps fade/slide in one by one on mount, each circle glows on hover, and any
 * step can be clicked to jump. The strip fills the container and only scrolls
 * horizontally (scrollbar hidden) on very narrow phones.
 *
 * @param {{ steps: Array<{key: string, label: string, done: boolean}>,
 *           current: number, onJump: (i: number) => void }} props
 */
export default function WizardStepper({ steps, current, onJump }) {
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
          minWidth: 0,
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
                '& .MuiStepLabel-label': { fontWeight: 600, fontSize: '0.78rem' },
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
