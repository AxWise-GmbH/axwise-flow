import { Accordion, AccordionDetails, AccordionSummary, Box, Container, Stack, Typography, alpha, useTheme } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import AppIcon from '../../icons/AppIcon';

// Compact FAQ for a single surface.
export default function FAQSlice({ title = 'Common questions', subtitle, items, bg = 'subtle' }) {
  const theme = useTheme();
  const bgcolor = bg === 'tint' ? alpha(theme.palette.text.primary, 0.02) : 'transparent';
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 8 }, bgcolor, borderTop: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none', borderBottom: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none' }}>
      <Container maxWidth="md">
        <Stack spacing={1.5} sx={{ mb: { xs: 3, md: 4 } }}>
          <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.5rem', md: '2rem' }, color: 'text.primary', letterSpacing: '-0.01em' }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography sx={{ fontSize: '1rem', color: 'text.secondary', maxWidth: 560 }}>{subtitle}</Typography>
          )}
        </Stack>
        <Stack spacing={1.5}>
          {items.map((it, i) => (
            <Accordion
              key={i}
              disableGutters
              elevation={0}
              sx={{
                bgcolor: 'background.paper',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: '12px !important',
                overflow: 'hidden',
                '&:before': { display: 'none' },
                '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.35) },
                '&.Mui-expanded': { borderColor: alpha(theme.palette.primary.main, 0.55) },
              }}
            >
              <AccordionSummary expandIcon={<AppIcon name='ExpandMore' fallback={ExpandMoreIcon} />} sx={{ px: { xs: 2.5, md: 3 } }}>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>{it.q}</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: { xs: 2.5, md: 3 }, pb: 2.5 }}>
                <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>{it.a}</Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Stack>
      </Container>
    </Box>
  );
}
