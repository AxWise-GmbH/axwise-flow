import { Box, Button, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import BusinessCenterOutlinedIcon from '@mui/icons-material/BusinessCenterOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LandingGlassIcon from './LandingGlassIcon';

const TILES = [
  {
    iconName: 'PsychologyOutlined',
    Fallback: PsychologyOutlinedIcon,
    title: 'Skills',
    desc: 'Modular capabilities',
  },
  {
    iconName: 'BuildOutlined',
    Fallback: BuildOutlinedIcon,
    title: 'Tools',
    desc: 'Integrations & APIs',
  },
  {
    iconName: 'GroupsOutlined',
    Fallback: GroupsOutlinedIcon,
    title: 'Consilium',
    desc: 'Multi-agent councils',
  },
  {
    iconName: 'CorporateFareOutlined',
    Fallback: CorporateFareOutlinedIcon,
    title: 'Organizations',
    desc: 'Team workspaces',
  },
  {
    iconName: 'BusinessCenterOutlined',
    Fallback: BusinessCenterOutlinedIcon,
    title: 'Business models',
    desc: 'Verified revenue patterns',
  },
  {
    iconName: 'VpnKeyOutlined',
    Fallback: VpnKeyOutlinedIcon,
    title: 'Account',
    desc: 'Purchase any Tool or LLM account to get keys.',
  },
];

export default function MarketplaceSpotlight() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Box component="section" id="marketplace" sx={{ py: { xs: 8, md: 12 } }}>
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
            Marketplace
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
            An app store for AI agents.
          </Typography>
          <Typography sx={{ fontSize: '1.15rem', color: 'text.secondary', maxWidth: 580 }}>
            You build it.{' '}
            <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>
              You keep 85%.
            </Box>
          </Typography>
        </Stack>

        <Grid container spacing={2} sx={{ mb: 5 }}>
          {TILES.map(({ iconName, Fallback, title, desc }) => (
            <Grid key={title} size={{ xs: 6, sm: 4, md: 2 }}>
              <Stack
                spacing={1.5}
                alignItems="center"
                textAlign="center"
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  bgcolor:
                    theme.palette.mode === 'dark' ? alpha('#fff', 0.025) : alpha('#fff', 0.7),
                  border: `1px solid ${theme.palette.divider}`,
                  backdropFilter: 'saturate(140%) blur(10px)',
                  WebkitBackdropFilter: 'saturate(140%) blur(10px)',
                  height: '100%',
                  transition:
                    'transform 250ms ease, border-color 250ms ease, box-shadow 250ms ease',
                  '&:hover': {
                    transform: 'translateY(-3px)',
                    borderColor: alpha(primary, 0.4),
                    boxShadow: `0 10px 28px ${alpha(primary, 0.15)}`,
                  },
                }}
              >
                <LandingGlassIcon name={iconName} fallback={Fallback} size={26} tone="brand" />
                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'text.primary' }}>
                  {title}
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', lineHeight: 1.4 }}>
                  {desc}
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
            mb: 4,
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
            <PaidOutlinedIcon sx={{ fontSize: 28 }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography
              sx={{ fontWeight: 800, fontSize: '1.35rem', color: 'text.primary', mb: 0.5 }}
            >
              85 / 15 revenue split.
            </Typography>
            <Typography sx={{ fontSize: '0.95rem', color: 'text.secondary', lineHeight: 1.6 }}>
              Creators keep 85% of every sale. Platform takes 15%. Stripe Connect handles payouts
              directly to your bank.
            </Typography>
          </Box>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
          <MarketingCtaButton
            component={RouterLink}
            to="/marketplace"
            endIcon={<ArrowForwardIcon />}
            sx={{ px: 3.5, py: 1.25 }}
          >
            Browse marketplace
          </MarketingCtaButton>
          <Button
            component={RouterLink}
            to="/marketplace"
            size="large"
            variant="outlined"
            sx={{ px: 3.5, py: 1.25, fontWeight: 600, borderRadius: 2 }}
          >
            Become a creator
          </Button>
        </Stack>
      </Container>
    </Box>
  );
}
