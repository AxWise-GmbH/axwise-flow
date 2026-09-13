import { useState } from 'react';
import {
  Avatar,
  IconButton,
  Tooltip,
  CircularProgress,
  Box,
  Dialog,
  useTheme,
  alpha,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';

import AppIcon from '../icons/AppIcon';

const SIZES = {
  small: 32,
  medium: 48,
  large: 80,
  xl: 120,
};

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

export default function AgentAvatar({
  profile,
  size = 'medium',
  showRegenerate = false,
  onRegenerate,
  sx = {},
}) {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  const px = SIZES[size] || SIZES.medium;
  const name = profile?.display_name || profile?.name || 'Agent';
  const headshot = profile?.headshot_path;

  // Load from local public folder or Supabase Storage
  const imgUrl =
    headshot && !imgError
      ? headshot.startsWith('http')
        ? headshot
        : headshot.startsWith('/')
          ? headshot
          : `/team-headshots/${headshot}`
      : null;

  const handleRegenerate = async () => {
    if (!onRegenerate || loading) return;
    setLoading(true);
    try {
      await onRegenerate();
      setImgError(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Box sx={{ position: 'relative', display: 'inline-flex', ...sx }}>
        <Avatar
          src={imgUrl}
          alt={name}
          onError={() => setImgError(true)}
          onClick={() => imgUrl && setPhotoOpen(true)}
          sx={{
            width: px,
            height: px,
            bgcolor: alpha(stringToColor(name), 0.85),
            fontSize: px * 0.38,
            fontWeight: 700,
            color: '#fff',
            border: '2px solid',
            borderColor: alpha(theme.palette.divider, 0.15),
            cursor: imgUrl ? 'pointer' : 'default',
            transition: 'transform 0.15s',
            '&:hover': imgUrl ? { transform: 'scale(1.05)' } : {},
          }}
        >
          {getInitials(name)}
        </Avatar>

        {loading && (
          <CircularProgress
            size={px * 0.5}
            thickness={4}
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              mt: -(px * 0.25),
              ml: -(px * 0.25),
              color: theme.palette.primary.main,
            }}
          />
        )}

        {showRegenerate && onRegenerate && !loading && (
          <Tooltip title="Regenerate avatar">
            <IconButton
              size="small"
              onClick={handleRegenerate}
              sx={{
                position: 'absolute',
                bottom: -4,
                right: -4,
                width: 22,
                height: 22,
                bgcolor: theme.palette.background.paper,
                border: '1px solid',
                borderColor: theme.palette.divider,
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1) },
              }}
            >
              <AppIcon name="Refresh" fallback={RefreshIcon} sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {/* Full-size photo popup */}
      <Dialog
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        maxWidth="sm"
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              overflow: 'hidden',
              bgcolor: 'transparent',
              boxShadow: 'none',
            },
          },
          backdrop: { sx: { backdropFilter: 'blur(8px)', bgcolor: 'rgba(0,0,0,0.7)' } },
        }}
      >
        <Box sx={{ position: 'relative' }}>
          <IconButton
            onClick={() => setPhotoOpen(false)}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              bgcolor: 'rgba(0,0,0,0.5)',
              color: '#fff',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
              zIndex: 1,
            }}
          >
            <AppIcon name="Close" fallback={CloseIcon} />
          </IconButton>
          <img
            src={imgUrl}
            alt={name}
            style={{
              display: 'block',
              width: '100%',
              maxHeight: '80vh',
              objectFit: 'contain',
              borderRadius: 12,
            }}
          />
        </Box>
      </Dialog>
    </>
  );
}
