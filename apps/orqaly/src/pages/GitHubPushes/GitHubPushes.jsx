import { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Button,
  TextField,
  InputAdornment,
  Alert,
  Stack,
  Skeleton,
  useTheme,
  alpha,
  Autocomplete,
  Checkbox,
  Divider,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Collapse,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import GitHubIcon from '@mui/icons-material/GitHub';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CommitIcon from '@mui/icons-material/Commit';
import FormDialog from '../../components/Common/FormDialog';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';

import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import EmptyState from '../../components/Common/EmptyState';
import { useGithubPushes } from '../../hooks/useGithubPushes';
import { usePartners } from '../../hooks/usePartners';
import { useProjects } from '../../hooks/useProjects';

import AppIcon from '../../components/icons/AppIcon';

function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

function shortenSha(sha) {
  return sha ? sha.slice(0, 7) : '';
}

const blankPush = {
  repo: '',
  branch: 'main',
  commitSha: '',
  commitMessage: '',
  commitAuthor: '',
  commitUrl: '',
  pushedAt: new Date().toISOString().slice(0, 16),
  notes: '',
};

// ── Live GitHub repository info from /api/data-topology ─────────────────────
function useGitHubLiveData() {
  const [data, setData] = useState(null);
  const [liveLoading, setLiveLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/data-topology', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled || !payload) return;
        const ghEntity = (payload.entities || []).find((e) => e.id === 'service-github');
        const vercelEntity = (payload.entities || []).find(
          (e) => e.id === 'service-vercel-deployments'
        );
        setData({ github: ghEntity || null, vercel: vercelEntity || null });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLiveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { data, liveLoading };
}

function GitHubLiveCard({ theme }) {
  const isDark = theme.palette.mode === 'dark';
  const { data, liveLoading } = useGitHubLiveData();

  if (liveLoading) {
    return (
      <BentoCard
        title="Repository"
        icon={AccountTreeOutlinedIcon}
        iconColor={isDark ? '#E6EDF3' : '#24292F'}
      >
        <Stack spacing={1.5}>
          <Skeleton variant="rectangular" height={50} sx={{ borderRadius: 2 }} />
          <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
        </Stack>
      </BentoCard>
    );
  }

  const gh = data?.github;
  const vercel = data?.vercel;
  if (!gh) return null;

  const d = gh.details || {};
  const accent = isDark ? '#E6EDF3' : '#24292F';

  return (
    <BentoCard
      title="Repository"
      subtitle={gh.description || ''}
      icon={AccountTreeOutlinedIcon}
      iconColor={accent}
    >
      <Stack spacing={1.5}>
        {/* Stats bar */}
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: alpha(accent, isDark ? 0.06 : 0.03),
            borderColor: alpha(accent, 0.18),
          }}
        >
          <Stack spacing={1.2}>
            <Stack
              direction="row"
              spacing={2}
              justifyContent="space-around"
              flexWrap="wrap"
              useFlexGap
            >
              {[
                d.repo && {
                  label: 'Repo',
                  value: (d.repo || '').split('/').pop() || d.repo,
                  color: accent,
                },
                d.branches?.length > 0 && {
                  label: 'Branches',
                  value: d.branches.length,
                  color: '#7C3AED',
                },
                gh.history?.length > 0 && {
                  label: 'Commits',
                  value: gh.history.length,
                  color: '#16A34A',
                },
                d.configured !== undefined && {
                  label: 'Status',
                  value: d.configured ? 'Active' : 'Not Set',
                  color: d.configured ? '#16A34A' : '#F59E0B',
                },
              ]
                .filter(Boolean)
                .map((s) => (
                  <Box key={s.label} sx={{ textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: s.color }}>
                      {s.value}
                    </Typography>
                    <Typography
                      sx={{ fontSize: '0.6rem', color: 'text.secondary', fontWeight: 600 }}
                    >
                      {s.label}
                    </Typography>
                  </Box>
                ))}
            </Stack>

            {/* Branches */}
            {d.branches?.length > 0 && (
              <Box>
                <Typography
                  sx={{ fontSize: '0.66rem', fontWeight: 700, color: 'text.secondary', mb: 0.5 }}
                >
                  Branches:
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {d.branches.map((b) => (
                    <Chip
                      key={b}
                      size="small"
                      label={b}
                      sx={{
                        height: 20,
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        bgcolor:
                          b === d.defaultBranch ? alpha('#7C3AED', 0.12) : alpha(accent, 0.08),
                        color: b === d.defaultBranch ? '#7C3AED' : 'text.primary',
                        border: b === d.defaultBranch ? '1px solid' : 'none',
                        borderColor: alpha('#7C3AED', 0.3),
                      }}
                    />
                  ))}
                </Stack>
              </Box>
            )}

            {/* Detail rows */}
            {[
              d.repo && { label: 'Repository', value: d.repo },
              d.latestCommitMessage && {
                label: 'Latest',
                value: `${d.latestCommit || ''}${d.latestCommitBranch ? ` (${d.latestCommitBranch})` : ''} - ${d.latestCommitMessage}`,
              },
              d.latestCommitAuthor && { label: 'Author', value: d.latestCommitAuthor },
              d.latestCommitTime && {
                label: 'Time',
                value: new Date(d.latestCommitTime).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              },
            ]
              .filter(Boolean)
              .map((r) => (
                <Stack key={r.label} direction="row" alignItems="center" spacing={1}>
                  <Typography
                    sx={{
                      fontSize: '0.66rem',
                      fontWeight: 700,
                      color: 'text.secondary',
                      minWidth: 72,
                      flexShrink: 0,
                    }}
                  >
                    {r.label}:
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.value}
                  </Typography>
                </Stack>
              ))}

            {/* Env keys */}
            {d.envKeys?.length > 0 && (
              <Box>
                <Typography
                  sx={{ fontSize: '0.66rem', fontWeight: 700, color: 'text.secondary', mb: 0.5 }}
                >
                  Environment:
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {d.envKeys.map((k) => (
                    <Chip
                      key={k}
                      size="small"
                      icon={
                        d.configured ? (
                          <AppIcon
                            name="CheckCircleOutline"
                            fallback={CheckCircleOutlineIcon}
                            sx={{ fontSize: '12px !important' }}
                          />
                        ) : (
                          <AppIcon
                            name="WarningAmberOutlined"
                            fallback={WarningAmberOutlinedIcon}
                            sx={{ fontSize: '12px !important' }}
                          />
                        )
                      }
                      label={k}
                      sx={{
                        height: 22,
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        bgcolor: d.configured ? alpha('#16A34A', 0.1) : alpha('#F59E0B', 0.1),
                        color: d.configured ? '#16A34A' : '#F59E0B',
                        '& .MuiChip-icon': { color: 'inherit' },
                      }}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        </Paper>

        {/* Recent activity */}
        {gh.history?.length > 0 && (
          <Paper
            variant="outlined"
            sx={{ p: 1.2, borderRadius: 2, borderColor: alpha(accent, 0.15) }}
          >
            <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 1 }}>
              <AppIcon
                name="ScheduleOutlined"
                fallback={ScheduleOutlinedIcon}
                sx={{ fontSize: 14, color: accent }}
              />
              <Typography sx={{ fontSize: '0.76rem', fontWeight: 800, color: accent }}>
                Recent Activity
              </Typography>
              <Chip
                size="small"
                label={`${gh.history.length} total`}
                sx={{
                  height: 16,
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  bgcolor: alpha(accent, 0.1),
                  color: accent,
                  ml: 'auto',
                }}
              />
            </Stack>
            <Stack spacing={0.5} sx={{ maxHeight: 340, overflowY: 'auto' }}>
              {gh.history.slice(0, 15).map((h, i) => {
                const ts = h.timestamp ? new Date(h.timestamp) : null;
                const ago = ts
                  ? (() => {
                      const diffMs = Date.now() - ts.getTime();
                      const mins = Math.floor(diffMs / 60000);
                      if (mins < 60) return `${mins}m ago`;
                      const hours = Math.floor(mins / 60);
                      if (hours < 24) return `${hours}h ago`;
                      const days = Math.floor(hours / 24);
                      return `${days}d ago`;
                    })()
                  : '';
                return (
                  <Stack
                    key={`${h.timestamp}-${i}`}
                    direction="row"
                    alignItems="center"
                    spacing={0.6}
                    sx={{
                      py: 0.3,
                      borderBottom: i < 14 ? '1px solid' : 'none',
                      borderColor: alpha(theme.palette.divider, 0.06),
                    }}
                  >
                    <Chip
                      size="small"
                      label={h.action || 'event'}
                      sx={{
                        height: 18,
                        fontSize: '0.58rem',
                        fontWeight: 700,
                        textTransform: 'capitalize',
                        minWidth: 48,
                        bgcolor: alpha(h.status === 'success' ? '#16A34A' : accent, 0.1),
                        color: h.status === 'success' ? '#16A34A' : accent,
                      }}
                    />
                    {h.branch && (
                      <Chip
                        size="small"
                        label={h.branch}
                        sx={{
                          height: 16,
                          fontSize: '0.52rem',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          bgcolor: alpha('#7C3AED', 0.1),
                          color: '#7C3AED',
                          maxWidth: 90,
                          '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                        }}
                      />
                    )}
                    <Typography
                      sx={{
                        fontSize: '0.63rem',
                        fontWeight: 600,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'monospace',
                      }}
                    >
                      {h.detail || h.label || '-'}
                    </Typography>
                    {h.user && (
                      <Typography
                        sx={{ fontSize: '0.56rem', color: 'text.secondary', flexShrink: 0 }}
                      >
                        {h.user}
                      </Typography>
                    )}
                    <Typography
                      sx={{
                        fontSize: '0.58rem',
                        color: 'text.secondary',
                        fontFamily: 'monospace',
                        flexShrink: 0,
                      }}
                    >
                      {ago}
                    </Typography>
                  </Stack>
                );
              })}
            </Stack>
          </Paper>
        )}

        {/* Vercel deployments */}
        {vercel?.history?.length > 0 && (
          <Paper
            variant="outlined"
            sx={{ p: 1.2, borderRadius: 2, borderColor: alpha('#0070F3', 0.15) }}
          >
            <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 1 }}>
              <AppIcon
                name="ScheduleOutlined"
                fallback={ScheduleOutlinedIcon}
                sx={{ fontSize: 14, color: '#0070F3' }}
              />
              <Typography sx={{ fontSize: '0.76rem', fontWeight: 800, color: '#0070F3' }}>
                Deployments
              </Typography>
              <Chip
                size="small"
                label={`${vercel.history.length} recent`}
                sx={{
                  height: 16,
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  bgcolor: alpha('#0070F3', 0.1),
                  color: '#0070F3',
                  ml: 'auto',
                }}
              />
            </Stack>
            <Stack spacing={0.5}>
              {vercel.history.slice(0, 5).map((h, i) => {
                const statusColor =
                  h.status === 'success' ? '#16A34A' : h.status === 'error' ? '#DC2626' : '#F59E0B';
                const ts = h.timestamp ? new Date(h.timestamp) : null;
                const ago = ts
                  ? (() => {
                      const diffMs = Date.now() - ts.getTime();
                      const mins = Math.floor(diffMs / 60000);
                      if (mins < 60) return `${mins}m ago`;
                      const hours = Math.floor(mins / 60);
                      if (hours < 24) return `${hours}h ago`;
                      return `${Math.floor(hours / 24)}d ago`;
                    })()
                  : '';
                return (
                  <Stack
                    key={`${h.timestamp}-${i}`}
                    direction="row"
                    alignItems="center"
                    spacing={0.6}
                    sx={{
                      py: 0.3,
                      borderBottom: i < 4 ? '1px solid' : 'none',
                      borderColor: alpha(theme.palette.divider, 0.06),
                    }}
                  >
                    <Chip
                      size="small"
                      label={h.status || 'deploy'}
                      sx={{
                        height: 18,
                        fontSize: '0.58rem',
                        fontWeight: 700,
                        textTransform: 'capitalize',
                        minWidth: 48,
                        bgcolor: alpha(statusColor, 0.1),
                        color: statusColor,
                      }}
                    />
                    <Typography
                      sx={{
                        fontSize: '0.63rem',
                        fontWeight: 600,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'monospace',
                      }}
                    >
                      {h.detail || '-'}
                    </Typography>
                    {h.meta?.duration && (
                      <Typography
                        sx={{ fontSize: '0.56rem', color: 'text.secondary', flexShrink: 0 }}
                      >
                        {h.meta.duration}
                      </Typography>
                    )}
                    <Typography
                      sx={{
                        fontSize: '0.58rem',
                        color: 'text.secondary',
                        fontFamily: 'monospace',
                        flexShrink: 0,
                      }}
                    >
                      {ago}
                    </Typography>
                  </Stack>
                );
              })}
            </Stack>
          </Paper>
        )}
      </Stack>
    </BentoCard>
  );
}

export default function GitHubPushes() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const {
    pushes,
    loading,
    error,
    refetch,
    addPush,
    editPush,
    removePush,
    assignTask,
    unassignTask,
  } = useGithubPushes();

  const { partners } = usePartners();
  const { projects } = useProjects();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...blankPush });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [assignOpen, setAssignOpen] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [copiedSha, setCopiedSha] = useState(null);

  // Build a flat list of all available tasks from partners
  const availableTasks = useMemo(() => {
    const tasks = [];
    (partners || []).forEach((partner) => {
      (partner.tasks || []).forEach((task) => {
        tasks.push({
          taskRef: task.id || task.taskId,
          taskTitle: task.title || 'Untitled task',
          taskType: 'partner_task',
          partnerId: partner.id,
          partnerName: partner.name,
          projectId: null,
        });
      });
    });
    (projects || []).forEach((project) => {
      tasks.push({
        taskRef: project.id,
        taskTitle: project.name || 'Untitled project',
        taskType: 'project',
        partnerId: project.partnerId || null,
        partnerName: project.partnerName || '',
        projectId: project.id,
      });
    });
    return tasks;
  }, [partners, projects]);

  // Filter pushes by search
  const filtered = useMemo(() => {
    if (!search.trim()) return pushes;
    const q = search.toLowerCase();
    return pushes.filter(
      (p) =>
        (p.commitMessage || '').toLowerCase().includes(q) ||
        (p.commitSha || '').toLowerCase().includes(q) ||
        (p.repo || '').toLowerCase().includes(q) ||
        (p.branch || '').toLowerCase().includes(q) ||
        (p.commitAuthor || '').toLowerCase().includes(q) ||
        (p.notes || '').toLowerCase().includes(q) ||
        (p.tasks || []).some((t) => (t.taskTitle || '').toLowerCase().includes(q))
    );
  }, [pushes, search]);

  // Summary metrics
  const metrics = useMemo(() => {
    const totalPushes = pushes.length;
    const totalLinkedTasks = pushes.reduce((sum, p) => sum + (p.tasks || []).length, 0);
    const branches = [...new Set(pushes.map((p) => p.branch).filter(Boolean))];
    const repos = [...new Set(pushes.map((p) => p.repo).filter(Boolean))];
    return { totalPushes, totalLinkedTasks, branches: branches.length, repos: repos.length };
  }, [pushes]);

  // ── Dialog handlers ─────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm({ ...blankPush, pushedAt: new Date().toISOString().slice(0, 16) });
    setDialogOpen(true);
  };

  const openEdit = (push) => {
    setEditing(push);
    setForm({
      repo: push.repo || '',
      branch: push.branch || 'main',
      commitSha: push.commitSha || '',
      commitMessage: push.commitMessage || '',
      commitAuthor: push.commitAuthor || '',
      commitUrl: push.commitUrl || '',
      pushedAt: push.pushedAt ? push.pushedAt.slice(0, 16) : '',
      notes: push.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await editPush(editing.id, form);
      } else {
        await addPush(form);
      }
      setDialogOpen(false);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await removePush(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  const handleCopySha = (sha) => {
    navigator.clipboard.writeText(sha).catch(() => {});
    setCopiedSha(sha);
    setTimeout(() => setCopiedSha(null), 1500);
  };

  // ── Task assignment ─────────────────────────────────────────
  const handleAssignTask = async (pushId, taskData) => {
    await assignTask(pushId, taskData);
  };

  const handleUnassignTask = async (pushId, pushTaskId) => {
    await unassignTask(pushId, pushTaskId);
  };

  // ── Render helpers ──────────────────────────────────────────
  const metricSubtitle = `Pushes: ${metrics.totalPushes} \u00B7 Linked tasks: ${metrics.totalLinkedTasks} \u00B7 Branches: ${metrics.branches} \u00B7 Repos: ${metrics.repos}`;

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <PageLayout
      title="GitHub Pushes"
      subtitle="Track git pushes and assign the tasks involved in each deployment."
      action={
        <Button
          variant="contained"
          size="small"
          startIcon={<AppIcon name="Add" fallback={AddIcon} />}
          onClick={openCreate}
        >
          Record Push
        </Button>
      }
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => refetch()}>
          {error}
        </Alert>
      )}
      {/* Live GitHub repository info (mirrors Data page GitHub card) */}
      <GitHubLiveCard theme={theme} />
      {/* Metrics card */}
      <BentoCard
        title="Push Overview"
        subtitle={metricSubtitle}
        icon={GitHubIcon}
        iconColor={isDark ? '#E6EDF3' : '#24292F'}
        noPadding
      >
        <Box sx={{ p: { xs: 1.25, sm: 1.5 } }}>
          {/* Search bar */}
          <TextField
            size="small"
            placeholder="Search pushes, commits, tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AppIcon name="SearchOutlined" fallback={SearchIcon} fontSize="small" />
                </InputAdornment>
              ),
              ...(search && {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearch('')}>
                      <AppIcon name="Close" fallback={CloseIcon} fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }),
            }}
            sx={{ mb: 2 }}
          />

          {filtered.length === 0 ? (
            <EmptyState
              title="No pushes recorded"
              description="Record a git push to start linking tasks to deployments."
            />
          ) : (
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, width: 40 }} />
                    <TableCell sx={{ fontWeight: 700 }}>Commit</TableCell>
                    <TableCell sx={{ fontWeight: 700, minWidth: 120 }}>Branch</TableCell>
                    <TableCell sx={{ fontWeight: 700, minWidth: 100 }}>Author</TableCell>
                    <TableCell sx={{ fontWeight: 700, minWidth: 100, textAlign: 'center' }}>
                      Tasks
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, minWidth: 110, textAlign: 'center' }}>
                      Pushed
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right', minWidth: 120 }}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((push) => {
                    const isExpanded = expandedRow === push.id;
                    const taskCount = (push.tasks || []).length;
                    return (
                      <PushRow
                        key={push.id}
                        push={push}
                        isExpanded={isExpanded}
                        taskCount={taskCount}
                        isDark={isDark}
                        theme={theme}
                        copiedSha={copiedSha}
                        availableTasks={availableTasks}
                        assignOpen={assignOpen}
                        onToggleExpand={() => setExpandedRow(isExpanded ? null : push.id)}
                        onEdit={() => openEdit(push)}
                        onDelete={() => setDeleteConfirm(push)}
                        onCopySha={handleCopySha}
                        onOpenAssign={() => setAssignOpen(push.id)}
                        onCloseAssign={() => setAssignOpen(null)}
                        onAssignTask={handleAssignTask}
                        onUnassignTask={handleUnassignTask}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </BentoCard>
      {/* ── Create / Edit Dialog ──────────────────────────────── */}
      <FormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? 'Edit Push' : 'Record a Git Push'}
        icon={GitHubIcon}
        maxWidth="sm"
        primaryLabel={saving ? 'Saving...' : editing ? 'Update' : 'Record Push'}
        onPrimary={handleSave}
        primaryDisabled={saving || !form.commitMessage.trim()}
        primaryLoading={saving}
      >
        <Stack spacing={2}>
          <TextField
            label="Repository"
            placeholder="owner/repo"
            size="small"
            fullWidth
            value={form.repo}
            onChange={(e) => setForm((f) => ({ ...f, repo: e.target.value }))}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label="Branch"
              size="small"
              fullWidth
              value={form.branch}
              onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
            />
            <TextField
              label="Commit SHA"
              size="small"
              fullWidth
              value={form.commitSha}
              onChange={(e) => setForm((f) => ({ ...f, commitSha: e.target.value }))}
            />
          </Stack>
          <TextField
            label="Commit Message"
            size="small"
            fullWidth
            multiline
            minRows={2}
            value={form.commitMessage}
            onChange={(e) => setForm((f) => ({ ...f, commitMessage: e.target.value }))}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label="Author"
              size="small"
              fullWidth
              value={form.commitAuthor}
              onChange={(e) => setForm((f) => ({ ...f, commitAuthor: e.target.value }))}
            />
            <TextField
              label="Pushed At"
              type="datetime-local"
              size="small"
              fullWidth
              value={form.pushedAt}
              onChange={(e) => setForm((f) => ({ ...f, pushedAt: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
          <TextField
            label="Commit URL"
            size="small"
            fullWidth
            placeholder="https://github.com/owner/repo/commit/..."
            value={form.commitUrl}
            onChange={(e) => setForm((f) => ({ ...f, commitUrl: e.target.value }))}
          />
          <TextField
            label="Notes"
            size="small"
            fullWidth
            multiline
            minRows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </Stack>
      </FormDialog>
      {/* ── Delete Confirmation ───────────────────────────────── */}
      <FormDialog
        open={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Push Record?"
        icon={DeleteOutlineIcon}
        iconVariant="error"
        maxWidth="xs"
        actions={
          <>
            <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="contained" color="error" onClick={handleDelete}>
              Delete
            </Button>
          </>
        }
      >
        <Typography variant="body2">
          This will remove the push record for{' '}
          <strong>{shortenSha(deleteConfirm?.commitSha)}</strong> and unlink all assigned tasks.
          This cannot be undone.
        </Typography>
      </FormDialog>
    </PageLayout>
  );
}

// ── Row component with expandable task list ──────────────────
function PushRow({
  push,
  isExpanded,
  taskCount,
  isDark,
  theme,
  copiedSha,
  availableTasks,
  assignOpen,
  onToggleExpand,
  onEdit,
  onDelete,
  onCopySha,
  onOpenAssign,
  onCloseAssign,
  onAssignTask,
  onUnassignTask,
}) {
  const isAssigning = assignOpen === push.id;
  const [selectedTasks, setSelectedTasks] = useState([]);

  const alreadyAssigned = new Set((push.tasks || []).map((t) => t.taskRef));
  const unassignedTasks = availableTasks.filter((t) => !alreadyAssigned.has(t.taskRef));

  const handleConfirmAssign = async () => {
    for (const task of selectedTasks) {
      await onAssignTask(push.id, task);
    }
    setSelectedTasks([]);
    onCloseAssign();
  };

  return (
    <>
      <TableRow
        hover
        sx={{
          cursor: 'pointer',
          '&:last-child td': { borderBottom: isExpanded ? 'none' : undefined },
        }}
      >
        <TableCell sx={{ width: 40, pr: 0 }}>
          <IconButton size="small" onClick={onToggleExpand}>
            {isExpanded ? (
              <AppIcon name="ExpandLess" fallback={ExpandLessIcon} fontSize="small" />
            ) : (
              <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} fontSize="small" />
            )}
          </IconButton>
        </TableCell>
        <TableCell onClick={onToggleExpand}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AppIcon
              name="Commit"
              fallback={CommitIcon}
              fontSize="small"
              sx={{ color: 'text.secondary', flexShrink: 0 }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 340,
                }}
              >
                {push.commitMessage || 'No message'}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Tooltip title={copiedSha === push.commitSha ? 'Copied!' : 'Copy SHA'}>
                  <Chip
                    label={shortenSha(push.commitSha) || 'N/A'}
                    size="small"
                    variant="outlined"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopySha(push.commitSha);
                    }}
                    icon={
                      <AppIcon
                        name="ContentCopy"
                        fallback={ContentCopyIcon}
                        sx={{ fontSize: '14px !important' }}
                      />
                    }
                    sx={{
                      height: 22,
                      fontSize: '0.7rem',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  />
                </Tooltip>
                {push.repo && (
                  <Typography variant="caption" color="text.secondary">
                    {push.repo}
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        </TableCell>
        <TableCell onClick={onToggleExpand}>
          <Chip
            label={push.branch || 'main'}
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: '0.72rem',
              bgcolor: isDark
                ? alpha(theme.palette.primary.main, 0.12)
                : alpha(theme.palette.primary.main, 0.1),
              color: theme.palette.primary.main,
              border: '1px solid',
              borderColor: alpha(theme.palette.primary.main, 0.2),
            }}
          />
        </TableCell>
        <TableCell onClick={onToggleExpand}>
          <Typography variant="body2" color="text.secondary">
            {push.commitAuthor || '\u2014'}
          </Typography>
        </TableCell>
        <TableCell onClick={onToggleExpand} sx={{ textAlign: 'center' }}>
          <Chip
            label={taskCount}
            size="small"
            color={taskCount > 0 ? 'success' : 'default'}
            variant={taskCount > 0 ? 'filled' : 'outlined'}
            sx={{ fontWeight: 700, minWidth: 32 }}
          />
        </TableCell>
        <TableCell onClick={onToggleExpand} sx={{ textAlign: 'center' }}>
          <Tooltip title={formatDate(push.pushedAt)}>
            <Typography variant="caption" color="text.secondary">
              {formatRelative(push.pushedAt)}
            </Typography>
          </Tooltip>
        </TableCell>
        <TableCell sx={{ textAlign: 'right' }}>
          <Tooltip title="Assign tasks">
            <IconButton size="small" onClick={onOpenAssign}>
              <AppIcon name="Link" fallback={LinkIcon} fontSize="small" />
            </IconButton>
          </Tooltip>
          {push.commitUrl && (
            <Tooltip title="Open commit on GitHub">
              <IconButton
                size="small"
                component="a"
                href={push.commitUrl}
                target="_blank"
                rel="noopener"
              >
                <AppIcon name="OpenInNew" fallback={OpenInNewIcon} fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Edit">
            <IconButton size="small" onClick={onEdit}>
              <AppIcon name="EditOutlined" fallback={EditOutlinedIcon} fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={onDelete}>
              <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} fontSize="small" />
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>
      {/* Expanded: assigned tasks */}
      <TableRow>
        <TableCell colSpan={7} sx={{ p: 0, borderBottom: isExpanded ? undefined : 'none' }}>
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <Box
              sx={{
                px: 3,
                py: 1.5,
                bgcolor: isDark
                  ? alpha(theme.palette.background.default, 0.5)
                  : alpha(theme.palette.grey[100], 0.6),
              }}
            >
              {push.notes && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 1, fontStyle: 'italic' }}
                >
                  {push.notes}
                </Typography>
              )}
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Assigned Tasks ({taskCount})
              </Typography>
              {taskCount === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No tasks linked to this push yet. Click the link icon to assign tasks.
                </Typography>
              ) : (
                <Stack spacing={0.75}>
                  {(push.tasks || []).map((t) => (
                    <Box
                      key={t.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        px: 1.5,
                        py: 0.75,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: isDark
                          ? alpha(theme.palette.background.paper, 0.5)
                          : 'background.paper',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <AppIcon
                          name="AssignmentOutlined"
                          fallback={AssignmentOutlinedIcon}
                          fontSize="small"
                          color="action"
                        />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {t.taskTitle}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {t.taskType === 'project' ? 'Project' : 'Partner task'}
                            {t.partnerId ? ` \u00B7 ${t.partnerName || t.partnerId}` : ''}
                          </Typography>
                        </Box>
                      </Box>
                      <Tooltip title="Unlink task">
                        <IconButton size="small" onClick={() => onUnassignTask(push.id, t.id)}>
                          <AppIcon name="Close" fallback={CloseIcon} fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
      {/* Task assignment dialog */}
      <FormDialog
        open={isAssigning}
        onClose={onCloseAssign}
        title="Assign Tasks to Push"
        subtitle={`${shortenSha(push.commitSha)} - ${push.commitMessage?.slice(0, 60)}`}
        icon={AssignmentOutlinedIcon}
        maxWidth="sm"
        primaryLabel={selectedTasks.length > 0 ? `Assign (${selectedTasks.length})` : 'Assign'}
        onPrimary={handleConfirmAssign}
        primaryDisabled={selectedTasks.length === 0}
      >
        {unassignedTasks.length === 0 ? (
          <Alert severity="info">All available tasks are already assigned to this push.</Alert>
        ) : (
          <Autocomplete
            multiple
            options={unassignedTasks}
            disableCloseOnSelect
            getOptionLabel={(opt) =>
              `${opt.taskTitle}${opt.partnerName ? ` (${opt.partnerName})` : ''}${opt.taskType === 'project' ? ' [Project]' : ''}`
            }
            value={selectedTasks}
            onChange={(_, newVal) => setSelectedTasks(newVal)}
            renderOption={(props, option, { selected }) => {
              const { key, ...rest } = props;
              return (
                <li key={key} {...rest}>
                  <Checkbox
                    icon={
                      <AppIcon
                        name="CheckBoxOutlineBlank"
                        fallback={CheckBoxOutlineBlankIcon}
                        fontSize="small"
                      />
                    }
                    checkedIcon={
                      <AppIcon name="CheckBox" fallback={CheckBoxIcon} fontSize="small" />
                    }
                    checked={selected}
                    sx={{ mr: 1 }}
                  />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {option.taskTitle}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.taskType === 'project' ? 'Project' : 'Partner task'}
                      {option.partnerName ? ` \u00B7 ${option.partnerName}` : ''}
                    </Typography>
                  </Box>
                </li>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Select tasks to assign"
                placeholder="Search tasks..."
                size="small"
              />
            )}
          />
        )}

        {/* Already assigned */}
        {taskCount > 0 && (
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Already Assigned ({taskCount})
            </Typography>
            <Stack spacing={0.5}>
              {(push.tasks || []).map((t) => (
                <Box
                  key={t.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 1,
                    bgcolor: alpha(theme.palette.success.main, 0.06),
                    border: '1px solid',
                    borderColor: alpha(theme.palette.success.main, 0.15),
                  }}
                >
                  <Typography variant="body2">{t.taskTitle}</Typography>
                  <Tooltip title="Unlink">
                    <IconButton size="small" onClick={() => onUnassignTask(push.id, t.id)}>
                      <AppIcon name="Close" fallback={CloseIcon} fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </FormDialog>
    </>
  );
}
