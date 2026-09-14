import { useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Container,
  IconButton,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import Reveal from '../../../components/Common/Reveal';

const EXAMPLES = [
  {
    id: 'local',
    label: 'Build locally',
    title: 'From an idea to a working local prototype.',
    outcome:
      'Use Goose skills to edit files, run checks, and keep the useful outputs beside your conversation.',
    request: 'Build a webhook receiver in this project. Check retries and duplicate events.',
    activity: 'Checking the implementation',
    reply: 'I can use the project’s webhook skill, update the receiver, and run the local checks.',
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
    title: 'Turn operational records into the next action.',
    outcome: 'Bring orders and stock into one brief, with the source records close at hand.',
    request: 'Which orders need attention, and what should the team do next?',
    activity: 'Reviewing the records',
    reply:
      'In these example records, one order needs a stock decision. I’ve included the numbers and a suggested next action.',
    files: ['Operations brief.md', 'Example orders.csv', 'Example inventory.csv'],
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
      'I’ll use the selected role context and the supplied account notes to draft a handover for the team.',
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
      'I’ll gather the supplied updates into a concise brief, keeping decisions and follow-ups easy to find.',
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

function Detail({ children, sx }) {
  return (
    <Box
      sx={{
        p: { xs: 1.75, sm: 2.25 },
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2.5,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function SceneDetail({ id }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  if (id === 'local') {
    return (
      <Stack spacing={1.5}>
        <Chip
          icon={<AutoAwesomeOutlinedIcon />}
          label="Goose skill · webhook development"
          size="small"
          sx={{
            alignSelf: 'flex-start',
            maxWidth: '100%',
            bgcolor: alpha(primary, 0.07),
            color: 'text.primary',
            '& .MuiChip-icon': { color: primary },
          }}
        />
        <Detail sx={{ bgcolor: alpha(theme.palette.text.primary, 0.035) }}>
          <Typography
            sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', mb: 1.5 }}
          >
            LOCAL PROJECT
          </Typography>
          <Box
            component="pre"
            sx={{
              m: 0,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              fontSize: { xs: '0.72rem', sm: '0.8rem' },
              lineHeight: 1.8,
              color: 'text.primary',
            }}
          >
            {
              'await receiveEvent(event);\nconst retry = await receiveEvent(event);\nexpect(retry.duplicate).toBe(true);'
            }
          </Box>
          <Stack
            direction="row"
            spacing={0.75}
            alignItems="center"
            sx={{ mt: 1.75, color: 'text.secondary' }}
          >
            <CheckRoundedIcon sx={{ fontSize: 16, color: primary }} />
            <Typography sx={{ fontSize: '0.75rem' }}>
              Example check: duplicate event handled once
            </Typography>
          </Stack>
        </Detail>
      </Stack>
    );
  }

  if (id === 'n8n') {
    return (
      <Detail
        sx={{
          backgroundImage: `radial-gradient(${alpha(primary, 0.18)} 1px, transparent 1px)`,
          backgroundSize: '14px 14px',
        }}
      >
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', mb: 2 }}>
          WORKFLOW DRAFT
        </Typography>
        <Box
          component="ol"
          sx={{
            listStyle: 'none',
            p: 0,
            m: 0,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 1.5,
          }}
        >
          {['Order received', 'Look up stock', 'Check availability', 'Confirm or review'].map(
            (label, index) => (
              <Box
                component="li"
                key={label}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: index === 1 ? primary : 'divider',
                  bgcolor: 'background.paper',
                  display: 'flex',
                  gap: 1,
                  alignItems: 'center',
                }}
              >
                <Box
                  component="span"
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: 1,
                    bgcolor: alpha(primary, 0.09),
                    color: primary,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {index + 1}
                </Box>
                <Typography sx={{ fontSize: '0.76rem', fontWeight: 600 }}>{label}</Typography>
              </Box>
            )
          )}
        </Box>
        <Typography sx={{ mt: 1.75, fontSize: '0.74rem', color: 'text.secondary' }}>
          Stock check added · low-stock branch included
        </Typography>
      </Detail>
    );
  }

  if (id === 'operations') {
    return (
      <Detail>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', mb: 1.5 }}>
          EXAMPLE INVENTORY · ITEM A
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          {[
            ['On hand', '10'],
            ['Reserved', '2'],
            ['Available', '8'],
          ].map(([label, value]) => (
            <Box
              key={label}
              sx={{ flex: 1, p: 1, bgcolor: alpha(primary, 0.05), borderRadius: 1.5 }}
            >
              <Typography sx={{ fontSize: '1.3rem', fontWeight: 750, color: 'text.primary' }}>
                {value}
              </Typography>
              <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>{label}</Typography>
            </Box>
          ))}
        </Stack>
        <Box
          component="table"
          sx={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.75rem',
            textAlign: 'left',
            '& th': { color: 'text.secondary', fontWeight: 500, pb: 1 },
            '& td': { py: 1, borderTop: '1px solid', borderColor: 'divider' },
          }}
        >
          <caption style={{ textAlign: 'left', marginBottom: 8, fontWeight: 600 }}>
            Orders for item A
          </caption>
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Units</th>
              <th scope="col">Next action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1042</td>
              <td>2 reserved</td>
              <td>Fulfil</td>
            </tr>
            <tr>
              <td>1043</td>
              <td>12 requested</td>
              <td>Review shortfall</td>
            </tr>
          </tbody>
        </Box>
      </Detail>
    );
  }

  if (id === 'role') {
    return (
      <Detail>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', mb: 1.5 }}>
          SELECTED ROLE · ACCOUNT MANAGER
        </Typography>
        <Stack spacing={1.25}>
          {[
            ['Responsibilities', 'Customer continuity and clear next steps'],
            ['Playbook', 'Include the account status, risks, and owner'],
            ['Preferences', 'Concise, direct, and ready for a teammate'],
          ].map(([label, value]) => (
            <Box
              key={label}
              sx={{ borderLeft: '2px solid', borderColor: alpha(primary, 0.45), pl: 1.5 }}
            >
              <Typography sx={{ fontSize: '0.74rem', fontWeight: 700 }}>{label}</Typography>
              <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary', mt: 0.25 }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Detail>
    );
  }

  return (
    <Detail>
      <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', mb: 1.5 }}>
        TEAM CONVERSATION
      </Typography>
      <Stack spacing={1.25}>
        {[
          ['Maya', 'The launch guide is ready for review.'],
          ['Alex', 'Support still needs the final FAQ.'],
        ].map(([name, message]) => (
          <Stack direction="row" spacing={1} key={name}>
            <Box
              aria-hidden="true"
              sx={{
                width: 26,
                height: 26,
                borderRadius: 1.5,
                bgcolor: alpha(primary, 0.1),
                color: primary,
                display: 'grid',
                placeItems: 'center',
                fontSize: '0.68rem',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {name[0]}
            </Box>
            <Box>
              <Typography sx={{ fontSize: '0.73rem', fontWeight: 700 }}>{name}</Typography>
              <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>
                {message}
              </Typography>
            </Box>
          </Stack>
        ))}
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ p: 1.25, borderRadius: 1.5, bgcolor: alpha(primary, 0.06) }}
        >
          <DescriptionOutlinedIcon sx={{ fontSize: 18, color: primary }} />
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
            Launch brief · decisions + follow-ups
          </Typography>
        </Stack>
      </Stack>
    </Detail>
  );
}

function Workspace({ example }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  return (
    <Box
      component="aside"
      aria-label="Example workspace artifacts"
      sx={{
        minWidth: 0,
        p: { xs: 2, md: 2.5 },
        bgcolor: alpha(primary, 0.045),
        borderLeft: { md: '1px solid' },
        borderTop: { xs: '1px solid', md: 'none' },
        borderColor: 'divider',
      }}
    >
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 700, mb: 1.75 }}>
        WORKSPACE
      </Typography>
      <Stack component="ul" spacing={0.5} sx={{ p: 0, m: 0, listStyle: 'none' }}>
        {example.files.map((file, index) => (
          <Stack
            component="li"
            key={file}
            direction="row"
            spacing={0.9}
            alignItems="center"
            sx={{
              px: 1.1,
              py: 1,
              borderRadius: 1.5,
              bgcolor: index === 0 ? 'background.paper' : 'transparent',
              border: '1px solid',
              borderColor: index === 0 ? 'divider' : 'transparent',
            }}
          >
            <DescriptionOutlinedIcon
              sx={{ fontSize: 17, color: index === 0 ? primary : 'text.secondary', flexShrink: 0 }}
            />
            <Typography
              sx={{
                fontSize: '0.75rem',
                fontWeight: index === 0 ? 650 : 450,
                overflowWrap: 'anywhere',
              }}
            >
              {file}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Box
        sx={{
          mt: 2.5,
          p: 2,
          borderRadius: 2,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 750, mb: 1.5 }}>
          {example.artifactTitle}
        </Typography>
        <Stack component="ul" spacing={1.3} sx={{ p: 0, m: 0, listStyle: 'none' }}>
          {example.artifactLines.map((line) => (
            <Stack component="li" key={line} direction="row" spacing={0.75} alignItems="flex-start">
              <Box
                aria-hidden="true"
                sx={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  bgcolor: primary,
                  flexShrink: 0,
                  mt: '7px !important',
                }}
              />
              <Typography sx={{ fontSize: '0.77rem', lineHeight: 1.65, color: 'text.secondary' }}>
                {line}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
      <Typography sx={{ mt: 2, fontSize: '0.73rem', lineHeight: 1.6, color: 'text.secondary' }}>
        {example.footer}
      </Typography>
    </Box>
  );
}

export default function SimpleExamples() {
  const [selected, setSelected] = useState(0);
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
            Illustrative examples
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
            One conversation. Many ways to work.
          </Typography>
          <Typography
            sx={{ textAlign: 'center', color: 'text.secondary', fontSize: '0.95rem', mb: 3.5 }}
          >
            Research, build, and check as needed. Keep the conversation and its outputs together.
          </Typography>
        </Reveal>

        <Box role="region" aria-roledescription="carousel" aria-label="Ways to work with Orqaly">
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

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.75fr) minmax(0, 1fr)' },
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 4,
                overflow: 'hidden',
                bgcolor: 'background.paper',
                boxShadow: `0 16px 50px ${alpha(theme.palette.text.primary, 0.055)}`,
              }}
            >
              <Box sx={{ minWidth: 0, p: { xs: 2, sm: 3 }, minHeight: { md: 465 } }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  flexWrap="wrap"
                  useFlexGap
                  gap={1}
                  sx={{ mb: 2.5 }}
                >
                  <Typography
                    sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 700 }}
                  >
                    CONVERSATION
                  </Typography>
                  <Chip
                    label={example.activity}
                    size="small"
                    sx={{
                      bgcolor: alpha(primary, 0.07),
                      color: 'text.secondary',
                      fontSize: '0.69rem',
                      height: 26,
                    }}
                  />
                </Stack>
                <Box
                  sx={{
                    ml: { xs: 1, sm: 5 },
                    mb: 2,
                    px: 2,
                    py: 1.6,
                    bgcolor: alpha(primary, 0.08),
                    borderRadius: '16px 16px 4px 16px',
                  }}
                >
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 550, lineHeight: 1.55 }}>
                    {example.request}
                  </Typography>
                </Box>
                <Typography
                  sx={{ fontSize: '0.86rem', color: 'text.secondary', lineHeight: 1.7, mb: 2 }}
                >
                  {example.reply}
                </Typography>
                <SceneDetail id={example.id} />
              </Box>
              <Workspace example={example} />
            </Box>
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
