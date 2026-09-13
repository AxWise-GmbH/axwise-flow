import { useEffect, useState } from 'react';
import { Box, Container, Stack, Typography, alpha, useMediaQuery, useTheme } from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import Reveal from '../../../components/Common/Reveal';

// Drop the generated photo at this path (see the hero photo prompt in the
// project plan) to replace the gradient placeholder below. Until then the
// hero renders a CSS-only placeholder so the page ships without the asset.
const HERO_PHOTO_SRC = new URL('../../../assets/landing/hero-person.jpg', import.meta.url).href;

function HeroPhoto() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [imageReady, setImageReady] = useState(false);
  const [offsetY, setOffsetY] = useState(0);

  useEffect(() => {
    if (reduceMotion) return undefined;
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const clamped = Math.max(-16, Math.min(16, window.scrollY * 0.04));
        setOffsetY(clamped);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduceMotion]);

  return (
    <Box
      sx={{
        position: 'relative',
        width: { xs: '100%', md: 420 },
        maxWidth: 420,
        aspectRatio: '4 / 5',
        mx: { xs: 'auto', md: 0 },
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: -28,
          background: `radial-gradient(ellipse at center, ${alpha(primary, 0.22)} 0%, transparent 68%)`,
          filter: 'blur(28px)',
          zIndex: 0,
          pointerEvents: 'none',
          animation: reduceMotion ? 'none' : 'simpleHeroGlowPulse 6s ease-in-out infinite',
        },
        '@keyframes simpleHeroGlowPulse': {
          '0%, 100%': { opacity: 0.7, transform: 'scale(1)' },
          '50%': { opacity: 1, transform: 'scale(1.04)' },
        },
      }}
    >
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          height: '100%',
          borderRadius: 4,
          overflow: 'hidden',
          border: `1px solid ${alpha(primary, 0.18)}`,
          bgcolor: alpha(primary, 0.06),
          transform: `translateY(${offsetY}px)`,
          transition: reduceMotion ? 'none' : 'transform 120ms linear',
        }}
      >
        <Box
          component="img"
          src={HERO_PHOTO_SRC}
          alt="A person working alongside their AI agent team"
          loading="eager"
          onLoad={() => setImageReady(true)}
          onError={() => setImageReady(false)}
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: imageReady ? 'block' : 'none',
          }}
        />
        {!imageReady && (
          <Stack
            alignItems="center"
            justifyContent="center"
            spacing={1}
            sx={{ width: '100%', height: '100%', color: alpha(primary, 0.55) }}
          >
            <AutoAwesomeOutlinedIcon sx={{ fontSize: 40 }} />
          </Stack>
        )}
      </Box>
    </Box>
  );
}

export default function SimpleHero({ onPrimaryCta }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        pt: { xs: 14, md: 18 },
        pb: { xs: 8, md: 10 },
        overflow: 'hidden',
      }}
    >
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 5, md: 8 }}
          alignItems="center"
          justifyContent="center"
        >
          <Reveal sx={{ order: { xs: 1, md: 2 }, flexShrink: 0 }}>
            <HeroPhoto />
          </Reveal>

          <Stack
            spacing={2.5}
            sx={{ order: { xs: 2, md: 1 }, flex: 1, textAlign: { xs: 'center', md: 'left' } }}
          >
            <Reveal>
              <Typography
                variant="h1"
                sx={{
                  fontSize: { xs: '2.25rem', sm: '3rem', md: '3.5rem' },
                  fontWeight: 800,
                  lineHeight: 1.08,
                  letterSpacing: '-0.02em',
                  background: `linear-gradient(180deg, ${theme.palette.text.primary} 0%, ${alpha(theme.palette.text.primary, 0.75)} 100%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Your AI team, ready to work.
              </Typography>
            </Reveal>

            <Reveal delay={80}>
              <Typography
                sx={{
                  fontSize: { xs: '1.05rem', md: '1.2rem' },
                  color: 'text.secondary',
                  maxWidth: 480,
                  lineHeight: 1.55,
                  mx: { xs: 'auto', md: 0 },
                }}
              >
                Describe a goal. Agents plan it, build it, and run it - while you stay in control.
              </Typography>
            </Reveal>

            <Reveal delay={160}>
              <Box sx={{ pt: 1 }}>
                <MarketingCtaButton
                  size="large"
                  onClick={onPrimaryCta}
                  sx={{ px: 3.5, borderColor: alpha(primary, 0.4) }}
                >
                  Start free
                </MarketingCtaButton>
              </Box>
            </Reveal>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
