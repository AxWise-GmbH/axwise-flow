import { useEffect, useState } from 'react';
import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import SubtitlesOutlinedIcon from '@mui/icons-material/SubtitlesOutlined';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import SlideshowOutlinedIcon from '@mui/icons-material/SlideshowOutlined';
import RecordVoiceOverOutlinedIcon from '@mui/icons-material/RecordVoiceOverOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import LandingGlassIcon from './LandingGlassIcon';

export const HERO_DEMO_FIRST_PROMPT = 'I want to build a landing page for my SaaS';

const CASES = [
  {
    prompt: HERO_DEMO_FIRST_PROMPT,
    tint: null,
    steps: [
      { label: 'Choosing tool · Framer…', done: 'Tool: Framer' },
      { label: 'Wireframing layout…', done: 'Layout wireframed' },
      { label: 'Writing hero copy…', done: 'Copy written' },
      { label: 'Deploying to the web…', done: 'Page live' },
    ],
    badges: [
      { label: 'Hero designed', glassName: 'BrushOutlined', glassFallback: BrushOutlinedIcon },
      { label: 'Copy written', glassName: 'ArticleOutlined', glassFallback: ArticleOutlinedIcon },
      { label: 'Page live', glassName: 'PublicOutlined', glassFallback: PublicOutlinedIcon },
    ],
    destinations: ['acmehq.io/launch', 'LinkedIn · X · ProductHunt', 'Stripe checkout live'],
  },
  {
    prompt: 'I want an iOS app to rent saunas nearby',
    tint: '#f59e0b',
    steps: [
      { label: 'Choosing tool · Xcode + Figma…', done: 'Tool: Xcode + Figma' },
      { label: 'Uploading brand assets…', done: 'Brand assets loaded' },
      { label: 'Designing screens…', done: 'Screens designed' },
      { label: 'Wiring booking & payments…', done: 'Booking flow live' },
      { label: 'Building TestFlight bundle…', done: 'TestFlight ready' },
    ],
    badges: [
      {
        label: 'Screens designed',
        glassName: 'PhoneIphoneOutlined',
        glassFallback: PhoneIphoneOutlinedIcon,
      },
      {
        label: 'Booking flow live',
        glassName: 'EventAvailableOutlined',
        glassFallback: EventAvailableOutlinedIcon,
      },
      {
        label: 'TestFlight ready',
        glassName: 'CloudUploadOutlined',
        glassFallback: CloudUploadOutlinedIcon,
      },
    ],
    destinations: ['saunas.app', 'Instagram · TikTok · Maps', 'Apple Pay · Stripe'],
  },
  {
    prompt: 'I want a 30-second product video',
    tint: '#d946ef',
    steps: [
      { label: 'Choosing tool · Runway…', done: 'Tool: Runway' },
      { label: 'Uploading footage & refs…', done: 'Materials uploaded' },
      { label: 'Writing the script…', done: 'Script ready' },
      { label: 'Storyboarding scenes…', done: 'Storyboard set' },
      { label: 'Rendering the cut…', done: 'Video rendered' },
    ],
    badges: [
      {
        label: 'Script ready',
        glassName: 'SubtitlesOutlined',
        glassFallback: SubtitlesOutlinedIcon,
      },
      { label: 'Storyboard set', glassName: 'MovieOutlined', glassFallback: MovieOutlinedIcon },
      {
        label: 'Video rendered',
        glassName: 'PlayCircleOutlined',
        glassFallback: PlayCircleOutlinedIcon,
      },
    ],
    destinations: ['acme.video/promo', 'YouTube · TikTok · Reels', 'Tracked affiliate links'],
  },
  {
    prompt: 'I want a pitch deck for investors',
    tint: '#6366f1',
    steps: [
      { label: 'Choosing tool · Slides…', done: 'Tool: Slides' },
      { label: 'Uploading research notes…', done: 'Research uploaded' },
      { label: 'Building the narrative…', done: 'Story arc set' },
      { label: 'Designing the slides…', done: 'Slides designed' },
    ],
    badges: [
      {
        label: 'Story arc set',
        glassName: 'AutoStoriesOutlined',
        glassFallback: AutoStoriesOutlinedIcon,
      },
      {
        label: 'Slides designed',
        glassName: 'SlideshowOutlined',
        glassFallback: SlideshowOutlinedIcon,
      },
      {
        label: 'Talking points',
        glassName: 'RecordVoiceOverOutlined',
        glassFallback: RecordVoiceOverOutlinedIcon,
      },
    ],
    destinations: ['pitch.acmehq.com', 'Sent to investor inboxes', 'Pre-commit form live'],
  },
];

const DESTINATIONS = [
  { title: 'Live on your domain', glassName: 'PublicOutlined', glassFallback: PublicOutlinedIcon },
  { title: 'On your channels', glassName: 'CampaignOutlined', glassFallback: CampaignOutlinedIcon },
  {
    title: 'Taking real payments',
    glassName: 'PaymentsOutlined',
    glassFallback: PaymentsOutlinedIcon,
  },
];

export default function HeroAnimatedDemo({ sx, eyebrow, title, subtitle }) {
  const theme = useTheme();
  const [promptIdx, setPromptIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState('type');
  const [stepsDone, setStepsDone] = useState(0);
  const [cardsShown, setCardsShown] = useState(false);
  const [destinationsShown, setDestinationsShown] = useState(false);
  const [hovered, setHovered] = useState(false);
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  useEffect(() => {
    if (!reducedMotion) return;
    setTyped(CASES[0].prompt);
    setStepsDone(CASES[0].steps.length);
    setCardsShown(true);
    setDestinationsShown(true);
    setPhase('done');
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const currentCase = CASES[promptIdx];
    const fullPrompt = currentCase.prompt;

    if (phase === 'type') {
      let i = 0;
      setTyped('');
      const id = setInterval(() => {
        i += 1;
        setTyped(fullPrompt.slice(0, i));
        if (i >= fullPrompt.length) {
          clearInterval(id);
          setTimeout(() => setPhase('process'), 220);
        }
      }, 28);
      return () => clearInterval(id);
    }

    if (phase === 'process') {
      setStepsDone(0);
      const stepCount = currentCase.steps.length;
      const timers = currentCase.steps.map((_, i) =>
        setTimeout(
          () => {
            setStepsDone(i + 1);
            if (i === stepCount - 1) {
              setCardsShown(true);
              setPhase('done');
            }
          },
          320 * (i + 1)
        )
      );
      return () => timers.forEach(clearTimeout);
    }

    if (phase === 'erase') {
      setCardsShown(false);
      setDestinationsShown(false);
      setStepsDone(0);
      let i = fullPrompt.length;
      const id = setInterval(() => {
        i -= 1;
        setTyped(fullPrompt.slice(0, Math.max(0, i)));
        if (i <= 0) {
          clearInterval(id);
          setPromptIdx((p) => (p + 1) % CASES.length);
          setPhase('type');
        }
      }, 14);
      return () => clearInterval(id);
    }

    return undefined;
  }, [phase, promptIdx, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    if (phase !== 'done') return undefined;
    const destTimer = setTimeout(() => setDestinationsShown(true), 140);
    if (hovered) return () => clearTimeout(destTimer);
    const eraseTimer = setTimeout(() => setPhase('erase'), 1400);
    return () => {
      clearTimeout(destTimer);
      clearTimeout(eraseTimer);
    };
  }, [phase, hovered, reducedMotion]);

  const primary = theme.palette.primary.main;
  const currentCase = CASES[promptIdx];
  const currentTint = primary;
  const rowsVisible = cardsShown || phase === 'process';
  const tintTransition = 'border-color 500ms ease, background-color 500ms ease, color 500ms ease';

  const showHeader = Boolean(eyebrow || title || subtitle);

  return (
    <Stack
      spacing={showHeader ? { xs: 3, md: 4 } : 0}
      sx={{
        width: '100%',
        maxWidth: 880,
        textAlign: 'left',
        ...sx,
      }}
    >
      {showHeader && (
        <Stack spacing={2.5} alignItems="flex-start" sx={{ width: '100%' }}>
          {eyebrow && (
            <Typography
              sx={{
                fontSize: '0.78rem',
                fontWeight: 800,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'primary.main',
              }}
            >
              {eyebrow}
            </Typography>
          )}
          {title && (
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: '2.1rem', md: '3rem' },
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                color: 'text.primary',
              }}
            >
              {title}
            </Typography>
          )}
          {subtitle && (
            <Typography
              sx={{
                fontSize: { xs: '1rem', md: '1.15rem' },
                color: 'text.secondary',
                lineHeight: 1.55,
                maxWidth: 680,
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Stack>
      )}

      <Box
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        sx={{
          width: '100%',
          borderRadius: 3,
          overflow: 'hidden',
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: 'background.paper',
          boxShadow: theme.shadows[10],
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.25,
            bgcolor: alpha(theme.palette.text.primary, 0.04),
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#ff5f57' }} />
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#febc2e' }} />
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#28c840' }} />
          <Box
            sx={{
              flex: 1,
              ml: 2,
              height: 22,
              borderRadius: 999,
              bgcolor: alpha(theme.palette.text.primary, 0.06),
            }}
          />
        </Box>

        <Box sx={{ p: { xs: 2.5, md: 4 }, minHeight: 420 }}>
          <Box
            sx={{
              border: `1px solid ${alpha(currentTint, 0.35)}`,
              borderRadius: 2,
              px: 2,
              py: 1.5,
              bgcolor: alpha(currentTint, 0.04),
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: { xs: '0.95rem', md: '1.1rem' },
              display: 'flex',
              alignItems: 'center',
              minHeight: 56,
              transition: tintTransition,
            }}
          >
            <Typography component="span" sx={{ color: 'text.primary', fontFamily: 'inherit' }}>
              {typed}
            </Typography>
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                width: '2px',
                height: '1.2em',
                bgcolor: currentTint,
                ml: 0.25,
                animation: 'caretBlink 1s steps(2) infinite',
                transition: tintTransition,
                '@keyframes caretBlink': { '50%': { opacity: 0 } },
              }}
            />
          </Box>

          <Stack
            spacing={1.25}
            sx={{ mt: 3, opacity: rowsVisible ? 1 : 0, transition: 'opacity 400ms ease' }}
          >
            {currentCase.steps.map((s, i) => {
              const done = stepsDone > i;
              return (
                <Stack key={i} direction="row" alignItems="center" spacing={1.5}>
                  {done ? (
                    <CheckCircleIcon
                      sx={{ color: currentTint, fontSize: 22, transition: tintTransition }}
                    />
                  ) : (
                    <RadioButtonUncheckedIcon
                      sx={{
                        color: 'text.disabled',
                        fontSize: 22,
                        animation:
                          phase === 'process' && !done ? 'spin 1.2s linear infinite' : 'none',
                        '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
                      }}
                    />
                  )}
                  <Typography
                    sx={{ color: done ? 'text.primary' : 'text.secondary', fontSize: '0.95rem' }}
                  >
                    {done ? s.done : s.label}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{
              mt: 3,
              opacity: cardsShown ? 1 : 0,
              transform: cardsShown ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 500ms ease, transform 500ms ease',
            }}
          >
            {currentCase.badges.map((b, i) => (
              <Box
                key={i}
                sx={{
                  flex: 1,
                  p: 2,
                  borderRadius: 2,
                  bgcolor: alpha(currentTint, 0.06),
                  border: `1px solid ${alpha(currentTint, 0.18)}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  transition: tintTransition,
                }}
              >
                <LandingGlassIcon
                  name={b.glassName}
                  fallback={b.glassFallback}
                  size={24}
                  tone={currentTint}
                />
                <Typography sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.95rem' }}>
                  {b.label}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>

      <Box sx={{ width: '100%' }}>
        <Typography
          sx={{
            mb: 1.25,
            pl: { xs: 0.5, md: 0.5 },
            fontSize: '0.78rem',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            color: 'text.secondary',
            letterSpacing: '0.04em',
            opacity: destinationsShown ? 0.85 : 0,
            transition: 'opacity 500ms ease',
          }}
        >
          ↳ ships to:
        </Typography>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{
            opacity: destinationsShown ? 1 : 0,
            transform: destinationsShown ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 500ms ease, transform 500ms ease',
          }}
        >
          {DESTINATIONS.map((d, i) => (
            <Box
              key={d.title}
              sx={{
                flex: 1,
                minWidth: 0,
                p: 2,
                borderRadius: 2,
                bgcolor: alpha(currentTint, 0.06),
                border: `1px solid ${alpha(currentTint, 0.18)}`,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                transition: tintTransition,
              }}
            >
              <LandingGlassIcon
                name={d.glassName}
                fallback={d.glassFallback}
                size={22}
                tone={currentTint}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  sx={{
                    fontWeight: 700,
                    color: 'text.primary',
                    fontSize: '0.9rem',
                    lineHeight: 1.2,
                  }}
                >
                  {d.title}
                </Typography>
                <Typography
                  sx={{
                    mt: 0.25,
                    fontSize: '0.78rem',
                    color: 'text.secondary',
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    transition: tintTransition,
                  }}
                >
                  {currentCase.destinations[i]}
                </Typography>
              </Box>
            </Box>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
