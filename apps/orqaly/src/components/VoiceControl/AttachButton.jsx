/**
 * AttachButton — paperclip file picker for the chat input.
 * Validates PDF/DOCX/CSV (<=10MB) via chatAttachmentService and hands the
 * accepted File up via onAdd. Rendering of attachment chips is the parent's job.
 */
import { useRef } from 'react';
import { IconButton, Tooltip, useTheme } from '@mui/material';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import { validateChatAttachment } from '../../services/chatAttachmentService';
import { composerToolIconSx, withComposerSurfaceTone } from '../../theme/composerSurface';

let uid = 0;

export default function AttachButton({ onAdd, onError, disabled, sx, surfaceTone = 'auto' }) {
  const ambientTheme = useTheme();
  const theme = withComposerSurfaceTone(ambientTheme, surfaceTone);
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const res = validateChatAttachment(file);
      if (res.ok) {
        uid += 1;
        onAdd?.({
          id: `att-${Date.now()}-${uid}`,
          name: res.file.name,
          kind: res.file.kind,
          size: res.file.size,
          file,
        });
      } else {
        onError?.(res.error || 'Unsupported file.');
      }
    }
    // reset so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.csv"
        multiple
        hidden
        onChange={handleChange}
      />
      <Tooltip title="Attach file (PDF, DOCX, CSV)">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            sx={[composerToolIconSx(theme), ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
            aria-label="Attach file"
          >
            <AttachFileRoundedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </span>
      </Tooltip>
    </>
  );
}
