import { Box, Button, Container, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';

export default function PromptsStrip({ prompts, ctaLabel = 'Try it now' }) {
  const theme = useTheme();
  return (
    <Box
      component="section"
      sx={{
        py: { xs: 5, md: 7 },
        bgcolor: alpha(theme.palette.primary.main, 0.04),
        borderTop: `1px solid ${theme.palette.divider}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Container maxWidth="md">
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: '1.4rem', color: 'text.primary', mb: 2.5, textAlign: 'center' }}>
          Try a prompt
        </Typography>
        <Stack spacing={1.5}>
          {prompts.map((p, i) => (
            <Box
              key={i}
              sx={{
                p: 2.5,
                borderRadius: 2,
                bgcolor: 'background.paper',
                border: `1px solid ${theme.palette.divider}`,
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: '0.92rem',
                color: 'text.primary',
                lineHeight: 1.55,
              }}
            >
              <Typography component="span" sx={{ color: 'primary.main', fontWeight: 700, mr: 1 }}>
                ›
              </Typography>
              {p}
            </Box>
          ))}
        </Stack>
        <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" sx={{ mt: 4 }}>
          <MarketingCtaButton component={RouterLink} to="/signup" size="large" sx={{ fontWeight: 700, borderRadius: 2, px: 3.5 }}>
            {ctaLabel}
          </MarketingCtaButton>
          <Button component={RouterLink} to="/contact" variant="outlined" size="large" sx={{ fontWeight: 700, borderRadius: 2, px: 3.5 }}>
            Book a walkthrough
          </Button>
        </Stack>
      </Container>
    </Box>
  );
}
