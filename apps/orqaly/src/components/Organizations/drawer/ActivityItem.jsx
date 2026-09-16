import { Box, Typography, alpha } from '@mui/material';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { formatTimeAgo } from './orgDrawerUtils';

import AppIcon from '../../icons/AppIcon';

const ACTIVITY_ICONS = {
  audit: AssignmentOutlinedIcon,
  goal: TrendingUpIcon,
  task: AssignmentOutlinedIcon,
  workflow: AccountTreeOutlinedIcon,
  doc: DescriptionOutlinedIcon,
};

const ACTIVITY_COLORS = {
  audit: '#5B8DEF',
  goal: '#8B5CF6',
  task: '#5B8DEF',
  workflow: '#8B5CF6',
  doc: '#F59E0B',
};

export default function ActivityItem({ item }) {
  const IconComp = ACTIVITY_ICONS[item.type] || AssignmentOutlinedIcon;
  const color = ACTIVITY_COLORS[item.type] || '#5B8DEF';

  const title =
    item.type === 'goal'
      ? (item.event_type || 'Goal event').replace(/_/g, ' ')
      : item.action || 'Action';
  const desc = item.details || item.entity || '';

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        py: 1.25,
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1.5,
          flexShrink: 0,
          bgcolor: alpha(color, 0.12),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppIcon fallback={IconComp} sx={{ fontSize: 16, color }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'capitalize' }}
        >
          {title}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {desc}
        </Typography>
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ whiteSpace: 'nowrap', flexShrink: 0, fontSize: '0.65rem', pt: 0.5 }}
      >
        {formatTimeAgo(item.created_at)}
      </Typography>
    </Box>
  );
}
