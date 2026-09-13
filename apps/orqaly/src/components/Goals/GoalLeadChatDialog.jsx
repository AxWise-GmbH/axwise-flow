import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Button,
  Avatar,
  Paper,
  CircularProgress,
  Collapse,
  MenuItem,
  Select,
  FormControl,
  useTheme,
  alpha,
  Tooltip,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import { sendLeadMessage } from '../../services/goalLeadChatService';
import { MODEL_OPTIONS } from './goalLeadModels';
import { ACTION_HANDLERS, EDITABLE_FIELD, availableGoalActions } from './goalActions';
import { supabase, hasSupabase } from '../../lib/supabase';

import AppIcon from '../icons/AppIcon';

function CouncilBlock({ council }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  if (!council?.length) return null;
  return (
    <Box sx={{ mt: 1 }}>
      <Button
        size="small"
        onClick={() => setOpen((v) => !v)}
        startIcon={<AppIcon name="GroupsOutlined" fallback={GroupsOutlinedIcon} fontSize="small" />}
        endIcon={
          open ? (
            <AppIcon name="ExpandLess" fallback={ExpandLessIcon} />
          ) : (
            <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />
          )
        }
        sx={{ textTransform: 'none', color: 'text.secondary' }}
      >
        Council perspectives ({council.length})
      </Button>
      <Collapse in={open}>
        <Box sx={{ pl: 1, mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {council.map((c, i) => (
            <Paper
              key={i}
              variant="outlined"
              sx={{ p: 1, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.04) }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {c.memberName} · {c.role}{' '}
                {typeof c.confidence === 'number' ? `(${c.confidence}/10)` : ''}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {c.opinion}
              </Typography>
            </Paper>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * The actions a team lead proposed, each behind its own Confirm.
 *
 * Exported because the Simple-mode thread talks to the same lead through the
 * same endpoint, and a proposed action has to run the same way wherever the
 * reply is read.
 */
export function ActionChips({ actions, goal, onResult }) {
  const theme = useTheme();
  // status per action index: 'idle' | 'running' | 'done' | 'error'
  const [state, setState] = useState({});
  // edited text per index for EDITABLE_FIELD actions
  const [edits, setEdits] = useState({});
  const visibleActions = availableGoalActions(actions, goal);
  if (!visibleActions.length) return null;

  const run = async (action, i) => {
    const fn = ACTION_HANDLERS[action.type];
    if (!fn) {
      setState((s) => ({ ...s, [i]: 'error' }));
      onResult?.(`Unknown action "${action.type}".`);
      return;
    }
    const field = EDITABLE_FIELD[action.type];
    const params = field
      ? { ...action.params, [field]: edits[i] ?? action.params?.[field] ?? '' }
      : action.params || {};
    setState((s) => ({ ...s, [i]: 'running' }));
    try {
      await fn(goal?.id, params, goal);
      setState((s) => ({ ...s, [i]: 'done' }));
      onResult?.(`✓ ${action.label}`);
    } catch (err) {
      setState((s) => ({ ...s, [i]: 'error' }));
      onResult?.(`⚠ ${action.label} failed: ${err.message || 'error'}`);
    }
  };

  return (
    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {visibleActions.map((action, i) => {
        const status = state[i] || 'idle';
        const field = EDITABLE_FIELD[action.type];
        const done = status === 'done';
        return (
          <Paper
            key={i}
            variant="outlined"
            sx={{
              p: 1,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.primary.main, done ? 0.06 : 0.03),
              borderColor: done ? 'success.main' : 'divider',
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
              {action.label}
            </Typography>
            {action.summary && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mb: 0.5 }}
              >
                {action.summary}
              </Typography>
            )}
            {field && status !== 'done' && (
              <TextField
                fullWidth
                size="small"
                multiline
                maxRows={4}
                value={edits[i] ?? action.params?.[field] ?? ''}
                onChange={(e) => setEdits((m) => ({ ...m, [i]: e.target.value }))}
                disabled={status === 'running'}
                sx={{ ...FORM_FIELD_SX, my: 0.5 }}
              />
            )}
            <Button
              size="small"
              variant={done ? 'text' : 'contained'}
              color={status === 'error' ? 'error' : 'primary'}
              disabled={status === 'running' || done}
              onClick={() => run(action, i)}
              startIcon={status === 'running' ? <CircularProgress size={12} /> : null}
              sx={{ textTransform: 'none', borderRadius: 2, mt: 0.25 }}
            >
              {done
                ? 'Done ✓'
                : status === 'error'
                  ? 'Retry'
                  : status === 'running'
                    ? 'Working…'
                    : 'Confirm'}
            </Button>
          </Paper>
        );
      })}
    </Box>
  );
}

export default function GoalLeadChatDialog({ open, onClose, goal }) {
  const theme = useTheme();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [modelId, setModelId] = useState('cheap');
  const [boards, setBoards] = useState([]);
  const [boardId, setBoardId] = useState('');
  const scrollRef = useRef(null);

  const selected = MODEL_OPTIONS.find((o) => o.id === modelId) || MODEL_OPTIONS[0];
  const goalId = goal?.id;

  useEffect(() => {
    if (selected.mode !== 'consilium' || !hasSupabase()) return;
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('concilium_boards_v2')
          .select('id, name')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (!cancelled) setBoards(data || []);
      } catch {
        if (!cancelled) setBoards([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected.mode]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || !goalId) return;
    setError('');
    const userMsg = { sender: 'user', text };
    const history = messages
      .filter((m) => m.sender !== 'system')
      .map((m) => ({ sender: m.sender, text: m.text }));
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    try {
      const payload = {
        goalId,
        message: text,
        history,
        mode: selected.mode,
        provider: selected.provider,
        model: selected.model,
        boardId: selected.mode === 'consilium' ? boardId || undefined : undefined,
      };
      const res = await sendLeadMessage(payload);
      setMessages((prev) => [
        ...prev,
        {
          sender: 'lead',
          text: res.reply || '(no reply)',
          council: res.council,
          boardName: res.boardName,
          actions: res.actions,
        },
      ]);
    } catch (err) {
      setError(err.message || 'Failed to reach the team lead');
      setMessages((prev) => [
        ...prev,
        { sender: 'lead', text: 'Sorry — I could not respond just now. Please try again.' },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, goalId, messages, selected, boardId]);

  const appendSystem = useCallback((text) => {
    setMessages((prev) => [...prev, { sender: 'system', text }]);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Talk with team lead"
      icon={ForumOutlinedIcon}
      paperSx={{ height: '70vh', maxHeight: 640 }}
      contentSx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        p: 0,
        pt: 0,
        px: 0,
        pb: 0,
        flex: 1,
        overflow: 'hidden',
        bgcolor: alpha(theme.palette.background.default, 0.4),
      }}
      contentDividers={false}
      titleAdornment={
        <Tooltip title="Model settings">
          <IconButton
            size="small"
            onClick={() => setShowAdvanced((v) => !v)}
            sx={{ ml: 1, color: showAdvanced ? 'primary.main' : 'text.secondary' }}
          >
            <AppIcon name="TuneOutlined" fallback={TuneOutlinedIcon} fontSize="small" />
          </IconButton>
        </Tooltip>
      }
      hideCancel
      actions={
        <Box sx={{ display: 'flex', gap: 1, width: '100%', p: 0 }}>
          <TextField
            fullWidth
            size="small"
            multiline
            maxRows={4}
            placeholder="Message the team lead…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            sx={FORM_FIELD_SX}
          />
          <Button
            variant="contained"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            sx={{ borderRadius: 2, minWidth: 0, px: 2 }}
          >
            <AppIcon name="Send" fallback={SendIcon} fontSize="small" />
          </Button>
        </Box>
      }
    >
      <Collapse in={showAdvanced}>
        <Box
          sx={{
            px: 3,
            py: 1.5,
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
            alignItems: 'center',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <Select value={modelId} onChange={(e) => setModelId(e.target.value)}>
              {MODEL_OPTIONS.map((o) => (
                <MenuItem key={o.id} value={o.id}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {selected.mode === 'consilium' && boards.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <Select value={boardId} displayEmpty onChange={(e) => setBoardId(e.target.value)}>
                <MenuItem value="">Default board</MenuItem>
                {boards.map((b) => (
                  <MenuItem key={b.id} value={b.id}>
                    {b.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
      </Collapse>
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          p: 2,
          minHeight: 280,
        }}
      >
        {messages.length === 0 && !sending && (
          <Box sx={{ m: 'auto', textAlign: 'center', color: 'text.disabled', py: 4 }}>
            <AppIcon
              name="ForumOutlined"
              fallback={ForumOutlinedIcon}
              sx={{ fontSize: 40, opacity: 0.4 }}
            />
            <Typography variant="body2" sx={{ mt: 1 }}>
              Ask the team lead about progress, the plan, blockers, or budget for
              <br />"{goal?.title || 'this goal'}".
            </Typography>
          </Box>
        )}
        {messages.map((m, i) => {
          if (m.sender === 'system') {
            return (
              <Typography
                key={i}
                variant="caption"
                sx={{ textAlign: 'center', color: 'text.secondary', px: 2 }}
              >
                {m.text}
              </Typography>
            );
          }
          const isUser = m.sender === 'user';
          return (
            <Box
              key={i}
              sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', gap: 1 }}
            >
              {!isUser && (
                <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: 13 }}>
                  TL
                </Avatar>
              )}
              <Box sx={{ maxWidth: '78%' }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.25,
                    borderRadius: 2,
                    bgcolor: isUser ? 'primary.main' : 'background.paper',
                    color: isUser ? 'primary.contrastText' : 'text.primary',
                    border: isUser ? 'none' : `1px solid ${theme.palette.divider}`,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  <Typography variant="body2">{m.text}</Typography>
                </Paper>
                {!isUser && <CouncilBlock council={m.council} />}
                {!isUser && <ActionChips actions={m.actions} goal={goal} onResult={appendSystem} />}
              </Box>
            </Box>
          );
        })}
        {sending && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
            <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: 13 }}>
              TL
            </Avatar>
            <CircularProgress size={16} />
            <Typography variant="caption">Team lead is thinking…</Typography>
          </Box>
        )}
        {error && (
          <Typography variant="caption" color="error.main">
            {error}
          </Typography>
        )}
      </Box>
    </FormDialog>
  );
}
