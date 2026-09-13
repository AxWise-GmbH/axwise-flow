import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';

// Plain-language version of the goal loop, shown as the "Trust the Process" illustration.
const STEPS = [
  { n: 1, label: 'Goal', caption: 'Ask in plain text' },
  { n: 2, label: 'Consilium', caption: 'Board hires the team' },
  { n: 3, label: 'Team', caption: 'Does the work in parallel' },
  { n: 4, label: 'Tools', caption: 'Use any AI service to code, design, write' },
  { n: 5, label: 'Result', caption: 'View the results in the right place' },
];

/**
 * Mockup for the Welcome Guide "Trust the Process" slide: the goal loop in plain language as a
 * numbered, connected flow (Goal -> Consilium -> Team -> Tools -> Result). Self-contained and
 * theme-aware (no props, no data deps).
 */
export default function DemoProcessFlow() {
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
        px: 2.5,
        pt: 2.5,
        pb: 5,
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 2 }}>
        How a goal runs
      </Typography>

      <Box>
        {STEPS.map((s, i) => {
          const last = i === STEPS.length - 1;
          return (
            <Box key={s.label} sx={{ display: 'flex', gap: 1.75 }}>
              {/* Rail: number badge + connector */}
              <Stack alignItems="center">
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    flexShrink: 0,
                    borderRadius: '50%',
                    bgcolor: alpha(primary, 0.14),
                    color: primary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                  }}
                >
                  {s.n}
                </Box>
                {!last && <Box sx={{ width: 2, flex: 1, minHeight: 18, my: 0.5, bgcolor: alpha(primary, 0.25) }} />}
              </Stack>
              <Box sx={{ pb: last ? 0 : 1.75, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.2 }}>{s.label}</Typography>
                <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.45 }}>{s.caption}</Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
