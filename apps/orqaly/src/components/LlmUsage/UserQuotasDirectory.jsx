import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  InputAdornment,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  LinearProgress,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  alpha,
  useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TokenIcon from '@mui/icons-material/Token';
import BlockIcon from '@mui/icons-material/Block';
import BoltIcon from '@mui/icons-material/Bolt';
import { useAuth } from '@clerk/react';
import { formatTokensOrZero } from '../../utils/formatTokens';

const TIER_COLORS = {
  free: 'default',
  starter: 'info',
  pro: 'primary',
  enterprise: 'secondary',
  internal: 'success',
};

export default function UserQuotasDirectory() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');

  // Edit dialog state
  const [editUser, setEditUser] = useState(null);
  const [editLimitUsd, setEditLimitUsd] = useState('5.00');
  const [editTier, setEditTier] = useState('free');
  const [editBlocked, setEditBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  let getToken;
  try {
    const auth = useAuth();
    getToken = auth?.getToken;
  } catch {}

  const apiUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ORQALY_API_URL) || '';

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = {};
      if (getToken) {
        const token = await getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${apiUrl}/desktop/v1/admin/users`, { headers });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('ADMIN_REQUIRED: Access restricted to authorized administrators (vitalijs@axwise.de, viktors@axwise.de).');
        }
        throw new Error(`Failed to load users (status ${res.status})`);
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !search ||
        u.userId.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.displayName && u.displayName.toLowerCase().includes(q));
      const matchesTier = tierFilter === 'all' || u.planTier === tierFilter;
      return matchesSearch && matchesTier;
    });
  }, [users, search, tierFilter]);

  const summary = useMemo(() => {
    const totalUsers = users.length;
    const totalSpendUsd = users.reduce((acc, u) => acc + (u.spendUsd || 0), 0);
    const totalTokens = users.reduce((acc, u) => acc + (u.tokens?.total || 0), 0);
    const totalPrompt = users.reduce((acc, u) => acc + (u.tokens?.prompt || 0), 0);
    const totalCached = users.reduce((acc, u) => acc + (u.tokens?.cached || 0), 0);
    const globalCacheRate = totalPrompt > 0 ? Number(((totalCached / totalPrompt) * 100).toFixed(1)) : 0;
    const overQuotaCount = users.filter((u) => (u.spendUsd || 0) >= (u.limitUsd || 5)).length;
    return { totalUsers, totalSpendUsd, totalTokens, totalCached, globalCacheRate, overQuotaCount };
  }, [users]);

  const handleOpenEdit = (user) => {
    setEditUser(user);
    setEditLimitUsd((user.limitUsd || 5.0).toFixed(2));
    setEditTier(user.planTier || 'free');
    setEditBlocked(Boolean(user.isBlocked));
    setSaveError(null);
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    setSaveError(null);
    try {
      const limitCents = Math.round(parseFloat(editLimitUsd || 0) * 100);
      if (Number.isNaN(limitCents) || limitCents < 0) {
        throw new Error('Please enter a valid dollar limit (e.g. 10.00).');
      }

      const headers = { 'Content-Type': 'application/json' };
      if (getToken) {
        const token = await getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${apiUrl}/desktop/v1/admin/users/${editUser.userId}/quota`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          monthlyLimitCents: limitCents,
          planTier: editTier,
          isBlocked: editBlocked,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || `Failed to update quota (status ${res.status})`);
      }

      const updated = await res.json();
      setUsers((prev) =>
        prev.map((u) =>
          u.userId === editUser.userId
            ? {
                ...u,
                planTier: updated.planTier,
                limitCents: updated.limitCents,
                limitUsd: updated.limitCents / 100,
                isBlocked: !updated.allowed && updated.spendCents < updated.limitCents ? true : editBlocked,
              }
            : u
        )
      );
      setEditUser(null);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Cycle Banner */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Current Month · October 2026
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            Tracking usage from 01 Oct 2026 to 31 Oct 2026 (resets monthly on 1st at 00:00 UTC)
          </Typography>
        </Box>
        <Chip label="Billing Cycle: Oct 2026" color="primary" variant="outlined" size="small" sx={{ fontWeight: 600 }} />
      </Box>

      {/* Metrics Row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 1.5 }}>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 0.5 }}>
            <PeopleOutlineIcon fontSize="small" />
            <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
              Managed Users
            </Typography>
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {summary.totalUsers}
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 0.5 }}>
            <AttachMoneyIcon fontSize="small" />
            <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
              October Spend
            </Typography>
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.main' }}>
            ${summary.totalSpendUsd.toFixed(2)}
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 0.5 }}>
            <TokenIcon fontSize="small" />
            <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
              Monthly Tokens
            </Typography>
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {formatTokensOrZero(summary.totalTokens)}
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 0.5 }}>
            <BoltIcon fontSize="small" sx={{ color: 'warning.main' }} />
            <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
              Cache Efficiency
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main' }}>
              {summary.globalCacheRate}%
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {formatTokensOrZero(summary.totalCached)} cached
            </Typography>
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 0.5 }}>
            <BlockIcon fontSize="small" />
            <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
              Over Quota
            </Typography>
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: summary.overQuotaCount > 0 ? 'error.main' : 'text.primary' }}>
            {summary.overQuotaCount}
          </Typography>
        </Paper>
      </Box>

      {/* Controls: Search, Filter, Refresh */}
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search by email, name, or Clerk User ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 280, flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
          }}
        />

        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Plan Tier</InputLabel>
          <Select value={tierFilter} label="Plan Tier" onChange={(e) => setTierFilter(e.target.value)}>
            <MenuItem value="all">All Tiers</MenuItem>
            <MenuItem value="free">Free</MenuItem>
            <MenuItem value="starter">Starter</MenuItem>
            <MenuItem value="pro">Pro</MenuItem>
            <MenuItem value="enterprise">Enterprise</MenuItem>
          </Select>
        </FormControl>

        <Tooltip title="Refresh user list">
          <span>
            <IconButton onClick={fetchUsers} disabled={loading} size="small" sx={{ border: '1px solid', borderColor: 'divider' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Paper>

      {/* Error state */}
      {error && (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* Table */}
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 6 }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <Table size="small">
            <TableHead sx={{ bgcolor: isDark ? alpha('#ffffff', 0.04) : alpha('#000000', 0.02) }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>User / Email</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Tier</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>October Spend / Limit</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Tokens</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Cache Rate</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Calls</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No users match the search filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((u) => {
                  const spend = u.spendUsd || 0;
                  const limit = u.limitUsd || 5;
                  const pct = Math.min(100, Math.max(0, (spend / limit) * 100));
                  const isOver = spend >= limit;

                  return (
                    <TableRow key={u.userId} hover>
                      <TableCell sx={{ minWidth: 200 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem', color: 'text.primary' }}>
                          {u.email || u.userId}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.7rem', display: 'block' }}>
                          {u.displayName ? `${u.displayName} · ` : ''}{u.userId}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={u.planTier?.toUpperCase() || 'FREE'}
                          size="small"
                          color={TIER_COLORS[u.planTier] || 'default'}
                          sx={{ fontWeight: 600, fontSize: '0.65rem', height: 20 }}
                        />
                      </TableCell>
                      <TableCell sx={{ minWidth: 160 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                          <Typography variant="caption" sx={{ fontWeight: 600, color: isOver ? 'error.main' : 'text.primary' }}>
                            ${spend.toFixed(2)}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            / ${limit.toFixed(2)}
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          color={isOver ? 'error' : pct > 80 ? 'warning' : 'primary'}
                          sx={{ height: 4, borderRadius: 2 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {formatTokensOrZero(u.tokens?.total)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.7rem' }}>
                          {formatTokensOrZero(u.tokens?.prompt)} in · {formatTokensOrZero(u.tokens?.completion)} out
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Chip
                            label={`${u.tokens?.cacheHitRate || 0}%`}
                            size="small"
                            color={(u.tokens?.cacheHitRate || 0) > 60 ? 'success' : (u.tokens?.cacheHitRate || 0) > 30 ? 'warning' : 'default'}
                            sx={{ fontWeight: 600, fontSize: '0.65rem', height: 20 }}
                          />
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                            {formatTokensOrZero(u.tokens?.cached)}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>{u.callCount || 0}</TableCell>
                      <TableCell>
                        {u.isBlocked ? (
                          <Chip label="Blocked" size="small" color="error" sx={{ height: 20, fontSize: '0.65rem' }} />
                        ) : isOver ? (
                          <Chip label="Over Quota" size="small" color="warning" sx={{ height: 20, fontSize: '0.65rem' }} />
                        ) : (
                          <Chip label="Active" size="small" color="success" sx={{ height: 20, fontSize: '0.65rem' }} />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit Quota">
                          <IconButton size="small" onClick={() => handleOpenEdit(u)}>
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      {/* Edit Quota Dialog */}
      <Dialog open={Boolean(editUser)} onClose={() => setEditUser(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Edit User Quota
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {editUser && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              Target: {editUser.email ? `${editUser.email} (${editUser.userId})` : editUser.userId}
            </Typography>
          )}

          {saveError && (
            <Alert severity="error" sx={{ fontSize: '0.8rem' }}>
              {saveError}
            </Alert>
          )}

          <TextField
            label="Monthly Limit ($ USD)"
            type="number"
            size="small"
            value={editLimitUsd}
            onChange={(e) => setEditLimitUsd(e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
          />

          <FormControl size="small" fullWidth>
            <InputLabel>Plan Tier</InputLabel>
            <Select value={editTier} label="Plan Tier" onChange={(e) => setEditTier(e.target.value)}>
              <MenuItem value="free">Free ($5.00 default)</MenuItem>
              <MenuItem value="starter">Starter ($10.00)</MenuItem>
              <MenuItem value="pro">Pro ($25.00)</MenuItem>
              <MenuItem value="enterprise">Enterprise ($100.00)</MenuItem>
              <MenuItem value="internal">Internal (Unlimited)</MenuItem>
            </Select>
          </FormControl>

          <FormControlLabel
            control={<Switch checked={editBlocked} onChange={(e) => setEditBlocked(e.target.checked)} color="error" />}
            label={<Typography variant="body2">Suspend / Block Access</Typography>}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditUser(null)} disabled={saving} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleSaveEdit} disabled={saving} variant="contained" color="primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
