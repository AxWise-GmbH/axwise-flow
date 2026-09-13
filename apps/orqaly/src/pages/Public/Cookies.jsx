import { Box, Container, Table, TableBody, TableCell, TableHead, TableRow, Typography, alpha, useTheme } from '@mui/material';
import PublicShell from '../../components/Public/PublicShell';
import { PageHero, PageSection, ProseP } from './_shared';

const COOKIES = [
  { name: 'sb-access-token', cat: 'Strictly necessary', purpose: 'Supabase session token - keeps you signed in.', expires: 'Session' },
  { name: 'sb-refresh-token', cat: 'Strictly necessary', purpose: 'Supabase refresh token - renews your session.', expires: '30 days' },
  { name: 'orchestratori-theme-mode', cat: 'Preferences', purpose: 'Remembers your light/dark theme choice.', expires: '1 year' },
  { name: 'orchestratori-primary-color', cat: 'Preferences', purpose: 'Remembers your custom accent color.', expires: '1 year' },
  { name: '_vercel_*', cat: 'Strictly necessary', purpose: 'Vercel CDN routing and rate-limiting.', expires: 'Session' },
];

export default function Cookies() {
  const theme = useTheme();
  return (
    <PublicShell>
      <PageHero
        eyebrow="Legal"
        title="Cookie Policy"
        subtitle="Last updated: 19 May 2026. We use cookies sparingly - to keep you signed in, remember your preferences, and understand how the platform is used. No third-party advertising cookies."
      />

      <PageSection title="What cookies are">
        <ProseP>
          Cookies are small text files a website stores on your device. Some are essential for the
          site to function; others remember your preferences or help us understand usage in
          aggregate.
        </ProseP>
      </PageSection>

      <PageSection title="Categories we use">
        <ProseP>
          <strong>Strictly necessary:</strong> required for the platform to work (e.g. authentication).
          You cannot disable these without breaking the app.
        </ProseP>
        <ProseP>
          <strong>Preferences:</strong> remember choices like theme or language. Optional - you can clear
          them from your browser settings.
        </ProseP>
        <ProseP>
          We do <strong>not</strong> use marketing or cross-site tracking cookies.
        </ProseP>
      </PageSection>

      <PageSection title="Cookies in use" maxWidth="lg">
        <Box sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, overflow: 'hidden', bgcolor: 'background.paper' }}>
          <Table>
            <TableHead sx={{ bgcolor: alpha(theme.palette.text.primary, 0.03) }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Purpose</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Expires</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {COOKIES.map((c) => (
                <TableRow key={c.name}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{c.name}</TableCell>
                  <TableCell>{c.cat}</TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{c.purpose}</TableCell>
                  <TableCell>{c.expires}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </PageSection>

      <PageSection title="Managing cookies">
        <ProseP>
          You can clear or block cookies in your browser settings. If you block strictly necessary
          cookies, signing in won’t work - that’s the trade-off.
        </ProseP>
      </PageSection>
    </PublicShell>
  );
}
