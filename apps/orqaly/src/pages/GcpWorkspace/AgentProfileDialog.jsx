import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { AGENT_AVATAR_OPTIONS, AGENT_COLOR_OPTIONS, AgentAvatar } from './AgentAvatar.jsx';

const DEFAULT_PROFILE = Object.freeze({
  displayName: '',
  roleLabel: '',
  description: '',
  instructions: '',
  avatar: Object.freeze({ kind: 'icon', value: 'smart_toy', color: '#6750A4' }),
});

function initialProfile(agent) {
  if (!agent) return { ...DEFAULT_PROFILE, avatar: { ...DEFAULT_PROFILE.avatar } };
  return {
    displayName: agent.name || '',
    roleLabel: agent.role || '',
    description: agent.description || '',
    instructions: agent.instructions || '',
    avatar: { ...DEFAULT_PROFILE.avatar, ...(agent.avatar || {}) },
  };
}

function profilePayload(profile) {
  return {
    version: 'orqaly_agent_profile_input_v1',
    displayName: profile.displayName.trim(),
    roleLabel: profile.roleLabel.trim(),
    description: profile.description.trim(),
    instructions: profile.instructions.trim(),
    avatar: {
      kind: profile.avatar.kind,
      value: profile.avatar.value.trim(),
      color: profile.avatar.color.toUpperCase(),
    },
  };
}

export function AgentProfileDialog({
  open,
  agent = null,
  busy = false,
  error = null,
  onClose,
  onSave,
}) {
  const [profile, setProfile] = useState(() => initialProfile(agent));

  const valid = useMemo(
    () =>
      profile.displayName.trim().length > 0 &&
      profile.roleLabel.trim().length > 0 &&
      profile.avatar.value.trim().length > 0,
    [profile]
  );
  const setField = (field) => (event) =>
    setProfile((current) => ({ ...current, [field]: event.target.value }));
  const setAvatar = (patch) =>
    setProfile((current) => ({ ...current, avatar: { ...current.avatar, ...patch } }));

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{agent ? 'Edit Agent profile' : 'Create an Agent'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.25}>
          <Stack direction="row" alignItems="center" gap={1.5}>
            <AgentAvatar avatar={profile.avatar} name={profile.displayName || 'Agent'} size={52} />
            <Box>
              <Typography variant="subtitle1">{profile.displayName || 'Your Agent'}</Typography>
              <Typography variant="body2" color="text.secondary">
                {profile.roleLabel || 'Give this Agent a clear working role'}
              </Typography>
            </Box>
          </Stack>

          {error ? (
            <Alert severity="error">{error.message || 'The Agent could not be saved.'}</Alert>
          ) : null}

          <TextField
            required
            label="Name"
            value={profile.displayName}
            inputProps={{ maxLength: 160 }}
            onChange={setField('displayName')}
            helperText="A stable identity you can reuse across tasks."
          />
          <TextField
            required
            label="Role"
            value={profile.roleLabel}
            inputProps={{ maxLength: 160 }}
            onChange={setField('roleLabel')}
            placeholder="For example: B2B operations lead"
          />
          <TextField
            label="What this Agent is for"
            multiline
            minRows={2}
            maxRows={4}
            value={profile.description}
            inputProps={{ maxLength: 2_000 }}
            onChange={setField('description')}
            placeholder="Describe the outcomes this Agent owns."
          />
          <TextField
            label="Working instructions"
            multiline
            minRows={4}
            maxRows={9}
            value={profile.instructions}
            inputProps={{ maxLength: 12_000 }}
            onChange={setField('instructions')}
            helperText="These instructions are versioned. Every run keeps the exact profile it started with."
          />

          <FormControl>
            <FormLabel>Avatar type</FormLabel>
            <RadioGroup
              row
              value={profile.avatar.kind}
              onChange={(event) =>
                setAvatar({
                  kind: event.target.value,
                  value: event.target.value === 'emoji' ? '🤖' : 'smart_toy',
                })
              }
            >
              <FormControlLabel value="icon" control={<Radio />} label="Icon" />
              <FormControlLabel value="emoji" control={<Radio />} label="Emoji" />
            </RadioGroup>
          </FormControl>
          {profile.avatar.kind === 'icon' ? (
            <TextField
              select
              label="Icon"
              value={profile.avatar.value}
              onChange={(event) => setAvatar({ value: event.target.value })}
            >
              {AGENT_AVATAR_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              label="Emoji"
              value={profile.avatar.value}
              inputProps={{ maxLength: 16 }}
              onChange={(event) => setAvatar({ value: event.target.value })}
            />
          )}
          <FormControl>
            <FormLabel>Color</FormLabel>
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
              {AGENT_COLOR_OPTIONS.map((color) => (
                <Button
                  key={color}
                  type="button"
                  aria-label={`Use ${color}`}
                  aria-pressed={profile.avatar.color === color}
                  onClick={() => setAvatar({ color })}
                  sx={{
                    minWidth: 36,
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    bgcolor: color,
                    border: '3px solid',
                    borderColor: profile.avatar.color === color ? 'text.primary' : 'transparent',
                    '&:hover': { bgcolor: color },
                  }}
                />
              ))}
            </Stack>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!valid || busy}
          onClick={() => onSave(profilePayload(profile))}
        >
          {busy ? 'Saving…' : agent ? 'Save new version' : 'Create Agent'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
