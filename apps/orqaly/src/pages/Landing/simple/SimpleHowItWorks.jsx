import { Box, Container, Stack, Typography } from '@mui/material';
import ComputerOutlinedIcon from '@mui/icons-material/ComputerOutlined';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';

const PARTS = [
  {
    icon: ComputerOutlinedIcon,
    label: 'On your device',
    title: 'Tools close to the work.',
    body: 'The Goose-powered desktop works with your project files, local tools and skills. Your local chat history stays with the desktop.',
  },
  {
    icon: CloudOutlinedIcon,
    label: 'In the cloud',
    title: 'Context that adds depth.',
    body: 'Orqaly handles access, Gemini provides reasoning, and AxWise brings research and project context. Model keys stay server-side.',
  },
  {
    icon: DescriptionOutlinedIcon,
    label: 'Between the two',
    title: 'Bring the useful context.',
    body: 'Open cloud Goals and research in your desktop conversation. Share selected context and tool results with the model as you work.',
  },
];

export default function SimpleHowItWorks() {
  return (
    <Box
      component="section"
      id="how-it-works"
      aria-labelledby="local-cloud-title"
      sx={{ py: { xs: 6, md: 9 }, scrollMarginTop: 88 }}
    >
      <Container maxWidth="lg">
        <Typography
          component="h2"
          id="local-cloud-title"
          sx={{
            color: 'text.primary',
            fontSize: { xs: '1.75rem', md: '2.5rem' },
            fontWeight: 700,
            letterSpacing: '-0.035em',
            mb: 1.5,
          }}
        >
          Local workspace. Connected cloud context.
        </Typography>
        <Typography sx={{ maxWidth: 680, color: 'text.secondary', mb: 4 }}>
          Research, plan, build and revisit a decision in the same conversation. The workspace shows
          where you are; it doesn’t make you follow a fixed sequence.
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            gap: { xs: 3, md: 4 },
          }}
        >
          {PARTS.map(({ icon: Icon, label, title, body }) => (
            <Stack
              key={label}
              spacing={1.5}
              sx={{ pt: 3, borderTop: '1px solid', borderColor: 'divider' }}
            >
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box component={Icon} sx={{ fontSize: 20, color: 'text.secondary' }} />
                <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                  {label}
                </Typography>
              </Stack>
              <Typography
                component="h3"
                sx={{ color: 'text.primary', fontSize: '1.1rem', fontWeight: 600 }}
              >
                {title}
              </Typography>
              <Typography sx={{ fontSize: '0.94rem', color: 'text.secondary', lineHeight: 1.7 }}>
                {body}
              </Typography>
            </Stack>
          ))}
        </Box>
        <Typography sx={{ mt: 4, fontSize: '0.8rem', color: 'text.secondary' }}>
          Cloud documents are available on demand. Automatic syncing of local files and chat history
          is not part of this preview.
        </Typography>
      </Container>
    </Box>
  );
}
