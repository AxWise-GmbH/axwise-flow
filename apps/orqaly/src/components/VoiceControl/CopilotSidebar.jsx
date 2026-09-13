/**
 * CopilotSidebar — persistent live panel beside the copilot chat.
 *
 * Sections: proactive suggestions, an at-a-glance Overview (from home-summary
 * counts), recent Activity (polled), and Notifications (passed in). Rows and
 * "View all" call onOpenEntity (which navigates + closes the dialog).
 */
import { Box, Typography, Divider, IconButton, CircularProgress, useTheme, alpha } from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import useCopilotSidebarData from '../../hooks/useCopilotSidebarData';
import { relTime } from './chat-blocks/BaseBlock.jsx';
import ProactiveSuggestionCard from './ProactiveSuggestionCard.jsx';
import { buildSuggestions } from './proactiveSuggestions';

function SectionTitle({ children, action }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75, mt: 1.5 }}>
      <Typography variant="caption" sx={{ color: alpha('#fff', 0.5), fontWeight: 700, letterSpacing: 0.5 }}>
        {children}
      </Typography>
      {action}
    </Box>
  );
}

function CountTile({ label, value, color }) {
  return (
    <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha('#fff', 0.05), flex: 1, minWidth: 70 }}>
      <Typography variant="h6" sx={{ color: color || '#fff', fontWeight: 700, fontSize: '1.1rem', lineHeight: 1 }}>
        {value ?? 0}
      </Typography>
      <Typography variant="caption" sx={{ color: alpha('#fff', 0.5), fontSize: '0.64rem' }}>{label}</Typography>
    </Box>
  );
}

export default function CopilotSidebar({ open = false, homeSummary, notifications = [], onOpenEntity, onSuggestionAction }) {
  const theme = useTheme();
  const { activity, loading, refresh } = useCopilotSidebarData({ enabled: open });
  const s = homeSummary || {};
  const suggestions = buildSuggestions({ homeSummary: s, activityFeed: activity });

  return (
    <Box
      sx={{
        width: 320,
        flexShrink: 0,
        height: '100%',
        overflowY: 'auto',
        borderLeft: '1px solid',
        borderColor: alpha('#fff', 0.08),
        px: 1.5,
        py: 1.5,
        bgcolor: alpha('#000', 0.2),
      }}
    >
      {suggestions.length > 0 && (
        <>
          <SectionTitle>SUGGESTIONS</SectionTitle>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {suggestions.map((sug) => (
              <ProactiveSuggestionCard key={sug.id} suggestion={sug} onAction={onSuggestionAction} />
            ))}
          </Box>
        </>
      )}

      <SectionTitle>OVERVIEW</SectionTitle>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <CountTile label="Active goals" value={s.activeGoals} color={theme.palette.primary.light} />
        <CountTile label="Tasks due" value={s.tasksDueThisWeek} color={theme.palette.warning.light} />
        <CountTile label="Workflows" value={s.workflows} color={theme.palette.info.light} />
        <CountTile label="Boards" value={s.boards} color={theme.palette.success.light} />
      </Box>

      <SectionTitle
        action={
          <IconButton size="small" onClick={refresh} sx={{ color: alpha('#fff', 0.4), p: 0.25 }} aria-label="Refresh activity">
            {loading ? <CircularProgress size={12} color="inherit" /> : <RefreshRoundedIcon sx={{ fontSize: 14 }} />}
          </IconButton>
        }
      >
        RECENT ACTIVITY
      </SectionTitle>
      {activity.length === 0 && !loading && (
        <Typography variant="caption" sx={{ color: alpha('#fff', 0.35) }}>No recent activity.</Typography>
      )}
      {activity.slice(0, 8).map((e, i) => (
        <Box
          key={e.id || `act-${i}`}
          onClick={() => e.goalId && onOpenEntity?.({ type: 'goal', entityId: e.goalId })}
          sx={{ py: 0.6, cursor: e.goalId ? 'pointer' : 'default', '&:hover': e.goalId ? { bgcolor: alpha('#fff', 0.04) } : {}, borderRadius: 1, px: 0.5 }}
        >
          <Typography variant="body2" sx={{ color: '#fff', fontSize: '0.76rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {e.title || e.action || 'Update'}
          </Typography>
          <Typography variant="caption" sx={{ color: alpha('#fff', 0.35), fontSize: '0.64rem' }}>
            {relTime(e.timestamp || e.created_at || e.at)}
          </Typography>
        </Box>
      ))}

      {notifications.length > 0 && (
        <>
          <Divider sx={{ my: 1.5, borderColor: alpha('#fff', 0.08) }} />
          <SectionTitle>NOTIFICATIONS</SectionTitle>
          {notifications.slice(0, 5).map((n, i) => (
            <Typography key={n.id || `n-${i}`} variant="body2" sx={{ color: alpha('#fff', 0.8), fontSize: '0.76rem', py: 0.4 }}>
              {n.title || n.message || n.body}
            </Typography>
          ))}
        </>
      )}
    </Box>
  );
}
