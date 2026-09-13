/**
 * Compact indicator showing who created an entity and when.
 * Clicking the "i" icon opens a popover with full details (date/time, created by, updated at).
 */
import { useState } from 'react';
import { Box, Typography, IconButton, Popover, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useAuth } from '../../context/AuthContext';

import AppIcon from '../icons/AppIcon';

function formatDateTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatShortDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { dateStyle: 'short' });
}

export default function EntityInfoBadge({
  createdBy,
  createdAt,
  updatedAt,
  createdByLabel,
  size = 'small',
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const { user } = useAuth();
  const open = Boolean(anchorEl);

  const creatorDisplay =
    createdByLabel ||
    (createdBy && user?.uid && String(createdBy) === String(user.uid) ? 'You' : null) ||
    (createdBy ? String(createdBy).slice(0, 8) + '…' : null) ||
    '—';

  const hasInfo = createdAt || updatedAt || createdBy || createdByLabel;

  if (!hasInfo) return null;

  const handleClick = (e) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => setAnchorEl(null);

  return (
    <>
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          flexWrap: 'nowrap',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {createdAt && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: size === 'small' ? '0.7rem' : '0.75rem' }}
          >
            {formatShortDate(createdAt)}
            {createdBy || createdByLabel ? ` · ${creatorDisplay}` : ''}
          </Typography>
        )}
        {!createdAt && (createdBy || createdByLabel) && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: size === 'small' ? '0.7rem' : '0.75rem' }}
          >
            {creatorDisplay}
          </Typography>
        )}
        <Tooltip title="Full info">
          <IconButton
            size="small"
            onClick={handleClick}
            sx={{
              p: 0.25,
              minWidth: 0,
              minHeight: 0,
              color: 'text.secondary',
              '&:hover': { color: 'primary.main' },
            }}
          >
            <AppIcon
              name="InfoOutlined"
              fallback={InfoOutlinedIcon}
              sx={{ fontSize: size === 'small' ? 14 : 16 }}
            />
          </IconButton>
        </Tooltip>
      </Box>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{
          paper: {
            sx: { p: 1.5, minWidth: 220, borderRadius: 2 },
          },
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Details
        </Typography>
        <Box
          component="dl"
          sx={{
            m: 0,
            '& dd': { m: 0, ml: 1.5 },
            '& dt': { mt: 0.75, color: 'text.secondary', fontSize: '0.75rem' },
          }}
        >
          {createdAt && (
            <>
              <dt>Created</dt>
              <dd>
                <Typography variant="body2">{formatDateTime(createdAt)}</Typography>
              </dd>
            </>
          )}
          {(createdBy || createdByLabel) && (
            <>
              <dt>Created by</dt>
              <dd>
                <Typography variant="body2">{creatorDisplay}</Typography>
              </dd>
            </>
          )}
          {updatedAt && (
            <>
              <dt>Last updated</dt>
              <dd>
                <Typography variant="body2">{formatDateTime(updatedAt)}</Typography>
              </dd>
            </>
          )}
        </Box>
      </Popover>
    </>
  );
}
