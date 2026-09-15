import { Box, Button, Container, Stack, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { DesktopDownloadButton, DesktopReleaseDetails } from './DesktopDownload';

export default function SimpleFinalCta({ onPrimaryCta }) {
  return (
    <Box
      component="section"
      id="download"
      aria-labelledby="desktop-download-heading"
      sx={{
        py: { xs: 6, md: 9 },
        borderTop: '1px solid',
        borderColor: 'divider',
        scrollMarginTop: 90,
      }}
    >
      <Container maxWidth="md">
        <Stack spacing={2.5} alignItems="center" textAlign="center">
          <Typography
            component="h2"
            id="desktop-download-heading"
            sx={{
              color: 'text.primary',
              fontSize: { xs: '1.8rem', md: '2.75rem' },
              fontWeight: 700,
              letterSpacing: '-0.04em',
            }}
          >
            Start with the work in front of you.
          </Typography>
          <Typography sx={{ color: 'text.secondary', maxWidth: 570 }}>
            Download Orqanix, sign in, and start with what you want to get done. Add a project
            folder or useful documents when you need them.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
            <DesktopDownloadButton descriptionId="desktop-download-details" />
            <Button
              variant="outlined"
              size="large"
              onClick={onPrimaryCta}
              endIcon={<ArrowForwardRoundedIcon />}
              sx={{ minHeight: 48, px: 3 }}
            >
              Open web preview
            </Button>
          </Stack>
          <DesktopReleaseDetails id="desktop-download-details" showChecksum />
          <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
            Unzip the download, then move Orqanix Preview to Applications. Built on Goose.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
