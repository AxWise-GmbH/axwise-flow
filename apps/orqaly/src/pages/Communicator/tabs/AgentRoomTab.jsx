/**
 * [module: connection-hub]
 * AgentRoomTab - AI Agents Room: real-time view of agent conversations during goals.
 * Mobile-first: room list collapses into a top selector on small screens.
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Chip,
  Button,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  Badge,
  Skeleton,
  Collapse,
  IconButton,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  Drawer,
  Divider,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import NotificationsIcon from '@mui/icons-material/NotificationsOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import EmptyState from '../../../components/Common/EmptyState';
import PhaseProgress from '../components/PhaseProgress';
import PaneStatusStrip from '../components/PaneStatusStrip';

import AppIcon from '../../../components/icons/AppIcon';

const CHANNELS = [
  { id: 'all', label: 'All' },
  { id: 'team-room', label: 'Team' },
  { id: 'lead-consilium', label: 'Lead' },
  { id: 'agent-lead', label: 'Agent' },
  { id: 'system', label: 'System' },
];

const MSG_TYPE_COLORS = {
  instruction: 'primary',
  feedback: 'warning',
  report: 'info',
  alert: 'error',
  text: 'default',
};

const CHANNEL_ICONS = {
  'team-room': GroupsOutlinedIcon,
  'lead-consilium': GavelOutlinedIcon,
  'agent-lead': PersonOutlinedIcon,
  system: NotificationsIcon,
};

const STATUS_COLORS = {
  active: 'success',
  running: 'info',
  completed: 'default',
  failed: 'error',
  paused: 'warning',
};

function MessageBubble({ msg, theme }) {
  const [expanded, setExpanded] = useState(false);
  const isInstruction = msg.message_type === 'instruction';
  const isAlert = msg.message_type === 'alert';
  const isSystem = msg.channel === 'system';
  const ChannelIcon = CHANNEL_ICONS[msg.channel] || SmartToyOutlinedIcon;
  const accentColor = isSystem
    ? theme.palette.warning.main
    : isAlert
      ? theme.palette.error.main
      : theme.palette.primary.main;

  const ts = msg.created_at
    ? new Date(msg.created_at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <Box
      sx={{
        mb: 1,
        p: 1.25,
        borderRadius: 2,
        bgcolor: alpha(theme.palette.text.primary, 0.02),
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.5),
        transition: 'border-color 0.15s',
        '&:hover': { borderColor: alpha(accentColor, 0.3) },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        {/* Sender icon */}
        <Box
          sx={{
            width: 30,
            height: 30,
            borderRadius: 1.5,
            flexShrink: 0,
            bgcolor: alpha(accentColor, 0.1),
            color: accentColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon fallback={ChannelIcon} sx={{ fontSize: 15 }} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.75rem' }}
            >
              {msg.sender_name || 'Unknown'}
            </Typography>
            <Chip
              label={msg.channel?.replace('-', ' ') || 'unknown'}
              size="small"
              sx={{
                height: 16,
                fontSize: '0.6rem',
                fontWeight: 600,
                bgcolor: alpha(accentColor, 0.08),
                color: accentColor,
              }}
            />
            {msg.message_type && msg.message_type !== 'text' && (
              <Chip
                label={msg.message_type}
                size="small"
                color={MSG_TYPE_COLORS[msg.message_type] || 'default'}
                variant="outlined"
                sx={{ height: 16, fontSize: '0.6rem' }}
              />
            )}
            <Typography
              variant="caption"
              sx={{ color: 'text.disabled', ml: 'auto', flexShrink: 0, fontSize: '0.65rem' }}
            >
              {ts}
            </Typography>
          </Box>

          {/* Content */}
          <Typography
            variant="body2"
            sx={{
              mt: 0.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: '0.82rem',
              lineHeight: 1.55,
              ...(isInstruction && {
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                bgcolor: alpha(theme.palette.primary.main, 0.05),
                p: 0.75,
                borderRadius: 1.5,
                mt: 0.75,
              }),
              ...(isAlert && { color: 'error.main', fontWeight: 600 }),
            }}
          >
            {msg.message || ''}
          </Typography>

          {/* Metadata */}
          {msg.metadata && Object.keys(msg.metadata).length > 0 && (
            <>
              <Button
                size="small"
                onClick={() => setExpanded(!expanded)}
                sx={{ mt: 0.5, textTransform: 'none', fontSize: '0.68rem', p: 0, minWidth: 0 }}
              >
                {expanded ? 'Hide' : 'Details'}
                {expanded ? (
                  <AppIcon
                    name="ExpandLess"
                    fallback={ExpandLessIcon}
                    sx={{ fontSize: 13, ml: 0.25 }}
                  />
                ) : (
                  <AppIcon
                    name="ExpandMore"
                    fallback={ExpandMoreIcon}
                    sx={{ fontSize: 13, ml: 0.25 }}
                  />
                )}
              </Button>
              <Collapse in={expanded}>
                <Box
                  component="pre"
                  sx={{
                    mt: 0.5,
                    p: 0.75,
                    borderRadius: 1,
                    fontSize: '0.68rem',
                    bgcolor: alpha(theme.palette.text.primary, 0.03),
                    overflow: 'auto',
                    maxHeight: 160,
                    lineHeight: 1.4,
                  }}
                >
                  {JSON.stringify(msg.metadata, null, 2)}
                </Box>
              </Collapse>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/* ── Room List (shared between sidebar and drawer) ────────────── */
function RoomList({ rooms, selectedRoom, onSelect, search, onSearchChange, onRefresh, maxHeight }) {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search rooms..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <AppIcon name="Search" fallback={SearchIcon} sx={{ fontSize: 16 }} />
              </InputAdornment>
            ),
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.82rem' } }}
        />
      </Box>
      <List sx={{ overflow: 'auto', flex: 1, maxHeight, p: 0 }}>
        {rooms.map((room) => (
          <ListItemButton
            key={room.goalId}
            selected={selectedRoom === room.goalId}
            onClick={() => onSelect(room.goalId)}
            sx={{
              px: 1.25,
              py: 0.75,
              borderBottom: '1px solid',
              borderColor: 'divider',
              '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) },
            }}
          >
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      fontSize: '0.8rem',
                    }}
                  >
                    {room.title || 'Untitled'}
                  </Typography>
                  <Badge
                    badgeContent={room.messageCount}
                    color="primary"
                    max={99}
                    sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', minWidth: 16, height: 16 } }}
                  />
                </Box>
              }
              secondary={
                <Box sx={{ mt: 0.4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.4 }}>
                    <Chip
                      label={room.status}
                      size="small"
                      color={STATUS_COLORS[room.status] || 'default'}
                      sx={{ height: 16, fontSize: '0.58rem' }}
                    />
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.disabled', fontSize: '0.65rem' }}
                    >
                      {room.lastMessageAt ? new Date(room.lastMessageAt).toLocaleDateString() : ''}
                    </Typography>
                  </Box>
                  {(room.totalPhases > 0 || room.activeSpeaker) && (
                    <PhaseProgress
                      currentPhase={room.currentPhase || 0}
                      totalPhases={room.totalPhases || 0}
                      phaseName={room.phaseName || ''}
                      activeSpeaker={room.activeSpeaker || null}
                      lastMessageAt={room.lastMessageAt}
                      compact
                    />
                  )}
                </Box>
              }
            />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ p: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button
          size="small"
          fullWidth
          startIcon={<AppIcon name="Refresh" fallback={RefreshIcon} sx={{ fontSize: 14 }} />}
          onClick={onRefresh}
          sx={{ textTransform: 'none', fontSize: '0.72rem' }}
        >
          Refresh
        </Button>
      </Box>
    </Box>
  );
}

export default function AgentRoomTab(props) {
  const {
    rooms,
    roomsLoading,
    roomsError,
    selectedRoom,
    messages,
    messagesLoading,
    messagesError,
    activeChannel,
    selectRoom,
    changeChannel,
    fetchRooms,
  } = props;

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [roomSearch, setRoomSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const messagesEndRef = useRef(null);

  const filteredRooms = useMemo(() => {
    if (!roomSearch) return rooms;
    const q = roomSearch.toLowerCase();
    return rooms.filter((r) => r.title?.toLowerCase().includes(q));
  }, [rooms, roomSearch]);

  const currentRoom = rooms.find((r) => r.goalId === selectedRoom);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Detect phase changes for dividers
  const messagesWithDividers = useMemo(() => {
    const result = [];
    let lastPhase = null;
    for (const m of messages) {
      const phase = m.metadata?.phase_index;
      if (phase !== undefined && phase !== lastPhase && lastPhase !== null) {
        result.push({ _divider: true, phase });
      }
      lastPhase = phase;
      result.push(m);
    }
    return result;
  }, [messages]);

  function handleSelectRoom(goalId) {
    selectRoom(goalId);
    if (isMobile) setDrawerOpen(false);
  }

  // ── Loading state ──
  if (roomsLoading && rooms.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={56} sx={{ mb: 1, borderRadius: 2 }} />
        ))}
      </Box>
    );
  }

  if (roomsError)
    return (
      <Alert severity="error" sx={{ m: 2, borderRadius: 2 }}>
        {roomsError}
      </Alert>
    );

  if (rooms.length === 0) {
    return (
      <EmptyState
        icon={SmartToyOutlinedIcon}
        title="No active goal conversations"
        description="Agent conversations will appear here when goals are running."
      />
    );
  }

  // Status strip stats - derived from rooms data
  const activeNow = rooms.filter((r) => r.status === 'active').length;
  const awaiting = rooms.filter((r) => /needs_human|awaiting_user/.test(r.status || '')).length;
  const totalMsgs = rooms.reduce((sum, r) => sum + (r.messageCount || 0), 0);

  return (
    <Box>
      <PaneStatusStrip
        stats={[
          { value: activeNow, label: 'Active rooms', color: 'success', icon: SmartToyOutlinedIcon },
          {
            value: awaiting,
            label: 'Awaiting input',
            color: awaiting > 0 ? 'warning' : 'neutral',
            icon: HourglassEmptyOutlinedIcon,
          },
          {
            value: totalMsgs,
            label: 'Total messages',
            color: 'info',
            icon: ChatBubbleOutlineOutlinedIcon,
          },
        ]}
      />
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          minHeight: { xs: 350, md: 450 },
          flexDirection: { xs: 'column', md: 'row' },
        }}
      >
        {/* ── Mobile: Room selector bar ── */}
        {isMobile && (
          <Paper
            variant="outlined"
            sx={{
              borderRadius: 2,
              p: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              cursor: 'pointer',
              '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.3) },
            }}
            onClick={() => setDrawerOpen(true)}
          >
            <AppIcon
              name="ForumOutlined"
              fallback={ForumOutlinedIcon}
              sx={{ fontSize: 18, color: 'primary.main' }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.82rem' }} noWrap>
                {currentRoom?.title || 'Select a room'}
              </Typography>
              {currentRoom && (
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                  <Chip
                    label={currentRoom.status}
                    size="small"
                    color={STATUS_COLORS[currentRoom.status] || 'default'}
                    sx={{ height: 16, fontSize: '0.58rem' }}
                  />
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                    {currentRoom.messageCount} messages
                  </Typography>
                </Box>
              )}
            </Box>
            <Chip
              label={`${rooms.length} rooms`}
              size="small"
              variant="outlined"
              sx={{ height: 22, fontSize: '0.68rem', fontWeight: 600 }}
            />
          </Paper>
        )}

        {/* ── Mobile: Room drawer ── */}
        {isMobile && (
          <Drawer
            anchor="bottom"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            PaperProps={{
              sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70vh' },
            }}
          >
            <Box
              sx={{
                p: 1.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <AppIcon
                name="ForumOutlined"
                fallback={ForumOutlinedIcon}
                sx={{ fontSize: 18, color: 'primary.main' }}
              />
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Goal History
              </Typography>
              <Chip
                label={rooms.length}
                size="small"
                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, ml: 'auto' }}
              />
            </Box>
            <RoomList
              rooms={filteredRooms}
              selectedRoom={selectedRoom}
              onSelect={handleSelectRoom}
              search={roomSearch}
              onSearchChange={setRoomSearch}
              onRefresh={fetchRooms}
              maxHeight="calc(70vh - 120px)"
            />
          </Drawer>
        )}

        {/* ── Desktop: Room sidebar ── */}
        {!isMobile && (
          <Paper
            variant="outlined"
            sx={{
              width: 250,
              flexShrink: 0,
              borderRadius: 2.5,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <RoomList
              rooms={filteredRooms}
              selectedRoom={selectedRoom}
              onSelect={handleSelectRoom}
              search={roomSearch}
              onSearchChange={setRoomSearch}
              onRefresh={fetchRooms}
              maxHeight="calc(100vh - 480px)"
            />
          </Paper>
        )}

        {/* ── Messages area ── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Channel filter pills */}
          <Box
            sx={{
              mb: 1,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            <ToggleButtonGroup
              value={activeChannel}
              exclusive
              onChange={(_, v) => v && changeChannel(v)}
              size="small"
              sx={{
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.72rem',
                  px: 1.25,
                  py: 0.25,
                  borderRadius: '8px !important',
                  border: '1px solid',
                  borderColor: 'divider',
                  mx: 0.25,
                  '&:first-of-type, &:last-of-type': { borderRadius: '8px !important' },
                  '&.Mui-selected': {
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: 'primary.main',
                    borderColor: alpha(theme.palette.primary.main, 0.3),
                  },
                },
              }}
            >
              {CHANNELS.map((ch) => (
                <ToggleButton key={ch.id} value={ch.id}>
                  {ch.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          {/* Messages feed */}
          <Paper
            variant="outlined"
            sx={{
              flex: 1,
              borderRadius: 2.5,
              p: 1.25,
              overflow: 'auto',
              maxHeight: { xs: 'calc(100vh - 520px)', md: 'calc(100vh - 480px)' },
              minHeight: 200,
            }}
          >
            {!selectedRoom ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  py: 6,
                  color: 'text.disabled',
                }}
              >
                <AppIcon
                  name="ForumOutlined"
                  fallback={ForumOutlinedIcon}
                  sx={{ fontSize: 40, mb: 1, opacity: 0.4 }}
                />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Select a room to view messages
                </Typography>
              </Box>
            ) : messagesLoading ? (
              [1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={48} sx={{ mb: 1, borderRadius: 1.5 }} />
              ))
            ) : messagesError ? (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {messagesError}
              </Alert>
            ) : messagesWithDividers.length === 0 ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  py: 6,
                  color: 'text.disabled',
                }}
              >
                <AppIcon
                  name="SmartToyOutlined"
                  fallback={SmartToyOutlinedIcon}
                  sx={{ fontSize: 36, mb: 1, opacity: 0.4 }}
                />
                <Typography variant="body2">
                  No messages{activeChannel !== 'all' ? ` on "${activeChannel}"` : ''}.
                </Typography>
              </Box>
            ) : (
              <>
                {messagesWithDividers.map((item, idx) =>
                  item._divider ? (
                    <Box
                      key={`div-${idx}`}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1.5 }}
                    >
                      <Box
                        sx={{
                          flex: 1,
                          borderBottom: '1px dashed',
                          borderColor: alpha(theme.palette.divider, 0.6),
                        }}
                      />
                      <Chip
                        label={`Phase ${item.phase + 1}`}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          bgcolor: alpha(theme.palette.info.main, 0.08),
                          color: 'info.main',
                        }}
                      />
                      <Box
                        sx={{
                          flex: 1,
                          borderBottom: '1px dashed',
                          borderColor: alpha(theme.palette.divider, 0.6),
                        }}
                      />
                    </Box>
                  ) : (
                    <MessageBubble key={item.id || idx} msg={item} theme={theme} />
                  )
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
