import { useState, useEffect } from 'react';
import { useClerk, useUser, useAuth } from '@clerk/react';
import { Alert, Box, Button, CircularProgress, Container, Stack, Typography, LinearProgress, Paper, alpha } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import BoltIcon from '@mui/icons-material/Bolt';
import { DESKTOP_RELEASE } from '../Landing/simple/desktop-release';
import UserQuotasDirectory from '../../components/LlmUsage/UserQuotasDirectory';

export default function AccountPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const { signOut, openUserProfile } = useClerk();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [quotaSummary, setQuotaSummary] = useState(null);

  useEffect(() => {
    if (!isSignedIn) return;
    const apiUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ORQALY_API_URL) || '';
    getToken()
      .then((token) =>
        fetch(`${apiUrl}/desktop/v1/usage`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
      )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.spendUsd !== undefined) setQuotaSummary(data);
      })
      .catch(() => {});
  }, [isSignedIn, getToken]);

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

  const quotaExceeded = quotaSummary && !quotaSummary.isUnlimited && quotaSummary.spendUsd >= quotaSummary.limitUsd;

  return (
    <Box component="main" sx={{ minHeight: '100vh', bgcolor: '#0A0A0A', color: '#F5F5F5', py: 6, px: 2 }}>
      <Container maxWidth={quotaSummary?.isAdmin ? 'lg' : 'sm'}>
        <Stack spacing={4}>
          <Typography component={RouterLink} to="/" sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 700 }}>
            Orqanix
          </Typography>
          <Box>
            <Typography component="h1" variant="h3">Your Orqanix account</Typography>
            <Typography sx={{ mt: 2, color: '#BDBDBD' }}>{user?.primaryEmailAddress?.emailAddress || 'Signed in'}</Typography>
          </Box>

          {/* Real-time AI Credits & Usage card */}
          {quotaSummary && (
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                borderRadius: 2.5,
                bgcolor: alpha('#ffffff', 0.03),
                borderColor: alpha('#ffffff', 0.1),
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'text.secondary' }}>
                    AI Credits & Usage
                  </Typography>
                  {quotaSummary.tokens?.cacheHitRate !== undefined && quotaSummary.tokens.cacheHitRate > 0 && (
                    <Box
                      component="span"
                      sx={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        px: 0.75,
                        py: 0.2,
                        borderRadius: '4px',
                        bgcolor: alpha('#4caf50', 0.15),
                        color: '#4caf50',
                        border: '1px solid',
                        borderColor: alpha('#4caf50', 0.3),
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.3,
                      }}
                    >
                      <BoltIcon sx={{ fontSize: 13 }} /> {quotaSummary.tokens.cacheHitRate}% Cached
                    </Box>
                  )}
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 700, color: quotaExceeded ? 'error.main' : 'primary.main' }}>
                  ${quotaSummary.spendUsd?.toFixed(2) ?? '0.00'} / {quotaSummary.isUnlimited ? 'Unlimited' : `$${quotaSummary.limitUsd?.toFixed(2) ?? '5.00'}`}
                </Typography>
              </Box>
              {!quotaSummary.isUnlimited && (
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, Math.max(0, ((quotaSummary.spendUsd || 0) / (quotaSummary.limitUsd || 5)) * 100))}
                  color={quotaExceeded ? 'error' : 'primary'}
                  sx={{ height: 6, borderRadius: 3, mb: 1.5, bgcolor: alpha('#ffffff', 0.08) }}
                />
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {(quotaSummary.tokens?.total || 0).toLocaleString()} tokens
                  {quotaSummary.tokens?.cached > 0 && ` (${(quotaSummary.tokens.cached).toLocaleString()} cached)`}
                </Typography>
                <Typography variant="caption" sx={{ color: '#81c784' }}>
                  {quotaSummary.savingsUsd > 0
                    ? `Saved $${quotaSummary.savingsUsd.toFixed(2)} with 75% prompt cache discount`
                    : 'Gemini 3.8 Flash (75% cache discount active)'}
                </Typography>
              </Box>
            </Paper>
          )}

          {/* Admin User Quotas Directory */}
          {quotaSummary?.isAdmin && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
                Admin · User Quotas & Limits Directory
              </Typography>
              <UserQuotasDirectory />
            </Box>
          )}

          <Typography>Your conversations, tools and AxWise results live in the desktop app. This website provides downloads and account access.</Typography>
          <Stack spacing={2} sx={{ maxWidth: 400 }}>
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
