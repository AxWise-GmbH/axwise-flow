import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import FormatQuoteOutlinedIcon from '@mui/icons-material/FormatQuoteOutlined';

import AppIcon from '../../icons/AppIcon';

const DOCS = [
  { title: 'Refund policy 2026', meta: 'PDF · 3 pages' },
  { title: 'Brand voice guide', meta: 'Notion · synced 12m ago' },
  { title: 'Onboarding Q4 call', meta: 'Transcript · 42 min' },
  { title: 'Pricing FAQ', meta: 'Web · ingested 1h ago' },
];

export default function DemoKnowledgeBase() {
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
      }}
    >
      <Box sx={{ p: 2.5, borderBottom: `1px solid ${theme.palette.divider}`, bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02) }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${theme.palette.divider}`, bgcolor: 'background.paper' }}>
          <AppIcon
            name='SearchOutlined'
            fallback={SearchOutlinedIcon}
            sx={{ color: 'text.secondary', fontSize: 20 }} />
          <Typography sx={{ flex: 1, fontSize: '0.88rem', color: 'text.primary' }}>How do we handle refunds older than 30 days?</Typography>
          <Box sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em' }}>
            ⏎
          </Box>
        </Stack>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.2fr' } }}>
        <Stack spacing={1.25} sx={{ p: { xs: 2, md: 2.5 }, borderRight: { md: `1px solid ${theme.palette.divider}` }, borderBottom: { xs: `1px solid ${theme.palette.divider}`, md: 'none' } }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Top matches
          </Typography>
          {DOCS.map((d, i) => (
            <Stack
              key={i}
              direction="row"
              spacing={1.25}
              alignItems="center"
              sx={{
                p: 1.25,
                borderRadius: 2,
                border: `1px solid ${i === 0 ? alpha(primary, 0.45) : theme.palette.divider}`,
                bgcolor: i === 0 ? alpha(primary, 0.05) : 'transparent',
              }}
            >
              <AppIcon
                name='DescriptionOutlined'
                fallback={DescriptionOutlinedIcon}
                sx={{ color: i === 0 ? 'primary.main' : 'text.secondary', fontSize: 18 }} />
              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'text.primary' }}>{d.title}</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{d.meta}</Typography>
              </Stack>
            </Stack>
          ))}
        </Stack>

        <Stack spacing={1.5} sx={{ p: { xs: 2, md: 2.5 } }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Answer · with citation
          </Typography>
          <Typography sx={{ fontSize: '0.92rem', color: 'text.primary', lineHeight: 1.65 }}>
            Refunds beyond 30 days require manager approval. Standard window for self-serve refunds is 14 days; agents auto-approve up to $200 inside that window.
          </Typography>
          <Stack
            direction="row"
            spacing={1.25}
            alignItems="flex-start"
            sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(primary, 0.06), border: `1px solid ${alpha(primary, 0.25)}` }}
          >
            <AppIcon
              name='FormatQuoteOutlined'
              fallback={FormatQuoteOutlinedIcon}
              sx={{ color: 'primary.main', fontSize: 16, transform: 'scaleX(-1)', mt: '2px' }} />
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', fontStyle: 'italic', lineHeight: 1.55 }}>
              "Self-serve refunds are limited to 14 days from order date..." - Refund policy 2026, p. 2
            </Typography>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
