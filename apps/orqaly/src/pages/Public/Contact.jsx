import { useState } from 'react';
import {
  Box,
  Button,
  Container,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
  Alert,
} from '@mui/material';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import PublicShell from '../../components/Public/PublicShell';
import { PageHero } from './_shared';

const REASONS = [
  { value: 'sales', label: 'Sales - I want to buy / pilot Orqaly', Icon: StorefrontOutlinedIcon, desc: 'Talk to a human about plans, scope a pilot, get a custom quote.' },
  { value: 'support', label: 'Support - I have a question or issue', Icon: SupportAgentOutlinedIcon, desc: 'Get help with your account, agents, or integrations.' },
  { value: 'press', label: 'Press / Partnerships', Icon: CampaignOutlinedIcon, desc: 'Media, podcast, integration or co-marketing inquiries.' },
];

export default function Contact() {
  const theme = useTheme();
  const [form, setForm] = useState({ name: '', email: '', reason: 'sales', message: '' });
  const [status, setStatus] = useState({ state: 'idle', error: null });

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setStatus({ state: 'sending', error: null });
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus({ state: 'sent', error: null });
      setForm({ name: '', email: '', reason: 'sales', message: '' });
    } catch (err) {
      setStatus({ state: 'error', error: err.message || 'Something went wrong' });
    }
  };

  return (
    <PublicShell>
      <PageHero
        eyebrow="Contact"
        title="We’d love to hear from you."
        subtitle="Sales, support, or press - pick a lane and we’ll route you to a real human within one business day."
      />

      <Box sx={{ py: { xs: 5, md: 7 } }}>
        <Container maxWidth="md">
          <Grid container spacing={2.5} sx={{ mb: 5 }}>
            {REASONS.map(({ value, label, Icon, desc }) => {
              const active = form.reason === value;
              return (
                <Grid key={value} size={{ xs: 12, md: 4 }}>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, reason: value }))}
                    sx={{
                      width: '100%',
                      textAlign: 'left',
                      cursor: 'pointer',
                      p: 2.5,
                      borderRadius: 3,
                      border: `1px solid ${active ? theme.palette.primary.main : theme.palette.divider}`,
                      bgcolor: active ? alpha(theme.palette.primary.main, 0.05) : 'background.paper',
                      transition: 'all 180ms ease',
                      '&:hover': { borderColor: theme.palette.primary.main },
                    }}
                  >
                    <Icon sx={{ color: active ? 'primary.main' : 'text.secondary', mb: 1 }} />
                    <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'text.primary', mb: 0.5 }}>
                      {label.split(' - ')[0]}
                    </Typography>
                    <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', lineHeight: 1.5 }}>
                      {desc}
                    </Typography>
                  </Box>
                </Grid>
              );
            })}
          </Grid>

          <Box
            component="form"
            onSubmit={submit}
            sx={{
              p: { xs: 3, md: 4 },
              borderRadius: 3,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper',
            }}
          >
            <Stack spacing={2.5}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    required
                    fullWidth
                    label="Your name"
                    value={form.name}
                    onChange={update('name')}
                    autoComplete="name"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    required
                    fullWidth
                    type="email"
                    label="Email"
                    value={form.email}
                    onChange={update('email')}
                    autoComplete="email"
                  />
                </Grid>
              </Grid>
              <TextField
                select
                fullWidth
                label="Reason"
                value={form.reason}
                onChange={update('reason')}
              >
                {REASONS.map((r) => (
                  <MenuItem key={r.value} value={r.value}>
                    {r.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                required
                fullWidth
                multiline
                minRows={4}
                label="How can we help?"
                value={form.message}
                onChange={update('message')}
              />
              {status.state === 'sent' && (
                <Alert severity="success">Thanks - we’ll get back to you within one business day.</Alert>
              )}
              {status.state === 'error' && (
                <Alert severity="error">Couldn’t send: {status.error}. Email hello@orqaly.com instead.</Alert>
              )}
              <Stack direction="row" spacing={2} alignItems="center">
                <MarketingCtaButton
                  type="submit"
                  
                  size="large"
                  disabled={status.state === 'sending'}
                  disableElevation
                  sx={{ fontWeight: 700, borderRadius: 2, px: 3.5 }}
                >
                  {status.state === 'sending' ? 'Sending…' : 'Send message'}
                </MarketingCtaButton>
                <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                  Or email{' '}
                  <Box component="a" href="mailto:hello@orqaly.com" sx={{ color: 'primary.main', textDecoration: 'none', fontWeight: 600 }}>
                    hello@orqaly.com
                  </Box>
                </Typography>
              </Stack>
            </Stack>
          </Box>
        </Container>
      </Box>
    </PublicShell>
  );
}
