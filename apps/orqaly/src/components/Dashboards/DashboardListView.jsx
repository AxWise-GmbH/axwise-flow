import { useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { relativeTime, VisibilityChip } from './dashboardListHelpers';

import AppIcon from '../icons/AppIcon';

/**
 * Table/list view for the dashboards list. Same data as DashboardCard;
 * different shape. Mobile gets horizontal scroll via the TableContainer.
 */
export default function DashboardListView({ dashboards, onOpen, onAction, isShared = false }) {
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuRow, setMenuRow] = useState(null);

  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuRow(null);
  };

  return (
    <TableContainer
      sx={{
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Table size="small" sx={{ minWidth: 600 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>
              Title
            </TableCell>
            <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>
              Visibility
            </TableCell>
            <TableCell
              align="right"
              sx={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}
            >
              Blocks
            </TableCell>
            <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>
              Last edited
            </TableCell>
            <TableCell sx={{ width: 56 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {dashboards.map((d) => {
            const blockCount = d.config?.blocks?.length || 0;
            return (
              <TableRow
                key={d.id}
                hover
                onClick={() => onOpen(d)}
                sx={{
                  cursor: 'pointer',
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                }}
              >
                <TableCell>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                      {d.title}
                    </Typography>
                    {d.description && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: 'block',
                          maxWidth: 320,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {d.description}
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    <VisibilityChip value={d.visibility} />
                    {isShared && (
                      <Chip
                        size="small"
                        label={d.can_edit ? 'Can edit' : 'View only'}
                        color={d.can_edit ? 'secondary' : 'default'}
                        variant="outlined"
                        sx={{ height: 22, fontWeight: 600, fontSize: '0.65rem' }}
                      />
                    )}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Chip
                    size="small"
                    label={blockCount}
                    sx={{ height: 22, fontWeight: 700, fontSize: '0.7rem' }}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {relativeTime(d.updated_at)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuAnchor(e.currentTarget);
                      setMenuRow(d);
                    }}
                    aria-label="actions"
                  >
                    <AppIcon name="MoreVert" fallback={MoreVertIcon} fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem
          onClick={() => {
            if (menuRow) onAction('open', menuRow);
            closeMenu();
          }}
        >
          <AppIcon name="Visibility" fallback={VisibilityIcon} fontSize="small" sx={{ mr: 1 }} />{' '}
          Open
        </MenuItem>
        {!isShared && (
          <MenuItem
            onClick={() => {
              if (menuRow) onAction('duplicate', menuRow);
              closeMenu();
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
              if (menuRow) onAction('delete', menuRow);
              closeMenu();
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
    </TableContainer>
  );
}
