import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Container,
  Stack,
  Typography,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { Link as RouterLink } from 'react-router-dom';
import LandingGlassIcon from './LandingGlassIcon';
import { PERSONAS } from '../../../data/personas';
import { LANDING_HORIZONTAL_CAROUSEL_SX } from '../../../utils/mobileTouchScroll';

const AUTO_ROTATE_MS = 5000;

function solutionPath(slug) {
  return `/solutions/${slug}`;
}

function AccentChip({ label, primary }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.25,
        py: 0.5,
        borderRadius: 999,
        bgcolor: (theme) =>
          theme.palette.mode === 'dark' ? alpha('#fff', 0.06) : alpha('#fff', 0.85),
        border: (theme) => `1px solid ${theme.palette.divider}`,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: primary }} />
      <Typography
        sx={{
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'text.secondary',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function UseCaseCard({ persona, index, total }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const { slug, label, iconName, teaser } = persona;
  const { headline, desc } = teaser;

  return (
    <Box
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${total}: ${label}`}
      sx={{
        scrollSnapAlign: 'center',
        scrollSnapStop: 'always',
        flex: {
          xs: '0 0 85%',
          sm: '0 0 60%',
          md: '0 0 calc((100% - 2 * 16px) / 3)',
        },
        maxWidth: { xs: 320, sm: 360, md: 'none' },
        minHeight: { xs: 280, md: 300 },
        display: 'flex',
        flexDirection: 'column',
        p: { xs: 2.75, md: 3 },
        borderRadius: 3,
        bgcolor: isDark ? alpha('#fff', 0.025) : alpha('#fff', 0.7),
        border: `1px solid ${theme.palette.divider}`,
        backdropFilter: 'saturate(140%) blur(10px)',
        WebkitBackdropFilter: 'saturate(140%) blur(10px)',
        transition: 'transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease',
        '&:hover': {
          transform: 'translateY(-3px)',
          borderColor: alpha(primary, 0.5),
          boxShadow: `0 14px 36px ${alpha(primary, 0.18)}`,
        },
      }}
    >
      <Stack
        direction="row"
        alignItems="flex-start"
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <LandingGlassIcon name={iconName} size={26} tone="brand" />
        <AccentChip label={label} primary={primary} />
      </Stack>

      <Typography
        sx={{
          fontWeight: 800,
          fontSize: { xs: '1.05rem', md: '1.15rem' },
          lineHeight: 1.25,
          color: 'text.primary',
          letterSpacing: '-0.005em',
          mb: 1.25,
        }}
      >
        {headline}
      </Typography>
      <Typography
        sx={{ fontSize: '0.9rem', color: 'text.secondary', lineHeight: 1.55, flex: 1, mb: 2 }}
      >
        {desc}
      </Typography>

      <Button
        component={RouterLink}
        to={solutionPath(slug)}
        variant="outlined"
        size="small"
        endIcon={<ArrowForwardIcon />}
        sx={{
          alignSelf: 'flex-start',
          fontWeight: 700,
          borderRadius: 2,
          textTransform: 'none',
          borderColor: alpha(primary, 0.4),
          '&:hover': { borderColor: 'primary.main', bgcolor: alpha(primary, 0.06) },
        }}
      >
        Read more
      </Button>
    </Box>
  );
}

function CarouselDots({ count, activeIndex, onSelect }) {
  return (
    <Stack
      direction="row"
      spacing={1}
      role="tablist"
      aria-label="Use case navigation"
      sx={{ mt: { xs: 3, md: 4 }, justifyContent: 'center' }}
    >
      {Array.from({ length: count }).map((_, idx) => {
        const isActive = idx === activeIndex;
        return (
          <Box
            key={idx}
            component="button"
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={`Go to use case ${idx + 1} of ${count}`}
            onClick={() => onSelect(idx)}
            sx={{
              cursor: 'pointer',
              border: 'none',
              p: 0,
              width: isActive ? 22 : 8,
              height: 8,
              borderRadius: 999,
              bgcolor: (theme) =>
                isActive ? theme.palette.primary.main : alpha(theme.palette.text.primary, 0.22),
              transition: 'width 200ms ease, background-color 200ms ease',
              '&:focus-visible': {
                outline: (theme) => `2px solid ${alpha(theme.palette.primary.main, 0.6)}`,
                outlineOffset: 2,
              },
            }}
          />
        );
      })}
    </Stack>
  );
}

export default function WhoItsFor() {
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const containerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const total = PERSONAS.length;

  const headingId = 'who-its-for-heading';

  const scrollToIndex = useCallback(
    (idx, behavior = 'smooth') => {
      const container = containerRef.current;
      if (!container) return;
      const target = container.querySelectorAll('[data-carousel-card]')[idx];
      if (!target) return;
      const targetCenter = target.offsetLeft + target.offsetWidth / 2;
      const containerCenter = container.clientWidth / 2;
      container.scrollTo({
        left: targetCenter - containerCenter,
        behavior: prefersReducedMotion ? 'auto' : behavior,
      });
    },
    [prefersReducedMotion]
  );

  const handleDotClick = useCallback(
    (idx) => {
      setActiveIndex(idx);
      scrollToIndex(idx);
    },
    [scrollToIndex]
  );

  // Track active card from manual scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let frame = null;
    const update = () => {
      frame = null;
      const cards = container.querySelectorAll('[data-carousel-card]');
      if (!cards.length) return;
      const containerCenter = container.scrollLeft + container.clientWidth / 2;
      let nearest = 0;
      let nearestDist = Infinity;
      cards.forEach((card, idx) => {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const dist = Math.abs(cardCenter - containerCenter);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = idx;
        }
      });
      setActiveIndex((prev) => (prev === nearest ? prev : nearest));
    };

    const onScroll = () => {
      if (frame != null) return;
      frame = requestAnimationFrame(update);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, []);

  // Auto-rotation
  useEffect(() => {
    if (prefersReducedMotion || isPaused) return undefined;

    let timer = null;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      if (document.visibilityState !== 'visible') {
        timer = setTimeout(tick, AUTO_ROTATE_MS);
        return;
      }
      setActiveIndex((prev) => {
        const next = (prev + 1) % total;
        scrollToIndex(next);
        return next;
      });
      timer = setTimeout(tick, AUTO_ROTATE_MS);
    };

    timer = setTimeout(tick, AUTO_ROTATE_MS);
    return () => {
      stopped = true;
      if (timer != null) clearTimeout(timer);
    };
  }, [isPaused, prefersReducedMotion, scrollToIndex, total]);

  const cards = useMemo(
    () =>
      PERSONAS.map((persona, idx) => (
        <Box key={persona.slug} data-carousel-card sx={{ display: 'flex' }}>
          <UseCaseCard persona={persona} index={idx} total={total} />
        </Box>
      )),
    [total]
  );

  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      sx={{ py: { xs: 8, md: 12 }, pb: { xs: 6, md: 8 } }}
    >
      <Container maxWidth="lg">
        <Stack spacing={2} alignItems="center" textAlign="center" sx={{ mb: { xs: 5, md: 7 } }}>
          <Typography
            sx={{
              fontSize: '0.85rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'primary.main',
            }}
          >
            How it&apos;s used
          </Typography>
          <Typography
            id={headingId}
            component="h2"
            sx={{
              fontSize: { xs: '2rem', md: '2.75rem' },
              fontWeight: 800,
              lineHeight: 1.15,
              color: 'text.primary',
              maxWidth: 760,
            }}
          >
            Orqaly in Practice
          </Typography>
          <Typography sx={{ fontSize: '1.05rem', color: 'text.secondary', maxWidth: 580 }}>
            Ten teams, ten industries, one platform - adapted to each.
          </Typography>
        </Stack>
      </Container>

      <Box
        role="region"
        aria-roledescription="carousel"
        aria-label="How people use Orqaly"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={() => setIsPaused(false)}
      >
        <Container maxWidth="lg" sx={{ px: { xs: 0, md: 3 } }}>
          <Box
            ref={containerRef}
            data-landing-carousel="x"
            sx={{
              display: 'flex',
              gap: { xs: 1.5, md: 2 },
              overflowX: 'auto',
              scrollSnapType: 'x mandatory',
              scrollPaddingInline: { xs: '7.5%', sm: '20%', md: 0 },
              px: { xs: '7.5%', sm: '20%', md: 0 },
              pb: 1,
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
              ...LANDING_HORIZONTAL_CAROUSEL_SX,
            }}
          >
            {cards}
          </Box>
        </Container>

        <Container maxWidth="lg">
          <CarouselDots count={total} activeIndex={activeIndex} onSelect={handleDotClick} />
        </Container>
      </Box>
    </Box>
  );
}
