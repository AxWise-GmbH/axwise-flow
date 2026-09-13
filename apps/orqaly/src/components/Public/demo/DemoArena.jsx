import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';

import AppIcon from '../../icons/AppIcon';

/**
 * Welcome-guide mockup for Arena: one daily job, both corners, and the verdict.
 * Static by design - it illustrates the shape of the page, it is not live data.
 */
const JOB = {
  title: 'SMM pack, week 34',
  department: 'Marketing',
  due: 'due 21 Aug',
};

const CORNERS = [
  {
    key: 'people',
    Icon: PersonOutlineOutlinedIcon,
    iconName: 'PersonOutlineOutlined',
    label: 'Our people',
    actor: 'Ilona R.',
    role: 'SMM Manager',
    output: '3 banners · captions.docx',
    time: '3h 10m',
    cost: '€142',
    stars: 4,
  },
  {
    key: 'agents',
    Icon: SmartToyOutlinedIcon,
    iconName: 'SmartToyOutlined',
    label: 'Our agents',
    actor: 'Marta Liepa',
    role: 'SMM Manager',
    output: '5 banners · captions.md · schedule.csv',
    time: '4m 20s',
    cost: '€0.35',
    stars: 5,
  },
];

export default function DemoArena() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const success = theme.palette.success.main;

  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: theme.palette.mode === 'dark' ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 16px 40px ${alpha(primary, 0.14)}`,
        p: { xs: 2, md: 2.5 },
      }}
    >
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: '0.72rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'text.secondary',
          mb: 1.5,
        }}
      >
        Arena · same job, both corners
      </Typography>

      <Stack
        direction="row"
        alignItems="baseline"
        spacing={1}
        sx={{ mb: 1.5, flexWrap: 'wrap' }}
      >
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>{JOB.title}</Typography>
        <Typography
          sx={{
            fontSize: '0.66rem',
            fontWeight: 700,
            px: 0.75,
            py: 0.1,
            borderRadius: 1,
            border: `1px solid ${theme.palette.divider}`,
            color: 'text.secondary',
          }}
        >
          {JOB.department}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled' }}>{JOB.due}</Typography>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gap: '10px',
          gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) minmax(0, 1fr)' },
        }}
      >
        {CORNERS.map((c) => (
          <Stack
            key={c.key}
            spacing={0.75}
            sx={{
              p: 1.75,
              borderRadius: 2.5,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper',
              minWidth: 0,
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: 1.25,
                  bgcolor: alpha(primary, 0.12),
                  color: 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AppIcon name={c.iconName} fallback={c.Icon} sx={{ fontSize: 16 }} />
              </Box>
              <Stack sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: '0.6rem',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'text.disabled',
                  }}
                >
                  {c.label}
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '0.82rem' }} noWrap>
                  {c.actor}
                </Typography>
              </Stack>
            </Stack>

            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              {c.output}
            </Typography>

            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{c.time}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>·</Typography>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{c.cost}</Typography>
              <Box sx={{ flex: 1 }} />
              <Typography sx={{ fontSize: '0.75rem', color: 'warning.main', letterSpacing: '-1px' }}>
                {'★'.repeat(c.stars)}
                <Box component="span" sx={{ color: 'text.disabled' }}>
                  {'★'.repeat(5 - c.stars)}
                </Box>
              </Typography>
            </Stack>
          </Stack>
        ))}
      </Box>

      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          mt: 1.5,
          p: 1.25,
          borderRadius: 2,
          bgcolor: alpha(success, 0.1),
          color: success,
        }}
      >
        <AppIcon name="EmojiEventsOutlined" fallback={EmojiEventsOutlinedIcon} sx={{ fontSize: 16 }} />
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 800 }}>Agents won</Typography>
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
          saved €141.65 · 3h 06m
        </Typography>
      </Stack>
    </Box>
  );
}
