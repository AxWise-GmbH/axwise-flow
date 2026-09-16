import { useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Link,
  CircularProgress,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';

import AppIcon from '../../../components/icons/AppIcon';

/**
 * One credential row. Shows status, masked preview, and actions.
 * The row never holds plaintext - Replace opens KeyDialog which manages paste.
 */
export default function KeyRow({
  provider, // catalog entry { id, label, docUrl, placeholder, helpText }
  keyRow, // current user_api_keys row (or undefined)
  platformFallback, // boolean - server env has fallback
  onReplace,
  onClear,
  onTestExisting,
}) {
  const [testing, setTesting] = useState(false);
  const [lastProbe, setLastProbe] = useState(null);

  const configured = !!keyRow;
  const statusChip = configured
    ? { label: 'Using your key', color: 'success' }
    : platformFallback
      ? { label: 'Platform fallback', color: 'warning' }
      : { label: 'Not configured', color: 'default' };

  const handleTestExisting = async () => {
    if (!onTestExisting) return;
    setTesting(true);
    try {
      const result = await onTestExisting();
      setLastProbe(result);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.25,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        '&:hover': { borderColor: 'primary.light' },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" fontWeight={600} noWrap>
            {provider.label}
          </Typography>
          {provider.docUrl && (
            <Tooltip title="Open provider docs">
              <IconButton
                component={Link}
                href={provider.docUrl}
                target="_blank"
                rel="noopener noreferrer"
                size="small"
                sx={{ p: 0.25 }}
              >
                <AppIcon
                  name="OpenInNewOutlined"
                  fallback={OpenInNewOutlinedIcon}
                  sx={{ fontSize: 14 }}
                />
              </IconButton>
            </Tooltip>
          )}
          <Chip
            size="small"
            label={statusChip.label}
            color={statusChip.color}
            variant="outlined"
            sx={{ height: 20 }}
          />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
          {configured ? keyRow.maskedPreview : provider.helpText || provider.placeholder || '-'}
        </Typography>
        {lastProbe && (
          <Typography
            variant="caption"
            color={lastProbe.ok ? 'success.main' : 'error.main'}
            sx={{ display: 'block', mt: 0.25 }}
          >
            {lastProbe.ok
              ? `OK (${lastProbe.latencyMs ?? 0}ms)`
              : `Failed: ${lastProbe.message || lastProbe.code}`}
          </Typography>
        )}
      </Box>
      <Stack direction="row" spacing={0.5}>
        {configured && onTestExisting && (
          <Tooltip title="Test stored key">
            <span>
              <IconButton size="small" onClick={handleTestExisting} disabled={testing}>
                {testing ? (
                  <CircularProgress size={14} />
                ) : (
                  <AppIcon
                    name="PlayArrowOutlined"
                    fallback={PlayArrowOutlinedIcon}
                    sx={{ fontSize: 18 }}
                  />
                )}
              </IconButton>
            </span>
          </Tooltip>
        )}
        <Button
          size="small"
          variant={configured ? 'outlined' : 'contained'}
          startIcon={
            <AppIcon name="EditOutlined" fallback={EditOutlinedIcon} sx={{ fontSize: 16 }} />
          }
          onClick={onReplace}
          sx={{ textTransform: 'none', minWidth: 88 }}
        >
          {configured ? 'Replace' : 'Set key'}
        </Button>
        {configured && (
          <Tooltip title="Clear (revert to platform fallback)">
            <IconButton size="small" color="error" onClick={onClear}>
              <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Box>
  );
}
