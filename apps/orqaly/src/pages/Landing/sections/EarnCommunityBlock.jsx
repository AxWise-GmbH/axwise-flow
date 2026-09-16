import { useState } from 'react';
import {
  Box,
  Button,
  Collapse,
  Container,
  Grid,
  Stack,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import LandingGlassIcon from './LandingGlassIcon';
import {
  EARN_FEATURE_TILES,
  EARN_HANDSHAKE_BANNER,
  EARN_HERO,
  EARN_PILLARS,
  EARN_TIMELINE,
} from '../../../data/earnEconomy';
import { EARN_PILLAR_MOCKS } from '../../../components/Public/earn/EarnEconomyMocks';

const TILE_FALLBACKS = {
  MemoryOutlined: MemoryOutlinedIcon,
  StorefrontRounded: StorefrontOutlinedIcon,
  CloudUploadOutlined: CloudUploadOutlinedIcon,
  AccountBalanceWalletOutlined: AccountBalanceWalletOutlinedIcon,
};

const ICON_TILE = 51;
const BANNER_PAD_Y_MD = 48;
const LINE_TOP_MD = BANNER_PAD_Y_MD + ICON_TILE / 2;

function TimelineStep({ n, title, body }) {
  return (
    <Stack
      alignItems="center"
      textAlign="center"
      sx={{ flex: 1, position: 'relative', zIndex: 1, px: 1 }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '0.75rem',
          mb: 2,
        }}
      >
        {n}
      </Box>
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: { xs: '1rem', md: '1.1rem' },
          color: 'text.primary',
          mb: 0.75,
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </Typography>
      <Typography
        sx={{ fontSize: '0.85rem', color: 'text.secondary', lineHeight: 1.55, maxWidth: 220 }}
      >
        {body}
      </Typography>
    </Stack>
  );
}

function PillarRow({ pillar }) {
  const Mock = EARN_PILLAR_MOCKS[pillar.id];

  return (
    <Box sx={{ py: { xs: 5, md: 6 } }}>
      <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center">
        <Grid
          size={{ xs: 12, md: 6 }}
          sx={{ order: pillar.reverse ? { xs: 1, md: 2 } : undefined }}
        >
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: { xs: '1.35rem', md: '1.75rem' },
              color: 'text.primary',
              mb: 2,
              letterSpacing: '-0.01em',
            }}
          >
            {pillar.title}
          </Typography>
          <Typography
            sx={{
              fontSize: '0.95rem',
              color: 'text.secondary',
              lineHeight: 1.7,
              mb: pillar.extra ? 2 : 0,
            }}
          >
            {pillar.body}
          </Typography>
          {pillar.extra && (
            <Typography sx={{ fontSize: '0.95rem', color: 'text.secondary', lineHeight: 1.7 }}>
              {pillar.extra}
            </Typography>
          )}
        </Grid>
        <Grid
          size={{ xs: 12, md: 6 }}
          sx={{ order: pillar.reverse ? { xs: 2, md: 1 } : undefined }}
        >
          {Mock ? <Mock /> : null}
        </Grid>
      </Grid>
    </Box>
  );
}

export default function EarnCommunityBlock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [expanded, setExpanded] = useState(false);

  return (
    <Box
      component="section"
      id="earn"
      sx={{
        py: { xs: 8, md: 12 },
      }}
    >
      <Container maxWidth="lg">
        <Stack spacing={2} alignItems="center" textAlign="center" sx={{ mb: { xs: 5, md: 6 } }}>
          <Typography
            sx={{
              fontSize: '0.85rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'primary.main',
            }}
          >
            {EARN_HERO.landingEyebrow}
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '2rem', md: '2.75rem' },
              fontWeight: 800,
              lineHeight: 1.15,
              color: 'text.primary',
              maxWidth: 760,
            }}
          >
            {EARN_HERO.title}
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '1rem', md: '1.15rem' },
              color: 'text.secondary',
              maxWidth: 640,
              lineHeight: 1.65,
            }}
          >
            {EARN_HERO.subtitle}
          </Typography>
        </Stack>

        <Grid container spacing={2} sx={{ mb: { xs: 5, md: 6 } }}>
          {EARN_FEATURE_TILES.map(({ iconName, title, body }) => (
            <Grid key={title} size={{ xs: 6, md: 3 }}>
              <Stack
                spacing={1.5}
                sx={{
                  height: '100%',
                  p: 2.5,
                  borderRadius: 3,
                  bgcolor: isDark ? alpha('#fff', 0.025) : alpha('#fff', 0.7),
                  border: `1px solid ${theme.palette.divider}`,
                  backdropFilter: 'saturate(140%) blur(10px)',
                  WebkitBackdropFilter: 'saturate(140%) blur(10px)',
                  transition:
                    'transform 250ms ease, border-color 250ms ease, box-shadow 250ms ease',
                  '&:hover': {
                    transform: 'translateY(-3px)',
                    borderColor: alpha(primary, 0.4),
                    boxShadow: `0 10px 28px ${alpha(primary, 0.15)}`,
                  },
                }}
              >
                <LandingGlassIcon
                  name={iconName}
                  fallback={TILE_FALLBACKS[iconName]}
                  size={24}
                  tone="brand"
                />
                <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'text.primary' }}>
                  {title}
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', lineHeight: 1.45 }}>
                  {body}
                </Typography>
              </Stack>
            </Grid>
          ))}
        </Grid>

        <Box
          sx={{
            p: { xs: 3, md: 4 },
            borderRadius: 3,
            background: `linear-gradient(135deg, ${alpha(primary, 0.1)} 0%, ${alpha(primary, 0.02)} 100%)`,
            border: `1px solid ${alpha(primary, 0.3)}`,
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { md: 'center' },
            gap: 3,
            mb: { xs: 3, md: 4 },
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 2,
              bgcolor: primary,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <HandshakeOutlinedIcon sx={{ fontSize: 28 }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography
              sx={{ fontWeight: 800, fontSize: '1.35rem', color: 'text.primary', mb: 0.5 }}
            >
              {EARN_HANDSHAKE_BANNER.title}
            </Typography>
            <Typography sx={{ fontSize: '0.95rem', color: 'text.secondary', lineHeight: 1.6 }}>
              {EARN_HANDSHAKE_BANNER.body}
            </Typography>
          </Box>
        </Box>

        <Stack alignItems="center" sx={{ mb: expanded ? { xs: 4, md: 5 } : 0 }}>
          <Button
            variant="outlined"
            size="large"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            endIcon={
              <ExpandMoreIcon
                sx={{
                  transform: expanded ? 'rotate(180deg)' : 'none',
                  transition: 'transform 220ms ease',
                }}
              />
            }
            sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}
          >
            {expanded ? 'Show less' : 'Explore more'}
          </Button>
        </Stack>

        <Collapse in={expanded} timeout={300}>
          <Box>
            {EARN_PILLARS.map((pillar) => (
              <PillarRow key={pillar.id} pillar={pillar} />
            ))}

            <Box sx={{ py: { xs: 5, md: 6 } }}>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: '1.5rem', md: '2rem' },
                  color: 'text.primary',
                  mb: { xs: 4, md: 5 },
                  textAlign: 'center',
                  letterSpacing: '-0.01em',
                }}
              >
                {EARN_TIMELINE.title}
              </Typography>

              {isDesktop ? (
                <Box
                  sx={{
                    position: 'relative',
                    px: { md: 4 },
                    py: `${BANNER_PAD_Y_MD}px`,
                    borderRadius: 4,
                    bgcolor: isDark ? alpha('#fff', 0.03) : alpha('#fff', 0.7),
                    border: `1px solid ${theme.palette.divider}`,
                    backdropFilter: 'saturate(140%) blur(14px)',
                    WebkitBackdropFilter: 'saturate(140%) blur(14px)',
                  }}
                >
                  <Box
                    aria-hidden
                    sx={{
                      position: 'absolute',
                      top: LINE_TOP_MD,
                      left: '8%',
                      right: '8%',
                      height: 2,
                      bgcolor: alpha(primary, 0.2),
                      zIndex: 0,
                    }}
                  />
                  <Stack direction="row" spacing={2} sx={{ position: 'relative', zIndex: 1 }}>
                    {EARN_TIMELINE.steps.map((step) => (
                      <TimelineStep key={step.n} {...step} />
                    ))}
                  </Stack>
                </Box>
              ) : (
                <Stack spacing={3}>
                  {EARN_TIMELINE.steps.map((step) => (
                    <Box
                      key={step.n}
                      sx={{
                        p: 3,
                        borderRadius: 3,
                        bgcolor: isDark ? alpha('#fff', 0.025) : alpha('#fff', 0.7),
                        border: `1px solid ${theme.palette.divider}`,
                      }}
                    >
                      <TimelineStep {...step} />
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              justifyContent="center"
              sx={{ pt: 2, pb: 1 }}
            >
              <MarketingCtaButton
                component={RouterLink}
                to="/signup"
                endIcon={<ArrowForwardIcon />}
                sx={{ px: 3.5, py: 1.25 }}
              >
                Start contributing
              </MarketingCtaButton>
              <Button
                component={RouterLink}
                to="/earn"
                size="large"
                variant="outlined"
                sx={{ px: 3.5, py: 1.25, fontWeight: 600, borderRadius: 2, textTransform: 'none' }}
              >
                See full earn page
              </Button>
            </Stack>
          </Box>
        </Collapse>
      </Container>
    </Box>
  );
}
