/**
 * KBDocumentViewDialog — read-only preview dialog for knowledge base documents.
 * Shows full content, goal info, agent info, metadata, timestamps.
 */
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Chip,
  Button,
  IconButton,
  Divider,
  CircularProgress,
  useTheme,
  alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import PushPinIcon from '@mui/icons-material/PushPin';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import { getDocument } from '../../services/knowledgeBaseService';

import AppIcon from '../icons/AppIcon';

const TYPE_CONFIG = {
  note: { icon: DescriptionOutlinedIcon, label: 'Note', color: 'primary' },
  file: { icon: InsertDriveFileOutlinedIcon, label: 'File', color: 'info' },
  link: { icon: LinkOutlinedIcon, label: 'Link', color: 'secondary' },
  template: { icon: ContentCopyOutlinedIcon, label: 'Template', color: 'warning' },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function KBDocumentViewDialog({ open, onClose, doc, onEdit }) {
  const theme = useTheme();
  const [fullDoc, setFullDoc] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !doc?.id) {
      setFullDoc(null);
      return;
    }
    setLoading(true);
    getDocument(doc.id)
      .then((res) => setFullDoc(res.document || res))
      .catch(() => setFullDoc(doc))
      .finally(() => setLoading(false));
  }, [open, doc?.id]);

  if (!doc) return null;

  const display = fullDoc || doc;
  const cfg = TYPE_CONFIG[display.content_type] || TYPE_CONFIG.note;
  const TypeIcon = cfg.icon;
  const color = theme.palette[cfg.color]?.main || theme.palette.primary.main;
  const meta = display.metadata || {};

  const infoRows = [
    { label: 'Created', icon: CalendarTodayOutlinedIcon, value: formatDate(display.created_at) },
    {
      label: 'Updated',
      icon: CalendarTodayOutlinedIcon,
      value: display.updated_at !== display.created_at ? formatDate(display.updated_at) : null,
    },
    { label: 'Category', icon: LabelOutlinedIcon, value: display.category },
    {
      label: 'Owner',
      icon: PersonOutlineIcon,
      value:
        display.owner_type === 'user'
          ? 'My KB'
          : `${display.owner_type}: ${display.owner_id || '—'}`,
    },
    { label: 'Source', icon: DescriptionOutlinedIcon, value: display.source || null },
    {
      label: 'Goal',
      icon: FlagOutlinedIcon,
      value: meta.goal_id ? `${meta.goal_name || 'Goal'} (${meta.goal_id.slice(0, 8)}...)` : null,
    },
    {
      label: 'Agent',
      icon: SmartToyOutlinedIcon,
      value: meta.agent_name || (display.owner_type === 'agent' ? display.owner_id : null),
    },
    {
      label: 'Project',
      icon: LabelOutlinedIcon,
      value: meta.project_id ? meta.project_id.slice(0, 8) + '...' : null,
    },
  ].filter((r) => r.value);

  // Extra metadata (tasks, cost, quality etc.)
  const statRows = [
    meta.tasks != null && { label: 'Tasks', value: `${meta.completed || 0}/${meta.tasks}` },
    meta.cost != null && { label: 'Cost', value: `$${Number(meta.cost).toFixed(4)}` },
    meta.avg_quality != null && {
      label: 'Avg Quality',
      value: `${(meta.avg_quality * 100).toFixed(0)}%`,
    },
    meta.total_cost != null && {
      label: 'Total Cost',
      value: `$${Number(meta.total_cost).toFixed(4)}`,
    },
    meta.efficiency_score != null && { label: 'Efficiency', value: `${meta.efficiency_score}%` },
  ].filter(Boolean);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3, maxHeight: '90vh' } } }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
          pr: 6,
          bgcolor: alpha(color, 0.04),
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            bgcolor: alpha(color, 0.12),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            mt: 0.25,
          }}
        >
          <AppIcon fallback={TypeIcon} sx={{ fontSize: 20, color }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.3 }}>
            {display.title || 'Untitled Document'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
            <Chip
              size="small"
              label={cfg.label}
              sx={{ fontSize: '0.65rem', height: 20, bgcolor: alpha(color, 0.1), color }}
            />
            {display.category && display.category !== 'general' && (
              <Chip
                size="small"
                label={display.category}
                variant="outlined"
                sx={{ fontSize: '0.65rem', height: 20 }}
              />
            )}
            {display.is_pinned && (
              <Chip
                size="small"
                icon={<AppIcon name="PushPin" fallback={PushPinIcon} sx={{ fontSize: 12 }} />}
                label="Pinned"
                color="warning"
                variant="outlined"
                sx={{ fontSize: '0.65rem', height: 20 }}
              />
            )}
          </Box>
        </Box>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 20 }} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            {/* Info grid */}
            <Box
              sx={{
                px: 3,
                py: 2,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1.5,
                bgcolor: alpha(theme.palette.background.default, 0.5),
              }}
            >
              {infoRows.map((row) => {
                const Icon = row.icon;
                return (
                  <Box key={row.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AppIcon fallback={Icon} sx={{ fontSize: 16, color: 'text.disabled' }} />
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', fontWeight: 600, minWidth: 60 }}
                    >
                      {row.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.primary' }}>
                      {row.value}
                    </Typography>
                  </Box>
                );
              })}
            </Box>

            {/* Stats row (if any) */}
            {statRows.length > 0 && (
              <Box
                sx={{
                  px: 3,
                  py: 1.5,
                  display: 'flex',
                  gap: 2,
                  flexWrap: 'wrap',
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  bgcolor: alpha(theme.palette.background.default, 0.3),
                }}
              >
                {statRows.map((s) => (
                  <Box key={s.label} sx={{ textAlign: 'center' }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.disabled',
                        fontSize: '0.6rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        display: 'block',
                      }}
                    >
                      {s.label}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      {s.value}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}

            {/* Tags */}
            {display.tags?.length > 0 && (
              <Box
                sx={{
                  px: 3,
                  py: 1.5,
                  display: 'flex',
                  gap: 0.5,
                  flexWrap: 'wrap',
                  borderTop: '1px solid',
                  borderColor: 'divider',
                }}
              >
                {display.tags.map((t) => (
                  <Chip
                    key={t}
                    size="small"
                    label={`#${t}`}
                    variant="outlined"
                    sx={{ fontSize: '0.65rem', height: 22, borderRadius: 1 }}
                  />
                ))}
              </Box>
            )}

            <Divider />

            {/* Content */}
            <Box sx={{ px: 3, py: 2.5, minHeight: 120 }}>
              {display.content ? (
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: '0.88rem',
                    lineHeight: 1.7,
                    color: 'text.primary',
                  }}
                >
                  {display.content}
                </Typography>
              ) : (
                <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                  No content available.
                </Typography>
              )}
            </Box>

            {/* References */}
            {display.refs?.length > 0 && (
              <>
                <Divider />
                <Box sx={{ px: 3, py: 1.5 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}
                  >
                    References
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {display.refs.map((r) => (
                      <Chip
                        key={r}
                        size="small"
                        label={r.slice(0, 12) + '...'}
                        variant="outlined"
                        sx={{ fontSize: '0.6rem', height: 20, fontFamily: 'monospace' }}
                      />
                    ))}
                  </Box>
                </Box>
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5, justifyContent: 'space-between' }}>
        <Typography
          variant="caption"
          sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.6rem' }}
        >
          ID: {display.id?.slice(0, 12)}...
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose} sx={{ textTransform: 'none' }}>
            Close
          </Button>
          {onEdit && (
            <Button
              variant="outlined"
              startIcon={
                <AppIcon name="EditOutlined" fallback={EditOutlinedIcon} sx={{ fontSize: 16 }} />
              }
              onClick={() => {
                onClose();
                onEdit(display);
              }}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              Edit
            </Button>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  );
}
