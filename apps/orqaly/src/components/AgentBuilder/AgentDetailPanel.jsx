/**
 * Agent Detail Panel — shows activity feed, performance metrics, cost breakdown.
 * Opens as a drawer/dialog from the Agents tab or Builder tab.
 * Uses Supabase Realtime for instant push updates on agent activity.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Chip,
  Paper,
  Stack,
  Divider,
  CircularProgress,
  useTheme,
  alpha,
  IconButton,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { supabase } from '../../lib/supabase';

import AppIcon from '../icons/AppIcon';

// ── API helper ──────────────────────────────────────────────────
async function apiCall(path) {
  const token = localStorage.getItem('supabase_token') || sessionStorage.getItem('supabase_token');
  const res = await fetch(`/api/concilium?path=${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  return res.json();
}

export default function AgentDetailPanel({ agentId, onClose }) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState(null);
  const [reports, setReports] = useState([]);
  const [changes, setChanges] = useState([]);
  const subscriptionRef = useRef(null);

  // ── Load data ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const [agentRes, reportsRes, changesRes] = await Promise.all([
        apiCall(`agents&id=${agentId}`),
        apiCall(`agent-reports&agent_id=${agentId}`),
        apiCall(`agent-rollback&agent_id=${agentId}`),
      ]);
      setAgent(agentRes.agent || null);
      setReports((reportsRes.reports || []).slice(0, 20));
      setChanges((changesRes.changes || []).slice(0, 10));
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Supabase Realtime ──────────────────────────────────────
  useEffect(() => {
    if (!agentId || !supabase) return;

    const channel = supabase
      .channel(`agent-activity-${agentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'concilium_agent_reports',
          filter: `agent_id=eq.${agentId}`,
        },
        (payload) => {
          if (payload.new) {
            setReports((prev) => [payload.new, ...prev].slice(0, 20));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'concilium_agents',
          filter: `id=eq.${agentId}`,
        },
        (payload) => {
          if (payload.new) setAgent(payload.new);
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [agentId]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!agent) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">Agent not found</Typography>
      </Box>
    );
  }

  const statusColor =
    {
      active: 'success',
      accepted: 'success',
      pending: 'warning',
      paused: 'warning',
      terminated: 'error',
      offline: 'default',
    }[agent.status] || 'default';

  // Calculate simple metrics from reports
  const totalReports = reports.length;
  const errorReports = reports.filter((r) => r.report_type === 'error').length;
  const successRate =
    totalReports > 0 ? Math.round(((totalReports - errorReports) / totalReports) * 100) : 0;
  const totalCost = reports.reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
  const totalTokens = reports.reduce((sum, r) => sum + (Number(r.tokens_used) || 0), 0);

  return (
    <Box sx={{ p: 2 }}>
      {/* Agent Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <AppIcon
            name="SmartToyOutlined"
            fallback={SmartToyOutlinedIcon}
            sx={{ fontSize: 28, color: 'primary.main' }}
          />
          <Box>
            <Typography variant="h6" fontWeight={700}>
              {agent.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {agent.agent_type} &middot; Created {new Date(agent.created_at).toLocaleDateString()}
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip label={agent.status} size="small" color={statusColor} sx={{ fontWeight: 600 }} />
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={loadData}>
              <AppIcon name="Refresh" fallback={RefreshIcon} sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
      {/* KPI Cards */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2.5 }}>
        <KpiCard
          icon={<AppIcon name="CheckCircleOutline" fallback={CheckCircleOutlineIcon} />}
          label="Success Rate"
          value={`${successRate}%`}
          color="success"
          theme={theme}
        />
        <KpiCard
          icon={<AppIcon name="TrendingUp" fallback={TrendingUpIcon} />}
          label="Total Reports"
          value={totalReports}
          color="primary"
          theme={theme}
        />
        <KpiCard
          icon={<AppIcon name="AttachMoney" fallback={AttachMoneyIcon} />}
          label="Total Cost"
          value={`$${totalCost.toFixed(4)}`}
          color="info"
          theme={theme}
        />
        <KpiCard
          icon={<AppIcon name="AccessTime" fallback={AccessTimeIcon} />}
          label="Tokens Used"
          value={totalTokens.toLocaleString()}
          color="warning"
          theme={theme}
        />
      </Stack>
      {/* Last Check-in */}
      {agent.last_check_in && (
        <Paper
          sx={{
            p: 1.5,
            mb: 2,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.background.default, 0.5),
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Last check-in: {new Date(agent.last_check_in).toLocaleString()} &middot; Missed:{' '}
            {agent.missed_check_ins || 0}
          </Typography>
        </Paper>
      )}
      <Divider sx={{ my: 2 }} />
      {/* Activity Feed */}
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
        Activity Feed
      </Typography>
      {reports.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ py: 2, textAlign: 'center' }}>
          No activity yet
        </Typography>
      ) : (
        <Stack spacing={1}>
          {reports.map((r) => (
            <Paper
              key={r.id}
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor:
                  r.report_type === 'error'
                    ? alpha(theme.palette.error.main, 0.03)
                    : r.report_type === 'supervisor_intervention'
                      ? alpha(theme.palette.warning.main, 0.05)
                      : 'transparent',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Chip
                  label={r.report_type}
                  size="small"
                  color={
                    r.report_type === 'error'
                      ? 'error'
                      : r.report_type === 'completion'
                        ? 'success'
                        : 'default'
                  }
                  sx={{ fontSize: '0.65rem', height: 20, fontWeight: 600 }}
                />
                <Typography variant="caption" color="text.disabled">
                  {new Date(r.created_at).toLocaleString()}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                {r.summary}
              </Typography>
              {r.cost_usd > 0 && (
                <Typography variant="caption" color="text.secondary">
                  Cost: ${Number(r.cost_usd).toFixed(4)} &middot; Tokens: {r.tokens_used || 0}
                </Typography>
              )}
            </Paper>
          ))}
        </Stack>
      )}
      {/* Change Log */}
      {changes.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
            Recent Changes
          </Typography>
          <Stack spacing={1}>
            {changes.map((c) => (
              <Paper
                key={c.id}
                sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" fontWeight={600}>
                    {c.tool_id}
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    {c.rolled_back && (
                      <Chip
                        label="Rolled back"
                        size="small"
                        color="warning"
                        sx={{ fontSize: '0.6rem', height: 18 }}
                      />
                    )}
                    <Typography variant="caption" color="text.disabled">
                      {new Date(c.created_at).toLocaleString()}
                    </Typography>
                  </Stack>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {c.entity_type} #{c.entity_id}
                </Typography>
              </Paper>
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
}

function KpiCard({ icon, label, value, color, theme }) {
  return (
    <Paper
      sx={{
        flex: 1,
        p: 1.5,
        borderRadius: 2,
        textAlign: 'center',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette[color]?.main || theme.palette.primary.main, 0.03),
      }}
    >
      <Box sx={{ color: `${color}.main`, mb: 0.5, display: 'flex', justifyContent: 'center' }}>
        {icon}
      </Box>
      <Typography variant="h6" fontWeight={700} fontSize="1rem">
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Paper>
  );
}
