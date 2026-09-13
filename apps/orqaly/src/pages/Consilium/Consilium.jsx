/**
 * Consilium - Standalone page for the Consilium decision-layer module.
 * Uses the standard page design pattern (BentoCard + metrics + pill tabs).
 */
import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { loadMemberCountsByBoard } from '../../services/conciliumMembersBackend';
import {
  Box,
  Button,
  Paper,
  Typography,
  Collapse,
  ToggleButtonGroup,
  ToggleButton,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import TuneIcon from '@mui/icons-material/Tune';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
// Diversity3OutlinedIcon removed - teams tab removed from Consilium
import TimelineIcon from '@mui/icons-material/Timeline';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import PageLayout from '../../components/Common/PageLayout';
import PillTabStrip from '../../components/Common/PillTabStrip';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import BoardList from '../../components/Concilium/BoardList';
import MemberList from '../../components/Concilium/MemberList';
import CriteriaPanel from '../../components/Concilium/CriteriaPanel';
import AgentLifecyclePanel from '../../components/Concilium/AgentLifecyclePanel';
// TeamPanel removed - consilium hires individuals, teams are on Agents page
import AnalyticsDashboard from '../../components/Concilium/AnalyticsDashboard';
import SecurityEventsPanel from '../../components/Concilium/SecurityEventsPanel';
import { useConcilium } from '../../hooks/useConcilium';
import { useJobs } from '../../hooks/useJobs';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import { useAuth } from '../../context/AuthContext';

import AppIcon from '../../components/icons/AppIcon';

const TABS = [
  { id: 'boards', label: 'Boards', icon: GroupsOutlinedIcon },
  { id: 'members', label: 'Members', icon: PersonOutlineIcon },
  { id: 'criteria', label: 'Criteria', icon: TuneIcon },
  { id: 'agents', label: 'Agent Helper', icon: SmartToyOutlinedIcon },
  { id: 'analytics', label: 'Analytics', icon: TimelineIcon },
  { id: 'security', label: 'Security', icon: ShieldOutlinedIcon },
  { id: 'governance', label: 'Governance', icon: GavelOutlinedIcon },
];

export default function Consilium() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusBoardId = searchParams.get('board');
  const { concilium, addConcilium, editConcilium, removeConcilium } = useConcilium();
  const { jobs } = useJobs();
  const [showMetrics, setShowMetrics] = useShowMetrics('consilium');
  const [activeTab, setActiveTab] = useState('boards');
  const [toolApprovalMode, setToolApprovalMode] = useState(() => {
    try {
      return localStorage.getItem('orch_consilium_tool_mode') || 'auto';
    } catch {
      return 'auto';
    }
  });

  const openActivityLog = () => {};

  // Member counts per board (boards loaded via loadConcilium don't carry a
  // `members` array, so summing b.members.length always yielded 0).
  const [memberCounts, setMemberCounts] = useState({});
  useEffect(() => {
    let cancelled = false;
    loadMemberCountsByBoard()
      .then((m) => {
        if (!cancelled) setMemberCounts(m || {});
      })
      .catch(() => {
        if (!cancelled) setMemberCounts({});
      });
    return () => {
      cancelled = true;
    };
  }, [concilium]);

  // ── Metrics ────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalBoards = concilium.length;
    const totalMembers = Object.values(memberCounts).reduce((sum, n) => sum + (Number(n) || 0), 0);
    const activeJobs =
      jobs?.filter((j) => j.status === 'active' || j.status === 'pending').length || 0;
    const completedJobs =
      jobs?.filter((j) => j.status === 'completed' || j.status === 'done').length || 0;
    return { totalBoards, totalMembers, activeJobs, completedJobs };
  }, [concilium, jobs, memberCounts]);

  const statCards = [
    {
      label: 'Total boards',
      value: metrics.totalBoards,
      helper: 'Evaluation boards',
      color: theme.palette.primary.main,
      icon: GroupsOutlinedIcon,
    },
    {
      label: 'Members',
      value: metrics.totalMembers,
      helper: 'Across all boards',
      color: theme.palette.info.main,
      icon: PersonOutlineIcon,
    },
    {
      label: 'Active jobs',
      value: metrics.activeJobs,
      helper: 'Pending decisions',
      color: theme.palette.warning.main,
      icon: GavelOutlinedIcon,
    },
    {
      label: 'Completed',
      value: metrics.completedJobs,
      helper: 'Resolved evaluations',
      color: theme.palette.success.main,
      icon: VerifiedOutlinedIcon,
    },
  ];

  return (
    <PageLayout title="Consilium" subtitle="" showTitleBlock={false}>
      <BentoCard
        title="Consilium"
        explain
        noTour
        pageInfoPath="/consilium"
        subtitle={showMetrics ? `${metrics.totalBoards} boards` : undefined}
        icon={AssessmentOutlinedIcon}
        iconColor={theme.palette.primary.main}
        noPadding
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
      >
        {/* ── Metrics Cards ────────────────────────────────────── */}
        <Collapse in={showMetrics}>
          <Box
            data-tour-block="consilium-metrics"
            data-tour-label="Board stats"
            sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}
          >
            <Box
              sx={{
                mb: 2,
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: {
                  xs: 'repeat(2, minmax(0, 1fr))',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  md: 'repeat(4, minmax(0, 1fr))',
                },
              }}
            >
              {statCards.map((card) => (
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
                        sx={{
                          fontSize: '1.35rem',
                          fontWeight: 800,
                          color: 'text.primary',
                          lineHeight: 1.15,
                          mt: 0.45,
                        }}
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
                      <AppIcon fallback={card.icon} sx={{ fontSize: 18 }} />
                    </Box>
                  </Box>
                </Paper>
              ))}
            </Box>
          </Box>
        </Collapse>

        {/* ── Tab Bar ──────────────────────────────────────────── */}
        <PillTabStrip
          data-tour-block="consilium-tabs"
          data-tour-label="Sections"
          sx={{ alignItems: 'center' }}
        >
          {TABS.map((tab) => (
            <Button
              key={tab.id}
              startIcon={
                !isMobile ? <AppIcon fallback={tab.icon} sx={{ fontSize: 18 }} /> : undefined
              }
              onClick={() => setActiveTab(tab.id)}
              sx={{
                borderRadius: 2.5,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: { xs: '0.75rem', sm: '0.85rem' },
                px: { xs: 1.25, sm: 2 },
                minHeight: 36,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.2s',
                bgcolor:
                  activeTab === tab.id ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                color: activeTab === tab.id ? 'primary.main' : 'text.secondary',
                boxShadow:
                  activeTab === tab.id
                    ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}`
                    : 'none',
                '&:hover': {
                  bgcolor:
                    activeTab === tab.id
                      ? alpha(theme.palette.primary.main, 0.15)
                      : alpha(theme.palette.text.primary, 0.05),
                  color: activeTab === tab.id ? 'primary.main' : 'text.primary',
                },
              }}
            >
              {tab.label}
            </Button>
          ))}
        </PillTabStrip>

        {/* ── Divider ──────────────────────────────────────────── */}
        <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', mt: 1.5 }} />

        {/* ── Tab Content ──────────────────────────────────────── */}
        <Box
          data-tour-block="consilium-content"
          data-tour-label="Board workspace"
          sx={{ flex: 1, overflow: 'auto', minHeight: 'calc(100vh - 360px)' }}
        >
          {activeTab === 'boards' && (
            <BoardList
              concilium={concilium}
              addConcilium={addConcilium}
              editConcilium={editConcilium}
              removeConcilium={removeConcilium}
              jobs={jobs}
              user={user}
              theme={theme}
              isDark={isDark}
              openActivityLog={openActivityLog}
              focusBoardId={focusBoardId}
            />
          )}
          {activeTab === 'members' && (
            <MemberList concilium={concilium} theme={theme} isDark={isDark} />
          )}
          {activeTab === 'criteria' && (
            <CriteriaPanel concilium={concilium} theme={theme} isDark={isDark} />
          )}
          {activeTab === 'agents' && <AgentLifecyclePanel theme={theme} isDark={isDark} />}
          {/* Teams tab removed - consilium hires individuals, workforce teams are on Agents page */}
          {activeTab === 'analytics' && (
            <Box>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  px: { xs: 1.25, sm: 2.5 },
                  pt: 1.5,
                }}
              >
                <Button
                  size="small"
                  variant="text"
                  onClick={() => navigate('/communicator?tab=consilium-log')}
                  sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem' }}
                >
                  View full decision log
                </Button>
              </Box>
              <AnalyticsDashboard theme={theme} isDark={isDark} />
            </Box>
          )}
          {activeTab === 'security' && <SecurityEventsPanel theme={theme} isDark={isDark} />}
          {activeTab === 'governance' && (
            <Box sx={{ p: { xs: 1.25, sm: 2.5 } }}>
              <Paper
                elevation={0}
                sx={{
                  p: { xs: 1.5, sm: 2.5 },
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: alpha(theme.palette.divider, 0.6),
                  maxWidth: 480,
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Tool Approval Mode
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Controls how tool credentials are configured when agents are assigned after
                  pipeline execution.
                </Typography>
                <ToggleButtonGroup
                  value={toolApprovalMode}
                  exclusive
                  onChange={(_, val) => {
                    if (val) {
                      setToolApprovalMode(val);
                      try {
                        localStorage.setItem('orch_consilium_tool_mode', val);
                      } catch {}
                    }
                  }}
                  size="small"
                >
                  <ToggleButton value="auto">
                    <AppIcon
                      name="AutoMode"
                      fallback={AutoModeIcon}
                      sx={{ mr: 0.5, fontSize: 18 }}
                    />{' '}
                    Auto
                  </ToggleButton>
                  <ToggleButton value="manual">
                    <AppIcon
                      name="GavelOutlined"
                      fallback={GavelOutlinedIcon}
                      sx={{ mr: 0.5, fontSize: 18 }}
                    />{' '}
                    Manual
                  </ToggleButton>
                </ToggleButtonGroup>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 1.5 }}
                >
                  {toolApprovalMode === 'auto'
                    ? 'Tools are configured directly. All changes are logged immutably to the audit trail.'
                    : 'Every tool configuration requires explicit approval. Notifications are sent for review.'}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.5 }}
                >
                  Note: Agents with per-agent overrides (CFO, Accountant, Risk Manager, Lawyer)
                  always use Manual mode regardless of this setting.
                </Typography>
              </Paper>
            </Box>
          )}
        </Box>
      </BentoCard>
    </PageLayout>
  );
}
