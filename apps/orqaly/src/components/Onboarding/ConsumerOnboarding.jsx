import 'react';
import { Box, Typography, Button, Backdrop, Paper, alpha, useTheme } from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import { useOnboarding } from './OnboardingProvider';
import { useSimpleMode } from '../../hooks/useSimpleMode';

import AppIcon from '../icons/AppIcon';

const TOTAL_STEPS = 3;

const STEPS = [
  {
    icon: (
      <AppIcon
        name="AutoAwesomeOutlined"
        fallback={AutoAwesomeOutlinedIcon}
        sx={{ fontSize: 40 }}
      />
    ),
    title: 'Welcome to Orchestratori!',
    description:
      'We help you get things done with AI-powered agents. Simply tell us what you need, and our AI team will handle the rest.',
    hint: "Here's how it works...",
    spotlightSelector: null,
  },
  {
    icon: <AppIcon name="EditNoteOutlined" fallback={EditNoteOutlinedIcon} sx={{ fontSize: 40 }} />,
    title: 'Create a Request',
    description:
      'Click the "+ New Request" button to tell us what you need. Our AI will analyze your requirements, select the best agents, break it into tasks, and start working immediately.',
    hint: 'Try it on your Dashboard or My Requests page.',
    spotlightSelector: null,
  },
  {
    icon: (
      <AppIcon
        name="TrackChangesOutlined"
        fallback={TrackChangesOutlinedIcon}
        sx={{ fontSize: 40 }}
      />
    ),
    title: 'Track & Get Results',
    description:
      'Watch your requests progress in real-time on the "My Requests" page. When they\'re done, review the completed work, approve or request changes, and download your results.',
    hint: "That's it — simple as 1-2-3!",
    spotlightSelector: null,
  },
];

export default function ConsumerOnboarding() {
  const theme = useTheme();
  const { active, step, next, back, dismiss } = useOnboarding();
  const { simpleMode } = useSimpleMode();

  if (!active || !simpleMode || step >= TOTAL_STEPS) return null;

  const currentStep = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === TOTAL_STEPS - 1;

  return (
    <Backdrop
      open
      sx={{
        zIndex: (t) => t.zIndex.modal + 10,
        bgcolor: alpha(theme.palette.common.black, 0.6),
        backdropFilter: 'blur(4px)',
      }}
    >
      <Paper
        elevation={24}
        sx={{
          maxWidth: 440,
          width: '90vw',
          p: 4,
          borderRadius: 4,
          textAlign: 'center',
          border: '1px solid',
          borderColor: alpha(theme.palette.primary.main, 0.2),
          animation: 'fadeInUp 0.4s ease-out',
          '@keyframes fadeInUp': {
            from: { opacity: 0, transform: 'translateY(24px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
        }}
      >
        {/* Step indicator */}
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontWeight: 600,
            letterSpacing: '0.05em',
            mb: 2,
            display: 'block',
          }}
        >
          Step {step + 1} of {TOTAL_STEPS}
        </Typography>

        {/* Icon */}
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            border: '2px solid',
            borderColor: alpha(theme.palette.primary.main, 0.3),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'primary.main',
            mx: 'auto',
            mb: 2.5,
          }}
        >
          {currentStep.icon}
        </Box>

        {/* Title */}
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1.5, letterSpacing: '-0.02em' }}>
          {currentStep.title}
        </Typography>

        {/* Description */}
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1, lineHeight: 1.7, px: 1 }}>
          {currentStep.description}
        </Typography>

        {/* Hint */}
        <Typography
          variant="caption"
          sx={{ color: 'primary.main', fontWeight: 600, display: 'block', mb: 3 }}
        >
          {currentStep.hint}
        </Typography>

        {/* Navigation */}
        <Box
          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}
        >
          {isFirst ? (
            <Button size="small" onClick={dismiss} sx={{ color: 'text.secondary' }}>
              Skip
            </Button>
          ) : (
            <Button size="small" onClick={back} sx={{ color: 'text.secondary' }}>
              Back
            </Button>
          )}

          {/* Dots */}
          <Box sx={{ display: 'flex', gap: 0.75 }}>
            {STEPS.map((_, i) => (
              <Box
                key={i}
                sx={{
                  width: i === step ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  bgcolor: i === step ? 'primary.main' : alpha(theme.palette.text.primary, 0.15),
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </Box>

          {isLast ? (
            <Button variant="contained" size="small" onClick={dismiss} disableElevation>
              Get Started!
            </Button>
          ) : (
            <Button variant="contained" size="small" onClick={next} disableElevation>
              Next
            </Button>
          )}
        </Box>
      </Paper>
    </Backdrop>
  );
}
