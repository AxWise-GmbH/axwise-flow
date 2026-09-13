import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';

import AppIcon from '../../icons/AppIcon';

// A compact org chart: the Consilium (board) governs directorates, each running a team of agents.
const DIRECTORATES = [
  { name: 'Operations', agents: 12, team: 'Process Automation', teamAgents: 6 },
  { name: 'Finance', agents: 8, team: 'Risk & Compliance', teamAgents: 4 },
  { name: 'Technology', agents: 15, team: 'Engineering Ops', teamAgents: 7 },
];

/**
 * Mockup for the Welcome Guide "Organization & Consilium" slide: the org structure as a tree -
 * Consilium (board of directors) at the top, directorates beneath it, and a team under each, with
 * agent counts and a legend. Self-contained and theme-aware (no props, no data deps).
 */
export default function DemoOrgStructure() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const line = alpha(theme.palette.text.primary, isDark ? 0.18 : 0.16);
  const DIR = theme.palette.secondary.main; // Consilium + Directorate
  const TEAM = theme.palette.info.main; // Team
  const AGENT = theme.palette.success.main; // AI Agent

  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 16px 40px ${alpha(theme.palette.primary.main, 0.14)}`,
        px: 2.5,
        pt: 2.5,
        pb: 5,
      }}
    >
      {/* Consilium (board) */}
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <Stack
          direction="row"
          spacing={1.25}
          alignItems="center"
          sx={{
            px: 2,
            py: 1.25,
            borderRadius: 2.5,
            border: `1px solid ${alpha(DIR, 0.5)}`,
            bgcolor: alpha(DIR, 0.08),
            maxWidth: '90%',
          }}
        >
          <Box sx={{ width: 30, height: 30, flexShrink: 0, borderRadius: 1.5, bgcolor: alpha(DIR, 0.18), color: DIR, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AppIcon name='GavelOutlined' fallback={GavelOutlinedIcon} sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', lineHeight: 1.15 }}>Consilium · Directors</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>Strategic oversight & governance</Typography>
          </Box>
        </Stack>
      </Box>
      {/* trunk */}
      <Box sx={{ width: 2, height: 16, bgcolor: line, mx: 'auto' }} />
      {/* Directorates with a branching rail */}
      <Box sx={{ position: 'relative' }}>
        <Box sx={{ position: 'absolute', top: 0, left: `${100 / 6}%`, right: `${100 / 6}%`, borderTop: `2px solid ${line}` }} />
        <Stack direction="row" spacing={1.25}>
          {DIRECTORATES.map((d) => (
            <Box key={d.name} sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Box sx={{ width: 2, height: 16, bgcolor: line }} />
              <Box sx={{ width: '100%', px: 1.25, py: 1, borderRadius: 2, border: `1px solid ${alpha(DIR, 0.45)}`, bgcolor: alpha(DIR, 0.06), textAlign: 'center' }}>
                <AppIcon
                  name='ShieldOutlined'
                  fallback={ShieldOutlinedIcon}
                  sx={{ fontSize: 16, color: DIR }} />
                <Typography sx={{ fontWeight: 800, fontSize: '0.74rem', lineHeight: 1.15, mt: 0.25 }}>{d.name}</Typography>
                <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>Directorate · {d.agents} agents</Typography>
              </Box>
              <Box sx={{ width: 2, height: 12, bgcolor: line }} />
              <Box sx={{ width: '100%', px: 1, py: 0.75, borderRadius: 2, border: `1px solid ${alpha(TEAM, 0.45)}`, bgcolor: alpha(TEAM, 0.06), textAlign: 'center' }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.66rem', lineHeight: 1.2, color: 'text.primary' }}>{d.team}</Typography>
                <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>Team · {d.teamAgents} agents</Typography>
              </Box>
            </Box>
          ))}
        </Stack>
      </Box>
      {/* Legend */}
      <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 2 }}>
        {[['Directorate', DIR], ['Team', TEAM], ['AI Agent', AGENT]].map(([label, color]) => (
          <Stack key={label} direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
            <Typography sx={{ fontSize: '0.66rem', color: 'text.secondary', fontWeight: 600 }}>{label}</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
