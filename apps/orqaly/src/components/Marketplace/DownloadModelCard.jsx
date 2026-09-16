import { Box, Paper, Typography, Chip, Button, Link, useTheme, alpha } from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined';
import FileCopyOutlinedIcon from '@mui/icons-material/FileCopyOutlined';
import FavoriteBorderOutlinedIcon from '@mui/icons-material/FavoriteBorderOutlined';
import ModelBrandIcon from './ModelBrandIcon';
import AppIcon from '../icons/AppIcon';
import { createHoverGlowShadow } from '../../theme/hoverGlow';

function compact(n) {
  const x = Number(n) || 0;
  if (x >= 1e9) return `${(x / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (x >= 1e6) return `${(x / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return String(x);
}

/**
 * A single Hugging Face model card for the Marketplace "Download" sub-tab.
 * Shared by the category shelves, the "Show all" focused grid, and flat search
 * results so the card design stays identical everywhere.
 *
 * `idx` (optional) drives the staggered fade-in when rendered in a grid.
 */
export default function DownloadModelCard({ model, onDownload, idx = 0 }) {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.25,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 3,
        position: 'relative',
        border: '1px solid',
        borderColor: alpha(theme.palette.primary.main, 0.12),
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.03)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          borderColor: 'primary.main',
          transform: 'translateY(-2px)',
          boxShadow: createHoverGlowShadow(theme),
        },
        animation: theme.animations?.fadeInUp,
        animationDelay: `${Math.min(idx * 50, 400)}ms`,
        animationFillMode: 'both',
      }}
    >
      {/* Rank badge (curated shelves only) */}
      {model.rank != null && (
        <Box
          sx={{
            position: 'absolute',
            top: 10,
            right: 10,
            minWidth: 22,
            height: 22,
            px: 0.5,
            borderRadius: 1.5,
            bgcolor: alpha(theme.palette.primary.main, 0.14),
            color: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.7rem',
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          #{model.rank}
        </Box>
      )}

      {/* Header: brand logo + name + repo id */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.25 }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: 2.5,
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ModelBrandIcon model={model} size={22} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body1"
            sx={{ fontWeight: 800, lineHeight: 1.2, color: 'text.primary' }}
            noWrap
          >
            {model.displayName || model.name}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.68rem' }}
          >
            {model.repoId}
          </Typography>
        </Box>
      </Box>

      {/* Chips: task + license + gated */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5, flexWrap: 'wrap' }}>
        <Chip
          label={model.pipelineTag}
          size="small"
          variant="outlined"
          sx={{ height: 18, fontSize: '0.6rem', opacity: 0.8 }}
        />
        {model.license && (
          <Chip
            label={model.license}
            size="small"
            variant="outlined"
            sx={{ height: 18, fontSize: '0.6rem', opacity: 0.8 }}
          />
        )}
        {model.gated && (
          <Chip
            icon={<LockOutlinedIcon sx={{ fontSize: 11 }} />}
            label="Gated"
            size="small"
            sx={{
              height: 18,
              fontSize: '0.58rem',
              fontWeight: 700,
              bgcolor: alpha(theme.palette.warning.main, 0.14),
              color: 'warning.main',
            }}
          />
        )}
      </Box>

      {/* Stats: downloads, likes, size, files */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 0.75,
          mb: 2,
          flexGrow: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <AppIcon
            name="DownloadOutlined"
            fallback={DownloadOutlinedIcon}
            sx={{ fontSize: 15, color: 'text.secondary', opacity: 0.7 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {compact(model.downloads)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <FavoriteBorderOutlinedIcon sx={{ fontSize: 15, color: 'text.secondary', opacity: 0.7 }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {compact(model.likes)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <MemoryOutlinedIcon sx={{ fontSize: 15, color: 'text.secondary', opacity: 0.7 }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {model.paramsLabel ? `~${model.paramsLabel}` : '—'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <FileCopyOutlinedIcon sx={{ fontSize: 15, color: 'text.secondary', opacity: 0.7 }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {model.files} file{model.files === 1 ? '' : 's'}
          </Typography>
        </Box>
      </Box>

      {/* Footer: Download + View on HF */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          pt: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Button
          variant="contained"
          size="small"
          startIcon={<AppIcon name="DownloadOutlined" fallback={DownloadOutlinedIcon} />}
          onClick={() => onDownload?.(model)}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, flex: 1 }}
        >
          Download
        </Button>
        <Button
          component={Link}
          href={model.url}
          target="_blank"
          rel="noopener noreferrer"
          variant="text"
          size="small"
          endIcon={<OpenInNewOutlinedIcon sx={{ fontSize: 14 }} />}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
        >
          HF
        </Button>
      </Box>
    </Paper>
  );
}
