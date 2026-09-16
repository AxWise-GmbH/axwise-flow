import { useState, useEffect } from 'react';
import {
  Popover,
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  TextField,
  InputAdornment,
  IconButton,
  Checkbox,
  Button,
  Divider,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import AppIcon from '../../../components/icons/AppIcon';

/**
 * Reusable edit popover for table cells.
 *
 * mode="select"  - renders a list of options to pick from (saves on click)
 * mode="multiselect" - renders checkboxes with explicit save action
 * mode="selectCreate" - pick existing option or create a new one
 * mode="text"    - renders a text input (saves on Enter or check button)
 */
export default function EditPopover({
  anchorEl,
  open,
  onClose,
  title,
  mode = 'select',
  // select mode props
  options = [], // [{ value, label, color?, bg? }]
  currentValue,
  currentValues = [],
  // text mode props
  textValue = '',
  textPlaceholder = '',
  // callback
  onSave,
}) {
  const [inputValue, setInputValue] = useState(textValue);
  const [selectedValues, setSelectedValues] = useState(currentValues);

  // Sync local state when the popover transitions from closed to open
  const [prevOpen, setPrevOpen] = useState(false);
  useEffect(() => {
    if (open && !prevOpen) {
      setInputValue(textValue);
      setSelectedValues(currentValues);
    }
    setPrevOpen(open);
  }, [open, prevOpen, textValue, currentValues]);

  const handleSelectOption = (value) => {
    if (value !== currentValue) {
      onSave(value);
    }
    onClose();
  };

  const handleTextSave = () => {
    const trimmed = inputValue.trim();
    if (trimmed && trimmed !== textValue) {
      onSave(trimmed);
    }
    onClose();
  };

  // Reset input when popover opens with new value (backup for transition)
  const handleEnter = () => {
    setInputValue(textValue);
    setSelectedValues(currentValues);
  };

  const toggleValue = (value) => {
    setSelectedValues((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleMultiSave = () => {
    // Skip save if selection hasn't actually changed
    const prev = [...currentValues].sort();
    const next = [...selectedValues].sort();
    if (prev.length === next.length && prev.every((v, i) => v === next[i])) {
      onClose();
      return;
    }
    onSave(selectedValues);
    onClose();
  };

  const handleCreateSave = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onSave(trimmed);
    onClose();
  };

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      TransitionProps={{ onEnter: handleEnter }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            border: '1px solid',
            borderColor: 'divider',
            minWidth: 200,
            maxWidth: 280,
            mt: 0.5,
          },
        },
      }}
    >
      {/* Header */}
      <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'text.secondary',
            fontSize: '0.65rem',
          }}
        >
          {title}
        </Typography>
      </Box>
      {/* Select mode */}
      {mode === 'select' && (
        <List dense sx={{ px: 0.5, pb: 0.5 }}>
          {options.map((opt) => {
            const isSelected = opt.value === currentValue;
            return (
              <ListItemButton
                key={opt.value}
                onClick={() => handleSelectOption(opt.value)}
                sx={{
                  borderRadius: 1.5,
                  mx: 0.5,
                  py: 0.8,
                  px: 1.5,
                  mb: 0.3,
                  bgcolor: isSelected ? 'rgba(59,130,246,0.06)' : 'transparent',
                  '&:hover': {
                    bgcolor: isSelected ? 'rgba(59,130,246,0.1)' : 'action.hover',
                  },
                }}
              >
                {opt.bg && (
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: opt.color || opt.bg,
                      }}
                    />
                  </ListItemIcon>
                )}
                <ListItemText
                  primary={opt.label}
                  primaryTypographyProps={{
                    fontSize: '0.82rem',
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? 'primary.main' : 'text.primary',
                  }}
                />
                {isSelected && (
                  <AppIcon
                    name="CheckCircle"
                    fallback={CheckCircleIcon}
                    sx={{ fontSize: 16, color: 'primary.main', ml: 1 }}
                  />
                )}
              </ListItemButton>
            );
          })}
        </List>
      )}
      {/* Multi-select mode */}
      {mode === 'multiselect' && (
        <Box sx={{ px: 0.5, pb: 1 }}>
          <List dense sx={{ maxHeight: 220, overflow: 'auto' }}>
            {options.map((opt) => {
              const isSelected = selectedValues.includes(opt.value);
              return (
                <ListItemButton
                  key={opt.value}
                  onClick={() => toggleValue(opt.value)}
                  sx={{
                    borderRadius: 1.5,
                    mx: 0.5,
                    py: 0.6,
                    px: 1,
                    mb: 0.3,
                    bgcolor: isSelected ? 'rgba(59,130,246,0.06)' : 'transparent',
                    '&:hover': {
                      bgcolor: isSelected ? 'rgba(59,130,246,0.1)' : 'action.hover',
                    },
                  }}
                >
                  <Checkbox size="small" checked={isSelected} sx={{ p: 0.4, mr: 0.8 }} />
                  <ListItemText
                    primary={opt.label}
                    primaryTypographyProps={{
                      fontSize: '0.82rem',
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? 'primary.main' : 'text.primary',
                    }}
                  />
                </ListItemButton>
              );
            })}
          </List>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1, pt: 0.6 }}>
            <Button
              size="small"
              variant="contained"
              onClick={handleMultiSave}
              disabled={selectedValues.length === 0}
            >
              Save
            </Button>
          </Box>
        </Box>
      )}
      {/* Select + create mode */}
      {mode === 'selectCreate' && (
        <Box sx={{ px: 0.5, pb: 1 }}>
          <List dense sx={{ maxHeight: 180, overflow: 'auto' }}>
            {options.map((opt) => {
              const isSelected = opt.value === currentValue;
              return (
                <ListItemButton
                  key={opt.value}
                  onClick={() => handleSelectOption(opt.value)}
                  sx={{
                    borderRadius: 1.5,
                    mx: 0.5,
                    py: 0.8,
                    px: 1.5,
                    mb: 0.3,
                    bgcolor: isSelected ? 'rgba(59,130,246,0.06)' : 'transparent',
                    '&:hover': {
                      bgcolor: isSelected ? 'rgba(59,130,246,0.1)' : 'action.hover',
                    },
                  }}
                >
                  <ListItemText
                    primary={opt.label}
                    primaryTypographyProps={{
                      fontSize: '0.82rem',
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? 'primary.main' : 'text.primary',
                    }}
                  />
                  {isSelected && (
                    <AppIcon
                      name="CheckCircle"
                      fallback={CheckCircleIcon}
                      sx={{ fontSize: 16, color: 'primary.main', ml: 1 }}
                    />
                  )}
                </ListItemButton>
              );
            })}
          </List>

          <Divider sx={{ my: 1 }} />

          <Box sx={{ px: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Create new
            </Typography>
            <TextField
              size="small"
              fullWidth
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateSave();
                if (e.key === 'Escape') onClose();
              }}
              placeholder={textPlaceholder}
              sx={{ mt: 0.5, '& .MuiInputBase-root': { fontSize: '0.85rem' } }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.8 }}>
              <Button
                size="small"
                variant="contained"
                onClick={handleCreateSave}
                disabled={!inputValue.trim()}
              >
                Save new
              </Button>
            </Box>
          </Box>
        </Box>
      )}
      {/* Text mode */}
      {mode === 'text' && (
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          <TextField
            size="small"
            fullWidth
            autoFocus
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTextSave();
              if (e.key === 'Escape') onClose();
            }}
            placeholder={textPlaceholder}
            sx={{ '& .MuiInputBase-root': { fontSize: '0.85rem' } }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={handleTextSave}
                    disabled={!inputValue.trim() || inputValue.trim() === textValue}
                    sx={{ color: 'primary.main' }}
                  >
                    <AppIcon name="Check" fallback={CheckIcon} fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Box>
      )}
    </Popover>
  );
}
