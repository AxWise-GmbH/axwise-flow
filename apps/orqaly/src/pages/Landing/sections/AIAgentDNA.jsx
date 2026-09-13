import { useState } from 'react';
import { Box, Container, Stack, Typography, alpha, useTheme, Grid, Fade } from '@mui/material';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import AutoGraphOutlinedIcon from '@mui/icons-material/AutoGraphOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import LandingGlassIcon from './LandingGlassIcon';
import AxWiseLogo from '../../../components/Public/primitives/AxWiseLogo';
import DemoAIAgentDNA from '../../../components/Public/demo/DemoAIAgentDNA';
import DemoDataIngestion from '../../../components/Public/demo/DemoDataIngestion';
import DemoSyntheticBuilder from '../../../components/Public/demo/DemoSyntheticBuilder';

const TILE_FALLBACKS = {
  PsychologyOutlined: PsychologyOutlinedIcon,
  AutoGraphOutlined: AutoGraphOutlinedIcon,
  ScienceOutlined: ScienceOutlinedIcon,
};

const PLATFORM_TILES = [
  {
    iconName: 'PsychologyOutlined',
    title: 'Serve the platform',
    body: 'Be more human-like in creative and decision making tasks.',
  },
  {
    iconName: 'AutoGraphOutlined',
    title: 'Improve datasets',
    body: 'Help to improve datasets for any system with synthetic interactions.',
  },
  {
    iconName: 'ScienceOutlined',
    title: 'Synthetic builder',
    body: 'Unique Synthetic builder for crafting the exact personality of an AI.',
  },
];

const HEADLINE = 'AI Agent DNA';
const SUBTITLE =
  'Build & Clone Personas and their unique behavior. The AI Beam and the Tool Kit will create a one of a kind AI Agent.';

function CarouselTab({ isActive, iconName, title, body, onClick, theme }) {
  const primary = theme.palette.primary.main;

  return (
    <Box
      onClick={onClick}
      sx={{
        p: 3,
        borderRadius: 4,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        border: '1px solid transparent',
        ...(isActive
          ? {
              bgcolor: alpha(primary, 0.08),
              borderColor: alpha(primary, 0.2),
              transform: 'translateX(8px)',
            }
          : {
              '&:hover': {
                bgcolor: alpha(theme.palette.text.primary, 0.02),
                borderColor: alpha(theme.palette.text.primary, 0.05),
              },
            }),
      }}
    >
      <Stack direction="row" spacing={2.5} alignItems="flex-start">
        <Box sx={{ opacity: isActive ? 1 : 0.5, transition: 'opacity 0.3s ease' }}>
          <LandingGlassIcon
            name={iconName}
            fallback={TILE_FALLBACKS[iconName]}
            size={28}
            tone={isActive ? 'brand' : 'neutral'}
          />
        </Box>
        <Box>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: '1.1rem',
              color: isActive ? 'text.primary' : 'text.secondary',
              mb: 0.5,
              transition: 'color 0.3s ease',
            }}
          >
            {title}
          </Typography>
          <Typography
            sx={{
              fontSize: '0.95rem',
              color: isActive ? 'text.secondary' : alpha(theme.palette.text.secondary, 0.5),
              lineHeight: 1.55,
              transition: 'color 0.3s ease',
            }}
          >
            {body}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}

export default function AIAgentDNA() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const [activeTab, setActiveTab] = useState(0);

  const visuals = [
    <DemoAIAgentDNA key="0" />,
    <DemoDataIngestion key="1" />,
    <DemoSyntheticBuilder key="2" />,
  ];

  return (
    <Box
      component="section"
      id="ai-agent-dna"
      sx={{
        py: { xs: 8, md: 12 },
        bgcolor: 'background.default',
        position: 'relative',
        overflow: 'hidden',
        borderTop: `1px solid ${theme.palette.divider}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      {/* Background flare */}
      <Box
        sx={{
          position: 'absolute',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '80%',
          height: '80%',
          background: `radial-gradient(ellipse, ${alpha(primary, 0.08)} 0%, transparent 60%)`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Grid container spacing={{ xs: 6, md: 8 }} alignItems="center">
          {/* Left Column: Interactive Pitch */}
          <Grid size={{ xs: 12, md: 5 }}>
            <Stack spacing={4}>
              <Box>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                  <Typography
                    sx={{
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                    }}
                  >
                    Powered by
                  </Typography>
                  <AxWiseLogo sx={{ transform: 'scale(0.8)', transformOrigin: 'left center' }} />
                </Stack>
                <Typography
                  sx={{
                    fontSize: { xs: '2.5rem', md: '3rem' },
                    fontWeight: 800,
                    lineHeight: 1.15,
                    color: 'text.primary',
                    mb: 2,
                  }}
                >
                  {HEADLINE}
                </Typography>
                <Typography
                  sx={{
                    fontSize: { xs: '1rem', md: '1.1rem' },
                    color: 'text.secondary',
                    lineHeight: 1.6,
                  }}
                >
                  {SUBTITLE}
                </Typography>
              </Box>

              <Stack spacing={1}>
                {PLATFORM_TILES.map((tile, index) => (
                  <CarouselTab
                    key={index}
                    isActive={activeTab === index}
                    iconName={tile.iconName}
                    title={tile.title}
                    body={tile.body}
                    onClick={() => setActiveTab(index)}
                    theme={theme}
                  />
                ))}
              </Stack>
            </Stack>
          </Grid>

          {/* Right Column: Dynamic Visuals */}
          <Grid size={{ xs: 12, md: 7 }}>
            <Box
              sx={{
                position: 'relative',
                height: { xs: 600, md: 700 }, // Fixed height to prevent layout jumps during transitions
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {visuals.map((visual, index) => (
                <Fade in={activeTab === index} timeout={500} key={index} unmountOnExit={false}>
                  <Box
                    sx={{
                      position: 'absolute',
                      width: '100%',
                      maxWidth: 600,
                      display: activeTab === index ? 'block' : 'none',
                      animation: activeTab === index ? 'float 6s ease-in-out infinite' : 'none',
                      transform: 'scale(0.75)', // 25-30% smaller footprint
                      transformOrigin: 'center center',
                      '@keyframes float': {
                        '0%': { transform: 'scale(0.75) translateY(0px)' },
                        '50%': { transform: 'scale(0.75) translateY(-15px)' },
                        '100%': { transform: 'scale(0.75) translateY(0px)' },
                      },
                    }}
                  >
                    {visual}
                  </Box>
                </Fade>
              ))}
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
