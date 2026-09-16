/**
 * [module: connection-hub]
 * Communicator v3 - two top tabs, each with a left-rail sub-menu (Phase 5f).
 *
 *  🧠 Agent Workspace   - Live activity · Goal History · Organizations · Consilium · History
 *  🤖 Communicator       - Bot Settings · Channels · Files · Scheduled Reports
 *                         · Strangers · Controller · Audit Log
 *
 * URL: /communicator?view=workspace|communicator&section=<id>
 * Old `?tab=<id>` params are silently rewritten so existing bookmarks survive.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Paper,
  Typography,
  Collapse,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';

import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import TelegramIcon from '@mui/icons-material/Telegram';

import PageLayout from '../../components/Common/PageLayout';
import PillTabStrip from '../../components/Common/PillTabStrip';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import { useAgentRoom } from '../../hooks/useAgentRoom';
import { useController } from '../../hooks/useController';
import { useConsiliumLog } from '../../hooks/useConsiliumLog';
import { useActivityFeed } from '../../hooks/useActivityFeed';

import { supabase, hasSupabase } from '../../lib/supabase';

import AgentRoomTab from './tabs/AgentRoomTab';
import OrganizationsTab from './tabs/OrganizationsTab';
import ConsiliumLogTab from './tabs/ConsiliumLogTab';
import ActivityFeedTab from './tabs/ActivityFeedTab';
import SettingsTab from './tabs/SettingsTab';
import FilesTab from './tabs/FilesTab';
import ScheduledReportsTab from './tabs/ScheduledReportsTab';
import StrangersTab from './tabs/StrangersTab';
import ChannelsView from './tabs/ChannelsView';
import AssistantHistoryPanel from './tabs/AssistantHistoryPanel';
import { CommandInterface, CommandHistory } from './tabs/ControllerTab';

import SidebarMenu from './components/SidebarMenu';
import AssistantSurface from '../../components/Assistant/AssistantSurface';

import AppIcon from '../../components/icons/AppIcon';

// ── View / section definitions ────────────────────────────────────────────

const WORKSPACE_SECTIONS = [
  { id: 'activity', label: 'Live activity', icon: BoltOutlinedIcon },
  { id: 'rooms', label: 'Goal History', icon: SmartToyOutlinedIcon },
  { id: 'organizations', label: 'Organizations', icon: BusinessOutlinedIcon },
  { id: 'consilium', label: 'Consilium', icon: GavelOutlinedIcon },
  { id: 'history', label: 'History', icon: HistoryOutlinedIcon },
];

const COMMUNICATOR_SECTIONS = [
  { id: 'assistant', label: 'Assistant', icon: ChatBubbleOutlineIcon },
  { id: 'settings', label: 'Bot Settings', icon: SettingsOutlinedIcon },
  { id: 'channels', label: 'Channels', icon: SettingsInputAntennaIcon },
  { id: 'files', label: 'Files', icon: InsertDriveFileOutlinedIcon },
  { id: 'reports', label: 'Scheduled Reports', icon: EventRepeatOutlinedIcon },
  { id: 'strangers', label: 'Strangers', icon: PersonOffOutlinedIcon, adminTag: true },
  { id: 'controller', label: 'Controller', icon: TerminalIcon },
  { id: 'audit', label: 'Audit Log', icon: HistoryOutlinedIcon },
  { id: 'assistant-history', label: 'History', icon: ChatBubbleOutlineIcon },
];

// Map OLD ?tab=… params to new view+section so existing bookmarks keep working.
const LEGACY_TAB_MAP = {
  activity: { view: 'workspace', section: 'activity' },
  'agent-room': { view: 'workspace', section: 'rooms' },
  'consilium-log': { view: 'workspace', section: 'consilium' },
  controller: { view: 'communicator', section: 'controller' },
  settings: { view: 'communicator', section: 'settings' },
  files: { view: 'communicator', section: 'files' },
  'scheduled-reports': { view: 'communicator', section: 'reports' },
  strangers: { view: 'communicator', section: 'strangers' },
};

const DEFAULT_VIEW = 'workspace';
const DEFAULT_SECTION = { workspace: 'activity', communicator: 'settings' };

export default function Communicator() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchParams, setSearchParams] = useSearchParams();
  const [showMetrics, setShowMetrics] = useShowMetrics('communicator');

  // ── Resolve initial view/section from URL (with legacy migration) ──
  const [view, setView] = useState(() => {
    const legacy = searchParams.get('tab');
    if (legacy && LEGACY_TAB_MAP[legacy]) return LEGACY_TAB_MAP[legacy].view;
    const v = searchParams.get('view');
    return v === 'communicator' || v === 'workspace' ? v : DEFAULT_VIEW;
  });
  const [section, setSection] = useState(() => {
    const legacy = searchParams.get('tab');
    if (legacy && LEGACY_TAB_MAP[legacy]) return LEGACY_TAB_MAP[legacy].section;
    const s = searchParams.get('section');
    return s || DEFAULT_SECTION[view];
  });

  // Mirror state → URL (replaces ?tab if present)
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    next.set('view', view);
    next.set('section', section);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, section]);

  function handleViewChange(nextView) {
    setView(nextView);
    setSection(DEFAULT_SECTION[nextView]);
  }

  const navigate = useNavigate();
  function handleAssistantOpenEntity(payload) {
    if (!payload) return;
    const target = payload.route || payload.deepLink;
    if (target && typeof target === 'string' && target.startsWith('/')) navigate(target);
  }

  function handleOrgNavigate(link) {
    if (!link?.section) return;
    setView('workspace');
    setSection(link.section);
    const next = new URLSearchParams(searchParams);
    next.set('view', 'workspace');
    next.set('section', link.section);
    if (link.goal) next.set('goal', link.goal);
    else next.delete('goal');
    setSearchParams(next, { replace: true });
  }

  // ── Hooks for each tab (always loaded so switching is instant) ──
  const initialGoalId = searchParams.get('goal') || undefined;
  const agentRoom = useAgentRoom({ initialGoalId });
  const controller = useController();
  const consiliumLog = useConsiliumLog();
  const activityFeed = useActivityFeed();

  // ── Connected channel for the Communicator footer card ──
  const [myChannel, setMyChannel] = useState(null);
  useEffect(() => {
    (async () => {
      if (!hasSupabase()) return;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('communication_channels')
          .select('id, status, config, last_active')
          .eq('connected_by', user.id)
          .eq('platform', 'telegram')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setMyChannel(data || null);
      } catch (_e) {}
    })();
  }, []);

  // ── Top-of-card metric strip (unchanged shape, just keeps Phase 5e tiles) ──
  const metrics = useMemo(
    () => ({
      activeRooms: agentRoom.rooms.length,
      totalMessages: agentRoom.rooms.reduce((sum, r) => sum + (r.messageCount || 0), 0),
      commandsRun: controller.commandHistory.length,
      decisionsMade: consiliumLog.evaluations.length,
      eventsToday: activityFeed.events.filter((e) => {
        const d = new Date(e.timestamp);
        const now = new Date();
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        );
      }).length,
    }),
    [agentRoom.rooms, controller.commandHistory, consiliumLog.evaluations, activityFeed.events]
  );

  const statCards = [
    {
      label: 'Events Today',
      value: metrics.eventsToday,
      helper: 'Across all sources',
      color: theme.palette.warning.main,
      icon: BoltOutlinedIcon,
    },
    {
      label: 'Goal threads',
      value: metrics.activeRooms,
      helper: 'Goals with agent chats',
      color: theme.palette.primary.main,
      icon: SmartToyOutlinedIcon,
    },
    {
      label: 'Total Messages',
      value: metrics.totalMessages,
      helper: 'Agent messages',
      color: theme.palette.info.main,
      icon: ChatBubbleOutlineIcon,
    },
    {
      label: 'Commands Run',
      value: metrics.commandsRun,
      helper: 'Bot + terminal',
      color: theme.palette.success.main,
      icon: TerminalIcon,
    },
    {
      label: 'Decisions',
      value: metrics.decisionsMade,
      helper: 'Consilium evaluations',
      color: theme.palette.warning.dark,
      icon: GavelOutlinedIcon,
    },
  ];

  // ── Sidebar items + footer ──
  const items = view === 'workspace' ? WORKSPACE_SECTIONS : COMMUNICATOR_SECTIONS;
  const footer =
    view === 'communicator' ? (
      <CommunicatorFooter channel={myChannel} />
    ) : (
      <WorkspaceFooter metrics={metrics} />
    );

  // ── Render the active section's content inside the right pane ──
  function renderSection() {
    if (view === 'workspace') {
      if (section === 'activity') return <ActivityFeedTab {...activityFeed} />;
      if (section === 'rooms') return <AgentRoomTab {...agentRoom} />;
      if (section === 'organizations') return <OrganizationsTab onNavigate={handleOrgNavigate} />;
      if (section === 'consilium') return <ConsiliumLogTab {...consiliumLog} />;
      if (section === 'history') return <HistoryPanel />;
    } else {
      if (section === 'assistant')
        return (
          <Box sx={{ height: { xs: '70vh', md: '72vh' }, minHeight: 420 }}>
            <AssistantSurface variant="full" onOpenEntity={handleAssistantOpenEntity} />
          </Box>
        );
      if (section === 'settings') return <SettingsTab />;
      if (section === 'channels') return <ChannelsView />;
      if (section === 'files') return <FilesTab />;
      if (section === 'reports') return <ScheduledReportsTab />;
      if (section === 'strangers') return <StrangersTab />;
      if (section === 'controller') return <ControllerOnlyPanel controller={controller} />;
      if (section === 'audit') return <AuditOnlyPanel controller={controller} />;
      if (section === 'assistant-history') return <AssistantHistoryPanel />;
    }
    return null;
  }

  return (
    <PageLayout title="Communicator" subtitle="" showTitleBlock={false}>
      <BentoCard
        title="Communicator"
        explain
        noTour
        pageInfoPath="/communicator"
        subtitle={
          showMetrics
            ? `${metrics.activeRooms} rooms · ${metrics.commandsRun} commands · ${metrics.decisionsMade} decisions`
            : undefined
        }
        icon={ForumOutlinedIcon}
        iconColor={theme.palette.primary.main}
        noPadding
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
      >
        {/* ── Metrics ── */}
        <Collapse in={showMetrics}>
          <Box
            data-tour-block="communicator-metrics"
            data-tour-label="Activity stats"
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
                  md: 'repeat(5, minmax(0, 1fr))',
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
                        flexShrink: 0,
                        bgcolor: alpha(card.color, 0.16),
                        color: card.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
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

        {/* ── Top pill tabs ── */}
        <PillTabStrip
          data-tour-block="communicator-view-tabs"
          data-tour-label="Two views"
          sx={{ alignItems: 'center' }}
        >
          <TopPill
            active={view === 'workspace'}
            Icon={PsychologyOutlinedIcon}
            label="Platform Agents"
            mobileLabel="Agents"
            onClick={() => handleViewChange('workspace')}
            isMobile={isMobile}
          />
          <TopPill
            active={view === 'communicator'}
            Icon={TelegramIcon}
            label="Personal Assistant"
            mobileLabel="Assistant"
            onClick={() => handleViewChange('communicator')}
            isMobile={isMobile}
          />
        </PillTabStrip>
        <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', mt: 1.5 }} />

        {/* ── Master/detail layout ── */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            minHeight: 'calc(100vh - 380px)',
          }}
        >
          <Box data-tour-block="communicator-sidebar" data-tour-label="Sections">
            <SidebarMenu
              items={items}
              value={section}
              onChange={setSection}
              footer={footer}
              width={220}
            />
          </Box>
          <Box
            data-tour-block="communicator-content"
            data-tour-label="Main pane"
            sx={{
              flex: 1,
              minWidth: 0,
              overflow: 'auto',
              p: { xs: 1.25, sm: 1.75 },
            }}
          >
            {renderSection()}
          </Box>
        </Box>
      </BentoCard>
    </PageLayout>
  );
}

// ── Top pill (reuses the visual style from the previous tab buttons) ──────

function TopPill({ active, Icon, label, mobileLabel, onClick, isMobile }) {
  const theme = useTheme();
  return (
    <Button
      onClick={onClick}
      startIcon={Icon ? <Icon sx={{ fontSize: 18 }} /> : null}
      sx={{
        borderRadius: 2.5,
        textTransform: 'none',
        fontWeight: 700,
        fontSize: { xs: '0.8rem', sm: '0.9rem' },
        px: { xs: 1.5, sm: 2.5 },
        minHeight: 38,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'all 0.2s',
        bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
        color: active ? 'primary.main' : 'text.secondary',
        boxShadow: active ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}` : 'none',
        '&:hover': {
          bgcolor: active
            ? alpha(theme.palette.primary.main, 0.16)
            : alpha(theme.palette.text.primary, 0.05),
          color: active ? 'primary.main' : 'text.primary',
        },
        '& .MuiButton-startIcon': { mr: 0.75 },
      }}
    >
      {isMobile ? mobileLabel || label.split(' ')[0] : label}
    </Button>
  );
}

// ── Sidebar footer cards ──────────────────────────────────────────────────

function CommunicatorFooter({ channel }) {
  const theme = useTheme();
  const connected = !!channel?.id;
  const handle = channel?.config?.telegram_username;
  return (
    <Box
      sx={{
        p: 1.25,
        borderRadius: 2,
        bgcolor: alpha(theme.palette.primary.main, 0.08),
        border: '1px solid',
        borderColor: alpha(theme.palette.primary.main, 0.2),
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'text.disabled',
        }}
      >
        {connected ? 'Connected' : 'Not connected'}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontSize: '0.84rem', fontWeight: 700, mt: 0.25, color: 'text.primary' }}
      >
        {connected ? `@${handle || 'channel'}` : 'No Telegram link'}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', display: 'block', fontSize: '0.7rem', mt: 0.25 }}
      >
        {connected
          ? `via @${import.meta.env.VITE_TELEGRAM_SHARED_BOT_USERNAME || 'orchestratori_bot'}`
          : 'Connect to start using the bot.'}
      </Typography>
      <Button
        size="small"
        href={connected ? '/communicator/connect-telegram' : '/communicator/connect-telegram'}
        sx={{
          mt: 0.75,
          fontSize: '0.7rem',
          textTransform: 'none',
          color: connected ? 'error.main' : 'primary.main',
          px: 0,
          minWidth: 0,
          fontWeight: 700,
          '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
        }}
      >
        {connected ? 'Disconnect →' : 'Connect →'}
      </Button>
    </Box>
  );
}

function WorkspaceFooter({ metrics }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        p: 1.25,
        borderRadius: 2,
        bgcolor: alpha(theme.palette.success.main, 0.06),
        border: '1px solid',
        borderColor: alpha(theme.palette.success.main, 0.18),
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'text.disabled',
        }}
      >
        Platform Agents
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontSize: '0.78rem', fontWeight: 600, mt: 0.4, color: 'text.primary' }}
      >
        {metrics.activeRooms} active rooms · {metrics.decisionsMade} decisions today
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: 'success.main',
          display: 'block',
          fontSize: '0.7rem',
          mt: 0.25,
          fontWeight: 600,
        }}
      >
        ● All systems nominal
      </Typography>
    </Box>
  );
}

// ── Smaller panes that wrap a single piece of the old Controller ───────────

function ControllerOnlyPanel({ controller }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'text.secondary',
        }}
      >
        Slash-command terminal
      </Typography>
      <CommandInterface
        executing={controller.executing}
        lastResult={controller.lastResult}
        executeCommand={controller.executeCommand}
      />
    </Box>
  );
}

function AuditOnlyPanel({ controller }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'text.secondary',
        }}
      >
        Last 50 commands · text · voice · slash
      </Typography>
      <CommandHistory commands={controller.commandHistory} loading={controller.historyLoading} />
    </Box>
  );
}

// ── History placeholder (real search lands in v2) ─────────────────────────

function HistoryPanel() {
  const theme = useTheme();
  return (
    <Box
      sx={{
        py: 5,
        px: 2,
        textAlign: 'center',
        borderRadius: 3,
        bgcolor: alpha(theme.palette.primary.main, 0.04),
        border: '1px dashed',
        borderColor: 'divider',
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.92rem', mb: 0.5 }}>
        History search
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          display: 'block',
          fontSize: '0.78rem',
          maxWidth: 420,
          mx: 'auto',
        }}
      >
        Older events (before today) will land here with full-text search across goals, decisions,
        and agent threads. Coming in the next iteration - today's events live in the{' '}
        <b>Live activity</b> tab.
      </Typography>
    </Box>
  );
}
