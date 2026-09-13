/**
 * Phase 6 - Businesses list + detail view.
 *
 * Minimal but functional: list, create, master kill switch. Detail tabs
 * (Overview / Goals / Pulses / KPIs / Integrations / Audit) are stubbed
 * for now - each one renders the rollup data the backend already
 * returns.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  IconButton,
  TextField,
  Switch,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Stack,
  Tooltip,
} from '@mui/material';
import FormDialog from '../../components/Common/FormDialog';
import AddIcon from '@mui/icons-material/Add';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import {
  listBusinesses,
  createBusiness,
  killBusiness,
  unkillBusiness,
  getBusiness,
} from '../../services/businessService';

import AppIcon from '../../components/icons/AppIcon';

export default function Businesses() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('');
  const [activeId, setActiveId] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listBusinesses();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'Failed to load businesses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createBusiness({ name: newName.trim(), business_type: newType.trim() || null });
      setCreateOpen(false);
      setNewName('');
      setNewType('');
      fetchAll();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleToggleKill = async (biz) => {
    try {
      if (biz.master_kill_switch) await unkillBusiness(biz.id);
      else await killBusiness(biz.id, 'manual_from_list');
      fetchAll();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>
          Businesses
        </Typography>
        <Button
          variant="contained"
          startIcon={<AppIcon name="Add" fallback={AddIcon} />}
          onClick={() => setCreateOpen(true)}
          sx={{ textTransform: 'none' }}
        >
          New business
        </Button>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : items.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
          No businesses yet. A business groups a chain of goals, its pulses, KPIs and integrations.
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {items.map((b) => (
            <Paper
              key={b.id}
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                cursor: 'pointer',
                borderLeft: '4px solid',
                borderColor: b.master_kill_switch ? 'error.main' : 'primary.main',
              }}
              onClick={() => setActiveId(b.id)}
            >
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 700 }}>{b.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {b.business_type || 'untyped'} · {b.status}
                  {b.master_kill_switch && ' · ⛔ KILLED'}
                </Typography>
              </Box>
              <Tooltip
                title={
                  b.master_kill_switch
                    ? 'Resume business'
                    : 'Master kill switch - pauses all loops, pulses and integrations'
                }
                arrow
              >
                <IconButton
                  size="small"
                  color={b.master_kill_switch ? 'error' : 'default'}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleKill(b);
                  }}
                >
                  <AppIcon name="PowerSettingsNew" fallback={PowerSettingsNewIcon} />
                </IconButton>
              </Tooltip>
              <Switch
                checked={!b.master_kill_switch}
                onClick={(e) => e.stopPropagation()}
                onChange={() => handleToggleKill(b)}
                color="primary"
              />
            </Paper>
          ))}
        </Stack>
      )}
      <FormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New business"
        maxWidth="xs"
        primaryLabel="Create"
        onPrimary={handleCreate}
        primaryDisabled={!newName.trim()}
      >
        <TextField
          autoFocus
          fullWidth
          label="Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          label="Business type (optional)"
          placeholder="e.g. saas-agency, ecommerce"
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
        />
      </FormDialog>
      <BusinessDetailDialog
        id={activeId}
        open={!!activeId}
        onClose={() => setActiveId(null)}
        onUpdated={fetchAll}
      />
    </Box>
  );
}

function BusinessDetailDialog({ id, open, onClose, onUpdated }) {
  const [tab, setTab] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) {
      setData(null);
      return;
    }
    setLoading(true);
    getBusiness(id)
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (!open) return null;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={loading ? 'Loading…' : data?.name || 'Business'}
      titleAdornment={
        data?.master_kill_switch ? (
          <Chip size="small" color="error" label="KILLED" sx={{ ml: 1 }} />
        ) : null
      }
      maxWidth="md"
      hideCancel
      primaryLabel="Close"
      onPrimary={onClose}
    >
      {data ? (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label={`Overview`} />
            <Tab label={`Goals (${data.goals?.length || 0})`} />
            <Tab label={`Pulses (${data.pulses?.length || 0})`} />
            <Tab label={`KPIs (${data.kpis?.length || 0})`} />
            <Tab label={`Integrations (${data.integrations?.length || 0})`} />
          </Tabs>
          {tab === 0 && (
            <Box>
              <Typography variant="body2">
                <strong>Type:</strong> {data.business_type || '-'}
              </Typography>
              <Typography variant="body2">
                <strong>Goals:</strong> {data.rollups?.goal_count}
              </Typography>
              <Typography variant="body2">
                <strong>Total spent:</strong> $
                {Number(data.rollups?.total_spent_usd || 0).toFixed(2)}
              </Typography>
              <Typography variant="body2">
                <strong>Chain active:</strong> {data.rollups?.chain_active ? 'yes' : 'no'}
              </Typography>
              {data.killed_reason && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  Killed: {data.killed_reason} at {data.killed_at}
                </Alert>
              )}
            </Box>
          )}
          {tab === 1 && (
            <Stack spacing={1}>
              {(data.goals || []).map((g) => (
                <Paper key={g.id} sx={{ p: 1.25 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {g.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {g.status} · ${Number(g.spent_usd || 0).toFixed(2)}
                    {g.loop_enabled && ' · 🔁 looped'}
                    {g.loop_paused && ' · paused'}
                    {g.goal_kind === 'optimization' && ' · 🔧 optimization'}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          )}
          {tab === 2 && (
            <Stack spacing={1}>
              {(data.pulses || []).map((p) => (
                <Paper key={p.id} sx={{ p: 1.25 }}>
                  <Typography variant="body2">
                    <strong>{p.action}</strong> ({p.agent_role})
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {p.trigger_type} · {p.enabled ? 'enabled' : 'paused'} · last fired:{' '}
                    {p.last_fired_at || 'never'}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          )}
          {tab === 3 && (
            <Stack spacing={1}>
              {(data.kpis || []).map((k) => (
                <Paper key={k.id} sx={{ p: 1.25 }}>
                  <Typography variant="body2">
                    <strong>{k.label || k.key}</strong>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    current {k.current ?? '-'} / target {k.target ?? '-'} {k.unit} · {k.direction}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          )}
          {tab === 4 && (
            <Stack spacing={1}>
              {(data.integrations || []).map((i) => (
                <Paper key={i.id} sx={{ p: 1.25 }}>
                  <Typography variant="body2">
                    <strong>{i.provider}</strong> ({i.external_account_id || 'n/a'})
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {i.status} · expires {i.expires_at || 'never'}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          )}
        </>
      ) : (
        <CircularProgress size={24} />
      )}
    </FormDialog>
  );
}
