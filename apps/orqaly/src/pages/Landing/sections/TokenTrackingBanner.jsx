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
import DataUsageOutlinedIcon from '@mui/icons-material/DataUsageOutlined';
import PieChartOutlineOutlinedIcon from '@mui/icons-material/PieChartOutlineOutlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import DemoTokenTracking from '../../../components/Public/demo/DemoTokenTracking';
import LandingGlassIcon from './LandingGlassIcon';

const TILE_FALLBACKS = {
  DataUsageOutlined: DataUsageOutlinedIcon,
  PieChartOutlineOutlined: PieChartOutlineOutlinedIcon,
  SwapHorizOutlined: SwapHorizOutlinedIcon,
};

const PLATFORM_TILES = [
  {
    iconName: 'DataUsageOutlined',
    title: 'Per-step usage',
    body: 'Tokens and cost for each agent run inside a goal.',
  },
  {
    iconName: 'PieChartOutlineOutlined',
    title: 'Phase totals',
    body: 'Roll up spend by phase so you know where budget goes.',
  },
  {
    iconName: 'SwapHorizOutlined',
    title: 'Model switch',
    body: 'Compare outputs and swap the LLM when quality improves.',
  },
];

const HEADLINE = 'Spend - We Track';
const SUBTITLE =
  'Track individual moments inside your goal, monitor the results, and switch models if you find a better result.';

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

export default function TokenTrackingBanner() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [tilesExpanded, setTilesExpanded] = useState(false);
  const showTiles = !isMobile || tilesExpanded;

  return (
    <Box
      component="section"
      id="token-tracking"
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
            Token Tracking
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
            {HEADLINE}
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '1rem', md: '1.1rem' },
              color: 'text.secondary',
              maxWidth: 620,
              lineHeight: 1.65,
            }}
          >
            {SUBTITLE}
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
                <MarketingCtaButton component={RouterLink} to="/goals" sx={{ px: 3, py: 1.25 }}>
                  Open goals
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

          <Grid size={{ xs: 12, md: 6 }} sx={{ order: { xs: -1, md: 0 } }}>
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
              <DemoTokenTracking />
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
