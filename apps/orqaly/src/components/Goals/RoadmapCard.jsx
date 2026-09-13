/**
 * RoadmapCard — single strategic recommendation card from the Roadmap Strategist.
 *
 * Renders impact/effort badges (color-coded by leverage), category icon,
 * title, description, and timeframe. Mobile-responsive.
 *
 * Expected item shape:
 *   { title, description, impact, effort, category, timeframe }
 */
import { Box, Typography, Chip, alpha, useTheme } from '@mui/material';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';

import AppIcon from '../icons/AppIcon';

const IMPACT_COLORS = {
  high: '#10B981', // green
  medium: '#F59E0B', // amber
  low: '#64748B', // slate
};

const CATEGORY_META = {
  business: { icon: '💼', label: 'Business', color: '#7C3AED' },
  product: { icon: '🎯', label: 'Product', color: '#2563EB' },
  technical: { icon: '🛠', label: 'Technical', color: '#0EA5E9' },
  growth: { icon: '📈', label: 'Growth', color: '#10B981' },
};

export default function RoadmapCard({ item }) {
  const theme = useTheme();
  const impact = (item.impact || 'medium').toLowerCase();
  const effort = (item.effort || 'medium').toLowerCase();
  const category = (item.category || 'product').toLowerCase();
  const cat = CATEGORY_META[category] || CATEGORY_META.product;
  const impactColor = IMPACT_COLORS[impact] || IMPACT_COLORS.medium;

  return (
    <Box
      sx={{
        p: { xs: 1.5, sm: 2 },
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(impactColor, 0.25),
        bgcolor: alpha(impactColor, 0.04),
        mb: 1.25,
        transition: 'all 0.15s',
        '&:hover': {
          borderColor: alpha(impactColor, 0.4),
          bgcolor: alpha(impactColor, 0.06),
        },
      }}
    >
      {/* Top row: impact/effort badge + category */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mb: 1,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          <Box
            sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: impactColor, flexShrink: 0 }}
          />
          <Typography
            sx={{
              fontSize: '0.6rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: impactColor,
            }}
          >
            {impact} impact · {effort} effort
          </Typography>
        </Box>
        <Chip
          size="small"
          label={`${cat.icon} ${cat.label}`}
          sx={{
            height: 20,
            fontSize: '0.62rem',
            fontWeight: 700,
            bgcolor: alpha(cat.color, 0.12),
            color: cat.color,
            border: '1px solid',
            borderColor: alpha(cat.color, 0.2),
          }}
        />
      </Box>
      {/* Title */}
      <Typography
        sx={{
          fontSize: { xs: '0.85rem', sm: '0.92rem' },
          fontWeight: 700,
          lineHeight: 1.3,
          mb: 0.75,
          color: 'text.primary',
        }}
      >
        {item.title || 'Untitled recommendation'}
      </Typography>
      {/* Description */}
      <Typography
        sx={{
          fontSize: { xs: '0.75rem', sm: '0.78rem' },
          lineHeight: 1.55,
          color: 'text.secondary',
          mb: item.timeframe ? 1 : 0,
        }}
      >
        {item.description || ''}
      </Typography>
      {/* Timeframe */}
      {item.timeframe && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AppIcon
            name="ScheduleOutlined"
            fallback={ScheduleOutlinedIcon}
            sx={{ fontSize: 12, color: 'text.disabled' }}
          />
          <Typography
            sx={{
              fontSize: '0.65rem',
              fontWeight: 600,
              color: 'text.disabled',
            }}
          >
            {item.timeframe}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
