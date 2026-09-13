import { Box, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import GroupsIcon from '@mui/icons-material/Groups';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import TimelineIcon from '@mui/icons-material/Timeline';
import TerminalIcon from '@mui/icons-material/Terminal';
import ConnectWithoutContactIcon from '@mui/icons-material/ConnectWithoutContact';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LandingGlassIcon from './LandingGlassIcon';
import { TOUCH_SCROLL_CONTAINER_SX } from '../../../utils/mobileTouchScroll';

const ROWS = [
  {
    bad: {
      iconName: 'ChatBubbleOutlineOutlined',
      Fallback: ChatBubbleOutlineIcon,
      title: 'One-shot prompts',
      desc: 'You ask, it forgets.',
    },
    good: {
      iconName: 'TrackChangesOutlined',
      Fallback: GpsFixedIcon,
      title: 'Goal with Results.',
      desc: 'Bring results where you need them.',
    },
  },
  {
    bad: {
      iconName: 'SmartToyOutlined',
      Fallback: SmartToyOutlinedIcon,
      title: 'Single agent in a box',
      desc: 'No second opinion.',
    },
    good: {
      iconName: 'GroupsOutlined',
      Fallback: GroupsIcon,
      title: 'A controlled organisation',
      desc: 'Under a Consilium operted teams.',
    },
  },
  {
    bad: {
      iconName: 'HelpOutline',
      Fallback: HelpOutlineIcon,
      title: 'Black box, no trail',
      desc: 'Did it actually run?',
    },
    good: {
      iconName: 'AutoGraphOutlined',
      Fallback: TimelineIcon,
      title: 'Track every move',
      desc: 'Live activity, audit, KPIs - a clear vision.',
    },
  },
  {
    bad: {
      iconName: 'CodeOutlined',
      Fallback: TerminalIcon,
      title: 'Hard to talk to',
      desc: 'Built for engineers.',
    },
    good: {
      iconName: 'ConnectWithoutContactOutlined',
      Fallback: ConnectWithoutContactIcon,
      title: 'Chat, Messager, E-mail',
      desc: 'Build for human interaction',
    },
  },
];

function Card({ entry, kind }) {
  const theme = useTheme();
  const isGood = kind === 'good';
  const { iconName, Fallback, title, desc } = entry;
  const tint = isGood ? theme.palette.primary.main : theme.palette.error.main;
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        height: '100%',
        p: 2.5,
        borderRadius: 2.5,
        bgcolor: isGood ? alpha(tint, 0.06) : isDark ? alpha('#fff', 0.025) : alpha('#fff', 0.7),
        border: `1px solid ${isGood ? alpha(tint, 0.28) : theme.palette.divider}`,
        backdropFilter: 'saturate(140%) blur(10px)',
        WebkitBackdropFilter: 'saturate(140%) blur(10px)',
        display: 'flex',
        gap: 1.75,
        alignItems: 'flex-start',
      }}
    >
      <LandingGlassIcon name={iconName} fallback={Fallback} size={22} tone={tint} solid />
      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: '1rem', mb: 0.5, color: 'text.primary' }}>
          <Box component="span" sx={{ color: tint, mr: 0.75 }}>
            {isGood ? '✓' : '✗'}
          </Box>
          {title}
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', lineHeight: 1.5 }}>
          {desc}
        </Typography>
      </Box>
    </Box>
  );
}

function ProblemCarousel({ rows }) {
  const cards = rows.flatMap((row) => [
    { ...row.bad, kind: 'bad' },
    { ...row.good, kind: 'good' },
  ]);

  return (
    <Box
      role="region"
      aria-label="How Orqaly compares to typical AI tools"
      sx={{
        position: 'relative',
        display: { xs: 'block', md: 'none' },
        maxHeight: { xs: 420, sm: 520 },
        overflowY: 'auto',
        overflowX: 'hidden',
        ...TOUCH_SCROLL_CONTAINER_SX,
        maskImage:
          'linear-gradient(to bottom, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%)',
        // Room for iOS home-indicator + fade mask without clipping last card.
        pb: 0.5,
      }}
    >
      <Stack spacing={1.25}>
        {cards.map((card, i) => (
          <Card key={`${card.title}-${i}`} entry={card} kind={card.kind} />
        ))}
      </Stack>
    </Box>
  );
}

export default function ProblemPromise() {
  const theme = useTheme();
  return (
    <Box component="section" sx={{ py: { xs: 8, md: 12 } }}>
      <Container maxWidth="lg">
        <Stack spacing={6}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
          >
            <Typography
              sx={{
                fontSize: { xs: '1.5rem', md: '2rem' },
                fontWeight: 800,
                color: 'text.primary',
              }}
            >
              AI tools today are toys.
            </Typography>
            <Typography
              sx={{
                fontSize: { xs: '1.5rem', md: '2rem' },
                fontWeight: 800,
                color: 'primary.main',
              }}
            >
              Orqaly is a workforce.
            </Typography>
          </Stack>

          <ProblemCarousel rows={ROWS} />

          <Stack spacing={2} sx={{ display: { xs: 'none', md: 'flex' } }}>
            {ROWS.map((row, i) => (
              <Grid container spacing={2} key={i} alignItems="stretch">
                <Grid size={{ xs: 12, md: 5.75 }}>
                  <Card entry={row.bad} kind="bad" />
                </Grid>
                <Grid
                  size={{ xs: 12, md: 0.5 }}
                  sx={{
                    display: { xs: 'none', md: 'flex' },
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ArrowForwardIcon sx={{ color: alpha(theme.palette.text.primary, 0.3) }} />
                </Grid>
                <Grid size={{ xs: 12, md: 5.75 }}>
                  <Card entry={row.good} kind="good" />
                </Grid>
              </Grid>
            ))}
          </Stack>

          <Stack alignItems="center" sx={{ pt: { xs: 2, md: 3 } }}>
            <MarketingCtaButton
              component={RouterLink}
              to="/control/simple-mode"
              sx={{ px: 3.5, py: 1.25 }}
            >
              View Simple Mode
            </MarketingCtaButton>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
