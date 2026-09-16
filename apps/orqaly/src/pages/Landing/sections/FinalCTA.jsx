import { Box, Button, Container, Stack, Typography, alpha, useTheme } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import { LANDING_PASS_VERTICAL_TOUCH_SX } from '../../../utils/mobileTouchScroll';

export default function FinalCTA({ onPrimaryCta, onSecondaryCta }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Box
      component="section"
      sx={{
        py: { xs: 10, md: 16 },
        position: 'relative',
        background: `radial-gradient(ellipse at 50% 50%, ${alpha(primary, 0.12)} 0%, transparent 70%), ${theme.palette.background.default}`,
        overflow: 'hidden',
        ...LANDING_PASS_VERTICAL_TOUCH_SX,
      }}
    >
      <Container maxWidth="md">
        <Stack spacing={4} alignItems="center" textAlign="center">
          <Typography
            sx={{
              fontSize: { xs: '2rem', sm: '2.75rem', md: '3.5rem' },
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              color: 'text.primary',
              maxWidth: 720,
            }}
          >
            Turn your next idea into a working business - today.
          </Typography>
          <Typography
            sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, color: 'text.secondary', maxWidth: 540 }}
          >
            First 1000 beta users are free,{' '}
            <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>
              forever
            </Box>
            .
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 1 }}>
            <MarketingCtaButton
              endIcon={<ArrowForwardIcon />}
              onClick={onPrimaryCta}
              sx={{ px: 4, py: 1.5, fontSize: '1rem' }}
            >
              Join the beta
            </MarketingCtaButton>
            <Button
              size="large"
              variant="outlined"
              startIcon={<ForumOutlinedIcon />}
              onClick={onSecondaryCta}
              sx={{ px: 4, py: 1.5, fontSize: '1rem', borderRadius: 2, fontWeight: 600 }}
            >
              Talk to founders
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
