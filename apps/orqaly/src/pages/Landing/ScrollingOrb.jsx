import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { resolveAccent } from '../../theme/enterpriseTheme';
import AiOrb from '../../components/VoiceControl/AiOrb';

// Per-section orb behavior. The keys match the `data-orb-section` attribute
// values declared on each landing section.
// `alpha` scales the final orb opacity (0..1). For hero we want a large
// background orb at low alpha so the H1 and demo window stay readable.
// scale 0 still means "hide" for sections that already render their own
// in-flow orb (trust hub / voice stage).
const SECTION_CFG = {
  hero: {
    side: 'center',
    y: 0.55,
    yDrift: 0,
    scale: 5.2,
    glow: 0.55,
    alpha: 0.32,
    state: 'idle',
    trick: null,
    tint: null,
    lock: false,
  },
  trust: {
    side: 'center',
    y: 0.5,
    yDrift: 0,
    scale: 0.0,
    glow: 0.0,
    alpha: 0,
    state: 'idle',
    trick: null,
    tint: null,
    lock: false,
  },
  problem: {
    side: 'left',
    y: 0.3,
    yDrift: 0.2,
    scale: 1.1,
    glow: 0.45,
    alpha: 0.55,
    state: 'searching',
    trick: 'rings',
    tint: null,
    lock: false,
  },
  'how-it-works': {
    side: 'right',
    y: 0.7,
    yDrift: -0.3,
    scale: 1.3,
    glow: 0.55,
    alpha: 0.55,
    state: 'searching',
    trick: 'particles',
    tint: null,
    lock: false,
  },
  consilium: {
    side: 'right',
    y: 0.55,
    yDrift: 0.12,
    scale: 1.45,
    glow: 0.58,
    alpha: 0.58,
    state: 'listening',
    trick: 'rings',
    tint: null,
    lock: false,
  },
  'token-tracking': {
    side: 'left',
    y: 0.5,
    yDrift: 0.18,
    scale: 1.35,
    glow: 0.52,
    alpha: 0.55,
    state: 'searching',
    trick: 'particles',
    tint: null,
    lock: false,
  },
  tech: {
    side: 'left',
    y: 0.45,
    yDrift: 0.15,
    scale: 1.8,
    glow: 0.6,
    alpha: 0.6,
    state: 'idle',
    trick: 'tintShift',
    tint: '#3b82f6',
    lock: false,
  },
  voice: {
    side: 'center',
    y: 0.5,
    yDrift: 0,
    scale: 0.0,
    glow: 0.0,
    alpha: 0,
    state: 'speaking',
    trick: null,
    tint: null,
    lock: false,
  },
  features: {
    side: 'right',
    y: 0.25,
    yDrift: 0.4,
    scale: 1.2,
    glow: 0.55,
    alpha: 0.55,
    state: 'listening',
    trick: 'rings',
    tint: null,
    lock: false,
  },
  earn: {
    side: 'right',
    y: 0.42,
    yDrift: 0.18,
    scale: 1.2,
    glow: 0.5,
    alpha: 0.5,
    state: 'listening',
    trick: 'rings',
    tint: null,
    lock: false,
  },
  personas: {
    side: 'left',
    y: 0.75,
    yDrift: -0.2,
    scale: 0.95,
    glow: 0.4,
    alpha: 0.55,
    state: 'idle',
    trick: null,
    tint: null,
    lock: false,
  },
  marketplace: {
    side: 'right',
    y: 0.5,
    yDrift: 0,
    scale: 1.4,
    glow: 0.6,
    alpha: 0.55,
    state: 'speaking',
    trick: 'particles',
    tint: null,
    lock: false,
  },
  pricing: {
    side: 'right',
    y: 0.35,
    yDrift: 0.3,
    scale: 1.1,
    glow: 0.5,
    alpha: 0.55,
    state: 'searching',
    trick: 'tintShift',
    tint: '#f59e0b',
    lock: false,
  },
  investor: {
    side: 'right',
    y: 0.5,
    yDrift: 0,
    scale: 1.1,
    glow: 0.5,
    alpha: 0.55,
    state: 'searching',
    trick: 'rings',
    tint: null,
    lock: false,
  },
  faq: {
    side: 'left',
    y: 0.6,
    yDrift: 0,
    scale: 0.75,
    glow: 0.3,
    alpha: 0.55,
    state: 'idle',
    trick: null,
    tint: null,
    lock: false,
  },
  cta: {
    side: 'center',
    y: 0.5,
    yDrift: 0,
    scale: 1.85,
    glow: 0.7,
    alpha: 0.65,
    state: 'speaking',
    trick: 'rippleWave',
    tint: null,
    lock: true,
  },
};

const DEFAULT_CFG = SECTION_CFG.hero;
// Follows the accent chosen in Settings (brand emerald by default).
const EMERALD = resolveAccent().main;

function GreenOrb(props) {
  const greenTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: 'dark',
          primary: resolveAccent(),
        },
      }),
    []
  );
  return (
    <ThemeProvider theme={greenTheme}>
      <AiOrb {...props} />
    </ThemeProvider>
  );
}

// ─── Trick layers ───────────────────────────────────────────────────────────
function TrickLayer({ trick, sectionKey, size, tint }) {
  if (!trick) return null;
  const accent = tint || EMERALD;

  if (trick === 'rings') {
    return (
      <Box
        key={`rings-${sectionKey}`}
        sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: `1.5px solid ${accent}`,
              opacity: 0,
              animation: `orbRingPulse 3.2s ease-out ${i * 1.05}s infinite`,
              '@keyframes orbRingPulse': {
                '0%': { transform: 'scale(0.6)', opacity: 0.55 },
                '70%': { opacity: 0.15 },
                '100%': { transform: 'scale(2.4)', opacity: 0 },
              },
            }}
          />
        ))}
      </Box>
    );
  }

  if (trick === 'particles') {
    return (
      <Box
        key={`particles-${sectionKey}`}
        sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {[0, 1, 2, 3].map((i) => {
          const radius = size * (0.7 + i * 0.1);
          return (
            <Box
              key={i}
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: accent,
                boxShadow: `0 0 12px ${accent}`,
                opacity: 0.85,
                transformOrigin: 'center',
                animation: `orbParticle${i} ${3.5 + i * 0.6}s linear infinite`,
                [`@keyframes orbParticle${i}`]: {
                  '0%': {
                    transform: `translate(-50%, -50%) rotate(${i * 90}deg) translateX(${radius}px)`,
                  },
                  '100%': {
                    transform: `translate(-50%, -50%) rotate(${i * 90 + 360}deg) translateX(${radius}px)`,
                  },
                },
              }}
            />
          );
        })}
      </Box>
    );
  }

  if (trick === 'tintShift') {
    return (
      <Box
        key={`tint-${sectionKey}`}
        sx={{
          position: 'absolute',
          inset: '-20%',
          borderRadius: '50%',
          pointerEvents: 'none',
          background: `radial-gradient(circle, ${accent}55 0%, ${accent}22 35%, transparent 70%)`,
          filter: 'blur(10px)',
          animation: 'orbTintPulse 4s ease-in-out infinite',
          '@keyframes orbTintPulse': {
            '0%, 100%': { opacity: 0.45, transform: 'scale(0.95)' },
            '50%': { opacity: 0.85, transform: 'scale(1.08)' },
          },
        }}
      />
    );
  }

  if (trick === 'beam') {
    return (
      <Box
        key={`beam-${sectionKey}`}
        sx={{
          position: 'absolute',
          inset: '-60% -10%',
          borderRadius: '50%',
          pointerEvents: 'none',
          background: `conic-gradient(from 90deg at 50% 50%, transparent 0deg, ${accent}55 18deg, transparent 50deg, transparent 130deg, ${accent}33 200deg, transparent 250deg, transparent 360deg)`,
          filter: 'blur(10px)',
          animation: 'orbBeamSpin 9s linear infinite',
          '@keyframes orbBeamSpin': {
            from: { transform: 'rotate(0deg)' },
            to: { transform: 'rotate(360deg)' },
          },
        }}
      />
    );
  }

  if (trick === 'rippleWave') {
    return (
      <Box
        key={`wave-${sectionKey}`}
        sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {[0, 1].map((i) => (
          <Box
            key={i}
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: `2px solid ${accent}`,
              opacity: 0,
              animation: `orbRippleWave 2.4s ease-out ${i * 0.8}s infinite`,
              '@keyframes orbRippleWave': {
                '0%': { transform: 'scale(0.4)', opacity: 0.8, borderWidth: '2px' },
                '70%': { borderWidth: '1px' },
                '100%': { transform: 'scale(3.2)', opacity: 0, borderWidth: '0.5px' },
              },
            }}
          />
        ))}
      </Box>
    );
  }

  return null;
}

export default function ScrollingOrb() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const orbRef = useRef(null);
  const glowRef = useRef(null);
  const trickRef = useRef(null);
  const rafId = useRef(null);
  // Start the orb at roughly where the header NavOrb sits so the first paint
  // animates it sliding from the logo into the hero.
  const initialPos = useMemo(() => {
    if (typeof window === 'undefined') return { x: 80, y: 36 };
    const vw = window.innerWidth;
    return { x: Math.max(48, vw < 600 ? vw * 0.08 : vw * 0.11), y: 36 };
  }, []);
  const cur = useRef({ x: initialPos.x, y: initialPos.y, s: 0.25, g: 0.1, o: 1, to: 0, a: 1 });
  const tgt = useRef({ x: initialPos.x, y: initialPos.y, s: 0.25, g: 0.1, o: 1, to: 0, a: 1 });
  const secRects = useRef([]);
  const [activeSection, setActiveSection] = useState('hero');
  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  const orbSize = isMobile ? 90 : 150;
  const glowSize = isMobile ? 220 : 420;

  const measure = useCallback(() => {
    const els = document.querySelectorAll('[data-orb-section]');
    secRects.current = Array.from(els).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute('data-orb-section'),
        top: r.top + window.scrollY,
        height: r.height,
      };
    });
  }, []);

  useEffect(() => {
    measure();
    const t1 = setTimeout(measure, 600);
    const t2 = setTimeout(measure, 1600);
    let timer;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(measure, 200);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [measure]);

  // Scroll → compute target position
  useEffect(() => {
    const onScroll = () => {
      const rects = secRects.current;
      if (!rects.length) return;
      const sy = Math.max(0, window.scrollY);
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      // Find the active section (last whose top is above viewport mid).
      let activeIdx = 0;
      for (let i = rects.length - 1; i >= 0; i -= 1) {
        if (sy >= rects[i].top - vh * 0.5) {
          activeIdx = i;
          break;
        }
      }
      const rect = rects[activeIdx];
      const id = rect?.id || 'hero';
      const cfg = SECTION_CFG[id] || DEFAULT_CFG;

      const progress = rect
        ? Math.min(1, Math.max(0, (sy - rect.top + vh * 0.4) / Math.max(rect.height, 1)))
        : 0;

      // Horizontal placement varies per section.
      const sideOffsets = {
        center: vw * 0.5,
        left: isMobile ? vw * 0.2 : vw * 0.22,
        right: isMobile ? vw * 0.8 : vw * 0.78,
      };
      const targetX = sideOffsets[cfg.side] || vw * 0.5;
      const baseY = vh * cfg.y;
      const driftPx = (cfg.yDrift || 0) * vh * progress;
      const targetY = cfg.lock ? baseY : baseY + driftPx;

      tgt.current = {
        x: targetX,
        y: targetY,
        s: cfg.scale * (isMobile ? 0.85 : 1),
        g: cfg.glow,
        o: cfg.scale > 0.01 ? 1 : 0,
        to: cfg.trick ? 1 : 0,
        a: cfg.alpha ?? 1,
      };
      setActiveSection((prev) => (prev !== id ? id : prev));
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isMobile]);

  // rAF animation loop
  useEffect(() => {
    if (reducedMotion) return undefined;
    const SPEED = 0.07;
    const tick = () => {
      const c = cur.current;
      const t = tgt.current;
      c.x += (t.x - c.x) * SPEED;
      c.y += (t.y - c.y) * SPEED;
      c.s += (t.s - c.s) * SPEED;
      c.g += (t.g - c.g) * SPEED;
      c.o += (t.o - c.o) * SPEED;
      c.to += (t.to - c.to) * SPEED;
      c.a += (t.a - c.a) * SPEED;

      if (orbRef.current) {
        orbRef.current.style.transform = `translate3d(${c.x - orbSize / 2}px, ${c.y - orbSize / 2}px, 0) scale(${c.s})`;
        orbRef.current.style.opacity = c.o * c.a;
      }
      if (glowRef.current) {
        glowRef.current.style.transform = `translate3d(${c.x - glowSize / 2}px, ${c.y - glowSize / 2}px, 0) scale(${Math.max(1, c.s * 0.35)})`;
        glowRef.current.style.opacity = c.g * c.o * c.a;
      }
      if (trickRef.current) {
        trickRef.current.style.transform = `translate3d(${c.x - orbSize / 2}px, ${c.y - orbSize / 2}px, 0) scale(${c.s})`;
        trickRef.current.style.opacity = c.to * c.o;
      }

      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [orbSize, glowSize, reducedMotion]);

  const cfg = SECTION_CFG[activeSection] || DEFAULT_CFG;

  // Reduced motion: render a single static orb in the corner of the hero.
  if (reducedMotion) {
    return (
      <Box
        sx={{
          position: 'fixed',
          right: { xs: 16, md: 40 },
          top: { xs: 96, md: 120 },
          width: orbSize * 0.7,
          height: orbSize * 0.7,
          opacity: 0.5,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        <GreenOrb size={orbSize * 0.7} state="idle" disableFloat />
      </Box>
    );
  }

  return (
    <>
      <Box
        aria-hidden
        sx={{ position: 'fixed', inset: 0, pointerEvents: 'none', touchAction: 'pan-y', zIndex: 0 }}
      >
        {/* Ambient glow */}
        <Box
          ref={glowRef}
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: glowSize,
            height: glowSize,
            borderRadius: '50%',
            background: cfg.tint
              ? `radial-gradient(ellipse at center, ${cfg.tint}33 0%, ${cfg.tint}11 30%, ${cfg.tint}08 60%, transparent 80%)`
              : 'radial-gradient(ellipse at center, rgba(var(--app-accent-rgb),0.18) 0%, rgba(var(--app-accent-rgb),0.06) 30%, rgba(var(--app-accent-dark-rgb),0.02) 60%, transparent 80%)',
            pointerEvents: 'none',
            willChange: 'transform, opacity',
            zIndex: 0,
            filter: 'blur(4px)',
            transition: 'background 700ms ease',
          }}
        />
        {/* Trick layer (rings / particles / tint / beam / ripple) */}
        <Box
          ref={trickRef}
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: orbSize,
            height: orbSize,
            pointerEvents: 'none',
            willChange: 'transform, opacity',
            zIndex: 0,
            opacity: 0,
          }}
        >
          <TrickLayer trick={cfg.trick} sectionKey={activeSection} size={orbSize} tint={cfg.tint} />
        </Box>
        {/* Main orb */}
        <Box
          ref={orbRef}
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: orbSize,
            height: orbSize,
            pointerEvents: 'none',
            willChange: 'transform, opacity',
            zIndex: 0,
            opacity: 0.55,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <GreenOrb size={orbSize} state={cfg.state} disableFloat={false} />
        </Box>
      </Box>
    </>
  );
}
