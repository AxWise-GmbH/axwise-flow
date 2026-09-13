import { UserProfile } from '@clerk/react';
import { Alert, Box, Paper, Stack, Typography } from '@mui/material';
import PageLayout from '../../components/Common/PageLayout';

export default function ClerkSettings() {
  return (
    <PageLayout
      title="Settings"
      subtitle="Manage the personal account used to sign in to Orqaly."
      maxWidth={1120}
    >
      <Stack spacing={1.5}>
        <Alert severity="info" variant="outlined">
          Clerk manages sign-in, password recovery, connected accounts, sessions, and
          multi-factor security. Orqaly does not maintain a second Supabase user account.
        </Alert>
        <Paper
          elevation={0}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <Box sx={{ p: { xs: 1.5, sm: 2 }, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="h6">Account and security</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Update your profile and security settings directly through Clerk.
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', justifyItems: 'center', p: { xs: 1, sm: 2 } }}>
            <UserProfile routing="hash" />
          </Box>
        </Paper>
      </Stack>
    </PageLayout>
  );
}
