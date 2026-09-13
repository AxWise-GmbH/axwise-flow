/**
 * TeamPanel — Team management UI with member listing.
 */
import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import FormDialog from '../Common/FormDialog';
import EmptyState from '../Common/EmptyState';
import { useConciliumTeams } from '../../hooks/useConciliumTeams';

import AppIcon from '../icons/AppIcon';

export default function TeamPanel({ theme, isDark }) {
  const [search, setSearch] = useState('');
  const { teams, loading, addTeam, editTeam, removeTeam } = useConciliumTeams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return teams;
    const q = search.toLowerCase();
    return teams.filter(
      (t) =>
        (t.name || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
    );
  }, [teams, search]);

  const openCreate = () => {
    setEditingTeam(null);
    setForm({ name: '', description: '' });
    setDialogOpen(true);
  };
  const openEdit = (t) => {
    setEditingTeam(t);
    setForm({ name: t.name || '', description: t.description || '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      if (editingTeam) {
        await editTeam(editingTeam.id, form);
      } else {
        await addTeam(form);
      }
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await removeTeam(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 1, sm: 1.5 },
          mb: 2,
          flexWrap: 'wrap',
        }}
      >
        <TextField
          size="small"
          placeholder="Search teams..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <AppIcon name="SearchOutlined" fallback={SearchIcon} sx={{ fontSize: 18 }} />
              </InputAdornment>
            ),
          }}
          sx={{
            minWidth: { xs: 0 },
            flex: { xs: 1, sm: 'none' },
            width: { sm: 250 },
            '& .MuiOutlinedInput-root': { borderRadius: 2 },
          }}
        />
        <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />
        <Button
          variant="outlined"
          size="small"
          startIcon={<AppIcon name="Add" fallback={AddIcon} />}
          onClick={openCreate}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            width: { xs: '100%', sm: 'auto' },
          }}
        >
          New Team
        </Button>
      </Box>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Diversity3OutlinedIcon}
          title="No teams"
          description="Create a team to organize board members."
          actionLabel="New Team"
          onAction={openCreate}
        />
      ) : (
        <TableContainer sx={{ maxHeight: 'calc(100vh - 420px)', overflowX: 'auto' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Active</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {t.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {t.description || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={t.isActive ? 'Active' : 'Inactive'}
                      size="small"
                      color={t.isActive ? 'success' : 'default'}
                      sx={{ height: 20, fontWeight: 600, fontSize: '0.6rem' }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(t)}>
                          <AppIcon
                            name="EditOutlined"
                            fallback={EditOutlinedIcon}
                            sx={{ fontSize: 18 }}
                          />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => setDeleteConfirm(t)} color="error">
                          <AppIcon
                            name="DeleteOutline"
                            fallback={DeleteOutlineIcon}
                            sx={{ fontSize: 18 }}
                          />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {/* Create/Edit Dialog */}
      <FormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingTeam ? 'Edit Team' : 'New Team'}
        icon={Diversity3OutlinedIcon}
        maxWidth="xs"
        primaryLabel="Save"
        onPrimary={handleSave}
        primaryDisabled={!form.name.trim() || saving}
        primaryLoading={saving}
      >
        <TextField
          fullWidth
          size="small"
          label="Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <TextField
          fullWidth
          size="small"
          label="Description"
          multiline
          rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      </FormDialog>
      {/* Delete Confirmation */}
      <FormDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Team?"
        icon={DeleteOutlineIcon}
        iconVariant="error"
        maxWidth="xs"
        actions={
          <>
            <Button onClick={() => setDeleteConfirm(null)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDelete}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Delete
            </Button>
          </>
        }
      >
        <Typography variant="body2">
          Delete &quot;{deleteConfirm?.name}&quot;? This cannot be undone.
        </Typography>
      </FormDialog>
    </Box>
  );
}
