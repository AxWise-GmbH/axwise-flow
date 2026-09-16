import { Box, Typography, Tooltip, alpha, useTheme } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import BarChartIcon from '@mui/icons-material/BarChart';
import TimelineIcon from '@mui/icons-material/Timeline';
import PieChartIcon from '@mui/icons-material/PieChart';
import TableRowsIcon from '@mui/icons-material/TableRows';
import SpeedIcon from '@mui/icons-material/Speed';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotesIcon from '@mui/icons-material/Notes';

import { BLOCK_REGISTRY } from './blockRegistry';
import { recommend } from '../../services/chartRecommend';

import AppIcon from '../icons/AppIcon';

const ICONS = {
  kpi: SpeedIcon,
  trend: TimelineIcon,
  breakdown: BarChartIcon,
  pie: PieChartIcon,
  table: TableRowsIcon,
  alerts: NotificationsActiveIcon,
  markdown: NotesIcon,
};

export default function ChartTypePicker({ value, onChange, blockData }) {
  const theme = useTheme();
  const reco = recommend({
    measure: blockData?.measure,
    group_by: blockData?.group_by,
  });

  const allTypes = Object.keys(BLOCK_REGISTRY);

  return (
    <Box>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          fontSize: '0.65rem',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: 'text.secondary',
          display: 'block',
          mb: 0.75,
        }}
      >
        Chart type
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
          gap: 0.75,
        }}
      >
        {allTypes.map((type) => {
          const isBlocked = reco.blocked.includes(type);
          const isWarned = reco.warned.includes(type);
          const isRecommended = reco.recommended.includes(type);
          const active = value === type;
          const Icon = ICONS[type] || BarChartIcon;

          const status = isRecommended
            ? 'Recommended'
            : isWarned
              ? 'Not recommended — but allowed'
              : isBlocked
                ? 'Not suitable for this data shape'
                : 'Available';

          return (
            <Tooltip key={type} title={`${BLOCK_REGISTRY[type].label} — ${status}`}>
              <Box
                onClick={() => !isBlocked && onChange(type)}
                role="button"
                aria-disabled={isBlocked}
                sx={{
                  position: 'relative',
                  p: 1,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: active
                    ? 'primary.main'
                    : isBlocked
                      ? alpha(theme.palette.text.disabled, 0.3)
                      : 'divider',
                  bgcolor: active
                    ? alpha(theme.palette.primary.main, 0.08)
                    : isBlocked
                      ? alpha(theme.palette.action.disabled, 0.04)
                      : 'background.paper',
                  cursor: isBlocked ? 'not-allowed' : 'pointer',
                  textAlign: 'center',
                  opacity: isBlocked ? 0.5 : 1,
                  transition: 'border-color 0.15s, transform 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.25,
                  '&:hover': isBlocked
                    ? {}
                    : {
                        borderColor: 'primary.main',
                        transform: 'translateY(-1px)',
                      },
                }}
              >
                <AppIcon fallback={Icon} fontSize="small" color={active ? 'primary' : 'inherit'} />
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    color: active ? 'primary.main' : 'text.primary',
                  }}
                >
                  {BLOCK_REGISTRY[type].label.split(' ')[0]}
                </Typography>
                {isWarned && (
                  <AppIcon
                    name="WarningAmber"
                    fallback={WarningAmberIcon}
                    sx={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      fontSize: 11,
                      color: theme.palette.warning.main,
                    }}
                  />
                )}
              </Box>
            </Tooltip>
          );
        })}
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 0.75, fontSize: '0.65rem' }}
      >
        {reco.rationale}
      </Typography>
    </Box>
  );
}
