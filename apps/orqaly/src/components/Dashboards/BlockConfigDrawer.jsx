import { useEffect, useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Divider,
  Stack,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DataPicker from './DataPicker';
import ChartTypePicker from './ChartTypePicker';

import AppIcon from '../icons/AppIcon';

/**
 * Configures a single block. Opens as a drawer (right on desktop, bottom on mobile).
 */
export default function BlockConfigDrawer({ open, block, onClose, onSave }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [draft, setDraft] = useState(() => block || null);

  useEffect(() => {
    setDraft(block);
  }, [block]);

  if (!draft) return null;

  const isMarkdown = draft.type === 'markdown';

  const handleSave = () => {
    onSave(draft);
  };

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: isMobile ? '100%' : 400,
          maxWidth: '100vw',
          height: isMobile ? '85vh' : '100%',
          borderTopLeftRadius: isMobile ? 16 : 0,
          borderTopRightRadius: isMobile ? 16 : 0,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: alpha(theme.palette.primary.main, 0.04),
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Configure block
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="close">
          <AppIcon name="Close" fallback={CloseIcon} fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        <Stack spacing={2}>
          <TextField
            label="Title"
            size="small"
            fullWidth
            value={draft.title || ''}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />

          {isMarkdown ? (
            <TextField
              label="Note content"
              size="small"
              fullWidth
              multiline
              minRows={6}
              maxRows={20}
              value={draft.body || ''}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              helperText="Lines starting with '# ' become headings."
            />
          ) : (
            <>
              <ChartTypePicker
                value={draft.type}
                blockData={draft.data}
                onChange={(t) => setDraft({ ...draft, type: t })}
              />
              <Divider />
              <DataPicker
                value={draft.data || {}}
                onChange={(d) => setDraft({ ...draft, data: d })}
              />
            </>
          )}
        </Stack>
      </Box>
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1,
        }}
      >
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          Apply
        </Button>
      </Box>
    </Drawer>
  );
}
