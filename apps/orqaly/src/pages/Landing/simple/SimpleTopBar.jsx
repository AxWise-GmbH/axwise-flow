import { Box, Button, Container, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export default function SimpleTopBar() {
  const theme = useTheme();
  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        py: 1.5,
        bgcolor: alpha(theme.palette.background.default, 0.92),
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Container maxWidth="lg">
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Typography
            component={RouterLink}
            to="/"
            aria-label="Orqanix - home"
            sx={{
              color: 'text.primary',
              fontWeight: 750,
              fontSize: '1.3rem',
              letterSpacing: '-0.04em',
              textDecoration: 'none',
            }}
          >
            Orqanix
          </Typography>
          <Stack
            component="nav"
            aria-label="Main navigation"
            direction="row"
            spacing={{ xs: 0.5, sm: 1.5 }}
          >
            <Button
              component="a"
              href="/benchmark"
              sx={{ display: { xs: 'none', md: 'inline-flex' }, fontWeight: 600, color: 'primary.main' }}
            >
              ⚡ Benchmarks
            </Button>
            <Button
              component="a"
              href="#use-cases"
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              Use cases
            </Button>
            <Button
              component="a"
              href="#how-it-works"
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              Local + cloud
            </Button>
            <Button component={RouterLink} to="/login" variant="outlined" sx={{ minHeight: 44 }}>
              Log in
            </Button>
            <Button component="a" href="#download" variant="contained" sx={{ minHeight: 44 }}>
              Download
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
