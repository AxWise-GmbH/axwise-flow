import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Container,
  Grid,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import CheckIcon from '@mui/icons-material/Check';
import StarIcon from '@mui/icons-material/Star';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import PublicShell from '../../components/Public/PublicShell';
import { PageHero } from './_shared';
import CryptoDonateDialog from '../../components/Donate/CryptoDonateDialog';

import FAQSlice from '../../components/Public/primitives/FAQSlice';
import ClosingCta from '../../components/Public/primitives/ClosingCta';

import DemoAgentHub from '../../components/Public/demo/DemoAgentHub';
import DemoReplicators from '../../components/Public/demo/DemoReplicators';
import DemoOrganizations from '../../components/Public/demo/DemoOrganizations';

import AppIcon from '../../components/icons/AppIcon';

const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    blurb: 'Everything you need. Free for the first 1000 beta users.',
    badge: 'Free for first ...',
    features: [
      'API ownership',
      'Storage ownership',
      'Import ecosystem',
      'Community agent reuse',
      'Investment infrastructure',
      'Visual Programming (Beta)',
      'Marketplace publishing',
      'Monitoring',
      'Multi-org support',
    ],
    cta: 'Start free',
    to: '/signup',
    highlight: true,
  },
];

const SUPPORT = {
  id: 'support',
  name: 'Support',
  blurb: 'Help us ship.',
  body:
    'If you wish to support the project - so we can keep building and deliver these technologies to more people - any donation is a step forward. Thank you.',
  cta: 'Donate',
};

const TIER_SHOWCASE = [
  {
    id: 'workspace',
    tier: 'Free',
    title: 'A real workspace, day one.',
    caption: 'Single org with the agents already wired up. No card, no time limit.',
    Visual: DemoAgentHub,
  },
  {
    id: 'marketplace',
    tier: 'Free',
    title: 'Import from the marketplace.',
    caption: 'Install agents, tools, and full replicator templates. Publish your own and keep 85%.',
    Visual: DemoReplicators,
  },
  {
    id: 'enterprise',
    tier: 'Free',
    title: 'Multi-tenant, audit-ready.',
    caption: 'Run multiple businesses, isolate per-row data, defend every action to legal.',
    Visual: DemoOrganizations,
  },
];

const FAQS = [
  {
    q: 'Do you charge per agent or per seat?',
    a: 'Neither. You pay once per workspace; agents and seats are unlimited inside your plan. Usage costs (LLM calls, voice minutes) pass through at provider cost when you bring your own keys (BYOK).',
  },
  {
    q: 'What is BYOK / BYOS?',
    a: 'BYOK = Bring Your Own Keys: connect your own OpenAI / Groq / AssemblyAI keys and your usage is billed directly by those providers. BYOS = Bring Your Own Storage: keep your files in your own Supabase or S3 bucket - we never touch the data.',
  },
  {
    q: 'How does the marketplace revenue split work?',
    a: 'Creators keep 85% of every paid install of their agents, tools, skills, or templates. Orqaly retains 15% to run the platform, pay processors and invest in trust & safety.',
  },
  {
    q: 'What if I outgrow the Paid plan?',
    a: 'We have a Business / Enterprise plan with SSO, audit log retention, custom limits, and a dedicated success contact. Reach out via /contact and we will scope it with you.',
  },
  {
    q: 'Can I get a refund?',
    a: 'Yes - within 14 days of purchase, no questions asked. Email hello@orqaly.com or use the contact form.',
  },
];

function TierCard({ tier, primary, theme }) {
  return (
    <Stack
      spacing={2.5}
      sx={{
        height: '100%',
        p: { xs: 3, md: 4 },
        borderRadius: 3,
        bgcolor: tier.highlight ? alpha(primary, 0.04) : 'background.paper',
        border: `1px solid ${tier.highlight ? primary : theme.palette.divider}`,
        position: 'relative',
        boxShadow: tier.highlight ? `0 0 40px ${alpha(primary, 0.15)}` : 'none',
      }}
    >
      {tier.highlight && (
        <Box
          sx={{
            position: 'absolute',
            top: -14,
            left: '50%',
            transform: 'translateX(-50%)',
            bgcolor: primary,
            color: '#fff',
            fontSize: '0.75rem',
            fontWeight: 700,
            px: 1.5,
            py: 0.5,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <AppIcon name='Star' fallback={StarIcon} sx={{ fontSize: 14 }} /> {tier.badge ?? 'Most popular'}
        </Box>
      )}
      <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>
        {tier.name}
      </Typography>
      <Stack direction="row" alignItems="baseline" spacing={1}>
        <Typography sx={{ fontWeight: 800, fontSize: '2.5rem', color: 'text.primary', lineHeight: 1 }}>
          {tier.price}
        </Typography>
        <Typography sx={{ fontSize: '0.95rem', color: 'text.secondary' }}>{tier.period}</Typography>
      </Stack>
      <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>{tier.blurb}</Typography>
      <Stack spacing={1.25} sx={{ flex: 1 }}>
        {tier.features.map((f) => (
          <Stack key={f} direction="row" spacing={1} alignItems="center">
            <AppIcon name='Check' fallback={CheckIcon} sx={{ fontSize: 18, color: primary }} />
            <Typography sx={{ fontSize: '0.9rem', color: 'text.primary' }}>{f}</Typography>
          </Stack>
        ))}
      </Stack>
      <Button
        component={RouterLink}
        to={tier.to}
        size="large"
        variant={tier.highlight ? 'contained' : 'outlined'}
        fullWidth
        disableElevation
        sx={{ py: 1.25, fontWeight: 700, borderRadius: 2 }}
      >
        {tier.cta}
      </Button>
    </Stack>
  );
}

function SupportCard({ primary, onDonate }) {
  return (
    <Stack
      spacing={2.5}
      sx={{
        height: '100%',
        p: { xs: 3, md: 4 },
        borderRadius: 3,
        bgcolor: 'background.paper',
        border: `1.5px dashed ${alpha(primary, 0.45)}`,
        position: 'relative',
      }}
    >
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          bgcolor: alpha(primary, 0.1),
          color: primary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppIcon name='FavoriteBorder' fallback={FavoriteBorderIcon} sx={{ fontSize: 30 }} />
      </Box>
      <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>{SUPPORT.name}</Typography>
      <Typography sx={{ fontWeight: 800, fontSize: '1.8rem', color: 'text.primary', lineHeight: 1.15 }}>
        {SUPPORT.blurb}
      </Typography>
      <Typography sx={{ fontSize: '0.95rem', color: 'text.secondary', lineHeight: 1.6, flex: 1 }}>
        {SUPPORT.body}
      </Typography>
      <Button
        onClick={onDonate}
        size="large"
        variant="outlined"
        fullWidth
        startIcon={<AppIcon name='FavoriteBorder' fallback={FavoriteBorderIcon} />}
        sx={{
          py: 1.25,
          fontWeight: 700,
          borderRadius: 2,
          borderColor: alpha(primary, 0.6),
          '&:hover': { borderColor: primary, bgcolor: alpha(primary, 0.06) },
        }}
      >
        {SUPPORT.cta}
      </Button>
    </Stack>
  );
}

function ShowcaseCard({ item, theme }) {
  const primary = theme.palette.primary.main;
  return (
    <Stack spacing={2} sx={{ height: '100%' }}>
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Box
          sx={{
            px: 1.25,
            py: 0.4,
            borderRadius: 999,
            bgcolor: alpha(primary, 0.12),
            color: 'primary.main',
            fontSize: '0.7rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {item.tier}
        </Box>
        <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'text.primary', letterSpacing: '-0.01em' }}>
          {item.title}
        </Typography>
      </Stack>
      <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', lineHeight: 1.55 }}>
        {item.caption}
      </Typography>
      <Box
        sx={{
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: -16,
            background: `radial-gradient(ellipse at center, ${alpha(primary, 0.15)} 0%, transparent 65%)`,
            filter: 'blur(20px)',
            zIndex: 0,
            pointerEvents: 'none',
          },
        }}
      >
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <item.Visual />
        </Box>
      </Box>
    </Stack>
  );
}

export default function PublicPricing() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const [donateOpen, setDonateOpen] = useState(false);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Pricing - Orqaly';
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content');
    if (meta) {
      meta.setAttribute(
        'content',
        'Orqaly pricing: free forever for builders, $5/month for marketplace imports, custom Business plan for teams. BYOK pass-through, 85/15 creator split.',
      );
    }
    return () => {
      document.title = prevTitle;
      if (meta && prevDesc) meta.setAttribute('content', prevDesc);
    };
  }, []);

  return (
    <PublicShell>
      <PageHero
        eyebrow="Pricing"
        title="Simple pricing. Free forever for builders."
        subtitle="First 1,000 beta users keep the Free tier forever. Upgrade only when you’re ready to publish to the marketplace or scale beyond a single workspace."
      />
      {/* Tier cards */}
      <Box component="section" id="tiers" sx={{ py: { xs: 6, md: 9 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={3} alignItems="stretch">
            {TIERS.map((tier) => (
              <Grid key={tier.id} size={{ xs: 12, md: 6 }}>
                <TierCard tier={tier} primary={primary} theme={theme} />
              </Grid>
            ))}
            <Grid size={{ xs: 12, md: 6 }}>
              <SupportCard primary={primary} onDonate={() => setDonateOpen(true)} />
            </Grid>
          </Grid>
        </Container>
      </Box>
      {/* What you get at every tier - screenshot grid */}
      <Box
        component="section"
        id="showcase"
        sx={{
          py: { xs: 6, md: 9 },
          bgcolor: alpha(theme.palette.text.primary, 0.02),
          borderTop: `1px solid ${theme.palette.divider}`,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Container maxWidth="lg">
          <Stack spacing={1.5} sx={{ mb: { xs: 4, md: 5 } }} alignItems="center" textAlign="center">
            <Typography
              sx={{
                fontSize: '0.78rem',
                fontWeight: 800,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'primary.main',
              }}
            >
              What you get
            </Typography>
            <Typography
              component="h2"
              sx={{
                fontWeight: 800,
                fontSize: { xs: '1.7rem', md: '2.3rem' },
                color: 'text.primary',
                letterSpacing: '-0.01em',
              }}
            >
              Everything is Free
            </Typography>
            <Typography sx={{ fontSize: '1rem', color: 'text.secondary', maxWidth: 560 }}>
              Try our free solution and discover how it can streamline your daily processes, improve efficiency, and help take your operations to the next level.
            </Typography>
          </Stack>
          <Grid container spacing={{ xs: 4, md: 5 }} alignItems="flex-start">
            {TIER_SHOWCASE.map((item) => (
              <Grid key={item.id} size={{ xs: 12, md: 4 }}>
                <ShowcaseCard item={item} theme={theme} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
      <FAQSlice
        title="Pricing questions"
        subtitle="The boring questions answered up-front so you do not have to ask."
        items={FAQS}
        bg="subtle"
      />
      <ClosingCta
        title="Start free, upgrade when you outgrow it."
        body="No card to start. 14-day refund window if you do upgrade and change your mind."
        primary={{ label: 'Start free', to: '/signup' }}
        secondary={{ label: 'Talk to sales', to: '/contact' }}
      />
      <Box sx={{ py: { xs: 4, md: 5 }, textAlign: 'center' }}>
        <Container maxWidth="sm">
          <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', mb: 2 }}>
            Want to support the project? Donations help us keep the free tier alive.
          </Typography>
          <Button
            onClick={() => setDonateOpen(true)}
            variant="text"
            startIcon={<AppIcon name='FavoriteBorder' fallback={FavoriteBorderIcon} />}
            sx={{ fontWeight: 700 }}
          >
            Donate
          </Button>
        </Container>
      </Box>
      <CryptoDonateDialog open={donateOpen} onClose={() => setDonateOpen(false)} />
    </PublicShell>
  );
}
