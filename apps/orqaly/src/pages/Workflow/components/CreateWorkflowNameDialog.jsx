import { useState, useMemo } from 'react';
import {
  Button,
  TextField,
  Alert,
  Typography,
  Autocomplete,
  ToggleButtonGroup,
  ToggleButton,
  Box,
  alpha,
  useTheme,
} from '@mui/material';
import FormDialog, { FORM_FIELD_SX } from '../../../components/Common/FormDialog';
import PublicRoundedIcon from '@mui/icons-material/PublicRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

import AppIcon from '../../../components/icons/AppIcon';

export default function CreateWorkflowNameDialog({
  open,
  onClose,
  onCreate,
  existingNames = [],
  existingCategories = [],
}) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [creating, setCreating] = useState(false);

  const lowerNames = useMemo(
    () => existingNames.map((n) => (n || '').toLowerCase()),
    [existingNames]
  );

  const trimmed = name?.trim() || '';
  const isDuplicate = trimmed.length > 0 && lowerNames.includes(trimmed.toLowerCase());

  // Compute what the auto-renamed version would be
  const suggestedName = useMemo(() => {
    if (!isDuplicate) return '';
    let suffix = 1;
    let candidate;
    do {
      candidate = `${trimmed}-${String(suffix).padStart(2, '0')}`;
      suffix++;
    } while (lowerNames.includes(candidate.toLowerCase()));
    return candidate;
  }, [isDuplicate, trimmed, lowerNames]);

  const handleCreate = async () => {
    const finalName = trimmed || 'Untitled Workflow';
    const finalCategory = (category && String(category).trim()) || null;
    setCreating(true);
    try {
      await onCreate(finalName, finalCategory, visibility);
      setName('');
      setCategory('');
      setVisibility('public');
      onClose();
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setName('');
    setCategory('');
    setVisibility('public');
    onClose();
  };

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      title="Create workflow"
      icon={PublicRoundedIcon}
      primaryLabel={
        creating ? 'Creating...' : isDuplicate ? `Create as "${suggestedName}"` : 'Create'
      }
      onPrimary={handleCreate}
      primaryDisabled={creating}
      primaryLoading={creating}
    >
      <TextField
        autoFocus
        margin="dense"
        label="Workflow name"
        fullWidth
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        error={isDuplicate}
        sx={FORM_FIELD_SX}
      />
      <Autocomplete
        freeSolo
        options={existingCategories}
        value={category}
        onInputChange={(e, value) => setCategory(value || '')}
        onChange={(e, newVal) => setCategory((newVal && String(newVal).trim()) || '')}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Category"
            placeholder="Select or type a category"
            margin="dense"
            fullWidth
          />
        )}
        sx={{ mt: 0.5 }}
      />
      {/* Visibility toggle */}
      <Box sx={{ mt: 2 }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: 'text.secondary', mb: 0.5, display: 'block' }}
        >
          Visibility
        </Typography>
        <ToggleButtonGroup
          value={visibility}
          exclusive
          onChange={(e, val) => {
            if (val) setVisibility(val);
          }}
          size="small"
          fullWidth
          sx={{
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              borderRadius: 2,
            },
          }}
        >
          <ToggleButton
            value="public"
            sx={{
              gap: 0.5,
              color: visibility === 'public' ? 'text.primary' : 'text.secondary',
              bgcolor:
                visibility === 'public' ? alpha(theme.palette.info.main, 0.08) : 'transparent',
              borderColor:
                visibility === 'public' ? alpha(theme.palette.info.main, 0.3) : undefined,
            }}
          >
            <AppIcon name="PublicRounded" fallback={PublicRoundedIcon} sx={{ fontSize: 16 }} />
            Public
          </ToggleButton>
          <ToggleButton
            value="private"
            sx={{
              gap: 0.5,
              color: visibility === 'private' ? 'warning.main' : 'text.secondary',
              bgcolor:
                visibility === 'private' ? alpha(theme.palette.warning.main, 0.08) : 'transparent',
              borderColor:
                visibility === 'private' ? alpha(theme.palette.warning.main, 0.3) : undefined,
            }}
          >
            <AppIcon name="LockOutlined" fallback={LockOutlinedIcon} sx={{ fontSize: 16 }} />
            Private
          </ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {visibility === 'private'
            ? 'Only you will see this workflow.'
            : 'Visible to all team members.'}
        </Typography>
      </Box>
      {isDuplicate && (
        <Alert severity="warning" sx={{ mt: 1.5, borderRadius: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            A workflow named "{trimmed}" already exists.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            It will be automatically renamed to <strong>{suggestedName}</strong>
          </Typography>
        </Alert>
      )}
    </FormDialog>
  );
}
