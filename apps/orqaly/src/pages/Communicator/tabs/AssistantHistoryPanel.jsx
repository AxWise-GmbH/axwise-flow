import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Chip,
  Divider,
  IconButton,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import LoadingSpinner from '../../../components/Common/LoadingSpinner';
import EmptyState from '../../../components/Common/EmptyState';
import { getAssistantHistory } from '../../../services/assistantHistoryService';
import {
  MODE_LABEL,
  formatDateTime,
  groupConversations,
} from '../../Assistant/assistantConversations';

import AppIcon from '../../../components/icons/AppIcon';

/**
 * Read-only history of the Personal Assistant chat (assistant <-> user),
 * persisted to assistant_chat_messages. Grouped by conversation, newest first.
 */
export default function AssistantHistoryPanel() {
  const theme = useTheme();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAssistantHistory();
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load history');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Group by conversation_id; order conversations by their most recent message.
  const conversations = useMemo(() => groupConversations(messages), [messages]);

  if (loading && !messages.length)
    return (
      <Box sx={{ p: 4 }}>
        <LoadingSpinner />
      </Box>
    );

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1.5,
          px: 0.5,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Personal Assistant history
        </Typography>
        <Tooltip title="Refresh" arrow>
          <IconButton size="small" onClick={fetchHistory} aria-label="Refresh history">
            <AppIcon name="RefreshOutlined" fallback={RefreshOutlinedIcon} sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
      {error && (
        <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mb: 1 }}>
          {error}
        </Typography>
      )}
      {conversations.length === 0 ? (
        <EmptyState
          icon={ChatBubbleOutlineIcon}
          title="No conversations yet"
          description="Chats with your Personal Assistant will be saved here."
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {conversations.map((c) => (
            <Box
              key={c.id}
              sx={{
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  px: 1.5,
                  py: 1,
                  bgcolor: alpha(theme.palette.primary.main, 0.05),
                }}
              >
                <Chip
                  size="small"
                  label={MODE_LABEL[c.mode] || 'Personal Assistant'}
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 700, height: 20, fontSize: '0.66rem' }}
                />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {formatDateTime(c.lastAt)}
                </Typography>
              </Box>
              <Divider />
              <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {c.messages.map((m) => (
                  <Box
                    key={m.id}
                    sx={{
                      display: 'flex',
                      justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <Box
                      sx={{
                        maxWidth: '80%',
                        px: 1.25,
                        py: 0.85,
                        borderRadius: 2,
                        bgcolor:
                          m.role === 'user'
                            ? alpha(theme.palette.primary.main, 0.12)
                            : alpha(theme.palette.text.primary, 0.05),
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap' }}
                      >
                        {m.content}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          color: 'text.secondary',
                          mt: 0.25,
                          fontSize: '0.62rem',
                          textAlign: m.role === 'user' ? 'right' : 'left',
                        }}
                      >
                        {m.role === 'user' ? 'You' : 'Assistant'} · {formatDateTime(m.created_at)}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
