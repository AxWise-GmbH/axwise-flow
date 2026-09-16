import { Container } from '@mui/material';
import SetupWizard from './SetupWizard';

export default function SetupPage() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, sm: 4 } }}>
      <SetupWizard />
    </Container>
  );
}
