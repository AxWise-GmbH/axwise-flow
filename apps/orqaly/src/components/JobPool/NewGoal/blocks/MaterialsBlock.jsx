import { useRef } from 'react';
import { Box, Button, Chip, IconButton, Typography, alpha, useTheme } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import GlassIcon from '../../../icons/GlassIcon';
import { formatFileSize } from '../../../../services/goalFileService';
import KbPicker from './KbPicker';

const UPLOAD_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.gif,.webp,.svg';

/**
 * What the team gets to work with: Knowledge Base documents, uploaded files,
 * and results from earlier goals.
 *
 * All three share one 20-item evidence budget, enforced server-side. The
 * counter here mirrors that so the user is stopped before a submit fails.
 */
export default function MaterialsBlock({
  attachments,
  onUpload,
  onRemoveAttachment,
  uploadingFile,
  onLoadPastGoals,
  kbSelectedIds,
  onToggleKbDocument,
  remainingSlots,
  children,
}) {
  const theme = useTheme();
  const fileInputRef = useRef(null);

  return (
    <Box>
      <KbPicker
        selectedIds={kbSelectedIds}
        onToggle={onToggleKbDocument}
        remainingSlots={remainingSlots}
      />

      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.5 }}>
        <Button
          size="small"
          startIcon={<GlassIcon name="AttachFile" fallback={AttachFileIcon} size={14} />}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFile || remainingSlots <= 0}
          sx={{ textTransform: 'none', fontSize: '0.72rem', borderRadius: 1.5, minHeight: 36 }}
        >
          Upload file
        </Button>
        <Button
          size="small"
          startIcon={<GlassIcon name="FolderOpen" fallback={FolderOpenIcon} size={14} />}
          onClick={onLoadPastGoals}
          disabled={remainingSlots <= 0}
          sx={{ textTransform: 'none', fontSize: '0.72rem', borderRadius: 1.5, minHeight: 36 }}
        >
          From past goals
        </Button>
      </Box>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={onUpload}
        accept={UPLOAD_ACCEPT}
        aria-label="Upload files as goal materials"
      />

      {attachments.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
          {attachments.map((attachment) => (
            <Box
              key={attachment.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                py: 0.35,
                px: 0.75,
                borderRadius: 1.5,
                bgcolor: alpha(theme.palette.primary.main, 0.04),
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, 0.1),
                minWidth: 0,
              }}
            >
              <GlassIcon
                name="DescriptionOutlined"
                fallback={DescriptionOutlinedIcon}
                size={14}
                tone={
                  attachment.type === 'goal-result' || attachment.type === 'goal-reference'
                    ? theme.palette.success.main
                    : theme.palette.info.main
                }
              />
              <Typography
                variant="caption"
                noWrap
                sx={{ flex: 1, fontWeight: 600, fontSize: '0.68rem', minWidth: 0 }}
              >
                {attachment.name}
              </Typography>
              {attachment.size > 0 && (
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.6rem' }}>
                  {formatFileSize(attachment.size)}
                </Typography>
              )}
              {attachment.goalTitle && (
                <Chip
                  label="Goal result"
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ height: 16, fontSize: '0.5rem' }}
                />
              )}
              <IconButton
                size="small"
                aria-label={`Remove ${attachment.name}`}
                onClick={() => onRemoveAttachment(attachment.id)}
                sx={{ p: 0.25 }}
              >
                <GlassIcon
                  name="DeleteOutline"
                  fallback={DeleteOutlineIcon}
                  size={14}
                  tone="neutral"
                />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}

      {children}
    </Box>
  );
}
