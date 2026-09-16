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
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import { Link as RouterLink } from 'react-router-dom';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import DemoConsilium from '../../../components/Public/demo/DemoConsilium';
import LandingGlassIcon from './LandingGlassIcon';
import { ITEMS_BY_SLUG } from '../../../data/instruments';

const TILE_FALLBACKS = {
  GroupsOutlined: GroupsOutlinedIcon,
  FactCheckOutlined: FactCheckOutlinedIcon,
  PersonSearchOutlined: PersonSearchOutlinedIcon,
  BoltOutlined: BoltOutlinedIcon,
  InsightsOutlined: InsightsOutlinedIcon,
};

const PLATFORM_TILES = [
  {
    iconName: 'GroupsOutlined',
    title: 'Gateway',
    body: 'A collaborative team of specialized members that discuss goals, challenge ideas, and work together to find the best possible solution.',
  },
  {
    iconName: 'FactCheckOutlined',
    title: 'Review',
    body: 'Every goal passes through the Consilium Gate, where it is analyzed, refined, and broken down into clear and actionable steps.',
  },
  {
    iconName: 'PersonSearchOutlined',
    title: 'Headhunter',
    body: 'An intelligent system reviews the goal and assembles the ideal team, matching the right expertise and capabilities to the mission.',
  },
  {
    iconName: 'BoltOutlined',
    title: 'Execution',
    body: 'Each member takes ownership of a specific task, using the best models, tools, and workflows to deliver outstanding results.',
  },
  {
    iconName: 'InsightsOutlined',
    title: 'Monitoring',
    body: 'Every action, decision, and outcome is tracked, providing valuable insights for quality improvement, performance analysis, and personalization.',
  },
];

function PlatformTile({ iconName, title, body, isDark, theme }) {
  return (
    <Stack
      direction="row"
      spacing={2}
      alignItems="flex-start"
      sx={{
        p: 2.5,
        borderRadius: 3,
        bgcolor: isDark ? alpha('#fff', 0.025) : alpha('#fff', 0.7),
        border: `1px solid ${theme.palette.divider}`,
        backdropFilter: 'saturate(140%) blur(10px)',
        WebkitBackdropFilter: 'saturate(140%) blur(10px)',
      }}
    >
      <LandingGlassIcon
        name={iconName}
        fallback={TILE_FALLBACKS[iconName]}
        size={24}
        tone="brand"
      />
      <Box>
        <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'text.primary', mb: 0.5 }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.55 }}>
          {body}
        </Typography>
      </Box>
    </Stack>
  );
}

export default function ConsiliumBanner() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [tilesExpanded, setTilesExpanded] = useState(false);
  const showTiles = !isMobile || tilesExpanded;
  const item = ITEMS_BY_SLUG['control:consilium'];

  return (
    <Box
      component="section"
      id="consilium"
      sx={{
        py: { xs: 8, md: 12 },
        bgcolor: alpha(theme.palette.text.primary, 0.02),
        borderTop: `1px solid ${theme.palette.divider}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
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
            Consilium
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
            {item.hero.title}
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '1rem', md: '1.1rem' },
              color: 'text.secondary',
              maxWidth: 620,
              lineHeight: 1.65,
            }}
          >
            {item.hero.subtitle}
          </Typography>
        </Stack>

        <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={2.5}>
              <Collapse in={showTiles} timeout={300} unmountOnExit={isMobile}>
                <Stack spacing={2.5}>
                  {PLATFORM_TILES.map(({ iconName, title, body }) => (
                    <PlatformTile
                      key={title}
                      iconName={iconName}
                      title={title}
                      body={body}
                      isDark={isDark}
                      theme={theme}
                    />
                  ))}
                </Stack>
              </Collapse>

              <Stack
                direction="row"
                spacing={1.5}
                flexWrap="wrap"
                alignItems="center"
                sx={{ pt: 0.5 }}
              >
                <MarketingCtaButton
                  component={RouterLink}
                  to="/control/consilium"
                  sx={{ px: 3, py: 1.25 }}
                >
                  Try Consilium
                </MarketingCtaButton>
                {isMobile && (
                  <Button
                    variant="outlined"
                    size="large"
                    onClick={() => setTilesExpanded((open) => !open)}
                    aria-expanded={tilesExpanded}
                    sx={{
                      fontWeight: 700,
                      borderRadius: 2,
                      textTransform: 'none',
                      px: 2.5,
                      py: 1.25,
                      borderColor: alpha(primary, 0.45),
                      color: 'text.primary',
                      '&:hover': {
                        borderColor: primary,
                        bgcolor: alpha(primary, 0.06),
                      },
                    }}
                  >
                    {tilesExpanded ? 'Read Less' : 'Read More'}
                  </Button>
                )}
              </Stack>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Box
              sx={{
                position: 'relative',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  inset: -16,
                  borderRadius: 5,
                  background: `radial-gradient(ellipse 70% 60% at 50% 50%, ${alpha(primary, 0.14)} 0%, transparent 70%)`,
                  pointerEvents: 'none',
                },
              }}
            >
              <DemoConsilium />
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
