import { Box, Container, Stack, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';

export default function SimpleTopBar() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        py: 1.25,
        bgcolor: alpha(theme.palette.background.default, 0.82),
        backdropFilter: 'saturate(180%) blur(18px)',
        WebkitBackdropFilter: 'saturate(180%) blur(18px)',
        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
      }}
    >
      <Container maxWidth="lg">
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
          <Box
            component={RouterLink}
            to="/"
            aria-label="Orqaly - home"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: '50%',
              bgcolor: alpha(primary, 0.12),
              color: primary,
              flexShrink: 0,
            }}
          >
            <AutoAwesomeOutlinedIcon sx={{ fontSize: 18 }} />
          </Box>

          <Box
            component={RouterLink}
            to="/login"
            sx={{
              fontSize: '0.88rem',
              fontWeight: 600,
              color: 'text.secondary',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              '&:hover': { color: 'text.primary' },
            }}
          >
            Log in
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}
