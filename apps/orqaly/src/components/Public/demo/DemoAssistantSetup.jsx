import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

import AppIcon from '../../icons/AppIcon';

// Tabs mirror the assistant setup flow: brief the assistant, pick a model, read what it found,
// then approve. "Finish Briefing" is the active step in this snapshot.
const TABS = [
  { label: 'Finish Briefing', active: true },
  { label: 'Choose LLM', active: false },
  { label: 'View Insights', active: false },
  { label: 'Make Decisions', active: false },
];

const CAPTURED = [
  { k: 'Industry', v: 'SaaS analytics' },
  { k: 'Customers', v: 'SMB founders' },
  { k: 'Goal', v: 'More trial signups' },
];

/**
 * Mockup for the Welcome Guide "Connect Assistant" slide: a tabbed assistant that briefs you on
 * your business (Finish Briefing), then Choose LLM / View Insights / Make Decisions. Self-contained
 * and theme-aware (no props, no data deps), so it is safe to render inside the guide dialog.
 */
export default function DemoAssistantSetup() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 16px 40px ${alpha(primary, 0.14)}`,
      }}
    >
      {/* Tabs */}
      <Stack direction="row" sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
        {TABS.map((t) => (
          <Box
            key={t.label}
            sx={{
              flex: 1,
              minWidth: 0,
              py: 1.25,
              px: 0.5,
              textAlign: 'center',
              bgcolor: t.active ? alpha(primary, 0.06) : 'transparent',
              borderBottom: t.active ? `2px solid ${primary}` : '2px solid transparent',
            }}
          >
            <Typography
              sx={{
                fontSize: '0.7rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                color: t.active ? 'text.primary' : 'text.secondary',
              }}
            >
              {t.label}
            </Typography>
          </Box>
        ))}
      </Stack>
      {/* Active tab content: Finish Briefing */}
      <Box sx={{ p: 2.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 1.5 }}>
          Assistant briefing · 3 of 5 answered
        </Typography>

        {/* Assistant question */}
        <Stack direction="row" spacing={1.25} sx={{ mb: 1.75 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              flexShrink: 0,
              borderRadius: '50%',
              bgcolor: alpha(primary, 0.12),
              color: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon name='AutoAwesome' fallback={AutoAwesomeIcon} sx={{ fontSize: 16 }} />
          </Box>
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2.5,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
            }}
          >
            <Typography sx={{ fontSize: '0.85rem', color: 'text.primary', lineHeight: 1.5 }}>
              What does your business do, and who are your customers?
            </Typography>
          </Box>
        </Stack>

        {/* Captured answers */}
        <Stack spacing={1}>
          {CAPTURED.map((c) => (
            <Stack
              key={c.k}
              direction="row"
              alignItems="center"
              spacing={1.25}
              sx={{ p: 1, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}
            >
              <AppIcon
                name='CheckCircleOutline'
                fallback={CheckCircleOutlineIcon}
                sx={{ fontSize: 16, color: 'success.main' }} />
              <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: 'text.secondary', minWidth: 78 }}>{c.k}</Typography>
              <Typography sx={{ fontSize: '0.82rem', color: 'text.primary' }}>{c.v}</Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
