import { Box, Container, Stack, Typography, alpha, useTheme } from '@mui/material';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import Reveal from '../../../components/Common/Reveal';

export default function SimpleFinalCta({ onPrimaryCta, onSecondaryCta }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        py: { xs: 8, md: 11 },
        background: `radial-gradient(ellipse at 50% 50%, ${alpha(primary, 0.1)} 0%, transparent 65%)`,
      }}
    >
      <Container maxWidth="sm">
        <Reveal>
          <Stack spacing={2.5} alignItems="center" textAlign="center">
            <Typography
              sx={{
                fontSize: { xs: '1.6rem', md: '2.1rem' },
                fontWeight: 800,
                color: 'text.primary',
                lineHeight: 1.25,
              }}
            >
              Ready to put your first agent to work?
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
              <MarketingCtaButton size="large" onClick={onPrimaryCta} sx={{ px: 3.5 }}>
                Start free
              </MarketingCtaButton>
              <Box
                component="button"
                type="button"
                onClick={onSecondaryCta}
                sx={{
                  border: 'none',
                  background: 'none',
                  font: 'inherit',
                  cursor: 'pointer',
                  color: 'text.secondary',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  py: 1,
                  '&:hover': { color: 'text.primary' },
                }}
              >
                Talk to us instead
              </Box>
            </Stack>
          </Stack>
        </Reveal>
      </Container>
    </Box>
  );
}
