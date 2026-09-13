import { Box, Container, Stack, Typography, alpha, useTheme } from '@mui/material';

// Vertical step flow with a connecting line on the left.
export default function TimelineVertical({ title, subtitle, steps, bg = 'subtle' }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const bgcolor = bg === 'tint' ? alpha(theme.palette.text.primary, 0.02) : 'transparent';
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 8 }, bgcolor, borderTop: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none', borderBottom: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none' }}>
      <Container maxWidth="md">
        {(title || subtitle) && (
          <Stack spacing={1.5} sx={{ mb: { xs: 4, md: 5 } }}>
            {title && (
              <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.2rem' }, color: 'text.primary', letterSpacing: '-0.01em' }}>
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography sx={{ fontSize: '1rem', color: 'text.secondary', maxWidth: 560 }}>{subtitle}</Typography>
            )}
          </Stack>
        )}
        <Stack spacing={0} sx={{ position: 'relative' }}>
          <Box
            sx={{
              position: 'absolute',
              left: 23,
              top: 12,
              bottom: 12,
              width: 2,
              background: `linear-gradient(180deg, ${alpha(primary, 0.5)} 0%, ${alpha(primary, 0.15)} 100%)`,
            }}
          />
          {steps.map((s, i) => (
            <Stack key={i} direction="row" spacing={3} alignItems="flex-start" sx={{ position: 'relative', py: 2.5, zIndex: 1 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${primary} 0%, ${alpha(primary, 0.7)} 100%)`,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  flexShrink: 0,
                  boxShadow: `0 0 0 4px ${theme.palette.background.default}`,
                }}
              >
                {s.n || `0${i + 1}`}
              </Box>
              <Stack spacing={0.75} sx={{ flex: 1, pt: 0.5 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: 'text.primary' }}>{s.title}</Typography>
                <Typography sx={{ fontSize: '0.95rem', color: 'text.secondary', lineHeight: 1.65 }}>{s.body}</Typography>
              </Stack>
            </Stack>
          ))}
        </Stack>
      </Container>
    </Box>
  );
}
