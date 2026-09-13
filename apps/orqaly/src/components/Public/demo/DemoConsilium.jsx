import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import LandingGlassIcon from '../../../pages/Landing/sections/LandingGlassIcon';

import AppIcon from '../../icons/AppIcon';

const COUNCIL_LINK_ICONS = [
  { iconName: 'MenuBookOutlined', fallback: MenuBookOutlinedIcon, label: 'Knowledge' },
  { iconName: 'AccountTreeOutlined', fallback: AccountTreeOutlinedIcon, label: 'Workflow' },
];

const COUNCIL = [
  { role: 'Analyst', vote: 'yes', note: 'Pricing fits the segment and margins.', showLinks: true },
  { role: 'Critic', vote: 'no', note: 'Refund rate may spike in Q1.', showLinks: true },
  { role: 'Synthesiser', vote: 'yes', note: 'Net positive with churn cap of 7%.', showLinks: true },
  { role: 'Devil\'s advocate', vote: 'yes', note: 'Buyer signal is strong; ship.' },
];

export default function DemoConsilium() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const error = theme.palette.error.main;
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
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{
          px: 2.5,
          py: 1.5,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02),
        }}
      >
        <Box
          sx={{
            width: 30,
            height: 30,
            borderRadius: 1.5,
            bgcolor: alpha(primary, 0.12),
            color: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon name='GroupsOutlined' fallback={GroupsOutlinedIcon} sx={{ fontSize: 18 }} />
        </Box>
        <Stack sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'text.primary' }}>
            Should we launch the Pro tier at $29?
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
            Council of 4 · Majority vote · 1.4s deliberation
          </Typography>
        </Stack>
        <Chip
          label="3 / 4 YES"
          size="small"
          sx={{
            bgcolor: alpha(primary, 0.15),
            color: 'primary.main',
            fontWeight: 700,
            fontSize: '0.7rem',
          }}
        />
      </Stack>
      {/* Council votes */}
      <Stack spacing={1.25} sx={{ p: { xs: 2, md: 2.5 } }}>
        {COUNCIL.map((c, i) => {
          const isYes = c.vote === 'yes';
          return (
            <Stack
              key={i}
              direction="row"
              spacing={1.5}
              alignItems="flex-start"
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
              }}
            >
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  bgcolor: alpha(isYes ? primary : error, 0.15),
                  color: isYes ? 'primary.main' : 'error.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {isYes ? <AppIcon name='Check' fallback={CheckIcon} sx={{ fontSize: 16 }} /> : <AppIcon name='Close' fallback={CloseIcon} sx={{ fontSize: 16 }} />}
              </Box>
              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'text.primary' }}>
                  {c.role}{' '}
                  <Box
                    component="span"
                    sx={{
                      ml: 0.5,
                      fontSize: '0.7rem',
                      color: isYes ? 'primary.main' : 'error.main',
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                    }}
                  >
                    {isYes ? 'YES' : 'NO'}
                  </Box>
                </Typography>
                <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.55, mt: 0.25 }}>
                  {c.note}
                </Typography>
                {c.showLinks ? (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.25 }}>
                    {COUNCIL_LINK_ICONS.map(({ iconName, fallback, label }) => (
                      <Stack key={label} direction="row" spacing={0.75} alignItems="center">
                        <LandingGlassIcon
                          name={iconName}
                          fallback={fallback}
                          size={18}
                          tone="brand"
                        />
                        <Typography
                          sx={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: 'text.secondary',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {label}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}
