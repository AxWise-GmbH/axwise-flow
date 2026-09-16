import { Box, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';

import AppIcon from '../../icons/AppIcon';

// Single feature highlight. Visual one side, prose + bullets the other.
export default function Spotlight({ eyebrow, title, body, bullets, visual, reverse = false, bg = 'subtle' }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const bgcolor = bg === 'tint' ? alpha(theme.palette.text.primary, 0.02) : 'transparent';
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 9 }, bgcolor, borderTop: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none', borderBottom: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none' }}>
      <Container maxWidth="lg">
        <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center" direction={reverse ? { xs: 'column', md: 'row-reverse' } : 'row'}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={2.5}>
              {eyebrow && (
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'primary.main' }}>
                  {eyebrow}
                </Typography>
              )}
              {title && (
                <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.4rem' }, lineHeight: 1.15, letterSpacing: '-0.01em', color: 'text.primary' }}>
                  {title}
                </Typography>
              )}
              {body && (
                <Typography sx={{ fontSize: { xs: '1rem', md: '1.1rem' }, color: 'text.secondary', lineHeight: 1.7 }}>
                  {body}
                </Typography>
              )}
              {bullets && bullets.length > 0 && (
                <Stack spacing={1.25} sx={{ pt: 1 }}>
                  {bullets.map((b, i) => (
                    <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
                      <Box sx={{ mt: '4px', width: 22, height: 22, borderRadius: '50%', bgcolor: alpha(primary, 0.12), color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <AppIcon name='Check' fallback={CheckIcon} sx={{ fontSize: 14 }} />
                      </Box>
                      <Typography sx={{ fontSize: '0.98rem', color: 'text.primary', lineHeight: 1.55 }}>{b}</Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>{visual}</Grid>
        </Grid>
      </Container>
    </Box>
  );
}
