import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  InputAdornment,
  Alert,
  AlertTitle,
  useTheme,
  alpha,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';

import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import EmptyState from '../../components/Common/EmptyState';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import AgentCard from '../../components/MyAgents/AgentCard';
import AgentReuseDialog from '../../components/MyAgents/AgentReuseDialog';

import { useMyAgents } from '../../hooks/useMyAgents';
import { approveJob } from '../../services/pipelineService';
import AgentHub from '../AgentHub/AgentHub';

import AppIcon from '../../components/icons/AppIcon';

// ── Helpers ──────────────────────────────────────────────
function timeAgo(date) {
  if (!date) return '-';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Simple Mode ──────────────────────────────────────────
function SimpleMyAgents() {
  const theme = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const { agents, teams: conciliumTeams, stats, loading, refetch } = useMyAgents();

  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab');
    return t === 'teams' ? 'teams' : 'agents';
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Reuse dialog state
  const [reuseAgent, setReuseAgent] = useState(null);
  const [reuseIsTeam, setReuseIsTeam] = useState(false);

  // Approval state
  const [approvingId, setApprovingId] = useState(null);

  const handleTabChange = useCallback(
    (v) => {
      setTab(v);
      setSearchParams({ tab: v }, { replace: true });
    },
    [setSearchParams]
  );

  const individualAgents = useMemo(() => agents, [agents]);
  // Map concilium teams to card-compatible shape
  const teams = useMemo(
    () =>
      conciliumTeams.map((t) => ({
        agentId: t.id,
        agentName: t.name,
        role: 'team',
        category: 'team',
        jobsActive: 0,
        jobsCompleted: 0,
        jobsTotal: 0,
        totalSpend: 0,
        lastUsed: t.updated_at || t.created_at,
        description: t.description,
        recentJobs: [],
      })),
    [conciliumTeams]
  );

  const activeList = tab === 'teams' ? teams : individualAgents;

  const filtered = useMemo(() => {
    return activeList.filter((a) => {
      const name = (a.agentName || a.name || '').toLowerCase();
      if (search && !name.includes(search.toLowerCase())) return false;
      if (statusFilter === 'active') return a.jobsActive > 0;
      if (statusFilter === 'completed') return a.jobsCompleted > 0 && a.jobsActive === 0;
      return true;
    });
  }, [activeList, search, statusFilter]);

  // Pending approval jobs across all agents
  const pendingApprovalJobs = useMemo(() => {
    const jobs = [];
    for (const a of agents) {
      for (const j of a.recentJobs || []) {
        if (j.approvalStatus === 'pending_approval') {
          jobs.push({ ...j, agentName: a.agentName, agentId: a.agentId });
        }
      }
    }
    return jobs;
  }, [agents]);

  const handleApproval = useCallback(
    async (jobId, decision) => {
      setApprovingId(jobId);
      await approveJob(jobId, decision);
      refetch();
      setApprovingId(null);
    },
    [refetch]
  );

  const handleAskAgain = useCallback(
    (agent) => {
      setReuseAgent(agent);
      setReuseIsTeam(tab === 'teams');
    },
    [tab]
  );

  if (loading) return <LoadingSpinner />;

  return (
    <PageLayout showTitleBlock={false}>
      <Box sx={{ maxWidth: 900, mx: 'auto' }}>
        {/* Approval banner */}
        {pendingApprovalJobs.length > 0 && (
          <Alert
            severity="warning"
            icon={<AppIcon name="WarningAmber" fallback={WarningAmberIcon} />}
            sx={{ mb: 2, borderRadius: 2 }}
          >
            <AlertTitle sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
              {pendingApprovalJobs.length} job{pendingApprovalJobs.length !== 1 ? 's' : ''} pending
              your review
            </AlertTitle>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
              {pendingApprovalJobs.map((j) => (
                <Box
                  key={j.id}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 100 }}>
                    {j.agentName}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>
                    {j.description || j.id}
                  </Typography>
                  <Button
                    size="small"
                    color="success"
                    startIcon={
                      <AppIcon
                        name="CheckCircleOutline"
                        fallback={CheckCircleOutlineIcon}
                        sx={{ fontSize: 14 }}
                      />
                    }
                    disabled={approvingId === j.id}
                    onClick={() => handleApproval(j.id, 'approved')}
                    sx={{ fontSize: '0.68rem', textTransform: 'none', minWidth: 'auto' }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    startIcon={
                      <AppIcon
                        name="CancelOutlined"
                        fallback={CancelOutlinedIcon}
                        sx={{ fontSize: 14 }}
                      />
                    }
                    disabled={approvingId === j.id}
                    onClick={() => handleApproval(j.id, 'rejected')}
                    sx={{ fontSize: '0.68rem', textTransform: 'none', minWidth: 'auto' }}
                  >
                    Reject
                  </Button>
                </Box>
              ))}
            </Box>
          </Alert>
        )}

        <BentoCard
          title="My Agents"
          subtitle={`${stats.totalAgents} agents · ${stats.activeJobs} active`}
          icon={SmartToyOutlinedIcon}
          iconColor={theme.palette.primary.main}
        >
          {/* Tab bar */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 1,
              mb: 2,
            }}
          >
            <Box
              sx={{
                bgcolor: alpha(theme.palette.text.primary, 0.04),
                p: 0.5,
                borderRadius: 3,
                width: 'fit-content',
              }}
            >
              {[
                { id: 'agents', label: 'Agents', icon: SmartToyOutlinedIcon },
                { id: 'teams', label: 'Teams', icon: GroupsOutlinedIcon },
              ].map((t) => (
                <Button
                  key={t.id}
                  startIcon={<AppIcon fallback={t.icon} sx={{ fontSize: 18 }} />}
                  onClick={() => handleTabChange(t.id)}
                  sx={{
                    borderRadius: 2.5,
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    bgcolor: tab === t.id ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                    color: tab === t.id ? 'primary.main' : 'text.secondary',
                  }}
                >
                  {t.label}
                </Button>
              ))}
            </Box>
          </Box>

          {/* Search + filter */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder={`Search ${tab}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon name="Search" fallback={SearchIcon} sx={{ fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: 180, '& .MuiInputBase-input': { fontSize: '0.82rem' } }}
            />
            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
                bgcolor: alpha(theme.palette.text.primary, 0.04),
                borderRadius: 2.5,
                p: 0.5,
              }}
            >
              {[
                { key: 'all', label: 'All' },
                { key: 'active', label: 'Active' },
                { key: 'completed', label: 'Done' },
              ].map((f) => (
                <Button
                  key={f.key}
                  size="small"
                  onClick={() => setStatusFilter(f.key)}
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    bgcolor:
                      statusFilter === f.key
                        ? alpha(theme.palette.primary.main, 0.1)
                        : 'transparent',
                    color: statusFilter === f.key ? 'primary.main' : 'text.secondary',
                    minWidth: 'auto',
                    px: 1.5,
                  }}
                >
                  {f.label}
                </Button>
              ))}
            </Box>
          </Box>

          {/* Agent list */}
          {filtered.length === 0 ? (
            <EmptyState
              title={
                search || statusFilter !== 'all'
                  ? `No matching ${tab}`
                  : tab === 'teams'
                    ? 'No teams yet'
                    : 'No agents yet'
              }
              description={
                search || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Agents you work with will appear here after your first request'
              }
            />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {filtered.map((agent) => (
                <AgentCard
                  key={agent.agentId}
                  agent={agent}
                  isTeam={tab === 'teams'}
                  onAskAgain={handleAskAgain}
                />
              ))}
            </Box>
          )}
        </BentoCard>
      </Box>
      {/* Reuse dialog */}
      <AgentReuseDialog
        open={!!reuseAgent}
        onClose={() => setReuseAgent(null)}
        agent={reuseAgent}
        isTeam={reuseIsTeam}
        teamMembers={reuseAgent?.recentJobs?.length ? [] : []}
        onSubmitted={() => refetch()}
      />
    </PageLayout>
  );
}

// ── Entry Point ──
// Simple Mode parity refactor: /my-agents now renders AgentHub in BOTH modes
// so Simple Mode users get the full agent management experience (tabs, perf,
// pulse, prompt lab) instead of the stripped-down card list. The old
// SimpleMyAgents component above is retained as dead code for now and will
// be deleted in a follow-up pass.
export default function MyAgents() {
  return <AgentHub />;
}
