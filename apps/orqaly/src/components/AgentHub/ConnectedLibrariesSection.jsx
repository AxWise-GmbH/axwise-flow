/**
 * ConnectedLibrariesSection — embedded inside the Overview tab of
 * AgentDetailDialog. Lists this agent's connected MCP libraries with
 * status, action chips, usage stats, and a "Connect Library" button
 * that opens ConnectLibraryDialog.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Button,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  alpha,
} from '@mui/material';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { listConnectedLibraries } from '../../services/agentLibraryService';
import ConnectLibraryDialog from './ConnectLibraryDialog';

import AppIcon from '../icons/AppIcon';

const STATUS_DOT = { active: '#16A34A', vt_warn: '#D97706', error: '#DC2626', revoked: '#6B7280' };
const RISK_COLOR = { low: '#16A34A', medium: '#D97706', high: '#DC2626' };

export default function ConnectedLibrariesSection({ agentId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    setError('');
    try {
      const data = await listConnectedLibraries(agentId);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'Failed to load libraries');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    load();
  }, [load]);

  const connectedToolIds = useMemo(() => rows.map((r) => r.tool_id), [rows]);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, borderRadius: 2, mt: 1, gridColumn: { xs: '1', sm: '1 / -1' } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <AppIcon
            name="ExtensionOutlined"
            fallback={ExtensionOutlinedIcon}
            sx={{ fontSize: 16, color: 'primary.main' }}
          />
          <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.68rem' }}>
            Connected Libraries
          </Typography>
          {rows.length > 0 && (
            <Chip
              label={rows.length}
              size="small"
              sx={{
                height: 16,
                fontSize: '0.6rem',
                fontWeight: 700,
                bgcolor: alpha('#1E88E5', 0.1),
                color: '#1E88E5',
              }}
            />
          )}
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={load} disabled={loading}>
              <AppIcon
                name="RefreshOutlined"
                fallback={RefreshOutlinedIcon}
                sx={{ fontSize: 14 }}
              />
            </IconButton>
          </Tooltip>
          <Button
            size="small"
            startIcon={
              <AppIcon
                name="AddCircleOutline"
                fallback={AddCircleOutlineIcon}
                sx={{ fontSize: 14 }}
              />
            }
            onClick={() => setPickerOpen(true)}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.7rem' }}
          >
            Connect Library
          </Button>
        </Stack>
      </Stack>
      {error && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
          {error}
        </Typography>
      )}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
          <CircularProgress size={16} />
        </Box>
      ) : rows.length === 0 ? (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
          No libraries connected. Connect one to give this agent access to external services.
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {rows.map((row) => (
            <LibraryRow key={row.id} row={row} />
          ))}
        </Stack>
      )}
      <ConnectLibraryDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        agentId={agentId}
        alreadyConnectedToolIds={connectedToolIds}
        onConnected={load}
      />
    </Paper>
  );
}

function LibraryRow({ row }) {
  const cat = row.catalog;
  const name = cat?.name || row.tool_id;
  const desc = cat?.description || '';
  const risk = cat?.riskTier || 'medium';
  const totalActions = (cat?.actionsSafe?.length || 0) + (cat?.actionsSensitive?.length || 0);
  const enabledCount = Array.isArray(row.enabled_actions) ? row.enabled_actions.length : 0;
  const status = row.status || 'active';
  const dot = STATUS_DOT[status] || '#6B7280';

  return (
    <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Tooltip title={`Status: ${status}`}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dot, flexShrink: 0 }} />
        </Tooltip>
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.78rem', flex: 1 }}>
          {name}
        </Typography>
        <Chip
          label={risk.toUpperCase()}
          size="small"
          sx={{
            height: 16,
            fontSize: '0.55rem',
            fontWeight: 700,
            px: 0.5,
            bgcolor: alpha(RISK_COLOR[risk] || '#888', 0.12),
            color: RISK_COLOR[risk] || '#888',
          }}
        />
        {status === 'vt_warn' && (
          <Tooltip title="VirusTotal flagged this endpoint at the last weekly scan.">
            <AppIcon
              name="WarningAmber"
              fallback={WarningAmberIcon}
              sx={{ fontSize: 14, color: 'warning.main' }}
            />
          </Tooltip>
        )}
        {status === 'active' && (
          <AppIcon
            name="CheckCircleOutline"
            fallback={CheckCircleOutlineIcon}
            sx={{ fontSize: 14, color: 'success.main' }}
          />
        )}
      </Stack>
      {desc && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: '0.66rem', display: 'block', mb: 0.5 }}
        >
          {desc}
        </Typography>
      )}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ flexWrap: 'wrap', gap: 0.5 }}
      >
        <Tooltip title={(row.enabled_actions || []).join(', ') || 'No actions enabled'}>
          <Chip
            size="small"
            label={`${enabledCount}/${totalActions} actions`}
            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600 }}
          />
        </Tooltip>
        <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>
          {row.invocation_count || 0} invocations
          {row.last_used_at ? ` · last used ${formatRelative(row.last_used_at)}` : ''}
        </Typography>
      </Stack>
    </Paper>
  );
}

function formatRelative(iso) {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
  } catch {
    return '';
  }
}
