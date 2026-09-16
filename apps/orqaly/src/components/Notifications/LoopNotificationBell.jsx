/**
 * LoopNotificationBell — bell icon + popover showing loop / chain events.
 *
 * Backed by the public.notifications table (see migration 135 and
 * lib/notifications/dispatch.js). Polls every 30s; can be upgraded to
 * Supabase Realtime later for instant updates.
 *
 * Drop into the TopBar next to the existing notifications icon, or use
 * standalone in any header.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Badge,
  IconButton,
  Popover,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Button,
  CircularProgress,
  Tooltip,
  Chip,
} from '@mui/material';
import LoopOutlinedIcon from '@mui/icons-material/LoopOutlined';
import { listNotifications, markAllRead, markRead } from '../../services/notificationService';

import AppIcon from '../icons/AppIcon';

const POLL_MS = 30_000;

function relativeTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function summarize(n) {
  const p = n.payload || {};
  switch (n.event_type) {
    case 'loop_continuation_spawned':
      return {
        title: 'Loop continuation spawned',
        body: p.continuation_title
          ? `"${p.continuation_title}" started.`
          : 'A new continuation goal was created.',
      };
    case 'loop_chain_paused':
      return {
        title: 'Loop chain paused',
        body: p.reason || 'A loop chain was paused.',
      };
    case 'loop_auto_pivot_fired':
      return {
        title: 'Loop auto-pivoted',
        body: p.optimization_title || 'A focused optimization continuation was spawned.',
      };
    case 'loop_kpi_alert':
      return {
        title: 'KPI alert',
        body: p.detail || 'A KPI on a loop chain crossed a threshold.',
      };
    default:
      return { title: n.event_type, body: JSON.stringify(p).slice(0, 120) };
  }
}

export default function LoopNotificationBell({ onOpenGoal }) {
  const [items, setItems] = useState([]);
  const [anchorEl, setAnchorEl] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listNotifications();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      // ignore — bell stays at last good state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const unreadCount = items.filter((i) => !i.read_at).length;
  const open = !!anchorEl;

  const handleClickItem = async (n) => {
    if (!n.read_at) {
      try {
        await markRead(n.id);
      } catch {
        /* ignore */
      }
    }
    const goalId =
      n.payload?.continuation_goal_id || n.payload?.goalId || n.payload?.parent_goal_id;
    if (goalId && onOpenGoal) onOpenGoal(goalId);
    setAnchorEl(null);
    refresh();
  };

  const handleMarkAll = async () => {
    try {
      await markAllRead();
    } catch {
      /* ignore */
    }
    refresh();
  };

  return (
    <>
      <Tooltip title="Loop notifications" arrow>
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          aria-label="Loop notifications"
        >
          <Badge badgeContent={unreadCount} color="error" max={9}>
            <AppIcon name="LoopOutlined" fallback={LoopOutlinedIcon} sx={{ fontSize: 22 }} />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { width: 360, maxHeight: 480 } }}
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
          <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
            Loop activity
          </Typography>
          {loading && <CircularProgress size={14} />}
          {unreadCount > 0 && (
            <Button
              size="small"
              onClick={handleMarkAll}
              sx={{ textTransform: 'none', fontSize: '0.7rem' }}
            >
              Mark all read
            </Button>
          )}
        </Box>
        {items.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="caption">No loop activity yet.</Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {items.map((n) => {
              const { title, body } = summarize(n);
              return (
                <ListItem
                  key={n.id}
                  button
                  onClick={() => handleClickItem(n)}
                  sx={{
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: n.read_at ? 'transparent' : 'action.hover',
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, fontSize: '0.82rem', flex: 1 }}
                        >
                          {title}
                        </Typography>
                        {n.priority === 'high' && (
                          <Chip
                            size="small"
                            label="!"
                            color="error"
                            sx={{ height: 14, fontSize: '0.55rem' }}
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <>
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                            fontSize: '0.72rem',
                            color: 'text.secondary',
                            lineHeight: 1.4,
                          }}
                        >
                          {body}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ fontSize: '0.6rem', color: 'text.disabled' }}
                        >
                          {relativeTime(n.created_at)}
                        </Typography>
                      </>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        )}
      </Popover>
    </>
  );
}
