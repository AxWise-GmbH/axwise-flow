import {
  Box,
  Paper,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { formatFileSize } from '../../services/kbFileService';

import AppIcon from '../icons/AppIcon';

const TYPE_CONFIG = {
  note: { icon: DescriptionOutlinedIcon, label: 'Note', color: 'primary' },
  file: { icon: InsertDriveFileOutlinedIcon, label: 'File', color: 'info' },
  link: { icon: LinkOutlinedIcon, label: 'Link', color: 'secondary' },
  template: { icon: ContentCopyOutlinedIcon, label: 'Template', color: 'warning' },
};

function timeAgo(date) {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function KBDocumentCard({ doc, onEdit, onDelete, onPin, onDownload, onView }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const cfg = TYPE_CONFIG[doc.content_type] || TYPE_CONFIG.note;
  const TypeIcon = cfg.icon;
  const color = theme.palette[cfg.color]?.main || theme.palette.primary.main;

  return (
    <Paper
      elevation={0}
      onClick={() => onView && onView(doc)}
      sx={{
        p: { xs: 1.5, sm: 2 },
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: alpha(color, 0.18),
        background: `linear-gradient(135deg, ${alpha(color, 0.04)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
        transition: 'border-color 0.2s',
        cursor: onView ? 'pointer' : 'default',
        '&:hover': { borderColor: alpha(color, 0.35) },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: { xs: 1, sm: 1.5 } }}>
        {/* Icon */}
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            bgcolor: alpha(color, 0.12),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <AppIcon fallback={TypeIcon} sx={{ fontSize: 18, color }} />
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 700,
                lineHeight: 1.3,
                ...(isMobile
                  ? {
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      display: '-webkit-box',
                      overflow: 'hidden',
                    }
                  : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
              }}
            >
              {doc.title || 'Untitled'}
            </Typography>
            {doc.is_pinned && (
              <AppIcon
                name="PushPin"
                fallback={PushPinIcon}
                sx={{ fontSize: 14, color: 'warning.main', flexShrink: 0 }}
              />
            )}
          </Box>

          {/* Type + category + owner badge */}
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
            <Chip
              size="small"
              label={cfg.label}
              sx={{
                fontSize: '0.6rem',
                height: 18,
                borderRadius: 1,
                bgcolor: alpha(color, 0.1),
                color,
              }}
            />
            {doc.category && doc.category !== 'general' && (
              <Chip
                size="small"
                label={doc.category}
                variant="outlined"
                sx={{ fontSize: '0.6rem', height: 18, borderRadius: 1 }}
              />
            )}
            {doc.owner_type && doc.owner_type !== 'user' && (
              <Chip
                size="small"
                label={`${doc.owner_type}: ${doc.owner_id || ''}`.slice(0, 20)}
                sx={{ fontSize: '0.6rem', height: 18, borderRadius: 1 }}
              />
            )}
          </Box>

          {/* Preview based on type */}
          {doc.content_type === 'note' && doc.content && (
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                lineHeight: 1.4,
              }}
            >
              {doc.content.slice(0, 200)}
            </Typography>
          )}
          {doc.content_type === 'file' && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {doc.file_name || 'File'} · {formatFileSize(doc.file_size)}
            </Typography>
          )}
          {doc.content_type === 'link' && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
              {doc.url_meta?.title || doc.url || 'Link'}
            </Typography>
          )}

          {/* Tags */}
          {doc.tags?.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.3, flexWrap: 'wrap', mt: 0.5 }}>
              {doc.tags.slice(0, 5).map((t) => (
                <Chip
                  key={t}
                  size="small"
                  label={`#${t}`}
                  sx={{ fontSize: '0.58rem', height: 16, borderRadius: 0.8 }}
                  variant="outlined"
                />
              ))}
              {doc.tags.length > 5 && (
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.6rem' }}>
                  +{doc.tags.length - 5}
                </Typography>
              )}
            </Box>
          )}

          {/* Meta line */}
          <Typography
            variant="caption"
            sx={{ color: 'text.disabled', mt: 0.5, display: 'block', fontSize: '0.65rem' }}
          >
            {timeAgo(doc.created_at)}
            {doc.refs?.length > 0 && ` · ${doc.refs.length} ref${doc.refs.length !== 1 ? 's' : ''}`}
          </Typography>
        </Box>

        {/* Actions */}
        <Box
          onClick={(e) => e.stopPropagation()}
          sx={{
            display: 'flex',
            flexDirection: { xs: 'row', sm: 'column' },
            gap: 0.25,
            flexShrink: 0,
          }}
        >
          {onPin && (
            <Tooltip title={doc.is_pinned ? 'Unpin' : 'Pin'}>
              <IconButton size="small" onClick={() => onPin(doc)} sx={{ p: 0.4 }}>
                {doc.is_pinned ? (
                  <AppIcon
                    name="PushPin"
                    fallback={PushPinIcon}
                    sx={{ fontSize: 16, color: 'warning.main' }}
                  />
                ) : (
                  <AppIcon
                    name="PushPinOutlined"
                    fallback={PushPinOutlinedIcon}
                    sx={{ fontSize: 16, color: 'text.secondary' }}
                  />
                )}
              </IconButton>
            </Tooltip>
          )}
          {onDownload && doc.content_type === 'file' && (
            <Tooltip title="Download">
              <IconButton size="small" onClick={() => onDownload(doc)} sx={{ p: 0.4 }}>
                <AppIcon
                  name="DownloadOutlined"
                  fallback={DownloadOutlinedIcon}
                  sx={{ fontSize: 16, color: 'text.secondary' }}
                />
              </IconButton>
            </Tooltip>
          )}
          {onEdit && (
            <Tooltip title="Edit">
              <IconButton size="small" onClick={() => onEdit(doc)} sx={{ p: 0.4 }}>
                <AppIcon
                  name="EditOutlined"
                  fallback={EditOutlinedIcon}
                  sx={{ fontSize: 16, color: 'text.secondary' }}
                />
              </IconButton>
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip title="Delete">
              <IconButton size="small" onClick={() => onDelete(doc)} sx={{ p: 0.4 }}>
                <AppIcon
                  name="DeleteOutline"
                  fallback={DeleteOutlineIcon}
                  sx={{ fontSize: 16, color: 'error.main' }}
                />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
    </Paper>
  );
}
