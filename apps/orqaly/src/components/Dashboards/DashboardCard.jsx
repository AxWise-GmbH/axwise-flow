import { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Menu,
  MenuItem,
  Chip,
  alpha,
  useTheme,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { relativeTime, VisibilityChip } from './dashboardListHelpers';

import AppIcon from '../icons/AppIcon';

export default function DashboardCard({
  dashboard,
  onOpen,
  onAction,
  isShared = false,
  sharedCanEdit = false,
}) {
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState(null);
  const updatedAgo = useMemo(() => relativeTime(dashboard.updated_at), [dashboard.updated_at]);
  const blockCount = dashboard.config?.blocks?.length || 0;

  return (
    <Paper
      elevation={0}
      onClick={() => onOpen(dashboard)}
      sx={{
        p: { xs: 1.5, sm: 1.75 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        height: '100%',
        '&:hover': {
          borderColor: alpha(theme.palette.primary.main, 0.4),
          transform: 'translateY(-2px)',
          boxShadow: `0 6px 24px ${alpha(theme.palette.primary.main, 0.08)}`,
        },
      }}
    >
      <Box
        sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 700,
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {dashboard.title}
          </Typography>
          {dashboard.description && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                mt: 0.5,
              }}
            >
              {dashboard.description}
            </Typography>
          )}
        </Box>
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setMenuAnchor(e.currentTarget);
          }}
          aria-label="dashboard actions"
        >
          <AppIcon name="MoreVert" fallback={MoreVertIcon} fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 'auto', pt: 1 }}>
        <VisibilityChip value={dashboard.visibility} />
        <Chip
          size="small"
          label={`${blockCount} ${blockCount === 1 ? 'block' : 'blocks'}`}
          sx={{ height: 22, fontWeight: 600, fontSize: '0.65rem' }}
        />
        {isShared && (
          <Chip
            size="small"
            label={sharedCanEdit ? 'Can edit' : 'View only'}
            sx={{ height: 22, fontWeight: 600, fontSize: '0.65rem' }}
            color={sharedCanEdit ? 'secondary' : 'default'}
            variant="outlined"
          />
        )}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
          {updatedAgo}
        </Typography>
      </Box>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={(e) => {
          e?.stopPropagation?.();
          setMenuAnchor(null);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem
          onClick={() => {
            onAction('open', dashboard);
            setMenuAnchor(null);
          }}
        >
          <AppIcon name="Visibility" fallback={VisibilityIcon} fontSize="small" sx={{ mr: 1 }} />{' '}
          Open
        </MenuItem>
        {!isShared && (
          <MenuItem
            onClick={() => {
              onAction('duplicate', dashboard);
              setMenuAnchor(null);
            }}
          >
            <AppIcon
              name="ContentCopy"
              fallback={ContentCopyIcon}
              fontSize="small"
              sx={{ mr: 1 }}
            />{' '}
            Duplicate
          </MenuItem>
        )}
        {!isShared && (
          <MenuItem
            onClick={() => {
              onAction('delete', dashboard);
              setMenuAnchor(null);
            }}
            sx={{ color: 'error.main' }}
          >
            <AppIcon
              name="DeleteOutline"
              fallback={DeleteOutlineIcon}
              fontSize="small"
              sx={{ mr: 1 }}
            />{' '}
            Delete
          </MenuItem>
        )}
      </Menu>
    </Paper>
  );
}
