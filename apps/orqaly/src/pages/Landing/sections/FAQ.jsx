import { useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Button,
  Collapse,
  Container,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { FAQ_QUESTIONS } from '../data/faq';

const VISIBLE_COUNT = 4;
const QUESTIONS = FAQ_QUESTIONS;

function FaqItem({ item, theme }) {
  return (
    <Accordion
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
        expandIcon={<ExpandMoreIcon sx={{ fontSize: 28 }} />}
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
  );
}

export default function FAQ() {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const visible = QUESTIONS.slice(0, VISIBLE_COUNT);
  const hidden = QUESTIONS.slice(VISIBLE_COUNT);
  return (
    <Box component="section" id="faq" sx={{ py: { xs: 10, md: 16 } }}>
      <Container maxWidth="md">
        <Stack spacing={2.5} alignItems="center" textAlign="center" sx={{ mb: { xs: 6, md: 9 } }}>
          <Typography
            sx={{
              fontSize: '0.9rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'primary.main',
            }}
          >
            FAQ
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '2.2rem', md: '3.25rem' },
              fontWeight: 800,
              lineHeight: 1.1,
              color: 'text.primary',
              letterSpacing: '-0.02em',
            }}
          >
            Your answers, here
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '1rem', md: '1.15rem' },
              color: 'text.secondary',
              maxWidth: 620,
              lineHeight: 1.55,
            }}
          >
            Everything we get asked the most - what Orqaly is, how Consilium changes the output,
            where your data lives, and how to start earning on the marketplace.
          </Typography>
        </Stack>

        <Stack spacing={2}>
          {visible.map((item, i) => (
            <FaqItem key={i} item={item} theme={theme} />
          ))}

          <Collapse in={expanded} timeout={300} unmountOnExit>
            <Stack spacing={2}>
              {hidden.map((item, i) => (
                <FaqItem key={i + VISIBLE_COUNT} item={item} theme={theme} />
              ))}
            </Stack>
          </Collapse>
        </Stack>

        {hidden.length > 0 && (
          <Stack alignItems="center" sx={{ mt: { xs: 4, md: 5 } }}>
            <Button
              onClick={() => setExpanded((v) => !v)}
              variant="outlined"
              size="large"
              endIcon={
                <ExpandMoreIcon
                  sx={{
                    transform: expanded ? 'rotate(180deg)' : 'none',
                    transition: 'transform 220ms ease',
                  }}
                />
              }
              aria-expanded={expanded}
              aria-controls="faq-extra-questions"
              sx={{
                fontWeight: 700,
                borderRadius: 999,
                textTransform: 'none',
                px: 3.5,
                py: 1.25,
                borderColor: alpha(theme.palette.primary.main, 0.4),
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                },
              }}
            >
              {expanded ? 'Show fewer questions' : `View more (${hidden.length} more)`}
            </Button>
          </Stack>
        )}
      </Container>
    </Box>
  );
}
