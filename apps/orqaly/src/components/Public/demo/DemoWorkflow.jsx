import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import WebhookOutlinedIcon from '@mui/icons-material/WebhookOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

import AppIcon from '../../icons/AppIcon';

const NODES = [
  { Icon: WebhookOutlinedIcon, title: 'Trigger', sub: 'Stripe refund.created' },
  { Icon: SmartToyOutlinedIcon, title: 'Classify', sub: 'Refund Reviewer agent' },
  { Icon: ExtensionOutlinedIcon, title: 'Tool', sub: 'Stripe refunds.create' },
  { Icon: EmailOutlinedIcon, title: 'Notify', sub: 'Send customer email' },
];

export default function DemoWorkflow() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
        p: { xs: 2.5, md: 4 },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: primary }} />
        <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Workflow · Refund auto-handler
        </Typography>
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.5, md: 2 }} alignItems="center">
        {NODES.map(({ Icon, title, sub }, i) => (
          <Stack key={title} direction={{ xs: 'row', md: 'column' }} alignItems="center" spacing={{ xs: 2, md: 0 }} sx={{ flex: 1, width: { xs: '100%', md: 'auto' } }}>
            <Stack
              spacing={1}
              alignItems="center"
              sx={{
                p: 2,
                borderRadius: 2.5,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
                width: { xs: 'auto', md: '100%' },
                minWidth: { xs: 100, md: 'unset' },
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 1.5,
                  bgcolor: alpha(primary, 0.12),
                  color: 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon sx={{ fontSize: 20 }} />
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'text.primary' }}>{title}</Typography>
              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', textAlign: 'center', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                {sub}
              </Typography>
            </Stack>
            {i < NODES.length - 1 && (
              <AppIcon
                name='ArrowForward'
                fallback={ArrowForwardIcon}
                sx={{
                  fontSize: 18,
                  color: alpha(primary, 0.5),
                  transform: { xs: 'rotate(90deg)', md: 'none' },
                  flexShrink: 0,
                }} />
            )}
          </Stack>
        ))}
      </Stack>
      <Box sx={{ mt: 3, pt: 2.5, borderTop: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
            <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>● Live</Box> · 47 runs today · 0 failed
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
            avg 1.8s
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
