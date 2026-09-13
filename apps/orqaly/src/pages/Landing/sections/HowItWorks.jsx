import { useCallback, useRef, useState } from 'react';
import { Box, Container, Stack, Typography, alpha, useTheme } from '@mui/material';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import LandingGlassIcon from './LandingGlassIcon';
import { TOUCH_SCROLL_CONTAINER_SX } from '../../../utils/mobileTouchScroll';

const STEPS = [
  {
    title: 'Define',
    desc: 'Describe a goal in plain language. No prompts, no PRDs.',
    iconName: 'LightbulbOutlined',
    Fallback: LightbulbOutlinedIcon,
  },
  {
    title: 'Plan',
    desc: 'Consilium decomposes it into tasks and assigns the right agents.',
    iconName: 'AccountTreeOutlined',
    Fallback: AccountTreeOutlinedIcon,
  },
  {
    title: 'Execute',
    desc: 'The job pool runs agents in parallel; you watch it live.',
    iconName: 'BoltOutlined',
    Fallback: BoltOutlinedIcon,
  },
  {
    title: 'Deliver',
    desc: 'Versioned deliverables ship to your review with one-click refinement.',
    iconName: 'LocalShippingOutlined',
    Fallback: LocalShippingOutlinedIcon,
  },
  {
    title: 'Where you want',
    desc: 'Every result will be at the right place.',
    iconName: 'PlaceOutlined',
    Fallback: PlaceOutlinedIcon,
  },
];

const BANNER_PAD_Y_MD = 56;
const BANNER_PAD_Y_XS = 40;

function StepNode({ title, desc, iconName, Fallback }) {
  return (
    <Stack
      alignItems="center"
      textAlign="center"
      sx={{ flex: 1, position: 'relative', zIndex: 1, px: 1 }}
    >
      <Box sx={{ mb: 2.5 }}>
        <LandingGlassIcon name={iconName} fallback={Fallback} size={30} tone="brand" />
      </Box>
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: { xs: '1.15rem', md: '1.3rem' },
          color: 'text.primary',
          mb: 0.75,
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </Typography>
      <Typography
        sx={{ fontSize: '0.9rem', color: 'text.secondary', lineHeight: 1.55, maxWidth: 230 }}
      >
        {desc}
      </Typography>
    </Stack>
  );
}

function HowItWorksCarousel({ steps }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const scrollRef = useRef(null);
  const stepRefs = useRef([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const syncActiveStep = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const mid = el.scrollTop + el.clientHeight / 2;
    let best = 0;
    let bestDist = Infinity;
    stepRefs.current.forEach((node, i) => {
      if (!node) return;
      const center = node.offsetTop + node.offsetHeight / 2;
      const dist = Math.abs(center - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setActiveIndex(best);
  }, []);

  return (
    <Box
      sx={{
        display: { xs: 'flex', md: 'none' },
        gap: 1.5,
        alignItems: 'stretch',
        position: 'relative',
        touchAction: 'pan-y',
      }}
    >
      <Box
        aria-hidden
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
          py: 1,
        }}
      >
        {steps.map((_, i) => {
          const isActive = i === activeIndex;
          return (
            <Box
              key={i}
              sx={{
                width: 6,
                height: isActive ? 18 : 6,
                borderRadius: 3,
                bgcolor: isActive ? primary : alpha(primary, 0.22),
                transition: 'all 250ms ease',
              }}
            />
          );
        })}
      </Box>

      <Box
        ref={scrollRef}
        role="region"
        aria-label="How Orqaly works in five steps"
        onScroll={syncActiveStep}
        sx={{
          flex: 1,
          maxHeight: 440,
          overflowY: 'auto',
          overflowX: 'hidden',
          ...TOUCH_SCROLL_CONTAINER_SX,
          maskImage:
            'linear-gradient(to bottom, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%)',
          pb: 0.5,
        }}
      >
        <Stack spacing={2.5}>
          {steps.map((s, i) => (
            <Box
              key={s.title}
              ref={(node) => {
                stepRefs.current[i] = node;
              }}
            >
              <StepNode {...s} />
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

export default function HowItWorks() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      component="section"
      id="how-it-works"
      sx={{
        py: { xs: 8, md: 12 },
        bgcolor: alpha(theme.palette.text.primary, 0.02),
        borderTop: `1px solid ${theme.palette.divider}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Container maxWidth="lg">
        <Stack spacing={2} alignItems="center" textAlign="center" sx={{ mb: { xs: 6, md: 8 } }}>
          <Typography
            sx={{
              fontSize: '0.85rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'primary.main',
            }}
          >
            How it works
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '2rem', md: '2.75rem' },
              fontWeight: 800,
              lineHeight: 1.15,
              color: 'text.primary',
              maxWidth: 720,
            }}
          >
            Just Ask & Watch
          </Typography>
        </Stack>

        {/* Unified banner - single surface, no internal card borders */}
        <Box
          sx={{
            position: 'relative',
            px: { xs: 3, md: 5 },
            py: { xs: `${BANNER_PAD_Y_XS}px`, md: `${BANNER_PAD_Y_MD}px` },
            borderRadius: 4,
            overflow: 'hidden',
            bgcolor: isDark ? alpha('#fff', 0.03) : alpha('#fff', 0.7),
            border: `1px solid ${theme.palette.divider}`,
            backdropFilter: 'saturate(140%) blur(14px)',
            WebkitBackdropFilter: 'saturate(140%) blur(14px)',
            boxShadow: isDark
              ? `0 12px 40px ${alpha('#000', 0.35)}`
              : `0 12px 40px ${alpha('#000', 0.06)}`,
          }}
        >
          {/* Soft glow blobs in the background to make it feel like a "banner" */}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: `
                radial-gradient(ellipse at 0% 50%, ${alpha(primary, 0.12)} 0%, transparent 40%),
                radial-gradient(ellipse at 100% 50%, ${alpha(primary, 0.08)} 0%, transparent 40%)
              `,
            }}
          />

          <HowItWorksCarousel steps={STEPS} />

          <Stack
            direction="row"
            spacing={0}
            sx={{ position: 'relative', zIndex: 1, display: { xs: 'none', md: 'flex' } }}
            alignItems="stretch"
          >
            {STEPS.map((s) => (
              <StepNode key={s.title} {...s} />
            ))}
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
