import { useState } from 'react';
import { useClerk, useUser } from '@clerk/react';
import { Alert, Box, Button, CircularProgress, Container, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { DESKTOP_RELEASE } from '../Landing/simple/desktop-release';

export default function AccountPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!isLoaded) return <CircularProgress aria-label="Loading account" />;
  if (!isSignedIn) return null;

  async function accountAction(action) {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await action(); }
    catch { setError('The account action could not complete. Please try again.'); }
    finally { setBusy(false); }
  }

  return (
    <Box component="main" sx={{ minHeight: '100vh', bgcolor: '#0A0A0A', color: '#F5F5F5', py: 6, px: 2 }}>
      <Container maxWidth="sm">
        <Stack spacing={4}>
          <Typography component={RouterLink} to="/" sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 700 }}>Orqanix</Typography>
          <Box>
            <Typography component="h1" variant="h3">Your Orqanix account</Typography>
            <Typography sx={{ mt: 2, color: '#BDBDBD' }}>{user?.primaryEmailAddress?.emailAddress || 'Signed in'}</Typography>
          </Box>
          <Typography>Your conversations, tools and AxWise results live in the desktop app. This website provides downloads and account access.</Typography>
          <Stack spacing={2}>
            <Button component="a" href={DESKTOP_RELEASE.url} variant="contained">Download Orqanix {DESKTOP_RELEASE.version} for Mac</Button>
            <Typography variant="body2" sx={{ color: '#BDBDBD' }}>Apple Silicon · macOS. This build is not Apple-notarized; macOS may require approval to open it.</Typography>
            <Button onClick={() => accountAction(() => openUserProfile())} disabled={busy} variant="outlined" color="inherit">Account security and profile</Button>
            <Button onClick={() => accountAction(() => signOut({ redirectUrl: '/' }))} disabled={busy} color="inherit">Sign out</Button>
          </Stack>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography variant="body2" sx={{ color: '#BDBDBD' }}>Browser sign-in does not automatically sign in the desktop. Use the app’s sign-in button to connect it securely. Cloud conversation sync is not enabled.</Typography>
          <Button component="a" href="https://axwise.de" color="inherit">About the AxWise extension</Button>
        </Stack>
      </Container>
    </Box>
  );
}
