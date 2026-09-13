import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import ArrowRightAltRoundedIcon from '@mui/icons-material/ArrowRightAltRounded';

import AppIcon from '../../icons/AppIcon';

// Three compact widgets that map to the "View Reports" bullets: a kanban (tasks), a 3-step
// workflow (automations), and a short message thread (conversations).
const COLUMNS = [
  { title: 'To do', cards: 2 },
  { title: 'Doing', cards: 1, active: true },
  { title: 'Done', cards: 2 },
];
const FLOW = ['Trigger', 'Classify', 'Notify'];
const MESSAGES = [
  { who: 'Refund Reviewer', text: 'Approved refund for order #1284.' },
  { who: 'Comms', text: 'Customer notified by email.' },
];

function SectionLabel({ children }) {
  return (
    <Typography sx={{ fontWeight: 800, fontSize: '0.64rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.75 }}>
      {children}
    </Typography>
  );
}

/**
 * Mockup for the Welcome Guide "View Reports" slide: a control-center snapshot showing tasks
 * (kanban), a workflow (3 steps), and conversations (messages). Self-contained and theme-aware
 * (no props, no data deps).
 */
export default function DemoControlCenter() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const soft = isDark ? alpha('#fff', 0.04) : alpha(theme.palette.text.primary, 0.03);
  const bar = isDark ? alpha('#fff', 0.07) : alpha(theme.palette.text.primary, 0.07);

  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 16px 40px ${alpha(primary, 0.14)}`,
        px: 2.25,
        pt: 2.25,
        pb: 5,
      }}
    >
      {/* Tasks - kanban */}
      <SectionLabel>Tasks</SectionLabel>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {COLUMNS.map((col) => (
          <Box key={col.title} sx={{ flex: 1, minWidth: 0, p: 1, borderRadius: 1.5, bgcolor: soft, border: `1px solid ${theme.palette.divider}` }}>
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'text.secondary', mb: 0.75 }}>{col.title}</Typography>
            <Stack spacing={0.5}>
              {Array.from({ length: col.cards }).map((_, i) => (
                <Box
                  key={i}
                  sx={{
                    height: 18,
                    borderRadius: 1,
                    bgcolor: col.active && i === 0 ? alpha(primary, 0.18) : bar,
                    border: col.active && i === 0 ? `1px solid ${alpha(primary, 0.4)}` : 'none',
                  }}
                />
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
      {/* Workflow - 3 steps */}
      <SectionLabel>Workflow</SectionLabel>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 2 }}>
        {FLOW.map((s, i) => (
          <Box key={s} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1, minWidth: 0 }}>
            <Box sx={{ flex: 1, textAlign: 'center', py: 0.75, px: 0.5, borderRadius: 1.5, bgcolor: alpha(primary, 0.06), border: `1px solid ${alpha(primary, 0.25)}` }}>
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'text.primary', whiteSpace: 'nowrap' }}>{s}</Typography>
            </Box>
            {i < FLOW.length - 1 && <AppIcon
              name='ArrowRightAltRounded'
              fallback={ArrowRightAltRoundedIcon}
              sx={{ fontSize: 18, color: alpha(primary, 0.6), flexShrink: 0 }} />}
          </Box>
        ))}
      </Stack>
      {/* Conversations - messages */}
      <SectionLabel>Conversations</SectionLabel>
      <Stack spacing={0.75}>
        {MESSAGES.map((m) => (
          <Stack key={m.who} direction="row" spacing={1} alignItems="flex-start">
            <Box sx={{ width: 22, height: 22, flexShrink: 0, borderRadius: '50%', bgcolor: alpha(primary, 0.14), color: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 800 }}>
              {m.who[0]}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, p: 1, borderRadius: 1.5, bgcolor: soft, border: `1px solid ${theme.palette.divider}` }}>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: 'text.secondary' }}>{m.who}</Typography>
              <Typography sx={{ fontSize: '0.74rem', color: 'text.primary', lineHeight: 1.35 }}>{m.text}</Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
