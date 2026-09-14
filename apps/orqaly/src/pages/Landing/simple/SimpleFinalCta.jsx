import { Box, Button, Container, Stack, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';

export default function SimpleFinalCta({ onPrimaryCta }) {
  return (
    <Box
      component="section"
      sx={{ py: { xs: 6, md: 9 }, borderTop: '1px solid', borderColor: 'divider' }}
    >
      <Container maxWidth="md">
        <Stack spacing={2.5} alignItems="center" textAlign="center">
          <Typography
            component="h2"
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
            Explore the web workspace, then bring a Goal into your desktop chat when you’re ready to
            build.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={onPrimaryCta}
            endIcon={<ArrowForwardRoundedIcon />}
            sx={{ minHeight: 48, px: 3 }}
          >
            Open web preview
          </Button>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
            Desktop preview available separately for macOS Apple Silicon.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
