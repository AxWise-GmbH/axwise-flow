import { useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Stack,
  useTheme,
  alpha,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import SpeedIcon from '@mui/icons-material/Speed';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import EmptyState from '../../components/Common/EmptyState';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getAgentView,
  getAgents,
  getKpis,
  getProjects,
  getAssignments,
} from '../../services/agentHubService';

import AppIcon from '../../components/icons/AppIcon';

function formatTimestamp(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} - ${hh}:${mi}`;
}

const TASK_STATUS_COLORS = {
  created: 'default',
  assigned: 'info',
  in_progress: 'warning',
  review: 'secondary',
  completed: 'success',
  evaluated: 'success',
};

export default function AgentReports() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();

  const agentView = useMemo(() => getAgentView(id), [id]);
  const allKpis = useMemo(() => getKpis(), []);
  const allProjects = useMemo(() => getProjects(), []);
  const allAssignments = useMemo(() => getAssignments(), []);

  if (!agentView) {
    return (
      <PageLayout title="Agent Reports" showTitleBlock={false}>
        <Box sx={{ p: 4 }}>
          <Button
            startIcon={<AppIcon name="ArrowBack" fallback={ArrowBackIcon} />}
            onClick={() => navigate('/agent-hub')}
            sx={{ mb: 2, textTransform: 'none' }}
          >
            Back to Agents
          </Button>
          <EmptyState
            icon={SmartToyOutlinedIcon}
            title="Agent not found"
            description="This agent may have been removed."
            actionLabel="Back to Agents"
            onAction={() => navigate('/agent-hub')}
          />
        </Box>
      </PageLayout>
    );
  }

  const { agent, tasks, completedTasks, efficiency, workload } = agentView;

  // Agent KPIs
  const agentKpis = allKpis.filter((k) => k.entity_type === 'agent' && k.entity_id === agent.id);

  // Assigned projects
  const agentAssignments = allAssignments.filter((a) => a.agent_id === agent.id);
  const assignedProjects = agentAssignments
    .map((a) => {
      const project = allProjects.find((p) => p.id === a.project_id);
      return project ? { ...project, matchScore: a.match_score } : null;
    })
    .filter(Boolean);

  const costPerTask = Number(agent.cost_per_task || 0);
  const totalCost = costPerTask * tasks.length;

  const statCards = [
    {
      label: 'Total Tasks',
      value: tasks.length,
      helper: `${workload} in progress`,
      color: theme.palette.primary.main,
      icon: TaskAltIcon,
    },
    {
      label: 'Success Rate',
      value: `${efficiency}%`,
      helper: `${completedTasks} completed`,
      color:
        efficiency >= 80
          ? theme.palette.success.main
          : efficiency >= 50
            ? theme.palette.warning.main
            : theme.palette.error.main,
      icon: TrendingUpIcon,
    },
    {
      label: 'Cost Efficiency',
      value: `$${costPerTask.toFixed(2)}`,
      helper: `Total: $${totalCost.toFixed(2)}`,
      color: theme.palette.info.main,
      icon: AttachMoneyIcon,
    },
    {
      label: 'Projects Assigned',
      value: assignedProjects.length,
      helper: `${agentKpis.length} KPI records`,
      color: theme.palette.warning.main,
      icon: FolderOutlinedIcon,
    },
  ];

  return (
    <PageLayout title={`Agent Reports - ${agent.role}`} showTitleBlock={false}>
      <Button
        startIcon={<AppIcon name="ArrowBack" fallback={ArrowBackIcon} />}
        onClick={() => navigate('/agent-hub')}
        sx={{ mb: 2, textTransform: 'none', fontWeight: 600 }}
      >
        Back to Agents
      </Button>
      <BentoCard
        title={agent.role || agent.agent_id}
        subtitle={`${agent.connection_type?.toUpperCase()} · ${(agent.capabilities || []).join(', ') || 'No capabilities'}`}
        icon={SmartToyOutlinedIcon}
        noPadding
      >
        {/* ── Stats ──────────────────────────────────────────── */}
        <Box sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}>
          <Box
            sx={{
              mb: 2,
              display: 'grid',
              gap: 1.25,
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, minmax(0, 1fr))',
                lg: 'repeat(4, minmax(0, 1fr))',
              },
            }}
          >
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <Paper
                  key={card.label}
                  elevation={0}
                  sx={{
                    p: 1.5,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: alpha(card.color, 0.22),
                    background: `linear-gradient(135deg, ${alpha(card.color, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 1,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontWeight: 600 }}
                      >
                        {card.label}
                      </Typography>
                      <Typography
                        sx={{ fontSize: '1.35rem', fontWeight: 800, lineHeight: 1.15, mt: 0.45 }}
                      >
                        {card.value}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', display: 'block', mt: 0.35 }}
                      >
                        {card.helper}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: 2,
                        bgcolor: alpha(card.color, 0.16),
                        color: card.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <AppIcon fallback={Icon} sx={{ fontSize: 18 }} />
                    </Box>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        </Box>

        {/* ── Task History ────────────────────────────────────── */}
        <Box sx={{ px: { xs: 1.25, sm: 1.5 }, pb: 2 }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              mb: 1.5,
              textTransform: 'uppercase',
              fontSize: '0.75rem',
              letterSpacing: '0.04em',
              color: 'text.secondary',
            }}
          >
            Task History
          </Typography>
          {tasks.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No tasks recorded for this agent yet.
              </Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Task</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Created</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Completed</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow key={task.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {task.title}
                        </Typography>
                        {task.description && (
                          <Typography variant="caption" color="text.secondary">
                            {task.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={task.status}
                          color={TASK_STATUS_COLORS[task.status] || 'default'}
                          variant="outlined"
                          sx={{ fontWeight: 600, fontSize: '0.68rem', borderRadius: 1.5 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="caption"
                          sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                        >
                          {formatTimestamp(task.created_at)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="caption"
                          sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                        >
                          {formatTimestamp(task.completed_at)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>

        {/* ── Project Participation ───────────────────────────── */}
        <Box sx={{ px: { xs: 1.25, sm: 1.5 }, pb: 2 }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              mb: 1.5,
              textTransform: 'uppercase',
              fontSize: '0.75rem',
              letterSpacing: '0.04em',
              color: 'text.secondary',
            }}
          >
            Project Participation
          </Typography>
          {assignedProjects.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Not assigned to any projects yet.
              </Typography>
            </Paper>
          ) : (
            <Stack spacing={1}>
              {assignedProjects.map((p) => (
                <Paper
                  key={p.id}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                  }}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {p.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.description || '-'}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      size="small"
                      label={`Match: ${Math.round((p.matchScore || 0) * 100)}%`}
                      color={p.matchScore >= 0.7 ? 'success' : 'warning'}
                      variant="outlined"
                      sx={{ fontWeight: 600, fontSize: '0.68rem' }}
                    />
                    <Chip
                      size="small"
                      label={p.priority_level || 'medium'}
                      variant="outlined"
                      sx={{ fontWeight: 600, fontSize: '0.68rem', textTransform: 'capitalize' }}
                    />
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Box>

        {/* ── KPI Records ─────────────────────────────────────── */}
        {agentKpis.length > 0 && (
          <Box sx={{ px: { xs: 1.25, sm: 1.5 }, pb: 2 }}>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 700,
                mb: 1.5,
                textTransform: 'uppercase',
                fontSize: '0.75rem',
                letterSpacing: '0.04em',
                color: 'text.secondary',
              }}
            >
              KPI Records
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>KPI</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Value</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Period</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Recorded</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {agentKpis.map((k) => (
                    <TableRow key={k.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {k.kpi_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {k.kpi_value}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{k.period_key}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="caption"
                          sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                        >
                          {formatTimestamp(k.recorded_at)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </BentoCard>
    </PageLayout>
  );
}
