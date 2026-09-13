import { Box, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LandingGlassIcon from '../../../pages/Landing/sections/LandingGlassIcon';

import AppIcon from '../../icons/AppIcon';

export default function RelatedGrid({ title, items, bg = 'subtle' }) {
  const theme = useTheme();
  const bgcolor = bg === 'tint' ? alpha(theme.palette.text.primary, 0.02) : 'transparent';
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 8 }, bgcolor, borderTop: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none', borderBottom: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none' }}>
      <Container maxWidth="lg">
        {title && (
          <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.5rem', md: '2rem' }, color: 'text.primary', letterSpacing: '-0.01em', mb: 3 }}>
            {title}
          </Typography>
        )}
        <Grid container spacing={2.5}>
          {items.map((it, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
              <Box
                component={RouterLink}
                to={it.to}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.25,
                  p: 2.75,
                  height: '100%',
                  borderRadius: 2.5,
                  textDecoration: 'none',
                  bgcolor: 'background.paper',
                  border: `1px solid ${theme.palette.divider}`,
                  transition: 'border-color 200ms ease, transform 200ms ease',
                  '&:hover': { borderColor: 'primary.main', transform: 'translateY(-2px)' },
                }}
              >
                {it.iconName && <LandingGlassIcon name={it.iconName} size={22} tone="brand" />}
                <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'text.primary' }}>{it.label}</Typography>
                {it.blurb && (
                  <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.55 }}>{it.blurb}</Typography>
                )}
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'primary.main', fontSize: '0.82rem', fontWeight: 600, mt: 'auto' }}>
                  {it.cta || 'Read more'} <AppIcon name='ArrowForward' fallback={ArrowForwardIcon} sx={{ fontSize: 14 }} />
                </Stack>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
