/**
 * [module: connection-hub]
 * ControllerTab - operate the platform from messenger / terminal-style command input.
 * Merges: command interface + command history + channels + personas (connections).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Collapse,
  Alert,
  Skeleton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  CircularProgress,
  useTheme,
  alpha,
} from '@mui/material';
import TerminalIcon from '@mui/icons-material/Terminal';
import SendIcon from '@mui/icons-material/Send';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import TelegramIcon from '@mui/icons-material/Telegram';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import EmptyState from '../../../components/Common/EmptyState';
import FormDialog from '../../../components/Common/FormDialog';
import { usePartnerAccessOptional } from '../../../context/PartnerAccessContext';
import { validateTelegramToken } from '../../../services/communicatorService';
import { supabase, hasSupabase } from '../../../lib/supabase';

import AppIcon from '../../../components/icons/AppIcon';

// ── Slash command autocomplete
const SLASH_COMMANDS = [
  { cmd: '/status', desc: 'List active agents and their state' },
  { cmd: '/agent [name] [action]', desc: 'Control an agent: start | pause | stop' },
  { cmd: '/build [project]', desc: 'Trigger a build or workflow' },
  { cmd: '/deploy [project]', desc: 'Trigger a deployment' },
  { cmd: '/logs [n]', desc: 'Return last N log entries' },
  { cmd: '/help', desc: 'List all available commands' },
  { cmd: '/plan [description]', desc: 'Generate an execution plan (AI)' },
];

// ── Platform metadata
export const PLATFORM_META = {
  telegram: {
    label: 'Telegram',
    Icon: TelegramIcon,
    color: '#229ED9',
    fields: [
      {
        key: 'bot_token',
        label: 'Bot Token',
        masked: true,
        hint: 'Get from @BotFather on Telegram',
      },
      {
        key: 'allowed_ids',
        label: 'Allowed User IDs',
        masked: false,
        hint: 'Comma-separated Telegram user IDs',
      },
    ],
  },
  discord: {
    label: 'Discord',
    Icon: HubOutlinedIcon,
    color: '#5865F2',
    fields: [
      {
        key: 'bot_token',
        label: 'Bot Token',
        masked: true,
        hint: 'Discord bot token from Developer Portal',
      },
      { key: 'guild_id', label: 'Guild ID', masked: false, hint: 'Server (guild) ID' },
      {
        key: 'allowed_ids',
        label: 'Allowed User IDs',
        masked: false,
        hint: 'Comma-separated Discord user IDs',
      },
    ],
  },
  slack: {
    label: 'Slack',
    Icon: HubOutlinedIcon,
    color: '#4A154B',
    fields: [
      { key: 'bot_token', label: 'Bot Token', masked: true, hint: 'xoxb-... token from Slack App' },
      {
        key: 'signing_secret',
        label: 'Signing Secret',
        masked: true,
        hint: 'From Slack App Basic Information',
      },
      {
        key: 'allowed_ids',
        label: 'Allowed User IDs',
        masked: false,
        hint: 'Comma-separated Slack user IDs',
      },
    ],
  },
  webhook: {
    label: 'Webhook',
    Icon: TerminalIcon,
    color: '#10B981',
    fields: [
      {
        key: 'secret',
        label: 'Webhook Secret',
        masked: true,
        hint: 'Used to verify incoming POST requests',
      },
    ],
  },
};

function MaskedField({ value, onChange, label, hint }) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      size="small"
      fullWidth
      label={label}
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      helperText={hint}
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => setVisible((p) => !p)} edge="end">
                {visible ? (
                  <AppIcon
                    name="VisibilityOff"
                    fallback={VisibilityOffIcon}
                    sx={{ fontSize: 18 }}
                  />
                ) : (
                  <AppIcon name="Visibility" fallback={VisibilityIcon} sx={{ fontSize: 18 }} />
                )}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
    />
  );
}

function StatusChipChannel({ status }) {
  const map = {
    active: { label: 'Active', color: 'success', Icon: CheckCircleOutlineIcon },
    inactive: { label: 'Inactive', color: 'default', Icon: PauseCircleOutlineIcon },
    error: { label: 'Error', color: 'error', Icon: ErrorOutlineIcon },
  };
  const { label, color, Icon } = map[status] || map.inactive;
  return (
    <Chip
      size="small"
      icon={<Icon sx={{ fontSize: '14px !important' }} />}
      label={label}
      color={color}
      variant="outlined"
      sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600 }}
    />
  );
}

// ── Command Interface
export function CommandInterface({ executing, lastResult, executeCommand }) {
  const theme = useTheme();
  const [input, setInput] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const inputRef = useRef(null);

  const filtered = input.startsWith('/')
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input.split(' ')[0]))
    : [];

  function handleSubmit() {
    if (!input.trim() || executing) return;
    executeCommand(input.trim());
    setInput('');
    setShowAutocomplete(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') setShowAutocomplete(false);
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 2.5,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: alpha(theme.palette.primary.main, 0.15),
        transition: 'border-color 0.2s',
        '&:focus-within': { borderColor: alpha(theme.palette.primary.main, 0.4) },
      }}
    >
      {/* Input bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          p: { xs: 1, sm: 1.5 },
          bgcolor: alpha(theme.palette.text.primary, 0.02),
        }}
      >
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1.5,
            flexShrink: 0,
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            color: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon name="Terminal" fallback={TerminalIcon} sx={{ fontSize: 15 }} />
        </Box>
        <TextField
          inputRef={inputRef}
          size="small"
          fullWidth
          placeholder="Type a command... (e.g. /status, /help)"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowAutocomplete(e.target.value.startsWith('/'));
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => input.startsWith('/') && setShowAutocomplete(true)}
          onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
          disabled={executing}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              fontFamily: 'monospace',
              fontSize: '0.82rem',
            },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
          }}
        />
        <IconButton
          onClick={handleSubmit}
          disabled={!input.trim() || executing}
          sx={{
            color: 'primary.main',
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            borderRadius: 2,
            width: 34,
            height: 34,
          }}
        >
          {executing ? (
            <CircularProgress size={16} />
          ) : (
            <AppIcon name="Send" fallback={SendIcon} sx={{ fontSize: 16 }} />
          )}
        </IconButton>
      </Box>
      {/* Autocomplete */}
      {showAutocomplete && filtered.length > 0 && (
        <Box
          sx={{ borderTop: '1px solid', borderColor: 'divider', maxHeight: 180, overflow: 'auto' }}
        >
          {filtered.map((c) => (
            <Box
              key={c.cmd}
              onClick={() => {
                setInput(c.cmd.split(' ')[0] + ' ');
                setShowAutocomplete(false);
                inputRef.current?.focus();
              }}
              sx={{
                px: 1.5,
                py: 0.6,
                cursor: 'pointer',
                display: 'flex',
                gap: 1.25,
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) },
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  color: 'primary.main',
                  minWidth: 120,
                  fontSize: '0.8rem',
                }}
              >
                {c.cmd}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                {c.desc}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      {/* Last result */}
      {lastResult && (
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', p: { xs: 1, sm: 1.5 } }}>
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.78rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.5,
              color: lastResult.status === 'error' ? 'error.main' : 'text.primary',
            }}
          >
            {lastResult.output || 'Done.'}
          </Typography>

          {lastResult.calls?.length > 0 && (
            <Box sx={{ mt: 0.75, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {lastResult.calls.map((c, i) => (
                <Chip
                  key={i}
                  label={c.tool}
                  size="small"
                  color={c.needsConfirmation ? 'warning' : 'primary'}
                  variant="outlined"
                  sx={{ height: 18, fontSize: '0.62rem', fontFamily: 'monospace' }}
                />
              ))}
            </Box>
          )}

          {(lastResult.cost > 0 || lastResult.model) && (
            <Box sx={{ mt: 0.5, display: 'flex', gap: 1.5 }}>
              {lastResult.cost > 0 && (
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
                  Cost: ${lastResult.cost.toFixed(4)}
                </Typography>
              )}
              {lastResult.model && (
                <Typography
                  variant="caption"
                  sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem' }}
                >
                  {lastResult.model}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      )}
    </Paper>
  );
}

// ── Command History
export function CommandHistory({ commands, loading }) {
  const theme = useTheme();
  const [expandedId, setExpandedId] = useState(null);

  if (loading)
    return [1, 2, 3].map((i) => (
      <Skeleton key={i} height={44} sx={{ mb: 0.75, borderRadius: 2 }} />
    ));
  if (commands.length === 0) {
    return (
      <Box sx={{ py: 3, textAlign: 'center' }}>
        <AppIcon
          name="Terminal"
          fallback={TerminalIcon}
          sx={{ fontSize: 32, color: 'text.disabled', mb: 0.5, opacity: 0.4 }}
        />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          No commands yet. Try <b>/help</b> above.
        </Typography>
      </Box>
    );
  }

  return commands.slice(0, 30).map((cmd) => {
    const ts = cmd.created_at
      ? new Date(cmd.created_at).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
    const expanded = expandedId === cmd.id;

    return (
      <Paper key={cmd.id} variant="outlined" sx={{ mb: 0.5, borderRadius: 2, overflow: 'hidden' }}>
        <Box
          onClick={() => setExpandedId(expanded ? null : cmd.id)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.25,
            py: 0.5,
            cursor: 'pointer',
            '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.02) },
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: 'text.disabled', minWidth: { xs: 50, sm: 90 }, fontSize: '0.65rem' }}
          >
            {ts}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              fontWeight: 600,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '0.78rem',
            }}
          >
            {cmd.input}
          </Typography>
          <Chip
            label={cmd.status}
            size="small"
            color={
              cmd.status === 'success' ? 'success' : cmd.status === 'error' ? 'error' : 'default'
            }
            sx={{ height: 18, fontSize: '0.62rem' }}
          />
          <IconButton size="small" sx={{ p: 0.25 }}>
            {expanded ? (
              <AppIcon name="ExpandLess" fallback={ExpandLessIcon} sx={{ fontSize: 15 }} />
            ) : (
              <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} sx={{ fontSize: 15 }} />
            )}
          </IconButton>
        </Box>
        <Collapse in={expanded}>
          <Box sx={{ px: 1.25, pb: 0.75, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                whiteSpace: 'pre-wrap',
                mt: 0.5,
                color: 'text.secondary',
                lineHeight: 1.5,
              }}
            >
              {cmd.output || '(no output)'}
            </Typography>
          </Box>
        </Collapse>
      </Paper>
    );
  });
}

// ── Connections Section
export function ConnectionsSection(props) {
  const {
    channels,
    channelsLoading,
    createChannel,
    editChannel,
    removeChannel,
    personas,
    personasLoading,
    createPersona,
    editPersona,
    removePersona,
  } = props;

  const theme = useTheme();
  const { roleId } = usePartnerAccessOptional?.() || {};
  const isAdmin = roleId === 'role-super-admin' || roleId === 'role-manager';
  const [showConnections, setShowConnections] = useState(false);
  const [channelDlg, setChannelDlg] = useState({ open: false, initial: null });
  const [channelSaving, setChannelSaving] = useState(false);
  const [personaDlg, setPersonaDlg] = useState({ open: false, initial: null });
  const [personaSaving, setPersonaSaving] = useState(false);
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    if (!hasSupabase()) return;
    supabase
      .from('agents')
      .select('agent_id, role, availability_status')
      .order('created_at', { ascending: false })
      .then(({ data }) => setAgents(data || []))
      .catch(() => {});
  }, []);

  async function handleSaveChannel(form) {
    setChannelSaving(true);
    try {
      if (form.id) await editChannel(form.id, form);
      else await createChannel(form);
      setChannelDlg({ open: false, initial: null });
    } catch {
    } finally {
      setChannelSaving(false);
    }
  }

  async function handleSavePersona(form) {
    setPersonaSaving(true);
    try {
      if (form.id) await editPersona(form.id, form);
      else await createPersona(form);
      setPersonaDlg({ open: false, initial: null });
    } catch {
    } finally {
      setPersonaSaving(false);
    }
  }

  return (
    <>
      <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        <Box
          onClick={() => setShowConnections(!showConnections)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            cursor: 'pointer',
            p: 1.25,
            '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.02) },
          }}
        >
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1.5,
              flexShrink: 0,
              bgcolor: alpha(theme.palette.info.main, 0.1),
              color: 'info.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon
              name="SettingsInputAntenna"
              fallback={SettingsInputAntennaIcon}
              sx={{ fontSize: 15 }}
            />
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
            Connections
          </Typography>
          <Chip
            label={`${channels.length} ch · ${personas.length} personas`}
            size="small"
            sx={{ height: 20, fontSize: '0.62rem', fontWeight: 600 }}
          />
          <Box sx={{ ml: 'auto' }}>
            {showConnections ? (
              <AppIcon
                name="ExpandLess"
                fallback={ExpandLessIcon}
                sx={{ fontSize: 18, color: 'text.secondary' }}
              />
            ) : (
              <AppIcon
                name="ExpandMore"
                fallback={ExpandMoreIcon}
                sx={{ fontSize: 18, color: 'text.secondary' }}
              />
            )}
          </Box>
        </Box>

        <Collapse in={showConnections}>
          <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
            {!isAdmin ? (
              <Alert
                severity="warning"
                icon={<AppIcon name="LockOutlined" fallback={LockOutlinedIcon} />}
                sx={{ m: 1.25, borderRadius: 2 }}
              >
                Only administrators can manage connections.
              </Alert>
            ) : (
              <Box sx={{ p: 1.25 }}>
                {/* Channels */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontSize: '0.62rem',
                    }}
                  >
                    Channels
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 13 }} />}
                    onClick={() => setChannelDlg({ open: true, initial: null })}
                    sx={{ ml: 'auto', textTransform: 'none', fontSize: '0.7rem', borderRadius: 2 }}
                  >
                    Add
                  </Button>
                </Box>

                {channelsLoading ? (
                  <Skeleton height={48} sx={{ borderRadius: 2 }} />
                ) : channels.length === 0 ? (
                  <Typography
                    variant="body2"
                    sx={{ color: 'text.disabled', mb: 1.5, fontSize: '0.78rem' }}
                  >
                    No channels connected.
                  </Typography>
                ) : (
                  <Box
                    sx={{
                      display: 'grid',
                      gap: 0.75,
                      gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                      mb: 1.5,
                    }}
                  >
                    {channels.map((ch) => {
                      const meta = PLATFORM_META[ch.platform] || PLATFORM_META.webhook;
                      return (
                        <Paper
                          key={ch.id}
                          variant="outlined"
                          sx={{
                            p: 1,
                            borderRadius: 2,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.75,
                          }}
                        >
                          <Box
                            sx={{
                              width: 28,
                              height: 28,
                              borderRadius: 1.5,
                              bgcolor: alpha(meta.color, 0.1),
                              color: meta.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <AppIcon fallback={meta.Icon} sx={{ fontSize: 14 }} />
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600, fontSize: '0.78rem' }}
                              noWrap
                            >
                              {ch.name || meta.label}
                            </Typography>
                            <StatusChipChannel status={ch.status} />
                          </Box>
                          <IconButton
                            size="small"
                            onClick={() => setChannelDlg({ open: true, initial: ch })}
                            sx={{ p: 0.25 }}
                          >
                            <AppIcon
                              name="EditOutlined"
                              fallback={EditOutlinedIcon}
                              sx={{ fontSize: 13 }}
                            />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => removeChannel(ch.id)}
                            sx={{
                              p: 0.25,
                              color: 'text.disabled',
                              '&:hover': { color: 'error.main' },
                            }}
                          >
                            <AppIcon
                              name="DeleteOutline"
                              fallback={DeleteOutlineIcon}
                              sx={{ fontSize: 13 }}
                            />
                          </IconButton>
                        </Paper>
                      );
                    })}
                  </Box>
                )}

                {/* Personas */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontSize: '0.62rem',
                    }}
                  >
                    Agent Personas
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 13 }} />}
                    onClick={() => setPersonaDlg({ open: true, initial: null })}
                    sx={{ ml: 'auto', textTransform: 'none', fontSize: '0.7rem', borderRadius: 2 }}
                  >
                    Assign
                  </Button>
                </Box>

                {personasLoading ? (
                  <Skeleton height={48} sx={{ borderRadius: 2 }} />
                ) : personas.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.78rem' }}>
                    No agent personas assigned.
                  </Typography>
                ) : (
                  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', py: 0.5 }}>
                            Agent
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', py: 0.5 }}>
                            Bot
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', py: 0.5 }}>
                            Status
                          </TableCell>
                          <TableCell
                            sx={{ fontWeight: 700, fontSize: '0.7rem', py: 0.5 }}
                            align="right"
                          >
                            Actions
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {personas.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell sx={{ fontSize: '0.72rem', py: 0.4 }}>
                              {p.agent_id}
                            </TableCell>
                            <TableCell
                              sx={{ fontSize: '0.72rem', fontFamily: 'monospace', py: 0.4 }}
                            >
                              @{p.bot_username || '-'}
                            </TableCell>
                            <TableCell sx={{ py: 0.4 }}>
                              <Chip
                                size="small"
                                label={p.status === 'active' ? 'Active' : 'Inactive'}
                                color={p.status === 'active' ? 'success' : 'default'}
                                variant="outlined"
                                sx={{ height: 18, fontSize: '0.62rem', cursor: 'pointer' }}
                                onClick={() =>
                                  editPersona(p.id, {
                                    status: p.status === 'active' ? 'inactive' : 'active',
                                  })
                                }
                              />
                            </TableCell>
                            <TableCell align="right" sx={{ py: 0.4 }}>
                              <IconButton
                                size="small"
                                onClick={() => setPersonaDlg({ open: true, initial: p })}
                                sx={{ p: 0.25 }}
                              >
                                <AppIcon
                                  name="EditOutlined"
                                  fallback={EditOutlinedIcon}
                                  sx={{ fontSize: 13 }}
                                />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => removePersona(p.id)}
                                sx={{
                                  p: 0.25,
                                  color: 'text.disabled',
                                  '&:hover': { color: 'error.main' },
                                }}
                              >
                                <AppIcon
                                  name="DeleteOutline"
                                  fallback={DeleteOutlineIcon}
                                  sx={{ fontSize: 13 }}
                                />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}
          </Box>
        </Collapse>
      </Paper>
      <ChannelDialogInline
        open={channelDlg.open}
        initial={channelDlg.initial}
        onClose={() => setChannelDlg({ open: false, initial: null })}
        onSave={handleSaveChannel}
        saving={channelSaving}
      />
      <PersonaDialogInline
        open={personaDlg.open}
        initial={personaDlg.initial}
        agents={agents}
        onClose={() => setPersonaDlg({ open: false, initial: null })}
        onSave={handleSavePersona}
        saving={personaSaving}
      />
    </>
  );
}

// ── Channel Dialog
export function ChannelDialogInline({ open, initial, onClose, onSave, saving, lockedPlatform }) {
  const theme = useTheme();
  const defaultPlatform = lockedPlatform || 'telegram';
  const [form, setForm] = useState({ platform: defaultPlatform, name: '', config: {} });
  const isEdit = !!initial?.id;

  useEffect(() => {
    if (open) {
      setForm(
        initial ? { ...initial } : { platform: lockedPlatform || 'telegram', name: '', config: {} }
      );
    }
  }, [open, initial, lockedPlatform]);

  const meta = PLATFORM_META[form.platform] || PLATFORM_META.webhook;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit channel' : `Connect ${meta.label}`}
      icon={HubOutlinedIcon}
      maxWidth="sm"
      primaryLabel={saving ? 'Saving...' : isEdit ? 'Save' : 'Connect'}
      onPrimary={() => onSave(form)}
      primaryDisabled={saving || !form.platform}
      primaryLoading={saving}
      contentSx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      {!isEdit && !lockedPlatform && (
        <FormControl size="small" fullWidth>
          <InputLabel>Platform</InputLabel>
          <Select
            value={form.platform}
            label="Platform"
            onChange={(e) => setForm({ ...form, platform: e.target.value, config: {} })}
            sx={{ borderRadius: 2 }}
          >
            {Object.entries(PLATFORM_META).map(([k, m]) => (
              <MenuItem key={k} value={k}>
                {m.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      <TextField
        size="small"
        fullWidth
        label="Friendly name"
        value={form.name || ''}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />
      {meta.fields.map((f) =>
        f.masked ? (
          <MaskedField
            key={f.key}
            label={f.label}
            hint={f.hint}
            value={form.config?.[f.key] || ''}
            onChange={(e) =>
              setForm({ ...form, config: { ...form.config, [f.key]: e.target.value } })
            }
          />
        ) : (
          <TextField
            key={f.key}
            size="small"
            fullWidth
            label={f.label}
            value={form.config?.[f.key] || ''}
            onChange={(e) =>
              setForm({ ...form, config: { ...form.config, [f.key]: e.target.value } })
            }
            helperText={f.hint}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        )
      )}
      {form.platform === 'webhook' && (
        <Box
          sx={{
            p: 1,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.info.main, 0.04),
            border: '1px solid',
            borderColor: alpha(theme.palette.info.main, 0.15),
          }}
        >
          <Typography
            variant="caption"
            color="info.main"
            sx={{ fontWeight: 600, fontSize: '0.68rem' }}
          >
            Inbound webhook URL (after save):
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'monospace',
              display: 'block',
              mt: 0.25,
              color: 'text.secondary',
              fontSize: '0.68rem',
            }}
          >
            https://orchestratori.vercel.app/api/communicator/webhook/webhook
          </Typography>
        </Box>
      )}
    </FormDialog>
  );
}

// ── Persona Dialog
function PersonaDialogInline({ open, initial, agents, onClose, onSave, saving }) {
  const [agentId, setAgentId] = useState('');
  const [personaName, setPersonaName] = useState('');
  const [botToken, setBotToken] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [tokenVisible, setTokenVisible] = useState(false);
  const [validating, setValidating] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [tokenValid, setTokenValid] = useState(false);
  const isEdit = !!initial?.id;

  useEffect(() => {
    if (open) {
      setAgentId(initial?.agent_id || '');
      setPersonaName(initial?.persona_name || '');
      setBotToken('');
      setBotUsername(initial?.bot_username || '');
      setTokenError('');
      setTokenValid(false);
    }
  }, [open, initial]);

  async function handleValidate() {
    if (!botToken) return;
    setValidating(true);
    setTokenError('');
    setTokenValid(false);
    try {
      const info = await validateTelegramToken(botToken);
      setBotUsername(info.username || '');
      if (!personaName) setPersonaName(info.first_name || '');
      setTokenValid(true);
    } catch (err) {
      setTokenError(err.message);
    } finally {
      setValidating(false);
    }
  }

  function handleSave() {
    const form = {
      agent_id: agentId,
      platform: 'telegram',
      persona_name: personaName,
      bot_username: botUsername,
    };
    if (botToken) form.bot_token = botToken;
    if (isEdit) form.id = initial.id;
    onSave(form);
  }

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit persona' : 'Assign persona'}
      icon={SmartToyOutlinedIcon}
      maxWidth="sm"
      primaryLabel={saving ? 'Saving...' : isEdit ? 'Save' : 'Assign'}
      onPrimary={handleSave}
      primaryDisabled={saving || !agentId}
      primaryLoading={saving}
      contentSx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      <FormControl size="small" fullWidth disabled={isEdit}>
        <InputLabel>Agent</InputLabel>
        <Select
          value={agentId}
          label="Agent"
          onChange={(e) => setAgentId(e.target.value)}
          sx={{ borderRadius: 2 }}
        >
          {(agents || []).map((a) => (
            <MenuItem key={a.agent_id} value={a.agent_id}>
              {a.agent_id} - {a.role || 'no role'}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Box sx={{ display: 'flex', gap: 0.75 }}>
        {['telegram', 'discord', 'slack'].map((p) => (
          <Chip
            key={p}
            label={
              p === 'telegram' ? 'Telegram' : p === 'discord' ? 'Discord (soon)' : 'Slack (soon)'
            }
            color={p === 'telegram' ? 'primary' : 'default'}
            variant={p === 'telegram' ? 'filled' : 'outlined'}
            disabled={p !== 'telegram'}
            sx={{ textTransform: 'capitalize', fontSize: '0.75rem' }}
          />
        ))}
      </Box>
      <TextField
        size="small"
        fullWidth
        label="Bot Token"
        type={tokenVisible ? 'text' : 'password'}
        value={botToken}
        onChange={(e) => {
          setBotToken(e.target.value);
          setTokenValid(false);
        }}
        helperText={
          isEdit ? 'Leave blank to keep existing token' : 'Paste Telegram bot token from @BotFather'
        }
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setTokenVisible(!tokenVisible)}>
                  {tokenVisible ? (
                    <AppIcon
                      name="VisibilityOff"
                      fallback={VisibilityOffIcon}
                      sx={{ fontSize: 18 }}
                    />
                  ) : (
                    <AppIcon name="Visibility" fallback={VisibilityIcon} sx={{ fontSize: 18 }} />
                  )}
                </IconButton>
                <Button
                  size="small"
                  onClick={handleValidate}
                  disabled={!botToken || validating}
                  sx={{ ml: 0.5, textTransform: 'none', fontSize: '0.72rem' }}
                >
                  {validating ? 'Verifying...' : 'Verify'}
                </Button>
              </InputAdornment>
            ),
          },
        }}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />
      {tokenError && (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {tokenError}
        </Alert>
      )}
      {tokenValid && (
        <Alert severity="success" sx={{ borderRadius: 2 }}>
          Token verified: @{botUsername}
        </Alert>
      )}
      <TextField
        size="small"
        fullWidth
        label="Persona name"
        value={personaName}
        onChange={(e) => setPersonaName(e.target.value)}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />
    </FormDialog>
  );
}

// ── Connect Telegram CTA banner
function ConnectTelegramBanner({ onConnect }) {
  const theme = useTheme();
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: 2.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        background: `linear-gradient(135deg, ${alpha('#229ED9', 0.08)} 0%, ${alpha('#229ED9', 0.02)} 100%)`,
        border: '1px solid',
        borderColor: alpha('#229ED9', 0.25),
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 1.75,
          flexShrink: 0,
          bgcolor: alpha('#229ED9', 0.15),
          color: '#229ED9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppIcon name="Telegram" fallback={TelegramIcon} sx={{ fontSize: 20 }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
          Run Orqaly from Telegram
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
          Two taps to link - no BotFather, no tokens.
        </Typography>
      </Box>
      <Button
        size="small"
        variant="contained"
        onClick={onConnect}
        sx={{
          borderRadius: 2,
          textTransform: 'none',
          fontWeight: 600,
          bgcolor: '#229ED9',
          '&:hover': { bgcolor: '#1a8fc7' },
        }}
      >
        Connect
      </Button>
    </Paper>
  );
}

// ── Main Tab
export default function ControllerTab(props) {
  const {
    commandHistory,
    historyLoading,
    executing,
    lastResult,
    executeCommand,
    channels,
    channelsLoading,
    createChannel,
    editChannel,
    removeChannel,
    personas,
    personasLoading,
    createPersona,
    editPersona,
    removePersona,
  } = props;

  const navigate = useNavigate();
  const hasActiveTelegram = (channels || []).some(
    (c) => c.platform === 'telegram' && c.status === 'active'
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {!hasActiveTelegram && (
        <ConnectTelegramBanner onConnect={() => navigate('/communicator/connect-telegram')} />
      )}
      <CommandInterface
        executing={executing}
        lastResult={lastResult}
        executeCommand={executeCommand}
      />
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
          <AppIcon
            name="HistoryOutlined"
            fallback={HistoryOutlinedIcon}
            sx={{ fontSize: 16, color: 'text.secondary' }}
          />
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              color: 'text.secondary',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontSize: '0.65rem',
            }}
          >
            Command History
          </Typography>
          <Chip
            label={commandHistory.length}
            size="small"
            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }}
          />
        </Box>
        <CommandHistory commands={commandHistory} loading={historyLoading} />
      </Box>
      <ConnectionsSection
        channels={channels}
        channelsLoading={channelsLoading}
        createChannel={createChannel}
        editChannel={editChannel}
        removeChannel={removeChannel}
        personas={personas}
        personasLoading={personasLoading}
        createPersona={createPersona}
        editPersona={editPersona}
        removePersona={removePersona}
      />
    </Box>
  );
}
