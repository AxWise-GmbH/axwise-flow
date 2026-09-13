import { Chip, useTheme } from '@mui/material';
import { FUNNEL_STATUS_COLORS, FUNNEL_STATUS_COLORS_DARK } from '../../../utils/constants';

const fallbackLight = { bg: '#F1F5F9', color: '#64748B' };
const fallbackDark = { bg: 'rgba(139, 148, 158, 0.22)', color: '#8B949E' };

export default function FunnelStatusBadge({ status }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const colorMap = isDark ? FUNNEL_STATUS_COLORS_DARK : FUNNEL_STATUS_COLORS;
  const colors = colorMap[status] || (isDark ? fallbackDark : fallbackLight);

  return (
    <Chip
      label={status}
      size="small"
      sx={{
        height: 24,
        fontSize: '0.7rem',
        fontWeight: 600,
        bgcolor: colors.bg,
        color: colors.color,
        borderRadius: '6px',
      }}
    />
  );
}
