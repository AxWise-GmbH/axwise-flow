import { Box, Button, Container, Stack, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { DesktopDownloadButton, DesktopReleaseDetails } from './DesktopDownload';

export default function SimpleHero({ onPrimaryCta }) {
  return (
    <Box component="section" sx={{ pt: { xs: 7, md: 10 }, pb: { xs: 5, md: 7 } }}>
      <Container maxWidth="lg">
        <Stack spacing={3} alignItems="center" textAlign="center">
          <Typography
            sx={{
              fontSize: '0.75rem',
              letterSpacing: '0.14em',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'text.secondary',
            }}
          >
            Orqanix · Desktop preview
          </Typography>
          <Typography
            variant="h1"
            sx={{
              color: 'text.primary',
              fontSize: { xs: '2.65rem', sm: '4rem', md: '5.4rem' },
              fontWeight: 700,
              lineHeight: 1.03,
              letterSpacing: '-0.055em',
              maxWidth: 1000,
            }}
          >
            Cloud reasoning.
            <Box component="span" sx={{ display: 'block', color: 'primary.main' }}>
              Local action.
            </Box>
          </Typography>
          <Typography
            sx={{
              maxWidth: 640,
              fontSize: { xs: '1rem', md: '1.15rem' },
              lineHeight: 1.65,
              color: 'text.secondary',
            }}
          >
            One conversation to research, plan, build and check. Your files, tools and useful
            outputs together in a connected workspace.
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
            Built on Goose · Powered by Gemini
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
            <DesktopDownloadButton descriptionId="hero-download-details" />
            <Button
              variant="outlined"
              size="large"
              onClick={onPrimaryCta}
              endIcon={<ArrowForwardRoundedIcon />}
              sx={{ px: 3, minHeight: 48 }}
            >
              Open web preview
            </Button>
          </Stack>
          <DesktopReleaseDetails id="hero-download-details" />
          <Button component="a" href="#use-cases" sx={{ px: 3, minHeight: 44 }}>
            Explore the possibilities
          </Button>
        </Stack>
      </Container>
    </Box>
  );
}
