import { useState } from 'react';
import { Box, Button, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import CheckIcon from '@mui/icons-material/Check';
import StarIcon from '@mui/icons-material/Star';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import CryptoDonateDialog from '../../../components/Donate/CryptoDonateDialog';

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
  body: 'If you wish to support the project - so we can keep building and deliver these technologies to more people - any donation is a step forward. Thank you.',
  cta: 'Donate',
};

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
          <StarIcon sx={{ fontSize: 14 }} /> {tier.badge ?? 'Most popular'}
        </Box>
      )}
      <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>
        {tier.name}
      </Typography>
      <Stack direction="row" alignItems="baseline" spacing={1}>
        <Typography
          sx={{ fontWeight: 800, fontSize: '2.5rem', color: 'text.primary', lineHeight: 1 }}
        >
          {tier.price}
        </Typography>
        <Typography sx={{ fontSize: '0.95rem', color: 'text.secondary' }}>{tier.period}</Typography>
      </Stack>
      <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>{tier.blurb}</Typography>
      <Stack spacing={1.25} sx={{ flex: 1 }}>
        {tier.features.map((f) => (
          <Stack key={f} direction="row" spacing={1} alignItems="center">
            <CheckIcon sx={{ fontSize: 18, color: primary }} />
            <Typography sx={{ fontSize: '0.9rem', color: 'text.primary' }}>{f}</Typography>
          </Stack>
        ))}
      </Stack>
      {tier.highlight ? (
        <MarketingCtaButton component={RouterLink} to={tier.to} fullWidth sx={{ py: 1.25 }}>
          {tier.cta}
        </MarketingCtaButton>
      ) : (
        <Button
          component={RouterLink}
          to={tier.to}
          size="large"
          variant="outlined"
          fullWidth
          sx={{ py: 1.25, fontWeight: 700, borderRadius: 2 }}
        >
          {tier.cta}
        </Button>
      )}
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
        <FavoriteBorderIcon sx={{ fontSize: 30 }} />
      </Box>
      <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>
        {SUPPORT.name}
      </Typography>
      <Typography
        sx={{ fontWeight: 800, fontSize: '1.8rem', color: 'text.primary', lineHeight: 1.15 }}
      >
        {SUPPORT.blurb}
      </Typography>
      <Typography
        sx={{
          fontSize: '0.95rem',
          color: 'text.secondary',
          lineHeight: 1.6,
          flex: 1,
        }}
      >
        {SUPPORT.body}
      </Typography>
      <Button
        onClick={onDonate}
        size="large"
        variant="outlined"
        fullWidth
        startIcon={<FavoriteBorderIcon />}
        sx={{
          py: 1.25,
          fontWeight: 700,
          borderRadius: 2,
          borderColor: alpha(primary, 0.6),
          '&:hover': {
            borderColor: primary,
            bgcolor: alpha(primary, 0.06),
          },
        }}
      >
        {SUPPORT.cta}
      </Button>
    </Stack>
  );
}

export default function Pricing() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const [donateOpen, setDonateOpen] = useState(false);
  return (
    <Box component="section" id="pricing" sx={{ py: { xs: 8, md: 12 } }}>
      <Container maxWidth="lg">
        <Stack spacing={2} alignItems="center" textAlign="center" sx={{ mb: 6 }}>
          <Typography
            sx={{
              fontSize: '0.85rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'primary.main',
            }}
          >
            Pricing
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
            Support Us Today!
          </Typography>
          <Typography sx={{ fontSize: '1rem', color: 'text.secondary', maxWidth: 580 }}>
            First 1000 beta users keep the free tier forever.
          </Typography>
        </Stack>

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

      <CryptoDonateDialog open={donateOpen} onClose={() => setDonateOpen(false)} />
    </Box>
  );
}
