import { useMemo } from 'react';
import { Box, Button, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { resolveAccent } from '../../../theme/enterpriseTheme';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import TelegramIcon from '@mui/icons-material/Telegram';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LandingGlassIcon from './LandingGlassIcon';
import AiOrb from '../../../components/VoiceControl/AiOrb';
import { LANDING_PASS_VERTICAL_TOUCH_SX } from '../../../utils/mobileTouchScroll';

const CHANNELS = [
  {
    iconName: 'MicNoneOutlined',
    Fallback: MicNoneOutlinedIcon,
    title: 'Platform',
    desc: 'AiOrb live conversation - talk, get answers, give commands.',
  },
  {
    iconName: 'Send',
    Fallback: TelegramIcon,
    title: 'Messager',
    desc: 'DM your agents like a person. Async, fast, mobile-friendly.',
  },
  {
    iconName: 'EmailOutlined',
    Fallback: EmailOutlinedIcon,
    title: 'Email',
    desc: 'Async briefs, deliverables, and approvals - straight to your inbox.',
  },
];

function GreenOrbStage({ size = 260 }) {
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
    <Box
      sx={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: `1.5px solid rgba(var(--app-accent-rgb), 0.18)`,
            transform: `scale(${1 - i * 0.18})`,
            pointerEvents: 'none',
            animation: `ringPulse 3.2s ${i * 0.45}s ease-in-out infinite`,
            '@keyframes ringPulse': {
              '0%, 100%': { opacity: 0.35, transform: `scale(${1 - i * 0.18})` },
              '50%': { opacity: 0.85, transform: `scale(${1 - i * 0.18 + 0.05})` },
            },
          }}
        />
      ))}
      <ThemeProvider theme={greenTheme}>
        <AiOrb size={Math.round(size * 0.6)} state="speaking" />
      </ThemeProvider>
    </Box>
  );
}

export default function VoiceChannels() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        py: { xs: 8, md: 12 },
        bgcolor: alpha(theme.palette.text.primary, 0.02),
        borderTop: `1px solid ${theme.palette.divider}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
        ...LANDING_PASS_VERTICAL_TOUCH_SX,
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: { xs: -60, md: -80 },
          left: '50%',
          transform: 'translateX(-50%)',
          width: { xs: 320, md: 480 },
          height: { xs: 320, md: 480 },
          opacity: 0.32,
          filter: 'blur(2px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        <GreenOrbStage size={480} />
      </Box>
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Grid container spacing={{ xs: 4, md: 8 }} alignItems="center">
          <Grid size={12}>
            <Stack spacing={3}>
              <Typography
                sx={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'primary.main',
                }}
              >
                Multichannel
              </Typography>
              <Typography
                sx={{
                  fontSize: { xs: '2rem', md: '2.5rem' },
                  fontWeight: 800,
                  lineHeight: 1.15,
                  color: 'text.primary',
                }}
              >
                Chat From Anywhere.
              </Typography>
              <Typography sx={{ fontSize: '1rem', color: 'text.secondary', lineHeight: 1.6 }}>
                Reach your agents the same way you reach your team - voice when you're driving,
                Telegram when you're on the train, chat when you're at the desk.
              </Typography>

              <Stack spacing={1.5} sx={{ mt: 1 }}>
                {CHANNELS.map(({ iconName, Fallback, title, desc }) => (
                  <Stack
                    key={title}
                    direction="row"
                    spacing={2}
                    alignItems="flex-start"
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      transition: 'background 200ms ease',
                      '&:hover': { bgcolor: alpha(primary, 0.04) },
                    }}
                  >
                    <LandingGlassIcon name={iconName} fallback={Fallback} size={20} tone="brand" />
                    <Box>
                      <Typography
                        sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'text.primary' }}
                      >
                        {title}
                      </Typography>
                      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                        {desc}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>

              <Box>
                <MarketingCtaButton
                  component={RouterLink}
                  to="/communicator"
                  endIcon={<ArrowForwardIcon />}
                  sx={{ mt: 2, px: 3.5, py: 1.25 }}
                >
                  Try voice control
                </MarketingCtaButton>
              </Box>
            </Stack>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
