import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Skeleton,
  alpha,
  useTheme,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadIcon from '@mui/icons-material/Download';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

import AppIcon from '../icons/AppIcon';

/**
 * Shared shell around every block. Provides:
 * - title + action menu
 * - drag handle (when editable)
 * - loading skeleton
 * - error rendering for { error }-shaped data
 */
export default function BlockShell({
  title,
  subtitle,
  children,
  loading = false,
  error = '',
  editable = false,
  onConfigure,
  onDuplicate,
  onDelete,
  onExportCsv,
}) {
  const theme = useTheme();
  const [menu, setMenu] = useState(null);

  return (
    <Paper
      elevation={0}
      className={editable ? 'block-shell editable' : 'block-shell'}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
        bgcolor: 'background.paper',
        transition: 'border-color 0.2s ease',
        '&:hover': {
          borderColor: alpha(theme.palette.primary.main, 0.25),
        },
      }}
    >
      <Box
        className={editable ? 'block-drag-handle' : undefined}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.25,
          py: 0.85,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: alpha(theme.palette.primary.main, 0.03),
          cursor: editable ? 'grab' : 'default',
          '&:active': editable ? { cursor: 'grabbing' } : undefined,
        }}
      >
        {editable && (
          <AppIcon
            name="DragIndicator"
            fallback={DragIndicatorIcon}
            sx={{ fontSize: 16, color: alpha(theme.palette.text.secondary, 0.5) }}
          />
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title || 'Untitled block'}
          </Typography>
          {subtitle && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: 'block',
                fontSize: '0.65rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
        <Tooltip title="Block actions">
          <IconButton
            size="small"
            aria-label="block actions"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setMenu(e.currentTarget);
            }}
            sx={{ ml: 'auto' }}
          >
            <AppIcon name="MoreVert" fallback={MoreVertIcon} fontSize="small" />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={menu}
          open={Boolean(menu)}
          onClose={() => setMenu(null)}
          onClick={(e) => e.stopPropagation()}
        >
          {editable && onConfigure && (
            <MenuItem
              onClick={() => {
                onConfigure();
                setMenu(null);
              }}
            >
              <AppIcon
                name="SettingsOutlined"
                fallback={SettingsOutlinedIcon}
                fontSize="small"
                sx={{ mr: 1 }}
              />{' '}
              Configure
            </MenuItem>
          )}
          {onExportCsv && (
            <MenuItem
              onClick={() => {
                onExportCsv();
                setMenu(null);
              }}
            >
              <AppIcon name="Download" fallback={DownloadIcon} fontSize="small" sx={{ mr: 1 }} />{' '}
              Export CSV
            </MenuItem>
          )}
          {editable && onDuplicate && (
            <MenuItem
              onClick={() => {
                onDuplicate();
                setMenu(null);
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
          {editable && onDelete && (
            <MenuItem
              onClick={() => {
                onDelete();
                setMenu(null);
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
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, p: 1.25, display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
            <Skeleton variant="text" height={24} />
            <Skeleton variant="rectangular" sx={{ flex: 1, borderRadius: 1 }} />
          </Box>
        ) : error ? (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.75,
              textAlign: 'center',
              color: 'error.main',
            }}
          >
            <AppIcon name="ErrorOutline" fallback={ErrorOutlineIcon} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {error}
            </Typography>
          </Box>
        ) : (
          children
        )}
      </Box>
    </Paper>
  );
}
