import { Box, Container, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export default function SimpleFooter({ onSwitchToFull }) {
  return (
    <Box component="footer" sx={{ py: 4, borderTop: '1px solid', borderColor: 'divider' }}>
      <Container maxWidth="md">
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 1.5, sm: 2 }}
          alignItems="center"
          justifyContent="space-between"
        >
          <Stack spacing={0.5} alignItems={{ xs: 'center', sm: 'flex-start' }}>
            <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
              © {new Date().getFullYear()} Orqaly
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              Built on Goose · Powered by Gemini
            </Typography>
          </Stack>

          <Stack direction="row" spacing={2.5}>
            <Typography
              component={RouterLink}
              to="/privacy"
              sx={{ fontSize: '0.82rem', color: 'text.secondary', textDecoration: 'none', '&:hover': { color: 'text.primary' } }}
            >
              Privacy
            </Typography>
            <Typography
              component={RouterLink}
              to="/terms"
              sx={{ fontSize: '0.82rem', color: 'text.secondary', textDecoration: 'none', '&:hover': { color: 'text.primary' } }}
            >
              Terms
            </Typography>
            <Typography
              component={RouterLink}
              to="/contact"
              sx={{ fontSize: '0.82rem', color: 'text.secondary', textDecoration: 'none', '&:hover': { color: 'text.primary' } }}
            >
              Contact
            </Typography>
          </Stack>

          {onSwitchToFull && (
            <Box
              component="button"
              type="button"
              onClick={onSwitchToFull}
              sx={{
                border: 'none',
                background: 'none',
                font: 'inherit',
                cursor: 'pointer',
                fontSize: '0.82rem',
                color: 'primary.main',
                fontWeight: 600,
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              Prefer the full tour? Switch above ↑
            </Box>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
