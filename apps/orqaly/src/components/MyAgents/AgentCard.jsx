import {
  Box,
  Paper,
  Typography,
  Chip,
  Button,
  Rating,
  IconButton,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import AgentAvatar from '../AgentHub/AgentAvatar';
import { createHoverGlowShadow } from '../../theme/hoverGlow';

import AppIcon from '../icons/AppIcon';

function timeAgo(date) {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function AgentCard({
  agent,
  isTeam = false,
  onAskAgain,
  onRate,
  profile,
  onChat,
  onClick,
}) {
  const theme = useTheme();
  const color = isTeam ? theme.palette.info.main : theme.palette.primary.main;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: alpha(color, 0.18),
        background: `linear-gradient(135deg, ${alpha(color, 0.06)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: onClick ? createHoverGlowShadow(theme) : 'none',
        },
      }}
      onClick={onClick}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        {/* Avatar */}
        {isTeam ? (
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              bgcolor: alpha(color, 0.14),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AppIcon
              name="GroupsOutlined"
              fallback={GroupsOutlinedIcon}
              sx={{ fontSize: 20, color }}
            />
          </Box>
        ) : (
          <AgentAvatar profile={profile} size="large" />
        )}

        {/* Info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 1,
              rowGap: 0.5,
              mb: 0.25,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
              {agent.agentName || agent.name || 'Agent'}
            </Typography>
            {agent.category && (
              <Chip
                size="small"
                label={agent.category}
                variant="outlined"
                sx={{ fontSize: '0.65rem', height: 18, borderRadius: 1, flexShrink: 0 }}
              />
            )}
            {agent.jobsActive > 0 && (
              <Chip
                size="small"
                label="Active"
                color="success"
                sx={{ fontSize: '0.6rem', height: 18, flexShrink: 0 }}
              />
            )}
          </Box>

          {agent.role && (
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3, fontWeight: 500 }}
            >
              {agent.role}
              {profile?.pronouns && <span style={{ opacity: 0.6 }}> · {profile.pronouns}</span>}
            </Typography>
          )}
          {profile?.location && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.25 }}>
              <AppIcon
                name="LocationOnOutlined"
                fallback={LocationOnOutlinedIcon}
                sx={{ fontSize: 12, color: 'text.disabled' }}
              />
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.62rem' }}>
                {profile.location}
              </Typography>
            </Box>
          )}
          <Typography
            variant="caption"
            sx={{ color: 'warning.main', fontWeight: 600, display: 'block', mt: 0.25 }}
          >
            Task Price : {(agent.costPerTask || 0).toFixed(2)} $
          </Typography>
          {(agent.connection_id || agent.connection_type) && (
            <Chip
              size="small"
              label={agent.connection_id || agent.connection_type || '—'}
              sx={{
                fontSize: '0.6rem',
                height: 18,
                mt: 0.25,
                borderRadius: 1,
                fontWeight: 600,
                bgcolor: '#1E88E5',
                color: '#fff',
              }}
            />
          )}

          {/* Rating */}
          {agent.userRating !== null && agent.userRating !== undefined && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <Rating value={agent.userRating} precision={0.1} readOnly size="small" />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                {agent.userRating}
              </Typography>
            </Box>
          )}

          {/* Stats line */}
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.4 }}
          >
            Last used: {timeAgo(agent.lastUsed)}
            {' · '}
            {agent.jobsCompleted ?? agent.jobsTotal ?? 0} job
            {(agent.jobsCompleted ?? 0) !== 1 ? 's' : ''} completed
            {agent.totalSpend > 0 && ` · $${agent.totalSpend.toFixed(2)}`}
            {isTeam && agent.memberCount > 0 && ` · ${agent.memberCount} members`}
          </Typography>

          {/* Approval pending */}
          {agent.approvalPending > 0 && (
            <Chip
              size="small"
              label={`${agent.approvalPending} pending approval`}
              color="warning"
              variant="outlined"
              sx={{ fontSize: '0.6rem', height: 18, mt: 0.5 }}
            />
          )}
        </Box>

        {/* Actions */}
        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0, alignItems: 'center' }}>
          {onChat && (
            <Tooltip title={`Chat with ${profile?.display_name || agent.name || 'agent'}`}>
              <IconButton size="small" onClick={() => onChat(agent)} sx={{ p: 0.5 }}>
                <AppIcon
                  name="ChatBubbleOutline"
                  fallback={ChatBubbleOutlineIcon}
                  sx={{ fontSize: 18, color: 'text.secondary' }}
                />
              </IconButton>
            </Tooltip>
          )}
          {onRate &&
            (agent.userRating === null || agent.userRating === undefined) &&
            agent.jobsCompleted > 0 && (
              <Tooltip title="Rate this agent">
                <IconButton size="small" onClick={() => onRate(agent)} sx={{ p: 0.5 }}>
                  <AppIcon
                    name="StarOutline"
                    fallback={StarOutlineIcon}
                    sx={{ fontSize: 18, color: 'text.secondary' }}
                  />
                </IconButton>
              </Tooltip>
            )}
          {onAskAgain && (
            <Button
              size="small"
              variant="contained"
              startIcon={<AppIcon name="Replay" fallback={ReplayIcon} sx={{ fontSize: 14 }} />}
              onClick={() => onAskAgain(agent)}
              sx={{ fontSize: '0.72rem', textTransform: 'none', minWidth: 'auto', px: 1.5 }}
            >
              Ask Again
            </Button>
          )}
        </Box>
      </Box>
    </Paper>
  );
}
