import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Container,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import PublicShell from '../../components/Public/PublicShell';
import { PageHero } from './_shared';
import { FAQ_QUESTIONS } from '../Landing/data/faq';

import AppIcon from '../../components/icons/AppIcon';

export default function Faq() {
  const theme = useTheme();
  return (
    <PublicShell>
      <PageHero
        eyebrow="FAQ"
        title="Your answers, here"
        subtitle="Everything we get asked the most - what Orqaly is, how Consilium changes the output, where your data lives, and how to start earning on the marketplace."
      />
      <Box sx={{ py: { xs: 5, md: 8 } }}>
        <Container maxWidth="md">
          <Stack spacing={2}>
            {FAQ_QUESTIONS.map((item, i) => (
              <Accordion
                key={i}
                disableGutters
                elevation={0}
                sx={{
                  bgcolor: 'background.paper',
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: '16px !important',
                  overflow: 'hidden',
                  transition: 'border-color 200ms ease, box-shadow 200ms ease',
                  '&:before': { display: 'none' },
                  '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.35) },
                  '&.Mui-expanded': {
                    borderColor: alpha(theme.palette.primary.main, 0.55),
                    boxShadow: `0 12px 32px ${alpha(theme.palette.primary.main, 0.12)}`,
                  },
                }}
              >
                <AccordionSummary
                  expandIcon={<AppIcon name='ExpandMore' fallback={ExpandMoreIcon} sx={{ fontSize: 28 }} />}
                  sx={{
                    px: { xs: 3, md: 4 },
                    py: { xs: 1.5, md: 2 },
                    '& .MuiAccordionSummary-content': { my: { xs: 1.25, md: 1.75 } },
                  }}
                >
                  <Typography
                    sx={{
                      fontWeight: 700,
                      fontSize: { xs: '1.05rem', md: '1.2rem' },
                      color: 'text.primary',
                      letterSpacing: '-0.005em',
                      pr: 2,
                    }}
                  >
                    {item.q}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: { xs: 3, md: 4 }, pb: { xs: 3, md: 4 }, pt: 0 }}>
                  <Typography
                    sx={{
                      fontSize: { xs: '0.98rem', md: '1.05rem' },
                      color: 'text.secondary',
                      lineHeight: 1.75,
                    }}
                  >
                    {item.a}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        </Container>
      </Box>
      <Box sx={{ py: { xs: 5, md: 7 }, textAlign: 'center', borderTop: `1px solid ${theme.palette.divider}` }}>
        <Container maxWidth="sm">
          <Stack spacing={2.5} alignItems="center">
            <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.4rem', md: '1.75rem' }, color: 'text.primary' }}>
              Still curious?
            </Typography>
            <Typography sx={{ color: 'text.secondary' }}>
              We answer anything else on email or with a short call.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <MarketingCtaButton
                component={RouterLink}
                to="/contact"
                                size="large"
                startIcon={<AppIcon name='MailOutline' fallback={MailOutlineIcon} />}
                sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3 }}
              >
                Contact us
              </MarketingCtaButton>
              <Button
                component={RouterLink}
                to="/signup"
                variant="outlined"
                size="large"
                sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3 }}
              >
                Try it free
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>
    </PublicShell>
  );
}
