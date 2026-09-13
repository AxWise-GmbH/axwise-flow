/* eslint-disable react-refresh/only-export-components */
// This module intentionally exports a pure helper alongside a small
// component — both are used together by the dashboards list views. Splitting
// the two into separate files would add file-clutter for no real benefit;
// react-refresh just won't hot-reload these helpers (no big deal).
import { Chip, alpha, useTheme } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import GroupIcon from '@mui/icons-material/Group';
import PublicIcon from '@mui/icons-material/Public';

export function relativeTime(updatedAt) {
  const t = new Date(updatedAt).getTime();
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function VisibilityChip({ value }) {
  const theme = useTheme();
  const map = {
    private: { Icon: LockOutlinedIcon, label: 'Private', color: theme.palette.text.secondary },
    group: { Icon: GroupIcon, label: 'Group', color: theme.palette.secondary.main },
    public: { Icon: PublicIcon, label: 'Public', color: theme.palette.success.main },
  };
  const entry = map[value] || map.private;
  const { Icon, label, color } = entry;
  return (
    <Chip
      size="small"
      icon={<Icon sx={{ fontSize: 14 }} />}
      label={label}
      sx={{
        height: 22,
        fontWeight: 600,
        fontSize: '0.65rem',
        bgcolor: alpha(color, 0.1),
        color,
        border: `1px solid ${alpha(color, 0.25)}`,
        '& .MuiChip-icon': { color, marginLeft: '6px' },
      }}
    />
  );
}
