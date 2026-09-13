import { Alert, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import ProfileItemList from './ProfileItemList';

/**
 * Profile, as the three things it actually is: who you are, your notes, your
 * tasks. They used to be one slab - account fields and both lists stacked in a
 * single card behind a pill switch - so nothing in it had any weight.
 *
 * Returns the `sectionBody` map `SettingsTabPanel` renders, keyed by block, in
 * the same shape the Goal setup drawer uses for its four decisions.
 */
export default function useProfileTabBodies({
  profileDataError,
  onDismissProfileError,
  profileDataLoading,
  displayName,
  onDisplayNameChange,
  email,
  telegram,
  onTelegramChange,
  notes,
  todos,
  openNotesArchive,
  openTodosArchive,
  format,
  noteList,
  todoList,
}) {
  return {
    account: (
      <Stack spacing={2}>
        {profileDataError && (
          <Alert severity="error" onClose={onDismissProfileError} sx={{ borderRadius: 2 }}>
            {profileDataError}
          </Alert>
        )}
        {profileDataLoading && notes.length === 0 && todos.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Loading notes and tasks…
          </Typography>
        )}
        <TextField
          label="Display name"
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          size="small"
          fullWidth
        />
        <TextField label="Email" value={email} size="small" fullWidth disabled />
        <TextField
          label="Telegram"
          placeholder="@username"
          value={telegram}
          onChange={(e) => onTelegramChange(e.target.value)}
          size="small"
          fullWidth
          InputProps={{
            startAdornment:
              telegram && !telegram.startsWith('@') ? (
                <InputAdornment position="start">@</InputAdornment>
              ) : null,
          }}
        />
      </Stack>
    ),

    notes: (
      <ProfileItemList
        items={notes}
        itemLabel="Notes"
        addPlaceholder="Add a note…"
        addIcon={NoteAddOutlinedIcon}
        addIconName="NoteAddOutlined"
        emptyTitle="No notes yet"
        emptyDescription="Add a note above to get started"
        archiveTooltip="View archived notes"
        onOpenArchive={openNotesArchive}
        format={format}
        {...noteList}
      />
    ),

    todo: (
      <ProfileItemList
        items={todos}
        itemLabel="Todo list"
        addPlaceholder="Add a task…"
        addIcon={PlaylistAddCheckIcon}
        addIconName="PlaylistAddCheck"
        emptyTitle="No tasks yet"
        emptyDescription="Add a task above to get started"
        archiveTooltip="View archived tasks"
        onOpenArchive={openTodosArchive}
        format={format}
        withCheckbox
        {...todoList}
      />
    ),
  };
}
