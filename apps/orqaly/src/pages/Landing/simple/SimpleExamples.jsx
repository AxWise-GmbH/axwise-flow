import { useRef, useState } from 'react';
import {
  Box,
  Button,
  Container,
  IconButton,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import Reveal from '../../../components/Common/Reveal';
import DesktopProductDemo from './DesktopProductDemo';

const EXAMPLES = [
  {
    id: 'local',
    label: 'Build locally',
    title: 'From an idea to a working local prototype.',
    outcome:
      'Use local skills to edit files, run checks, and keep the useful outputs beside your conversation.',
    request: 'Build a webhook receiver in this project. Check retries and duplicate events.',
    activity: 'Checking the implementation',
    reply:
      'The receiver handles duplicate deliveries and retries. Local checks passed. You can inspect the code and results beside this conversation.',
    files: ['Implementation notes.md', 'webhook-handler.js', 'Check results'],
    artifactTitle: 'A useful handoff',
    artifactLines: [
      'Receiver and retry handling',
      'Duplicate-event protection',
      'Local check results',
    ],
    footer: 'Files and tool actions stay under your control.',
  },
  {
    id: 'n8n',
    label: 'n8n workflows',
    title: 'Make the workflow match the way you work.',
    outcome: 'Describe a change, inspect the workflow draft, and review what would be updated.',
    request: 'Add a stock check before this order workflow sends a confirmation.',
    activity: 'Adjusting the workflow',
    reply:
      'Here is a revised workflow draft with an availability check and a branch for low stock.',
    files: ['Order workflow.json', 'Change summary.md', 'Connection notes'],
    artifactTitle: 'What changes',
    artifactLines: [
      'Add an inventory lookup',
      'Branch on available stock',
      'Keep low-stock orders for review',
    ],
    footer: 'Review the draft before applying it to your n8n setup.',
  },
  {
    id: 'operations',
    label: 'Business operations',
    title: 'See what needs your attention today.',
    outcome: 'Bring orders and stock into one brief, with the source records close at hand.',
    request: 'Check these orders and stock levels. What needs my attention today?',
    activity: 'Reviewing the records',
    reply:
      'One order needs a stock decision. I’ve put the numbers and a suggested next action in your brief.',
    files: ['Operations brief.md', 'Orders.csv', 'Inventory.csv'],
    artifactTitle: 'Team brief',
    artifactLines: [
      'Order 1042: ready to fulfil',
      'Order 1043: review stock shortfall',
      'Next: confirm a replenishment date',
    ],
    footer: 'The brief points back to its source records.',
  },
  {
    id: 'role',
    label: 'Role-based copilot',
    title: 'A copilot that starts with your team’s context.',
    eyebrow: 'Employee digital twin',
    outcome: 'Reuse a role’s responsibilities, playbook, and preferences to prepare relevant work.',
    request: 'Use our account manager’s playbook to prepare this customer handover.',
    activity: 'Preparing the handover',
    reply:
      'The handover brings together the selected role playbook and account notes, with clear follow-ups for your teammate.',
    files: ['Customer handover.md', 'Account manager role.md', 'Account notes.md'],
    artifactTitle: 'Ready for a teammate',
    artifactLines: [
      'Account context and open questions',
      'Named follow-ups from the notes',
      'A draft message in the team’s style',
    ],
    footer: 'Reusable role context, with the person still in control.',
  },
  {
    id: 'chat',
    label: 'Connected chat',
    title: 'Keep the conversation. Bring the work to it.',
    outcome:
      'Bring updates from your team chat into the conversation, with useful briefs and artifacts to return to.',
    request: 'Can you turn these launch updates into a short brief for the team?',
    activity: 'Shaping the team brief',
    reply:
      'The launch brief brings the supplied updates together. Decisions and follow-ups are ready to pick up next.',
    files: ['Launch brief.md', 'Decisions and follow-ups', 'Source updates'],
    artifactTitle: 'More than a reply',
    artifactLines: [
      'A brief the team can share',
      'Decisions linked to the updates',
      'Follow-ups to pick up next',
    ],
    footer: 'Continue the conversation with its useful context.',
  },
];

export default function SimpleExamples() {
  const [selected, setSelected] = useState(2);
  const selectors = useRef([]);
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const example = EXAMPLES[selected];
  const move = (direction) =>
    setSelected((current) => (current + direction + EXAMPLES.length) % EXAMPLES.length);

  const handleSelectorKey = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const focusedIndex = selectors.current.findIndex((button) => button?.contains(event.target));
    const currentIndex = focusedIndex === -1 ? selected : focusedIndex;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? EXAMPLES.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + EXAMPLES.length) %
            EXAMPLES.length;
    setSelected(next);
    selectors.current[next]?.focus();
  };

  return (
    <Box
      component="section"
      id="use-cases"
      aria-labelledby="use-cases-heading"
      sx={{ py: { xs: 6, md: 9 }, scrollMarginTop: 90 }}
    >
      <Container maxWidth="lg">
        <Reveal>
          <Typography
            sx={{
              textAlign: 'center',
              fontWeight: 750,
              fontSize: '0.72rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: primary,
              mb: 1.5,
            }}
          >
            Explore the desktop
          </Typography>
          <Typography
            component="h2"
            id="use-cases-heading"
            sx={{
              textAlign: 'center',
              color: 'text.primary',
              fontSize: { xs: '1.8rem', md: '2.5rem' },
              letterSpacing: '-0.045em',
              fontWeight: 800,
              lineHeight: 1.15,
              mb: 1.5,
            }}
          >
            One chat. A connected workspace.
          </Typography>
          <Typography
            sx={{ textAlign: 'center', color: 'text.secondary', fontSize: '0.95rem', mb: 3.5 }}
          >
            Explore the Orqanix desktop. Open a document or play a cursor walkthrough.
          </Typography>
        </Reveal>

        <Box role="region" aria-roledescription="carousel" aria-label="Ways to work with Orqanix">
          <Stack
            direction="row"
            role="group"
            aria-label="Choose a use case"
            onKeyDown={handleSelectorKey}
            useFlexGap
            flexWrap="wrap"
            justifyContent="center"
            spacing={0.75}
            sx={{ mb: { xs: 3, md: 4 } }}
          >
            {EXAMPLES.map((item, index) => (
              <Button
                key={item.id}
                ref={(element) => {
                  selectors.current[index] = element;
                }}
                type="button"
                aria-pressed={selected === index}
                aria-controls="use-case-panel"
                onClick={() => setSelected(index)}
                sx={{
                  px: { xs: 1.5, sm: 2 },
                  py: 1,
                  minHeight: 44,
                  borderRadius: 20,
                  fontSize: '0.8rem',
                  fontWeight: 650,
                  textTransform: 'none',
                  color: selected === index ? 'primary.contrastText' : 'text.secondary',
                  bgcolor: selected === index ? primary : 'transparent',
                  border: '1px solid',
                  borderColor: selected === index ? primary : 'divider',
                  '&:hover': {
                    bgcolor: selected === index ? 'primary.dark' : alpha(primary, 0.055),
                  },
                  '&.Mui-focusVisible': { outline: `2px solid ${primary}`, outlineOffset: 3 },
                }}
              >
                {item.label}
              </Button>
            ))}
          </Stack>

          <Box
            id="use-case-panel"
            role="group"
            aria-roledescription="slide"
            aria-labelledby={`use-case-${example.id}-heading`}
            data-case-id={example.id}
          >
            <Box sx={{ mb: 2.5, px: { xs: 0.5, md: 1 }, maxWidth: 800 }}>
              {example.eyebrow && (
                <Typography sx={{ color: primary, fontSize: '0.75rem', fontWeight: 700, mb: 0.75 }}>
                  {example.eyebrow}
                </Typography>
              )}
              <Typography
                component="h3"
                id={`use-case-${example.id}-heading`}
                sx={{
                  color: 'text.primary',
                  fontSize: { xs: '1.25rem', md: '1.55rem' },
                  letterSpacing: '-0.025em',
                  fontWeight: 750,
                  mb: 0.8,
                }}
              >
                {example.title}
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem', lineHeight: 1.6 }}>
                {example.outcome}
              </Typography>
            </Box>

            <DesktopProductDemo key={example.id} example={example} />
          </Box>

          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={2}
            sx={{ mt: 2 }}
          >
            <Typography sx={{ color: 'text.secondary', fontSize: '0.76rem', lineHeight: 1.5 }}>
              Connected-tool examples depend on your setup.
            </Typography>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ flexShrink: 0 }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  move(event.key === 'ArrowRight' ? 1 : -1);
                }
              }}
            >
              <IconButton
                type="button"
                aria-label="Previous use case"
                onClick={() => move(-1)}
                sx={{ width: 44, height: 44, border: '1px solid', borderColor: 'divider' }}
              >
                <ArrowBackRoundedIcon sx={{ fontSize: 19 }} />
              </IconButton>
              <Typography
                aria-live="polite"
                aria-atomic="true"
                sx={{
                  color: 'text.secondary',
                  fontSize: '0.74rem',
                  minWidth: 28,
                  textAlign: 'center',
                }}
              >
                {selected + 1} / {EXAMPLES.length}
              </Typography>
              <IconButton
                type="button"
                aria-label="Next use case"
                onClick={() => move(1)}
                sx={{ width: 44, height: 44, border: '1px solid', borderColor: 'divider' }}
              >
                <ArrowForwardRoundedIcon sx={{ fontSize: 19 }} />
              </IconButton>
            </Stack>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
