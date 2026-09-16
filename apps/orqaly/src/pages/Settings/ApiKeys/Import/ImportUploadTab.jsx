import { useCallback, useRef, useState } from 'react';
import { Box, Typography, Button, Stack, Alert } from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';

import AppIcon from '../../../../components/icons/AppIcon';

const ACCEPTED = '.env,.json,.csv,.txt,.yaml,.yml';
const MAX_BYTES = 256 * 1024;

/**
 * Drag-and-drop + click-to-select uploader. Hands the chosen File up.
 */
export default function ImportUploadTab({ onFile, disabled }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);

  const validate = (file) => {
    if (!file) return 'No file selected';
    if (file.size === 0) return 'Empty file';
    if (file.size > MAX_BYTES) return `File exceeds ${MAX_BYTES / 1024} KB`;
    const name = file.name.toLowerCase();
    const ok = ['.env', '.json', '.csv', '.txt', '.yaml', '.yml'].some(
      (ext) => name.endsWith(ext) || name.includes('.env.')
    );
    if (!ok) return 'Extension not supported (.env, .json, .csv, .txt, .yaml, .yml)';
    return null;
  };

  const pick = useCallback(
    (file) => {
      const err = validate(file);
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      onFile(file);
    },
    [onFile]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      pick(file);
    },
    [pick]
  );

  return (
    <Box>
      <Box
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        sx={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          p: 4,
          borderRadius: 2,
          border: '2px dashed',
          borderColor: dragging ? 'primary.main' : 'divider',
          bgcolor: dragging ? 'action.hover' : 'transparent',
          textAlign: 'center',
          transition: 'all 0.15s ease',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <AppIcon
          name="CloudUploadOutlined"
          fallback={CloudUploadOutlinedIcon}
          sx={{ fontSize: 40, color: 'primary.main', mb: 1 }}
        />
        <Typography variant="body2" fontWeight={600}>
          Drop your file here, or click to browse
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          .env, .json, .csv (1Password/Bitwarden), .yaml - max {MAX_BYTES / 1024} KB
        </Typography>
      </Box>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        style={{ display: 'none' }}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
        {['Doppler', 'Infisical', 'Vercel', '1Password', 'Bitwarden', 'Local .env'].map((src) => (
          <Typography
            key={src}
            variant="caption"
            sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: 'action.hover' }}
          >
            {src}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}
