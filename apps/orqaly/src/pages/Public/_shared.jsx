import { Box, Container, Stack, Typography, alpha, useTheme } from '@mui/material';

export function PageHero({ eyebrow, title, subtitle }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        position: 'relative',
        pt: { xs: 6, md: 10 },
        pb: { xs: 5, md: 8 },
        bgcolor: alpha(theme.palette.primary.main, 0.03),
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Container maxWidth="md">
        <Stack spacing={2.5} alignItems="flex-start">
          {eyebrow && (
            <Typography
              sx={{
                fontSize: '0.78rem',
                fontWeight: 800,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'primary.main',
              }}
            >
              {eyebrow}
            </Typography>
          )}
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: '2.1rem', md: '3rem' },
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              color: 'text.primary',
            }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography
              sx={{
                fontSize: { xs: '1rem', md: '1.15rem' },
                color: 'text.secondary',
                lineHeight: 1.55,
                maxWidth: 680,
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Stack>
      </Container>
    </Box>
  );
}

export function PageSection({ title, children, maxWidth = 'md' }) {
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 7 } }}>
      <Container maxWidth={maxWidth}>
        {title && (
          <Typography
            component="h2"
            sx={{
              fontSize: { xs: '1.5rem', md: '1.9rem' },
              fontWeight: 800,
              color: 'text.primary',
              mb: 2.5,
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </Typography>
        )}
        <Stack spacing={2}>{children}</Stack>
      </Container>
    </Box>
  );
}

export function ProseP({ children }) {
  return (
    <Typography sx={{ fontSize: '1rem', color: 'text.primary', lineHeight: 1.7 }}>
      {children}
    </Typography>
  );
}

export function ProseList({ items }) {
  return (
    <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 0.75, fontSize: '0.98rem', color: 'text.primary', lineHeight: 1.6 } }}>
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </Box>
  );
}
