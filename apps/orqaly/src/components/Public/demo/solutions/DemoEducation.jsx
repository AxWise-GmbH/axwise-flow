import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import { GlassPanel } from './demoShell';

import AppIcon from '../../../icons/AppIcon';

export function DemoEducationLessons() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const lessons = [
    { day: 'Mon', title: 'Industrial revolution intro', mins: 45 },
    { day: 'Tue', title: 'Working conditions debate', mins: 55 },
    { day: 'Wed', title: 'Primary source reading', mins: 40 },
    { day: 'Thu', title: 'Quiz + group work', mins: 50 },
    { day: 'Fri', title: 'Essay drafting', mins: 60 },
  ];
  return (
    <GlassPanel>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <AppIcon
          name='SchoolOutlined'
          fallback={SchoolOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Stack sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: 'text.primary' }}>Year 8 · History · Week 12</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>Aligned to curriculum unit 3.4</Typography>
        </Stack>
      </Stack>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {lessons.map((l) => (
          <Stack key={l.day} direction="row" spacing={2} alignItems="center" sx={{ p: 1.5 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: alpha(primary, 0.12), color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.78rem' }}>{l.day}</Box>
            <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.88rem' }}>{l.title}</Typography>
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{l.mins}m</Typography>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}

export const DemoEducationHub = DemoEducationLessons;

export function DemoEducationSummaries() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const warn = theme.palette.warning.main;
  const rows = [
    { name: 'Maya K.', snippet: 'Strong analytical essays', tag: 'enrichment', tone: 'ok' },
    { name: 'James T.', snippet: 'Steady progress on sources', tag: 'on track', tone: 'ok' },
    { name: 'Elena R.', snippet: 'Needs essay structure support', tag: 'support', tone: 'warn' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>Term 2 summaries · 28 students</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => {
          const tint = r.tone === 'warn' ? warn : primary;
          return (
            <Stack key={r.name} direction="row" spacing={2} sx={{ p: 1.75 }}>
              <Stack sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{r.name}</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{r.snippet}</Typography>
              </Stack>
              <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(tint, 0.12), color: tint, fontSize: '0.65rem', fontWeight: 800 }}>{r.tag}</Box>
            </Stack>
          );
        })}
      </Stack>
    </GlassPanel>
  );
}

export function DemoEducationPaths() {
  return (
    <GlassPanel sx={{ p: 2.5 }}>
      <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', mb: 1.5 }}>Future path · Maya K.</Typography>
      <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.6 }}>Suggested: Advanced history seminar, essay competition prep, enrichment reading list on primary sources.</Typography>
    </GlassPanel>
  );
}

export function DemoEducationKb() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const docs = [
    { title: 'Unit 3.4 assessment rubric', tag: 'indexed' },
    { title: 'Past lesson: Industrial revolution intro', tag: 'searchable' },
    { title: 'Parent communication policy', tag: 'agent-ready' },
  ];
  return (
    <GlassPanel>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <AppIcon
          name='MenuBookOutlined'
          fallback={MenuBookOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.92rem' }}>Knowledge base · 42 documents</Typography>
      </Stack>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {docs.map((d) => (
          <Stack key={d.title} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.85rem' }}>{d.title}</Typography>
            <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.68rem', fontWeight: 800 }}>{d.tag}</Box>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}

export function DemoEducationCalendar() {
  const theme = useTheme();
  const blocks = [
    { when: 'Mon 09:00', title: 'Lesson · Year 8 History' },
    { when: 'Tue 15:30', title: 'Grading block · essays' },
    { when: 'Wed 17:00', title: 'Parent conference' },
  ];
  return (
    <GlassPanel>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <AppIcon
          name='CalendarMonthOutlined'
          fallback={CalendarMonthOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.92rem' }}>Teaching calendar · this week</Typography>
      </Stack>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {blocks.map((b) => (
          <Stack key={b.when} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.78rem', color: 'primary.main', minWidth: 72 }}>{b.when}</Typography>
            <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{b.title}</Typography>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}
