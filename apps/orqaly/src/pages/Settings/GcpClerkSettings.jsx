import { UserProfile } from '@clerk/react';
import { Alert, Box, Container, Paper, Stack, Typography } from '@mui/material';

export default function GcpClerkSettings() {
  return (
    <Container maxWidth="lg">
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" component="h1">
            Settings
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Manage the personal account used to sign in to Orqanix.
          </Typography>
        </Box>
        <Alert severity="info" variant="outlined">
          Clerk manages sign-in, password recovery, connected accounts, sessions, and multi-factor
          security. The same account connects your desktop and cloud workspace.
        </Alert>
        <Paper variant="outlined" sx={{ overflow: 'hidden', bgcolor: '#0F0F0F' }}>
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="h6">Account and security</Typography>
          </Box>
          <Box sx={{ display: 'grid', justifyItems: 'center', p: { xs: 1, sm: 2 } }}>
            <UserProfile routing="hash" />
          </Box>
        </Paper>
      </Stack>
    </Container>
  );
}
