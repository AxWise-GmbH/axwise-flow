import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  Alert,
  TextField,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Tooltip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import BentoCard from '../../../components/Common/BentoCard';
import AppIcon from '../../../components/icons/AppIcon';
import DocCodeBlock from '../components/DocCodeBlock';
import DocCallout from '../components/DocCallout';
import { PAGE_DEFINITIONS } from '../../../services/rolesPermissionsService';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  activateApiKey,
  deleteApiKey,
  updateApiKey,
} from '../../../services/apiKeyService';

const STATUS_CONFIG = {
  active: { label: 'Active', color: 'success' },
  revoked: { label: 'Revoked', color: 'error' },
};

const USAGE_SNIPPET = `# Example header (only if API keys are enforced server-side)
curl -X GET https://app.orqaly.com/api/ops?path=reports \\
  -H "x-api-key: orch_xxxx_xxxx_xxxx_xxxx"`;

export default function ApiKeysSection({ userId }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const p = theme.palette;
  const keyColor = p.warning?.main || p.primary.main;

  const headerCellSx = {
    fontWeight: 700,
    fontSize: '0.72rem',
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    bgcolor: isDark ? alpha(p.background.default, 0.8) : 'action.hover',
    borderBottom: '1px solid',
    borderColor: 'divider',
    py: 1,
  };

  const [keys, setKeys] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [newPermissions, setNewPermissions] = useState([]);
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editPerms, setEditPerms] = useState([]);
  const [editLabel, setEditLabel] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const refreshKeys = useCallback(() => {
    setKeys(listApiKeys(userId));
  }, [userId]);

  useEffect(() => {
    refreshKeys();
  }, [refreshKeys]);

  const pageOptions = useMemo(() => PAGE_DEFINITIONS.map((pg) => ({ id: pg.id, label: pg.label })), []);

  const handleCreate = () => {
    if (!newLabel.trim()) {
      setMessage({ type: 'error', text: 'Please enter a label for the API key.' });
      return;
    }
    setCreating(true);
    try {
      const { plainKey } = createApiKey(userId, newLabel, newPermissions);
      setCreatedKey(plainKey);
      setNewLabel('');
      setNewPermissions([]);
      setShowCreateForm(false);
      refreshKeys();
      setMessage({ type: 'success', text: "API key created. Copy the key below - it won't be shown again." });
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Failed to create key.' });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = (key) => {
    try {
      if (key.status === 'active') {
        revokeApiKey(userId, key.id);
        setMessage({ type: 'success', text: `Key "${key.label}" revoked.` });
      } else {
        activateApiKey(userId, key.id);
        setMessage({ type: 'success', text: `Key "${key.label}" activated.` });
      }
      refreshKeys();
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Failed to update key.' });
    }
  };

  const handleDelete = (keyId) => {
    try {
      deleteApiKey(userId, keyId);
      setDeleteConfirmId(null);
      refreshKeys();
      setMessage({ type: 'success', text: 'API key permanently deleted.' });
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Failed to delete key.' });
    }
  };

  const startEdit = (key) => {
    setEditingId(key.id);
    setEditPerms([...(key.permissions || [])]);
    setEditLabel(key.label);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPerms([]);
    setEditLabel('');
  };

  const saveEdit = () => {
    try {
      updateApiKey(userId, editingId, { label: editLabel.trim(), permissions: editPerms });
      cancelEdit();
      refreshKeys();
      setMessage({ type: 'success', text: 'Permissions updated.' });
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Failed to save.' });
    }
  };

  const togglePerm = (pageId, list, setter) => {
    setter(list.includes(pageId) ? list.filter((x) => x !== pageId) : [...list, pageId]);
  };

  const toggleAllPerms = (list, setter) => {
    if (list.length === pageOptions.length) setter([]);
    else setter(pageOptions.map((pg) => pg.id));
  };

  const formatDate = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return (
      d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    );
  };

  return (
    <Stack spacing={3}>
      {message.text && (
        <Alert
          severity={message.type === 'error' ? 'error' : 'success'}
          onClose={() => setMessage({ type: '', text: '' })}
          sx={{ borderRadius: 2 }}
        >
          {message.text}
        </Alert>
      )}
      {createdKey && (
        <Alert
          severity="info"
          onClose={() => setCreatedKey('')}
          sx={{ borderRadius: 2, fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}
          action={
            <Button
              size="small"
              color="inherit"
              onClick={() => {
                navigator.clipboard.writeText(createdKey);
                setMessage({ type: 'success', text: 'Key copied to clipboard.' });
              }}
            >
              Copy
            </Button>
          }
        >
          <strong>Your new API key:</strong> {createdKey}
        </Alert>
      )}

      <BentoCard
        title="Generate API Key"
        subtitle="Create access keys with scoped permissions"
        icon={VpnKeyOutlinedIcon}
        iconColor={keyColor}
        minHeight={100}
      >
        <Stack spacing={2}>
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>
              Admin only
            </Typography>
            <Typography variant="body2">
              API key management must be performed by a verified human operator. Do not automate key
              creation/rotation/revocation, and do not give AI agents access to this tab.
            </Typography>
          </Alert>
          <Typography variant="body2" color="text.secondary">
            API keys are intended for controlled, least-privilege integrations. Keys are shown only once
            upon creation - store them securely and treat them as secrets. AI agents must never
            self-manage keys (create, rotate, revoke, or delete).
          </Typography>

          {!showCreateForm ? (
            <Button
              variant="contained"
              size="small"
              startIcon={<AppIcon name="AddOutlined" fallback={AddOutlinedIcon} />}
              onClick={() => setShowCreateForm(true)}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, alignSelf: 'flex-start', px: 2.5 }}
            >
              New API Key
            </Button>
          ) : (
            <Box
              sx={{
                p: 2,
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: alpha(keyColor, 0.3),
                bgcolor: isDark ? alpha(keyColor, 0.04) : alpha(keyColor, 0.02),
              }}
            >
              <Stack spacing={2}>
                <TextField
                  label="Key label"
                  placeholder="e.g. Production backend, CI/CD pipeline"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  size="small"
                  fullWidth
                  InputProps={{ sx: { fontSize: '0.8125rem' } }}
                  InputLabelProps={{ sx: { fontSize: '0.8125rem' } }}
                />

                <Box>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      Permissions (pages this key can access)
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => toggleAllPerms(newPermissions, setNewPermissions)}
                      sx={{ textTransform: 'none', fontSize: '0.68rem', minWidth: 0 }}
                    >
                      {newPermissions.length === pageOptions.length ? 'Deselect all' : 'Select all'}
                    </Button>
                  </Stack>
                  <FormGroup
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
                      gap: 0.25,
                    }}
                  >
                    {pageOptions.map((pg) => (
                      <FormControlLabel
                        key={pg.id}
                        control={
                          <Checkbox
                            size="small"
                            checked={newPermissions.includes(pg.id)}
                            onChange={() => togglePerm(pg.id, newPermissions, setNewPermissions)}
                          />
                        }
                        label={
                          <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                            {pg.label}
                          </Typography>
                        }
                      />
                    ))}
                  </FormGroup>
                </Box>

                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleCreate}
                    disabled={creating}
                    startIcon={<AppIcon name="VpnKeyOutlined" fallback={VpnKeyOutlinedIcon} sx={{ fontSize: 14 }} />}
                    sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 2.5 }}
                  >
                    {creating ? 'Creating…' : 'Generate Key'}
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewLabel('');
                      setNewPermissions([]);
                    }}
                    sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 2 }}
                  >
                    Cancel
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )}
        </Stack>
      </BentoCard>

      <BentoCard
        title="API Keys"
        subtitle={`${keys.length} key${keys.length !== 1 ? 's' : ''} · Manage access and permissions`}
        icon={LockOutlinedIcon}
        iconColor={p.primary.main}
        minHeight={100}
      >
        {keys.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <AppIcon name="VpnKeyOutlined" fallback={VpnKeyOutlinedIcon} sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No API keys yet. Generate one above.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...headerCellSx, minWidth: 140 }}>Label</TableCell>
                  <TableCell sx={{ ...headerCellSx, minWidth: 180 }}>Key</TableCell>
                  <TableCell sx={headerCellSx} align="center">
                    Status
                  </TableCell>
                  <TableCell sx={headerCellSx} align="center">
                    Permissions
                  </TableCell>
                  <TableCell sx={{ ...headerCellSx, minWidth: 130 }}>Created</TableCell>
                  <TableCell sx={{ ...headerCellSx, minWidth: 130 }}>Last used</TableCell>
                  <TableCell sx={headerCellSx} align="center">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {keys.map((row) => {
                  const isEditing = editingId === row.id;
                  const sc = STATUS_CONFIG[row.status] || STATUS_CONFIG.active;
                  return (
                    <TableRow key={row.id} hover sx={{ verticalAlign: 'top' }}>
                      <TableCell>
                        {isEditing ? (
                          <TextField
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            size="small"
                            fullWidth
                            InputProps={{ sx: { fontSize: '0.78rem' } }}
                          />
                        ) : (
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                            {row.label}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.73rem', color: 'text.secondary' }}>
                        {row.keyMasked}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small"
                          label={sc.label}
                          color={sc.color}
                          variant={row.status === 'active' ? 'filled' : 'outlined'}
                          sx={{ borderRadius: 1, fontSize: '0.68rem', height: 22, fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        {isEditing ? (
                          <Box sx={{ textAlign: 'left', px: 0.5 }}>
                            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
                              <Button
                                size="small"
                                onClick={() => toggleAllPerms(editPerms, setEditPerms)}
                                sx={{ textTransform: 'none', fontSize: '0.65rem', minWidth: 0, py: 0 }}
                              >
                                {editPerms.length === pageOptions.length ? 'None' : 'All'}
                              </Button>
                            </Stack>
                            <FormGroup>
                              {pageOptions.map((pg) => (
                                <FormControlLabel
                                  key={pg.id}
                                  control={
                                    <Checkbox
                                      size="small"
                                      checked={editPerms.includes(pg.id)}
                                      onChange={() => togglePerm(pg.id, editPerms, setEditPerms)}
                                    />
                                  }
                                  label={
                                    <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                                      {pg.label}
                                    </Typography>
                                  }
                                  sx={{ ml: 0 }}
                                />
                              ))}
                            </FormGroup>
                          </Box>
                        ) : (
                          <Tooltip
                            title={
                              row.permissions?.length
                                ? row.permissions
                                    .map((pid) => pageOptions.find((pg) => pg.id === pid)?.label || pid)
                                    .join(', ')
                                : 'No permissions'
                            }
                            arrow
                          >
                            <Chip
                              size="small"
                              label={
                                row.permissions?.length
                                  ? `${row.permissions.length} page${row.permissions.length !== 1 ? 's' : ''}`
                                  : 'None'
                              }
                              variant="outlined"
                              sx={{ borderRadius: 1, fontSize: '0.68rem', height: 22 }}
                            />
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                          {formatDate(row.createdAt)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                          {formatDate(row.lastUsedAt)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        {isEditing ? (
                          <Stack direction="row" spacing={0.5} justifyContent="center">
                            <Button
                              size="small"
                              variant="contained"
                              onClick={saveEdit}
                              sx={{ textTransform: 'none', fontSize: '0.7rem', borderRadius: 1.5, minWidth: 0, px: 1.5, py: 0.25 }}
                            >
                              Save
                            </Button>
                            <Button
                              size="small"
                              onClick={cancelEdit}
                              sx={{ textTransform: 'none', fontSize: '0.7rem', borderRadius: 1.5, minWidth: 0, px: 1.5, py: 0.25 }}
                            >
                              Cancel
                            </Button>
                          </Stack>
                        ) : (
                          <Stack direction="row" spacing={0.25} justifyContent="center">
                            <Tooltip title="Edit label & permissions" arrow>
                              <IconButton size="small" onClick={() => startEdit(row)}>
                                <AppIcon name="EditOutlined" fallback={EditOutlinedIcon} sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={row.status === 'active' ? 'Revoke' : 'Activate'} arrow>
                              <IconButton size="small" onClick={() => handleToggleStatus(row)}>
                                {row.status === 'active' ? (
                                  <AppIcon name="BlockOutlined" fallback={BlockOutlinedIcon} sx={{ fontSize: 16, color: 'error.main' }} />
                                ) : (
                                  <AppIcon name="CheckCircle" fallback={CheckCircleIcon} sx={{ fontSize: 16, color: 'success.main' }} />
                                )}
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete permanently" arrow>
                              <IconButton size="small" onClick={() => setDeleteConfirmId(row.id)} sx={{ color: 'error.main' }}>
                                <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </BentoCard>

      <BentoCard
        title="Using API Keys"
        subtitle="Authentication guide"
        icon={SecurityOutlinedIcon}
        iconColor={p.info?.main || p.primary.main}
        minHeight={100}
      >
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            If you build an external integration, use credentials provisioned by a human administrator
            and scoped to the minimum access required. Backend <code>/api/*</code> routes use Supabase
            Bearer tokens (or the <code>x-report-token</code> session token for report ingest);{' '}
            <code>x-api-key</code> is not a substitute for Supabase auth.
          </Typography>
          <DocCodeBlock code={USAGE_SNIPPET} color={keyColor} />
          <DocCallout color={keyColor}>
            Least privilege: do not grant admin-page access (for example <code>roles</code> or{' '}
            <code>documentation</code>) to automation credentials. If you need server-side API key
            enforcement, validate in the API layer and store keys server-side (not only in the browser).
          </DocCallout>
        </Stack>
      </BentoCard>

      <Dialog
        open={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Delete API Key?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will permanently remove the key. Any integrations using it will stop working immediately.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setDeleteConfirmId(null)} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => handleDelete(deleteConfirmId)}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
