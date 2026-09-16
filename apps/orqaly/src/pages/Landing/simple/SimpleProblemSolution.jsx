import { Box, Container, Stack, Typography, useTheme } from '@mui/material';
import Reveal from '../../../components/Common/Reveal';

export default function SimpleProblemSolution() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  return (
    <Box component="section" sx={{ py: { xs: 6, md: 9 } }}>
      <Container maxWidth="sm">
        <Reveal>
          <Stack spacing={2.5} sx={{ textAlign: 'center' }}>
            <Typography
              sx={{
                fontSize: { xs: '1.4rem', md: '1.75rem' },
                fontWeight: 700,
                color: 'text.primary',
                lineHeight: 1.35,
              }}
            >
              Tired of doing the repetitive stuff by hand?
            </Typography>
            <Typography
              sx={{
                fontSize: { xs: '1.05rem', md: '1.15rem' },
                color: 'text.secondary',
                lineHeight: 1.55,
              }}
            >
              Your AI agents take the busywork off your plate - orders, messages, follow-ups,
              reports - and get it{' '}
              <Box component="span" sx={{ color: primary, fontWeight: 700 }}>
                done
              </Box>
              .
            </Typography>
          </Stack>
        </Reveal>
      </Container>
    </Box>
  );
}
