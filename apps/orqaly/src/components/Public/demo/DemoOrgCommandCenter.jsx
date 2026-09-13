import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';

import AppIcon from '../../icons/AppIcon';

export const ORG_DRAWER_TABS = ['Overview', 'Results', 'Teams', 'Operations', 'Finances', 'Governance'];

const METRICS = [
  { label: 'Active goals', value: '4', color: '#5B8DEF', Icon: AssignmentOutlinedIcon },
  { label: 'Completed', value: '12', color: '#10B981', Icon: RocketLaunchOutlinedIcon },
  { label: 'Teams', value: '3', color: '#059669', Icon: GroupsOutlinedIcon },
  { label: 'KB docs', value: '28', color: '#F59E0B', Icon: MenuBookOutlinedIcon },
];

export default function DemoOrgCommandCenter() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      role="img"
      aria-label={`Organization command center with tabs: ${ORG_DRAWER_TABS.join(', ')}`}
      sx={{
        position: 'relative',
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{
          px: 2.5,
          py: 1.25,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02),
        }}
      >
        <Stack direction="row" spacing={0.6}>
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: alpha('#FF5F57', 0.7) }} />
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: alpha('#FEBC2E', 0.7) }} />
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: alpha('#28C840', 0.7) }} />
        </Stack>
        <Typography sx={{ flex: 1, fontSize: '0.78rem', color: 'text.secondary', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
          app.orqaly.com / organizations
        </Typography>
        <Chip label="Roastedco" size="small" sx={{ fontWeight: 700, fontSize: '0.65rem', height: 22 }} />
      </Stack>
      <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2,
              bgcolor: alpha('#6366F1', 0.12),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon
              name='CorporateFareOutlined'
              fallback={CorporateFareOutlinedIcon}
              sx={{ color: '#6366F1', fontSize: 24 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'text.primary' }}>Roastedco</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Virtual · Retail · Active</Typography>
          </Box>
        </Stack>
      </Box>
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          px: 1.5,
          py: 0.75,
          borderBottom: `1px solid ${theme.palette.divider}`,
          overflowX: 'auto',
        }}
      >
        {ORG_DRAWER_TABS.map((tab, i) => (
          <Typography
            key={tab}
            sx={{
              px: 1.25,
              py: 0.75,
              fontSize: '0.72rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              color: i === 0 ? 'primary.main' : 'text.secondary',
              borderBottom: i === 0 ? `2px solid ${primary}` : '2px solid transparent',
            }}
          >
            {tab}
          </Typography>
        ))}
      </Stack>
      <Box sx={{ p: 2.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 1.5 }}>
          At a glance
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
          {METRICS.map(({ label, value, color, Icon }) => (
            <Stack
              key={label}
              spacing={0.5}
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: `1px solid ${alpha(color, 0.25)}`,
                bgcolor: alpha(color, 0.06),
              }}
            >
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Icon sx={{ fontSize: 16, color }} />
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                  {label}
                </Typography>
              </Stack>
              <Typography sx={{ fontWeight: 800, fontSize: '1.35rem', color }}>{value}</Typography>
            </Stack>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
