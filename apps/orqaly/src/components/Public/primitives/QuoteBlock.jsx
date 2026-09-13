import { Box, Container, Stack, Typography, alpha, useTheme } from '@mui/material';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';

import AppIcon from '../../icons/AppIcon';

export default function QuoteBlock({ quote, attribution, bg = 'tint' }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const bgcolor = bg === 'tint' ? alpha(primary, 0.05) : 'transparent';
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 8 }, bgcolor, borderTop: bg === 'tint' ? `1px solid ${alpha(primary, 0.25)}` : 'none', borderBottom: bg === 'tint' ? `1px solid ${alpha(primary, 0.25)}` : 'none' }}>
      <Container maxWidth="md">
        <Stack spacing={3} alignItems="center" textAlign="center">
          <AppIcon
            name='FormatQuote'
            fallback={FormatQuoteIcon}
            sx={{ fontSize: 48, color: primary, opacity: 0.4, transform: 'scaleX(-1)' }} />
          <Typography
            component="blockquote"
            sx={{
              fontSize: { xs: '1.4rem', md: '1.9rem' },
              fontWeight: 700,
              lineHeight: 1.35,
              letterSpacing: '-0.01em',
              color: 'text.primary',
              m: 0,
              maxWidth: 720,
            }}
          >
            “{quote}”
          </Typography>
          {attribution && (
            <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', fontWeight: 600 }}>
              {attribution}
            </Typography>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
