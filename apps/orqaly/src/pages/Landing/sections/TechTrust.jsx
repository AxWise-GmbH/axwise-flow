import { useEffect, useRef, useState } from 'react';
import { Box, Container, Stack, Typography, alpha, useMediaQuery, useTheme } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import PowerSettingsNewOutlinedIcon from '@mui/icons-material/PowerSettingsNewOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import LandingGlassIcon from './LandingGlassIcon';
import { ByosVaultVisual, AnywhereScanVisual } from './TechTrustVisuals';
import { LANDING_HORIZONTAL_CAROUSEL_SX } from '../../../utils/mobileTouchScroll';

const PILLARS = [
  {
    id: 'byos',
    chips: ['BYOS', 'Sovereign'],
    emphasis: 'You Control',
    rest: '- Your Data.',
    desc: 'Plug in your own Supabase, Postgres, or self-hosted store. Credentials live on your side. We hold no copy.',
    microCtas: [
      'Not sure where to start? We’ll help.',
      'Set up once, ready forever',
      'Create - Review - Enjoy',
    ],
    Visual: ByosVaultVisual,
    iconName: 'LockOutlined',
    Fallback: LockOutlinedIcon,
    proofs: [
      {
        id: 'keys',
        iconName: 'VpnKeyOutlined',
        Fallback: VpnKeyOutlinedIcon,
        title: 'Your keys.',
        desc: 'Stored on your machine, we don’t have access.',
      },
      {
        id: 'db',
        iconName: 'StorageOutlined',
        Fallback: StorageOutlinedIcon,
        title: 'Your database.',
        desc: "Bring any Postgres. We're a guest, not the owner.",
      },
      {
        id: 'revoke',
        iconName: 'PowerSettingsNewOutlined',
        Fallback: PowerSettingsNewOutlinedIcon,
        title: 'One-click revoke.',
        desc: 'Disconnect any time - you will keep data.',
      },
    ],
  },
  {
    id: 'anywhere',
    chips: ['VT-scanned', 'Sandboxed'],
    emphasis: 'Add and customize',
    rest: '- securely.',
    desc: 'Drop in any tool, agent, dataset, webhook, or file. We hash it, scan it via VirusTotal, sandbox it, and only then let it touch your space.',
    Visual: AnywhereScanVisual,
    iconName: 'Inventory2Outlined',
    Fallback: Inventory2OutlinedIcon,
    proofs: [
      {
        id: 'vt',
        iconName: 'VerifiedUserOutlined',
        Fallback: VerifiedUserOutlinedIcon,
        title: 'VirusTotal pass.',
        desc: 'Every import hashed and checked. Dirty files refused.',
      },
      {
        id: 'sandbox',
        iconName: 'ScienceOutlined',
        Fallback: ScienceOutlinedIcon,
        title: 'Sandboxed first run.',
        desc: 'Code runs in isolation before it sees your DB.',
      },
      {
        id: 'revert',
        iconName: 'UndoOutlined',
        Fallback: UndoOutlinedIcon,
        title: 'Reversible by design.',
        desc: 'Undo any import. Nothing in your space is final.',
      },
    ],
  },
];

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

function PillarHero({ pillar }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const { chips, emphasis, rest, desc, microCtas, Visual, iconName, Fallback } = pillar;

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 4,
        p: { xs: 3, md: 4 },
        bgcolor: isDark ? alpha(primary, 0.08) : alpha(primary, 0.04),
        border: `1px solid ${alpha(primary, 0.3)}`,
        backdropFilter: 'saturate(140%) blur(12px)',
        WebkitBackdropFilter: 'saturate(140%) blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease',
        '&:hover': {
          transform: 'translateY(-3px)',
          borderColor: alpha(primary, 0.5),
          boxShadow: `0 14px 36px ${alpha(primary, 0.18)}`,
        },
      }}
    >
      {/* Hero glow halo */}
      <Box
        sx={{
          position: 'absolute',
          right: '-6%',
          top: '30%',
          width: '45%',
          aspectRatio: '1 / 1',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(primary, 0.28)} 0%, transparent 70%)`,
          filter: 'blur(20px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Background visual */}
      <Box
        sx={{
          position: 'absolute',
          right: -30,
          bottom: -30,
          width: { xs: 240, md: 320 },
          height: { xs: 200, md: 260 },
          color: primary,
          opacity: 0.55,
          pointerEvents: 'none',
          zIndex: 0,
          display: { xs: 'none', sm: 'block' },
        }}
      >
        <Visual />
      </Box>

      {/* Content */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5}>
          <LandingGlassIcon name={iconName} fallback={Fallback} size={28} tone="brand" solid />
          <Stack
            direction="row"
            spacing={0.75}
            flexWrap="wrap"
            justifyContent="flex-end"
            useFlexGap
          >
            {chips.map((chip) => (
              <AccentChip key={chip} label={chip} primary={primary} />
            ))}
          </Stack>
        </Stack>

        <Box sx={{ height: '10px' }} />

        <Box sx={{ maxWidth: 540 }}>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: { xs: '1.6rem', md: '2.1rem' },
              lineHeight: 1.15,
              color: 'text.primary',
              letterSpacing: '-0.01em',
              mb: 1,
            }}
          >
            <Box component="span" sx={{ color: 'primary.main' }}>
              {emphasis}
            </Box>
            <Box component="span"> {rest}</Box>
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '0.95rem', md: '1rem' },
              color: 'text.secondary',
              lineHeight: 1.55,
            }}
          >
            {desc}
          </Typography>
          {microCtas?.length ? (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
              {microCtas.map((label) => (
                <Box
                  key={label}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    px: 1.5,
                    py: 0.6,
                    borderRadius: 999,
                    border: `1px solid ${alpha(primary, 0.35)}`,
                    bgcolor: alpha(primary, 0.08),
                    color: primary,
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    transition:
                      'background-color 180ms ease, border-color 180ms ease, transform 180ms ease',
                    '&:hover': {
                      bgcolor: alpha(primary, 0.14),
                      borderColor: alpha(primary, 0.55),
                      transform: 'translateY(-1px)',
                    },
                  }}
                >
                  {label}
                </Box>
              ))}
            </Stack>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}

function ProofTile({ proof }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const { iconName, Fallback, title, desc } = proof;

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 3,
        p: { xs: 2.5, md: 3 },
        height: '100%',
        bgcolor: isDark ? alpha('#fff', 0.025) : alpha('#fff', 0.7),
        border: `1px solid ${theme.palette.divider}`,
        backdropFilter: 'saturate(140%) blur(10px)',
        WebkitBackdropFilter: 'saturate(140%) blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease',
        '&:hover': {
          transform: 'translateY(-3px)',
          borderColor: alpha(primary, 0.5),
          boxShadow: `0 14px 36px ${alpha(primary, 0.18)}`,
        },
      }}
    >
      <Box sx={{ mb: 2 }}>
        <LandingGlassIcon name={iconName} fallback={Fallback} size={22} tone="brand" solid />
      </Box>
      <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary', mb: 1 }}>
        {title}
      </Typography>
      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', lineHeight: 1.55, flex: 1 }}>
        {desc}
      </Typography>
    </Box>
  );
}

function ProofCarousel({ proofs }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const containerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const snapCount = Math.max(1, proofs.length - 1);

  useEffect(() => {
    if (!isMobile || reduceMotion || isPaused) return undefined;
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % snapCount);
    }, 5000);
    return () => clearInterval(id);
  }, [isMobile, reduceMotion, isPaused, snapCount]);

  useEffect(() => {
    if (!isMobile) return;
    const el = containerRef.current;
    if (!el) return;
    const cards = el.querySelectorAll('[data-proof-card]');
    const target = cards[activeIndex];
    if (target) {
      el.scrollTo({ left: target.offsetLeft - el.offsetLeft, behavior: 'smooth' });
    }
  }, [activeIndex, isMobile]);

  if (!isMobile) {
    return (
      <Box
        sx={{
          display: 'grid',
          gap: '10px',
          gridTemplateColumns: 'repeat(3, 1fr)',
        }}
      >
        {proofs.map((proof) => (
          <ProofTile key={proof.id} proof={proof} />
        ))}
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      data-landing-carousel="x"
      onTouchStart={() => setIsPaused(true)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      sx={{
        display: 'flex',
        gap: '10px',
        overflowX: 'auto',
        scrollSnapType: 'x mandatory',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        ...LANDING_HORIZONTAL_CAROUSEL_SX,
      }}
    >
      {proofs.map((proof) => (
        <Box
          key={proof.id}
          data-proof-card
          sx={{
            flex: '0 0 calc(50% - 5px)',
            scrollSnapAlign: 'start',
            minWidth: 0,
          }}
        >
          <ProofTile proof={proof} />
        </Box>
      ))}
    </Box>
  );
}

export default function TechTrust() {
  const theme = useTheme();
  return (
    <Box
      component="section"
      id="tech"
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
            Your : Keys &amp; Storage
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
            Your setup - Your Rules
          </Typography>
          <Typography sx={{ fontSize: '1.05rem', color: 'text.secondary', maxWidth: 580 }}>
            Stay independent. Connect your own cloud storage, databases.
          </Typography>
        </Stack>

        <Stack spacing="10px">
          {PILLARS.map((pillar) => (
            <Stack key={pillar.id} spacing="10px">
              <PillarHero pillar={pillar} />
              <ProofCarousel proofs={pillar.proofs} />
            </Stack>
          ))}
        </Stack>

        <Stack alignItems="center" sx={{ mt: { xs: 6, md: 8 } }}>
          <Typography
            sx={{
              fontSize: { xs: '0.95rem', md: '1rem' },
              color: 'text.secondary',
              textAlign: 'center',
              maxWidth: 640,
            }}
          >
            No vendor lock-in. &nbsp;·&nbsp; No silent telemetry. &nbsp;·&nbsp; No data we
            shouldn&apos;t have.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
