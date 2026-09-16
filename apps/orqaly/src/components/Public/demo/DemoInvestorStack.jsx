import { Box, Chip, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import LandingGlassIcon from '../../../pages/Landing/sections/LandingGlassIcon';

const NODES = [
  {
    step: '01',
    label: 'Goal',
    sub: 'Plain-language intent',
    glassName: 'LightbulbOutlined',
    Fallback: LightbulbOutlinedIcon,
  },
  {
    step: '02',
    label: 'Consilium',
    sub: 'Council plans & votes',
    glassName: 'GroupsOutlined',
    Fallback: GroupsOutlinedIcon,
  },
  {
    step: '03',
    label: 'Marketplace',
    sub: 'Agents & templates',
    glassName: 'StorefrontOutlined',
    Fallback: StorefrontOutlinedIcon,
  },
  {
    step: '04',
    label: 'Organizations',
    sub: 'Create virtual or real',
    glassName: 'CorporateFareOutlined',
    Fallback: CorporateFareOutlinedIcon,
  },
  {
    step: '05',
    label: 'Second Brain',
    sub: 'Information in one place',
    glassName: 'PsychologyOutlined',
    Fallback: PsychologyOutlinedIcon,
  },
];

const FLOW_LABELS = ['Intent', 'Plan', 'Distribute', 'Organize', 'Unify'];

export default function DemoInvestorStack() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      role="img"
      aria-label="Orqaly platform stack: Goal, Consilium, Marketplace, Organizations, and Second Brain"
      sx={{
        position: 'relative',
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 24px 56px ${alpha(primary, 0.22)}, 0 0 0 1px ${alpha(primary, 0.06)}`,
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 80% 55% at 50% 100%, ${alpha(primary, 0.14)} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={2}
        sx={{
          position: 'relative',
          px: 2.5,
          py: 1.5,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: isDark ? alpha('#fff', 0.03) : alpha(theme.palette.text.primary, 0.02),
        }}
      >
        <Stack spacing={0.25}>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: '0.72rem',
              color: 'text.secondary',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Orqaly stack
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
            From intent to revenue in one platform
          </Typography>
        </Stack>
        <Chip
          label="Production"
          size="small"
          sx={{
            height: 26,
            fontWeight: 700,
            fontSize: '0.68rem',
            letterSpacing: '0.04em',
            bgcolor: alpha(primary, 0.12),
            color: 'primary.main',
            border: `1px solid ${alpha(primary, 0.28)}`,
          }}
        />
      </Stack>

      <Box sx={{ position: 'relative', p: { xs: 2, md: 2.75 } }}>
        <Grid container spacing={{ xs: 1.25, md: 1.5 }}>
          {NODES.map((node) => (
            <Grid key={node.label} size={{ xs: 6, sm: 4, md: true }}>
              <Stack
                alignItems="center"
                textAlign="center"
                spacing={1.25}
                sx={{
                  height: '100%',
                  p: { xs: 1.5, md: 2 },
                  borderRadius: 2.5,
                  border: `1px solid ${alpha(primary, 0.2)}`,
                  bgcolor: isDark ? alpha('#fff', 0.04) : alpha(primary, 0.03),
                  boxShadow: `inset 0 1px 0 ${alpha('#fff', isDark ? 0.06 : 0.65)}`,
                  transition: 'border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease',
                  '&:hover': {
                    borderColor: alpha(primary, 0.45),
                    transform: 'translateY(-2px)',
                    boxShadow: `0 12px 28px ${alpha(primary, 0.15)}`,
                  },
                }}
              >
                <Box
                  sx={{
                    alignSelf: 'flex-end',
                    px: 0.75,
                    py: 0.2,
                    borderRadius: 999,
                    bgcolor: alpha(primary, 0.14),
                    color: 'primary.main',
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    lineHeight: 1,
                  }}
                >
                  {node.step}
                </Box>

                <LandingGlassIcon
                  name={node.glassName}
                  fallback={node.Fallback}
                  size={26}
                  tone="brand"
                />

                <Stack spacing={0.35} sx={{ width: '100%' }}>
                  <Typography
                    sx={{
                      fontWeight: 800,
                      fontSize: { xs: '0.82rem', md: '0.9rem' },
                      color: 'text.primary',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {node.label}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '0.68rem',
                      color: 'text.secondary',
                      lineHeight: 1.35,
                      px: 0.5,
                    }}
                  >
                    {node.sub}
                  </Typography>
                </Stack>
              </Stack>
            </Grid>
          ))}
        </Grid>

        <Stack
          direction="row"
          alignItems="center"
          justifyContent="center"
          spacing={{ xs: 0.75, md: 1.25 }}
          sx={{
            mt: 2.25,
            pt: 2,
            borderTop: `1px solid ${alpha(theme.palette.divider, 0.85)}`,
            flexWrap: 'wrap',
            rowGap: 0.75,
          }}
        >
          {FLOW_LABELS.map((label, i) => (
            <Stack key={label} direction="row" alignItems="center" spacing={{ xs: 0.75, md: 1.25 }}>
              <Typography
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: i === FLOW_LABELS.length - 1 ? 'primary.main' : 'text.secondary',
                  letterSpacing: '0.02em',
                }}
              >
                {label}
              </Typography>
              {i < FLOW_LABELS.length - 1 && (
                <Box
                  aria-hidden
                  sx={{
                    width: { xs: 12, md: 20 },
                    height: 2,
                    borderRadius: 999,
                    bgcolor: alpha(primary, 0.35),
                    position: 'relative',
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      right: -3,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: `4px solid transparent`,
                      borderLeftColor: alpha(primary, 0.5),
                    },
                  }}
                />
              )}
            </Stack>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
