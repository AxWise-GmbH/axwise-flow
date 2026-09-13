/**
 * SkillEditorDialog — Edit a skill's .md content with live char count and dirty tracking.
 */
import { useState, useEffect } from 'react';
import { Button, TextField, Typography, Box, Chip, alpha, useTheme } from '@mui/material';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import RestoreOutlinedIcon from '@mui/icons-material/RestoreOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';

import AppIcon from '../icons/AppIcon';

export default function SkillEditorDialog({ open, onClose, skill, onSave, onReset }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const originalContent = skill?.agent_skill_packs?.content || skill?.content || '';
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);

  // Determine if the skill has been customized (has custom_content different from original)
  const isCustomized = skill?.custom_content != null && skill.custom_content !== originalContent;

  useEffect(() => {
    if (open && skill) {
      const initial = skill.custom_content ?? originalContent;
      setContent(initial);
      setDirty(false);
    }
  }, [open, skill, originalContent]);

  const handleChange = (e) => {
    const val = e.target.value;
    setContent(val);
    const initial = skill?.custom_content ?? originalContent;
    setDirty(val !== initial);
  };

  const handleSave = () => {
    if (onSave) onSave(content);
    setDirty(false);
  };

  const handleReset = () => {
    setContent(originalContent);
    setDirty(originalContent !== (skill?.custom_content ?? originalContent));
    if (onReset) onReset();
  };

  const skillName = skill?.agent_skill_packs?.name || skill?.name || 'Skill';

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      title={`Edit: ${skillName}`}
      icon={AutoFixHighOutlinedIcon}
      titleAdornment={
        isCustomized ? (
          <Typography
            variant="caption"
            sx={{
              px: 1,
              py: 0.25,
              borderRadius: 1,
              ml: 1,
              bgcolor: alpha(theme.palette.warning.main, 0.12),
              color: theme.palette.warning.main,
              fontWeight: 600,
            }}
          >
            Customized
          </Typography>
        ) : null
      }
      actions={
        <>
          <Button
            onClick={handleReset}
            startIcon={<AppIcon name="RestoreOutlined" fallback={RestoreOutlinedIcon} />}
            color="warning"
            disabled={content === originalContent}
          >
            Reset to Original
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!dirty}
            startIcon={<AppIcon name="SaveOutlined" fallback={SaveOutlinedIcon} />}
          >
            Save Changes
          </Button>
        </>
      }
    >
      <TextField
        fullWidth
        multiline
        rows={18}
        value={content}
        onChange={handleChange}
        placeholder="Write skill content in markdown..."
        slotProps={{
          input: {
            sx: {
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              fontSize: '0.85rem',
              lineHeight: 1.7,
              bgcolor: isDark ? 'grey.900' : 'grey.50',
            },
          },
        }}
        sx={{ mt: 1 }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {content.length.toLocaleString()} characters
        </Typography>
        {dirty && (
          <Typography variant="caption" sx={{ color: theme.palette.warning.main, fontWeight: 600 }}>
            Unsaved changes
          </Typography>
        )}
      </Box>
    </FormDialog>
  );
}
