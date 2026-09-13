import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import LandingGlassIcon from '../../Landing/sections/LandingGlassIcon';

// Compact agent profile card used across solution pages.
export function AgentProfileCard({ name, desc, iconName }) {
  const theme = useTheme();
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{
        p: 2.5,
        height: '100%',
        borderRadius: 2.5,
        bgcolor: 'background.paper',
        border: `1px solid ${theme.palette.divider}`,
        alignItems: 'flex-start',
        transition: 'border-color 200ms ease, transform 200ms ease',
        '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.5), transform: 'translateY(-2px)' },
      }}
    >
      <LandingGlassIcon name={iconName} size={22} tone="brand" />
      <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.98rem', color: 'text.primary' }}>{name}</Typography>
        <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.6 }}>{desc}</Typography>
      </Stack>
    </Stack>
  );
}

// Generic chat thread mock used by several industry pages.
export function ChatThread({ messages }) {
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
        p: { xs: 2.5, md: 3 },
      }}
    >
      <Stack spacing={1.25}>
        {messages.map((m, i) => {
          const isAgent = m.who === 'agent';
          return (
            <Box
              key={i}
              sx={{
                maxWidth: '88%',
                ml: isAgent ? 'auto' : 0,
                p: 1.5,
                borderRadius: 2,
                bgcolor: isAgent
                  ? alpha(primary, 0.12)
                  : isDark
                    ? alpha('#fff', 0.06)
                    : alpha(theme.palette.text.primary, 0.06),
                fontSize: '0.88rem',
                color: 'text.primary',
                lineHeight: 1.55,
              }}
            >
              {isAgent && (
                <Typography sx={{ fontSize: '0.66rem', fontWeight: 800, color: 'primary.main', letterSpacing: '0.06em', textTransform: 'uppercase', mb: 0.5 }}>
                  Agent
                </Typography>
              )}
              {m.text}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
