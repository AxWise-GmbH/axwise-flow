import { Box, Container, Stack, Typography, Button, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import MarketingCtaButton from './MarketingCtaButton';

import AppIcon from '../../icons/AppIcon';

// Detect protocol-prefixed URLs (mailto:, tel:, http:, https:) so we render
// them as anchors instead of trying to route them through React Router.
function isExternal(to) {
  return typeof to === 'string' && /^[a-z]+:/i.test(to);
}

function ctaProps(target) {
  if (isExternal(target)) {
    return { component: 'a', href: target };
  }
  return { component: RouterLink, to: target };
}

export default function ClosingCta({
  title = 'Want to see it in action?',
  body = 'Sign up free, or have a five-minute call with the team to see if it fits.',
  primary = { label: 'Try it free', to: '/signup' },
  secondary = { label: 'Talk to sales', to: '/contact' },
}) {
  const theme = useTheme();
  const primaryColor = theme.palette.primary.main;
  return (
    <Box component="section" sx={{ py: { xs: 6, md: 9 } }}>
      <Container maxWidth="md">
        <Stack
          spacing={3}
          alignItems="center"
          textAlign="center"
          sx={{
            p: { xs: 4, md: 6 },
            borderRadius: 4,
            bgcolor: alpha(primaryColor, 0.05),
            border: `1px solid ${alpha(primaryColor, 0.25)}`,
          }}
        >
          <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2rem' }, color: 'text.primary', letterSpacing: '-0.01em' }}>
            {title}
          </Typography>
          <Typography sx={{ fontSize: '1rem', color: 'text.secondary', maxWidth: 520, lineHeight: 1.6 }}>{body}</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {primary && (
              <MarketingCtaButton
                {...ctaProps(primary.to)}
                endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />}
                sx={{ px: 3.5 }}
              >
                {primary.label}
              </MarketingCtaButton>
            )}
            {secondary && (
              <Button
                {...ctaProps(secondary.to)}
                variant="outlined"
                size="large"
                sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3.5 }}
              >
                {secondary.label}
              </Button>
            )}
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
