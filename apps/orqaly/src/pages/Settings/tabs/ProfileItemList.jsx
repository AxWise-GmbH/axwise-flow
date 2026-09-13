import {
  Box,
  Button,
  Checkbox,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Tooltip,
  alpha,
  useTheme,
} from '@mui/material';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AppIcon from '../../../components/icons/AppIcon';
import EmptyState from '../../../components/Common/EmptyState';

/**
 * The list behind Profile > Notes and Profile > Todo list: a composer row, then
 * the rows themselves with inline edit, archive and delete.
 *
 * These were two copies of the same 130 lines in Settings.jsx, identical down
 * to the `opacity: 0.55` on the hover actions; the only real differences are
 * the checkbox a task carries and the words on screen. Everything a caller
 * needs to differ about is a prop, so the next thing that wants a small
 * editable list does not become a third copy.
 */

const MAX_LIST_H = 260;

export default function ProfileItemList({
  items = [],
  itemLabel,
  addPlaceholder,
  addIcon,
  addIconName,
  emptyTitle,
  emptyDescription,
  draft = '',
  onDraftChange,
  onAdd,
  onOpenArchive,
  archiveTooltip,
  editingId = null,
  editingText = '',
  onEditingTextChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onArchive,
  onDelete,
  onOpen,
  withCheckbox = false,
  onToggle,
  format = (item) => item.text,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const rowActions = (item) =>
    editingId === item.id ? (
      <Stack direction="row" spacing={0} onClick={(e) => e.stopPropagation()}>
        <Tooltip title="Save">
          <IconButton size="small" onClick={onSaveEdit} aria-label="Save">
            <AppIcon name="Check" fallback={CheckIcon} sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Cancel">
          <IconButton size="small" onClick={onCancelEdit} aria-label="Cancel">
            <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Stack>
    ) : (
      <Stack
        direction="row"
        spacing={0}
        onClick={(e) => e.stopPropagation()}
        sx={{
          opacity: 0.55,
          transition: 'opacity 0.15s ease',
          '.MuiListItem-root:hover &': { opacity: 1 },
        }}
      >
        <Tooltip title="Edit">
          <IconButton size="small" onClick={() => onStartEdit?.(item)} aria-label="Edit">
            <AppIcon name="EditOutlined" fallback={EditOutlinedIcon} sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Archive">
          <IconButton size="small" onClick={() => onArchive?.(item)} aria-label="Archive">
            <AppIcon name="ArchiveOutlined" fallback={ArchiveOutlinedIcon} sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton size="small" onClick={() => onDelete?.(item)} aria-label="Delete">
            <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 18, color: 'error.main' }} />
          </IconButton>
        </Tooltip>
      </Stack>
    );

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          p: 1.25,
          borderRadius: 2.5,
          mb: 1.5,
          bgcolor: isDark ? alpha(theme.palette.background.default, 0.4) : 'grey.50',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title={archiveTooltip}>
            <IconButton
              onClick={onOpenArchive}
              aria-label="Archive"
              sx={{ flexShrink: 0, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
            >
              <AppIcon
                name="ArchiveOutlined"
                fallback={ArchiveOutlinedIcon}
                sx={{ fontSize: 18 }}
              />
            </IconButton>
          </Tooltip>
          <TextField
            size="small"
            placeholder={addPlaceholder}
            value={draft}
            onChange={(e) => onDraftChange?.(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAdd?.()}
            fullWidth
            variant="outlined"
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'background.paper' },
            }}
          />
          <Button
            variant="contained"
            size="small"
            onClick={onAdd}
            disabled={!draft.trim()}
            startIcon={<AppIcon name={addIconName} fallback={addIcon} sx={{ fontSize: 18 }} />}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              flexShrink: 0,
              boxShadow: 'none',
            }}
          >
            Add
          </Button>
        </Stack>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          borderRadius: 2.5,
          overflow: 'hidden',
          bgcolor: isDark ? alpha(theme.palette.background.paper, 0.5) : 'background.paper',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ maxHeight: MAX_LIST_H, overflow: 'auto' }}>
          {items.length === 0 ? (
            <EmptyState
              icon={addIcon}
              title={emptyTitle}
              description={emptyDescription}
              sx={{ py: 4 }}
            />
          ) : (
            <List dense disablePadding aria-label={itemLabel}>
              {items.map((item, idx) => {
                const editing = editingId === item.id;
                return (
                  <ListItem
                    key={item.id}
                    disablePadding={withCheckbox}
                    secondaryAction={rowActions(item)}
                    sx={{
                      py: 0.875,
                      px: 1.5,
                      alignItems: withCheckbox ? 'flex-start' : undefined,
                      cursor: editing ? 'default' : 'pointer',
                      borderTop: idx === 0 ? 'none' : '1px solid',
                      borderColor: 'divider',
                      '&:hover': editing
                        ? {}
                        : { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                    }}
                    onClick={editing ? undefined : () => onOpen?.(item)}
                  >
                    {withCheckbox && (
                      <Checkbox
                        size="small"
                        checked={!!item.done}
                        onChange={(e) => {
                          e.stopPropagation();
                          onToggle?.(item.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        inputProps={{ 'aria-label': `Toggle ${item.text}` }}
                        sx={{ py: 0.25, pr: 0.5, mt: 0.25 }}
                      />
                    )}
                    <Box
                      sx={{ flex: 1, minWidth: 0 }}
                      onClick={(e) => editing && e.stopPropagation()}
                    >
                      {editing ? (
                        <TextField
                          size="small"
                          value={editingText}
                          onChange={(e) => onEditingTextChange?.(e.target.value)}
                          fullWidth
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          inputProps={{ 'aria-label': 'Edit text' }}
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                        />
                      ) : (
                        <ListItemText
                          primary={format(item)}
                          primaryTypographyProps={{
                            variant: 'body2',
                            sx:
                              withCheckbox && item.done
                                ? { textDecoration: 'line-through', color: 'text.secondary' }
                                : {},
                          }}
                        />
                      )}
                    </Box>
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>
      </Paper>
    </>
  );
}
