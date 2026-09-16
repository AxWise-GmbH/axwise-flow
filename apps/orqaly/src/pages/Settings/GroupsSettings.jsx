import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  TextField,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import EmptyState from '../../components/Common/EmptyState';
import {
  listShareGroups,
  createShareGroup,
  deleteShareGroup,
  addGroupMember,
} from '../../services/dashboardService';

import AppIcon from '../../components/icons/AppIcon';

export default function GroupsSettings() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [owned, setOwned] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const [addMemberFor, setAddMemberFor] = useState(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('viewer');
  const [memberAdding, setMemberAdding] = useState(false);
  const [memberError, setMemberError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listShareGroups();
      setOwned(data.owned || []);
      setMemberships(data.memberships || []);
    } catch (err) {
      setError(err.message || 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const g = await createShareGroup({ name });
      setOwned((prev) => [...prev, { ...g, member_count: 0 }]);
      setCreateOpen(false);
      setNewName('');
    } catch (err) {
      setError(err.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteGroup = async (id) => {
    if (!window.confirm('Delete this group? Members lose access to dashboards shared via it.')) {
      return;
    }
    try {
      await deleteShareGroup(id);
      setOwned((prev) => prev.filter((g) => g.id !== id));
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  const handleAddMember = async () => {
    if (!addMemberFor) return;
    const email = memberEmail.trim();
    if (!email) {
      setMemberError('Email is required');
      return;
    }
    setMemberAdding(true);
    setMemberError('');
    try {
      await addGroupMember(addMemberFor.id, { user_email: email, role: memberRole });
      setOwned((prev) =>
        prev.map((g) =>
          g.id === addMemberFor.id ? { ...g, member_count: (g.member_count || 0) + 1 } : g
        )
      );
      setAddMemberFor(null);
      setMemberEmail('');
      setMemberRole('viewer');
    } catch (err) {
      setMemberError(err.message || 'Failed to add member');
    } finally {
      setMemberAdding(false);
    }
  };

  return (
    <PageLayout
      title="Share groups"
      subtitle="Collect people you collaborate with - then share dashboards with whole groups instead of individuals."
    >
      <BentoCard
        title="Your groups"
        subtitle={`${owned.length} owned · ${memberships.length} memberships`}
        icon={GroupIcon}
        iconColor={theme.palette.secondary.main}
        action={
          <Button
            size="small"
            variant="contained"
            startIcon={!isMobile ? <AppIcon name="Add" fallback={AddIcon} /> : null}
            onClick={() => setCreateOpen(true)}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            {isMobile ? <AppIcon name="Add" fallback={AddIcon} fontSize="small" /> : 'New group'}
          </Button>
        }
      >
        {loading ? (
          <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        ) : error ? (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.error.main, 0.06),
              border: `1px solid ${alpha(theme.palette.error.main, 0.25)}`,
            }}
          >
            <Typography variant="caption" color="error.main" sx={{ fontWeight: 600 }}>
              {error}
            </Typography>
          </Box>
        ) : owned.length === 0 && memberships.length === 0 ? (
          <EmptyState
            icon={GroupIcon}
            title="No groups yet"
            description="Create a group to share dashboards with your team."
            actionLabel="Create your first group"
            onAction={() => setCreateOpen(true)}
          />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {owned.length > 0 && (
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                    color: 'text.secondary',
                    fontSize: '0.65rem',
                    display: 'block',
                    mb: 0.75,
                  }}
                >
                  Owned by you
                </Typography>
                <List dense disablePadding>
                  {owned.map((g) => (
                    <ListItem
                      key={g.id}
                      disableGutters
                      sx={{
                        py: 1,
                        px: 1.25,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
                        mb: 0.75,
                      }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              {g.name}
                            </Typography>
                            <Chip
                              size="small"
                              label={`${g.member_count || 0} members`}
                              sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                          </Box>
                        }
                        secondary={g.description || 'No description'}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                      <ListItemSecondaryAction sx={{ position: 'static', transform: 'none' }}>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <IconButton
                            size="small"
                            onClick={() => setAddMemberFor(g)}
                            aria-label="add member"
                          >
                            <AppIcon name="PersonAdd" fallback={PersonAddIcon} fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteGroup(g.id)}
                            aria-label="delete group"
                            sx={{ color: 'error.main' }}
                          >
                            <AppIcon
                              name="DeleteOutline"
                              fallback={DeleteOutlineIcon}
                              fontSize="small"
                            />
                          </IconButton>
                        </Box>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}

            {memberships.length > 0 && (
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                    color: 'text.secondary',
                    fontSize: '0.65rem',
                    display: 'block',
                    mb: 0.75,
                  }}
                >
                  You're a member of
                </Typography>
                <List dense disablePadding>
                  {memberships.map((m) => (
                    <ListItem
                      key={m.group_id}
                      disableGutters
                      sx={{
                        py: 1,
                        px: 1.25,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        mb: 0.75,
                      }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              {m.name || m.group_id}
                            </Typography>
                            <Chip
                              size="small"
                              label={m.role}
                              color={m.role === 'editor' ? 'secondary' : 'default'}
                              sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                          </Box>
                        }
                        secondary="Read-only - only the group owner can manage members."
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        )}
      </BentoCard>
      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3, m: { xs: 1, sm: 4 } } }}
      >
        <DialogTitle sx={{ fontWeight: 700, borderBottom: 1, borderColor: 'divider' }}>
          New share group
        </DialogTitle>
        <DialogContent sx={{ pt: 2, px: { xs: 1.75, sm: 3 } }}>
          <TextField
            autoFocus
            label="Group name"
            size="small"
            fullWidth
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            sx={{ mt: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            helperText="e.g. Analytics team, Investors, Leadership"
          />
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider', gap: 1 }}>
          <Button onClick={() => setCreateOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={creating || !newName.trim()}
            onClick={handleCreate}
            sx={{ textTransform: 'none', fontWeight: 600 }}
            startIcon={
              creating ? <CircularProgress size={14} /> : <AppIcon name="Add" fallback={AddIcon} />
            }
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
      {/* Add member dialog */}
      <Dialog
        open={Boolean(addMemberFor)}
        onClose={() => setAddMemberFor(null)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3, m: { xs: 1, sm: 4 } } }}
      >
        <DialogTitle sx={{ fontWeight: 700, borderBottom: 1, borderColor: 'divider' }}>
          Add member to "{addMemberFor?.name}"
        </DialogTitle>
        <DialogContent sx={{ pt: 2, px: { xs: 1.75, sm: 3 } }}>
          <TextField
            autoFocus
            label="Member email"
            size="small"
            fullWidth
            value={memberEmail}
            onChange={(e) => setMemberEmail(e.target.value)}
            sx={{ mt: 1, mb: 1.5 }}
            error={Boolean(memberError)}
            helperText={memberError || 'They need to already have an account.'}
          />
          <TextField
            select
            label="Role"
            size="small"
            fullWidth
            value={memberRole}
            onChange={(e) => setMemberRole(e.target.value)}
            SelectProps={{ native: true }}
          >
            <option value="viewer">Viewer (read-only)</option>
            <option value="editor">Editor (can change dashboards shared with this group)</option>
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider', gap: 1 }}>
          <Button onClick={() => setAddMemberFor(null)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={memberAdding || !memberEmail.trim()}
            onClick={handleAddMember}
            startIcon={
              memberAdding ? (
                <CircularProgress size={14} />
              ) : (
                <AppIcon name="PersonAdd" fallback={PersonAddIcon} />
              )
            }
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Add member
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}
