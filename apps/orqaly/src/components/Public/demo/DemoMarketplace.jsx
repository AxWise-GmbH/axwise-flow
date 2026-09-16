import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import HandymanOutlinedIcon from '@mui/icons-material/HandymanOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';

import AppIcon from '../../icons/AppIcon';

const ITEMS = [
  {
    kind: 'agent',
    Icon: SmartToyOutlinedIcon,
    title: 'Sales Follow-up Pro',
    creator: '@northwind',
    price: '$19',
    rating: 4.9,
    installs: '2.1k',
    featured: true,
  },
  {
    kind: 'tool',
    Icon: HandymanOutlinedIcon,
    title: 'Stripe Refund Reviewer',
    creator: '@kira.ai',
    price: 'Free',
    rating: 4.8,
    installs: '4.7k',
  },
  {
    kind: 'skill',
    Icon: LayersOutlinedIcon,
    title: 'GDPR Email Auditor',
    creator: '@compliance.dev',
    price: '$5',
    rating: 4.7,
    installs: '892',
  },
  {
    kind: 'agent',
    Icon: SmartToyOutlinedIcon,
    title: 'Voice Triage Nurse',
    creator: '@medops',
    price: '$29',
    rating: 5.0,
    installs: '318',
  },
  {
    kind: 'replicator',
    Icon: RocketLaunchOutlinedIcon,
    title: 'Solo Coach Starter',
    creator: '@solo.studio',
    price: '$9',
    rating: 4.8,
    installs: '1.4k',
  },
  {
    kind: 'tool',
    Icon: HandymanOutlinedIcon,
    title: 'Telegram Inbox Router',
    creator: '@msgops',
    price: 'Free',
    rating: 4.6,
    installs: '3.2k',
  },
];

const KIND_LABEL = {
  agent: 'Agent',
  tool: 'Tool',
  skill: 'Skill',
  replicator: 'Replicator',
};

function MarketCard({ item, primary, theme, isDark }) {
  const { Icon, title, creator, price, rating, installs, featured, kind } = item;
  const isFree = price === 'Free';
  return (
    <Box
      sx={{
        position: 'relative',
        p: 1.5,
        borderRadius: 2.5,
        border: `1px solid ${featured ? alpha(primary, 0.5) : theme.palette.divider}`,
        bgcolor: featured
          ? alpha(primary, 0.05)
          : isDark
            ? alpha('#fff', 0.02)
            : alpha(theme.palette.text.primary, 0.012),
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        minHeight: 142,
      }}
    >
      {featured && (
        <Chip
          label="Featured"
          size="small"
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            bgcolor: primary,
            color: '#fff',
            fontWeight: 800,
            fontSize: '0.62rem',
            height: 18,
            letterSpacing: '0.04em',
          }}
        />
      )}
      <Stack direction="row" spacing={1} alignItems="center">
        <Box
          sx={{
            width: 30,
            height: 30,
            borderRadius: 1.25,
            bgcolor: alpha(primary, 0.12),
            color: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon sx={{ fontSize: 18 }} />
        </Box>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: '0.62rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'text.secondary',
          }}
        >
          {KIND_LABEL[kind]}
        </Typography>
      </Stack>
      <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: 'text.primary', lineHeight: 1.25 }}>
        {title}
      </Typography>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <AppIcon
          name='VerifiedRounded'
          fallback={VerifiedRoundedIcon}
          sx={{ fontSize: 13, color: 'primary.main' }} />
        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{creator}</Typography>
      </Stack>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mt: 'auto' }}>
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: '0.92rem',
            color: isFree ? primary : 'text.primary',
          }}
        >
          {price}
        </Typography>
        <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.disabled' }} />
        <Stack direction="row" spacing={0.25} alignItems="center">
          <AppIcon
            name='StarRounded'
            fallback={StarRoundedIcon}
            sx={{ fontSize: 13, color: theme.palette.warning.main }} />
          <Typography sx={{ fontSize: '0.72rem', color: 'text.primary', fontWeight: 700 }}>
            {rating}
          </Typography>
        </Stack>
        <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.disabled' }} />
        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{installs} installs</Typography>
      </Stack>
    </Box>
  );
}

export default function DemoMarketplace() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      role="img"
      aria-label="Orqaly marketplace: a grid of agents, tools, skills, and replicators with creator handles and prices"
      sx={{
        position: 'relative',
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
      }}
    >
      {/* Top bar */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{
          px: 2.5,
          py: 1.25,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02),
        }}
      >
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1.5,
            bgcolor: alpha(primary, 0.12),
            color: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon
            name='StorefrontOutlined'
            fallback={StorefrontOutlinedIcon}
            sx={{ fontSize: 16 }} />
        </Box>
        <Stack sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary' }}>
            Marketplace
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
            1,247 listings · creators earn crypto
          </Typography>
        </Stack>
        <Chip
          label="Newest"
          size="small"
          sx={{
            bgcolor: alpha(primary, 0.1),
            color: 'primary.main',
            fontWeight: 700,
            fontSize: '0.68rem',
            height: 22,
          }}
        />
      </Stack>
      {/* Grid of items */}
      <Box
        sx={{
          p: { xs: 1.5, md: 2 },
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
          gap: 1.25,
        }}
      >
        {ITEMS.map((item, i) => (
          <MarketCard key={i} item={item} primary={primary} theme={theme} isDark={isDark} />
        ))}
      </Box>
    </Box>
  );
}
