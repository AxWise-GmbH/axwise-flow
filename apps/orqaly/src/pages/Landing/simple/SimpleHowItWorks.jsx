import { Box, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import Reveal from '../../../components/Common/Reveal';

const STEPS = [
  {
    icon: ChatBubbleOutlineRoundedIcon,
    title: 'Tell it your goal',
    body: '"Handle my order support this week" - plain language, no setup wizard.',
  },
  {
    icon: GroupsOutlinedIcon,
    title: 'Agents form a team',
    body: 'The right skills and tools are assembled automatically for the job.',
  },
  {
    icon: TaskAltOutlinedIcon,
    title: 'You watch & approve',
    body: 'Results roll in as they happen. You stay in control the whole time.',
  },
];

export default function SimpleHowItWorks() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  return (
    <Box component="section" sx={{ py: { xs: 6, md: 9 } }}>
      <Container maxWidth="md">
        <Reveal>
          <Typography
            sx={{
              textAlign: 'center',
              fontSize: { xs: '1.5rem', md: '1.85rem' },
              fontWeight: 800,
              color: 'text.primary',
              mb: { xs: 4, md: 6 },
            }}
          >
            How it works
          </Typography>
        </Reveal>

        <Grid container spacing={3}>
          {STEPS.map((step, idx) => (
            <Grid key={step.title} size={{ xs: 12, md: 4 }}>
              <Reveal delay={idx * 120}>
                <Stack spacing={1.5} sx={{ textAlign: { xs: 'center', md: 'left' } }}>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 48,
                      height: 48,
                      borderRadius: 2.5,
                      bgcolor: alpha(primary, 0.1),
                      color: primary,
                      mx: { xs: 'auto', md: 0 },
                    }}
                  >
                    <step.icon sx={{ fontSize: 24 }} />
                  </Box>
                  <Typography
                    sx={{ fontSize: '0.75rem', fontWeight: 800, color: primary, letterSpacing: '0.06em' }}
                  >
                    STEP {idx + 1}
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'text.primary' }}>
                    {step.title}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem', lineHeight: 1.55 }}>
                    {step.body}
                  </Typography>
                </Stack>
              </Reveal>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
