import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export default function GcpPublicPage({ eyebrow = 'Orqanix', title, body }) {
  return (
    <Box component="main" sx={{ minHeight: '100vh', bgcolor: '#0A0A0A', color: '#F5F5F5', px: 3, py: 8 }}>
      <Container maxWidth="md">
        <Stack spacing={4}>
          <Typography component={RouterLink} to="/" sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 700 }}>Orqanix</Typography>
          <Box sx={{ py: { xs: 6, md: 12 } }}><Typography variant="overline" color="text.secondary">{eyebrow}</Typography><Typography variant="h2" component="h1" sx={{ mt: 1, letterSpacing: '-0.04em' }}>{title}</Typography><Typography variant="h6" color="text.secondary" sx={{ mt: 3, maxWidth: 700, fontWeight: 400 }}>{body}</Typography></Box>
          <Stack direction="row" spacing={1.5}><Button component={RouterLink} to="/signup" variant="contained">Start now</Button><Button component={RouterLink} to="/" color="inherit">Back to home</Button></Stack>
        </Stack>
      </Container>
    </Box>
  );
}
