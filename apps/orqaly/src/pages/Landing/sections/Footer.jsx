import { useMemo, useState } from 'react';
import {
  Box,
  Container,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { resolveAccent } from '../../../theme/enterpriseTheme';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import XIcon from '@mui/icons-material/X';
import GitHubIcon from '@mui/icons-material/GitHub';
import YouTubeIcon from '@mui/icons-material/YouTube';
import CircleIcon from '@mui/icons-material/Circle';
import LanguageIcon from '@mui/icons-material/Language';
import AiOrb from '../../../components/VoiceControl/AiOrb';
import { PERSONAS } from '../../../data/personas';
import { GROUPS, INSTRUMENTS_BY_GROUP } from '../../../data/instruments';

// Brand mark matches StickyNav's NavOrb - forces a green palette so the orb
// keeps its brand tint regardless of the surrounding theme.
function BrandOrb({ size = 32 }) {
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
      <AiOrb size={size} state="idle" />
    </ThemeProvider>
  );
}

const ANCHOR = (id) => `/#${id}`;

const LANES = [
  {
    heading: 'Platform',
    links: [
      { label: 'Features', to: '/features' },
      { label: 'How it works', to: '/how-it-works' },
      { label: 'Marketplace', to: '/marketplace-preview' },
      { label: 'Pricing', to: '/pricing' },
    ],
  },
  {
    heading: GROUPS.instruments.label,
    links: INSTRUMENTS_BY_GROUP.instruments.map((it) => ({
      label: it.label,
      to: `/instruments/${it.slug}`,
    })),
  },
  {
    heading: GROUPS.control.label,
    links: INSTRUMENTS_BY_GROUP.control.map((it) => ({
      label: it.label,
      to: `/control/${it.slug}`,
    })),
  },
  {
    heading: 'Solutions',
    links: [
      ...PERSONAS.slice(0, 6).map((p) => ({ label: p.label, to: `/solutions/${p.slug}` })),
      { label: 'See all →', to: `/solutions/${PERSONAS[0].slug}`, accent: true },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Docs', to: '/docs' },
      { label: 'FAQ', to: '/faq' },
      { label: 'Security', to: '/security' },
      { label: 'Status', to: '/status' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Contact', to: '/contact' },
      { label: 'For Private Investors', to: '/investors' },
    ],
  },
];

const SOCIAL = [
  { Icon: LinkedInIcon, label: 'LinkedIn', href: '#' },
  { Icon: XIcon, label: 'X (Twitter)', href: '#' },
  { Icon: GitHubIcon, label: 'GitHub', href: '#' },
  { Icon: YouTubeIcon, label: 'YouTube', href: '#' },
];

const LEGAL = [
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
  { label: 'Cookies', to: '/cookies' },
  { label: 'Security', to: '/security' },
];

function FooterLink({ link }) {
  const isAnchor = link.to.startsWith('/#');
  const common = {
    textDecoration: 'none',
    color: link.accent ? 'primary.main' : 'text.secondary',
    fontSize: '0.86rem',
    fontWeight: link.accent ? 700 : 500,
    display: 'inline-block',
    transition: 'color 180ms ease',
    '&:hover': { color: link.accent ? 'primary.dark' : 'primary.main' },
  };
  if (isAnchor) {
    return (
      <Box component="a" href={link.to} sx={common}>
        {link.label}
      </Box>
    );
  }
  return (
    <Box component={RouterLink} to={link.to} sx={common}>
      {link.label}
    </Box>
  );
}

function FooterSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        const q = query.trim();
        if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
      }}
      sx={{ width: '100%', maxWidth: 320 }}
    >
      <TextField
        fullWidth
        size="small"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search agents, tools, FAQ…"
        aria-label="Search site"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            </InputAdornment>
          ),
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 999,
            fontSize: '0.85rem',
            bgcolor: 'background.paper',
          },
        }}
      />
    </Box>
  );
}

export default function Footer() {
  const theme = useTheme();
  const year = new Date().getFullYear();
  return (
    <Box
      component="footer"
      sx={{
        pt: { xs: 7, md: 9 },
        pb: { xs: 4, md: 5 },
        bgcolor: alpha(theme.palette.text.primary, 0.03),
        borderTop: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Container maxWidth="lg">
        <Grid container spacing={{ xs: 4, md: 6 }}>
          {/* Brand */}
          <Grid size={{ xs: 12, lg: 3 }}>
            <Stack spacing={2}>
              <Stack direction="row" alignItems="center" spacing={1.25}>
                <BrandOrb size={32} />
                <Typography
                  sx={{
                    fontWeight: 800,
                    fontSize: '1.15rem',
                    color: 'text.primary',
                    letterSpacing: '-0.01em',
                  }}
                >
                  Orqaly
                </Typography>
              </Stack>
              <Typography
                sx={{ fontSize: '0.9rem', color: 'text.secondary', lineHeight: 1.6, maxWidth: 320 }}
              >
                The orchestration layer for the agent economy. Turn words into a working business.
              </Typography>
              <FooterSearch />
              <Stack direction="row" spacing={0.5}>
                {SOCIAL.map(({ Icon, label, href }) => (
                  <IconButton
                    key={label}
                    component="a"
                    href={href}
                    aria-label={label}
                    size="small"
                    sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
                  >
                    <Icon fontSize="small" />
                  </IconButton>
                ))}
              </Stack>
            </Stack>
          </Grid>

          {/* Lanes */}
          <Grid size={{ xs: 12, lg: 9 }}>
            <Grid container spacing={{ xs: 4, md: 3 }}>
              {LANES.map((lane) => (
                <Grid key={lane.heading} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                  <Typography
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'text.primary',
                      mb: 2,
                    }}
                  >
                    {lane.heading}
                  </Typography>
                  <Stack spacing={1.1}>
                    {lane.links.map((link) => (
                      <FooterLink key={link.label} link={link} />
                    ))}
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </Grid>
        </Grid>

        <Divider sx={{ mt: { xs: 5, md: 7 }, mb: 3 }} />

        {/* Utility row */}
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 2, md: 3 }}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent="space-between"
        >
          <Typography sx={{ fontSize: '0.78rem', color: 'text.disabled' }}>
            © {year} Orqaly. All rights reserved.
          </Typography>

          <Stack direction="row" spacing={2.5} flexWrap="wrap">
            {LEGAL.map((l) => (
              <Box
                key={l.label}
                component={RouterLink}
                to={l.to}
                sx={{
                  textDecoration: 'none',
                  fontSize: '0.78rem',
                  color: 'text.secondary',
                  '&:hover': { color: 'text.primary' },
                }}
              >
                {l.label}
              </Box>
            ))}
          </Stack>

          <Stack direction="row" spacing={2.5} alignItems="center">
            <Box
              component={RouterLink}
              to="/status"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                textDecoration: 'none',
                fontSize: '0.78rem',
                color: 'text.secondary',
                '&:hover': { color: 'text.primary' },
              }}
            >
              <CircleIcon sx={{ fontSize: 9, color: '#10B981' }} />
              All systems normal
            </Box>
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.5}
              sx={{
                color: 'text.secondary',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'default',
              }}
            >
              <LanguageIcon sx={{ fontSize: 14 }} />
              EN
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
