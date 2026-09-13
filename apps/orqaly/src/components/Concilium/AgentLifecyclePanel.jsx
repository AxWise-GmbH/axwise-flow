/**
 * AgentLifecyclePanel — Agent management: accept, monitor, pause, terminate.
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
  alpha,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import BlockIcon from '@mui/icons-material/Block';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import EmptyState from '../Common/EmptyState';
import { useConciliumAgents } from '../../hooks/useConciliumAgents';

import AppIcon from '../icons/AppIcon';

const STATUS_COLORS = {
  pending: { bg: '#F1F5F9', color: '#64748B' },
  accepted: { bg: '#DBEAFE', color: '#2563EB' },
  active: { bg: '#D1FAE5', color: '#059669' },
  paused: { bg: '#FEF3C7', color: '#D97706' },
  terminated: { bg: '#FEE2E2', color: '#DC2626' },
  expired: { bg: '#F1F5F9', color: '#94A3B8' },
};

export default function AgentLifecyclePanel({ theme, isDark }) {
  const [search, setSearch] = useState('');
  const { agents, loading, acceptAgent, pauseAgent, resumeAgent, terminateAgent } =
    useConciliumAgents();

  const filtered = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.status || '').toLowerCase().includes(q) ||
        (a.agentType || '').toLowerCase().includes(q)
    );
  }, [agents, search]);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 1, sm: 1.5 },
          mb: 2,
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <TextField
          size="small"
          placeholder="Search agents..."
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
        <Box sx={{ flex: { xs: 'none', sm: 1 } }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
          {agents.length} agent{agents.length !== 1 ? 's' : ''}
        </Typography>
      </Box>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SmartToyOutlinedIcon}
          title="No agents registered"
          description="Agents will appear here once they register with the Consilium."
        />
      ) : (
        <TableContainer sx={{ maxHeight: 'calc(100vh - 420px)', overflowX: 'auto' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Evals</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Violations</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((agent) => {
                const sc = STATUS_COLORS[agent.status] || STATUS_COLORS.pending;
                return (
                  <TableRow key={agent.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {agent.name || agent.id?.slice(0, 12)}
                        </Typography>
                        {agent.metadata?.source === 'auto-generated' && (
                          <Chip
                            label="Auto"
                            size="small"
                            color="info"
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.55rem', fontWeight: 700 }}
                          />
                        )}
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontFamily: 'monospace' }}
                      >
                        {agent.id?.slice(0, 20)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={agent.agentType || 'unknown'}
                        size="small"
                        sx={{
                          height: 20,
                          fontWeight: 600,
                          fontSize: '0.6rem',
                          textTransform: 'capitalize',
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={agent.status}
                        size="small"
                        sx={{
                          height: 22,
                          fontWeight: 600,
                          fontSize: '0.65rem',
                          bgcolor: sc.bg,
                          color: sc.color,
                          textTransform: 'capitalize',
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {agent.totalEvaluations || 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: (agent.totalViolations || 0) > 0 ? 'error.main' : 'text.secondary',
                        }}
                      >
                        {agent.totalViolations || 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        {agent.status === 'pending' && (
                          <Tooltip title="Accept">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => acceptAgent(agent.id)}
                            >
                              <AppIcon
                                name="PlayCircleOutline"
                                fallback={PlayCircleOutlineIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                        )}
                        {agent.status === 'active' && (
                          <Tooltip title="Pause">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => pauseAgent(agent.id)}
                            >
                              <AppIcon
                                name="PauseCircleOutline"
                                fallback={PauseCircleOutlineIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                        )}
                        {agent.status === 'paused' && (
                          <Tooltip title="Resume">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => resumeAgent(agent.id)}
                            >
                              <AppIcon
                                name="PlayCircleOutline"
                                fallback={PlayCircleOutlineIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                        )}
                        {!['terminated', 'expired'].includes(agent.status) && (
                          <Tooltip title="Terminate">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => terminateAgent(agent.id)}
                            >
                              <AppIcon name="Block" fallback={BlockIcon} sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
