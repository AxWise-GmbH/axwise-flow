import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Stack,
  Chip,
  LinearProgress,
  alpha,
} from '@mui/material';
import FormDialog, { FORM_FIELD_SX } from '../../../components/Common/FormDialog';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  MEETING_CHANNELS,
  MEETING_STATUS_LABELS,
  MEETING_STATUS_COLORS,
} from '../../../services/meetingService';

import AppIcon from '../../../components/icons/AppIcon';

/**
 * MeetingUploadDialog
 * Upload audio/video files for transcription.
 * Supports drag-and-drop and file picker.
 */
export default function MeetingUploadDialog({ open, onClose, partnerId, onUpload }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    channel: 'Other',
    participants: '',
    organizer: '',
  });
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const resetForm = () => {
    setFile(null);
    setFormData({ title: '', channel: 'Other', participants: '', organizer: '' });
    setPipelineStatus(null);
    setPipelineProgress(0);
    setUploading(false);
  };

  const handleClose = () => {
    if (uploading) return; // Don't close during upload
    resetForm();
    onClose();
  };

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      if (
        droppedFile &&
        (droppedFile.type.startsWith('audio/') || droppedFile.type.startsWith('video/'))
      ) {
        setFile(droppedFile);
        if (!formData.title) {
          setFormData((p) => ({ ...p, title: droppedFile.name.replace(/\.[^/.]+$/, '') }));
        }
      }
    },
    [formData.title]
  );

  const handleFileSelect = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      if (!formData.title) {
        setFormData((p) => ({ ...p, title: selected.name.replace(/\.[^/.]+$/, '') }));
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(
        file,
        {
          title: formData.title || file.name,
          channel: formData.channel,
          participants: formData.participants
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          organizer: formData.organizer || 'Current User',
        },
        (status, progress) => {
          setPipelineStatus(status);
          setPipelineProgress(progress);
        }
      );
      // Show completion state briefly before closing
      setPipelineStatus('completed');
      setPipelineProgress(100);
      setTimeout(() => {
        resetForm();
      }, 1200);
    } catch {
      setPipelineStatus('failed');
      setUploading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title="Upload Meeting Recording"
      icon={CloudUploadIcon}
      disableEscapeKeyDown={uploading}
      primaryLabel="Upload & Transcribe"
      onPrimary={handleUpload}
      primaryDisabled={!file || uploading}
    >
      {/* Drop Zone */}
      {!file && !uploading && (
        <Box
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          sx={{
            border: '2px dashed',
            borderColor: isDragOver ? 'primary.main' : 'divider',
            borderRadius: 3,
            p: 4,
            textAlign: 'center',
            cursor: 'pointer',
            bgcolor: isDragOver ? alpha('#3B82F6', 0.04) : 'transparent',
            transition: 'all 0.2s',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: alpha('#3B82F6', 0.02),
            },
            mb: 3,
          }}
        >
          <AppIcon
            name="CloudUpload"
            fallback={CloudUploadIcon}
            sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
          />
          <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
            Drag & drop audio/video file here
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            or click to browse. Supports MP3, WAV, WebM, MP4, OGG.
          </Typography>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </Box>
      )}
      {/* Selected File */}
      {file && !uploading && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.5,
            mb: 3,
            borderRadius: 2,
            bgcolor: alpha('#3B82F6', 0.05),
            border: '1px solid',
            borderColor: alpha('#3B82F6', 0.15),
          }}
        >
          <AppIcon name="AudioFile" fallback={AudioFileIcon} sx={{ color: '#3B82F6' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {file.name}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {formatFileSize(file.size)} · {file.type}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setFile(null)}>
            <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} fontSize="small" />
          </IconButton>
        </Box>
      )}
      {/* Pipeline Progress */}
      {uploading && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            {pipelineStatus === 'completed' ? (
              <Chip label="Complete" size="small" color="success" />
            ) : (
              <Box
                sx={{
                  width: 18,
                  height: 18,
                  border: '2px solid',
                  borderColor: MEETING_STATUS_COLORS[pipelineStatus] || '#3B82F6',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } },
                }}
              />
            )}
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {MEETING_STATUS_LABELS[pipelineStatus] || 'Processing…'}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={pipelineProgress}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: alpha(MEETING_STATUS_COLORS[pipelineStatus] || '#3B82F6', 0.12),
              '& .MuiLinearProgress-bar': {
                bgcolor: MEETING_STATUS_COLORS[pipelineStatus] || '#3B82F6',
                borderRadius: 3,
              },
            }}
          />
        </Box>
      )}
      {/* Form Fields */}
      {!uploading && (
        <Stack spacing={2}>
          <TextField
            label="Meeting Title"
            size="small"
            fullWidth
            value={formData.title}
            onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Q1 Campaign Review"
          />
          <TextField
            label="Channel"
            size="small"
            fullWidth
            select
            value={formData.channel}
            onChange={(e) => setFormData((p) => ({ ...p, channel: e.target.value }))}
          >
            {MEETING_CHANNELS.map((ch) => (
              <MenuItem key={ch} value={ch}>
                {ch}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Organizer"
            size="small"
            fullWidth
            value={formData.organizer}
            onChange={(e) => setFormData((p) => ({ ...p, organizer: e.target.value }))}
            placeholder="e.g. Alex"
          />
          <TextField
            label="Participants (comma-separated)"
            size="small"
            fullWidth
            value={formData.participants}
            onChange={(e) => setFormData((p) => ({ ...p, participants: e.target.value }))}
            placeholder="e.g. Alex, Sarah, Mike"
          />
        </Stack>
      )}
    </FormDialog>
  );
}
