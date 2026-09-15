import { useId, useRef, useState } from 'react';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import {
  Box,
  Button,
  Divider,
  FormControl,
  InputLabel,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { AgentAvatar } from '../GcpWorkspace/AgentAvatar.jsx';
import { BuildChatActions, BuildChatNotice } from './BuildChatControls.jsx';
import { ASSISTANT_MODES, ASSISTANT_MODE_ORDER } from './assistant-modes.js';
import {
  SolutionConversationNotices,
  SolutionConversationActions,
} from '../GcpWorkspace/SolutionConversation.jsx';

const MODE_ICONS = Object.freeze({
  auto: AutoAwesomeRoundedIcon,
  assistant: ChatBubbleOutlineRoundedIcon,
  research: SearchRoundedIcon,
  goal: SmartToyOutlinedIcon,
});

const AGENT_LIFETIME_OPTIONS = Object.freeze([
  Object.freeze({
    value: 'temporary',
    label: 'Temporary',
    description:
      'Becomes unavailable within 90 days in Preview. Cleanup when the task ends is not connected yet.',
  }),
  Object.freeze({
    value: 'persistent',
    label: 'Keep as digital twin',
    description: 'Retain this Agent identity in your user scope after the task.',
  }),
]);

function submitLabel(intent, mode) {
  return intent === 'auto' ? 'Send with Auto routing' : `Send as ${mode.label}`;
}

export function AssistantComposer({
  agentLifetime = 'temporary',
  agentLookupError = null,
  agentLookupLoading = false,
  agents = [],
  busy,
  canStop,
  draft,
  intent,
  inputRef,
  onAgentLifetimeChange,
  onRetrySelectedAgent,
  onSelectedAgentChange,
  onDraftChange,
  onIntentChange,
  onStop,
  onSubmit,
  pending,
  selectedAgentId = '',
  stopLabel = 'Stop response',
  stopping = false,
  recentTaskAgent = null,
  onOpenTask,
  workflowController = null,
  buildController = null,
}) {
  const modeMenuId = useId();
  const modeTriggerRef = useRef(null);
  const [modeMenuAnchor, setModeMenuAnchor] = useState(null);
  const selectedMode = ASSISTANT_MODES[intent] || ASSISTANT_MODES.auto;
  const SelectedModeIcon = MODE_ICONS[intent] || MODE_ICONS.auto;
  const workInProgress =
    busy || Boolean(pending) || !!workflowController?.busy || !!buildController?.busy;
  const modeMenuOpen = Boolean(modeMenuAnchor);
  const sendLabel = submitLabel(intent, selectedMode);
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || null;
  const selectedAgentCanWork =
    !selectedAgentId ||
    Boolean(selectedAgent && ['active', 'draft', 'proposed'].includes(selectedAgent.status));

  const chooseMode = (nextIntent) => {
    onIntentChange(nextIntent);
    setModeMenuAnchor(null);
    window.requestAnimationFrame(() => inputRef?.current?.focus());
  };

  const closeModeMenu = (_event, reason) => {
    setModeMenuAnchor(null);
    if (reason === 'escapeKeyDown') {
      window.requestAnimationFrame(() => modeTriggerRef.current?.focus());
    }
  };

  return (
    <Paper
      component="form"
      variant="outlined"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft);
      }}
      sx={{
        px: { xs: 1, sm: 1.25 },
        pt: 0.75,
        pb: 0.625,
        borderRadius: 2.25,
        mx: { xs: 1, sm: 2 },
        mb: { xs: 'max(12px, env(safe-area-inset-bottom))', sm: 1.5 },
        flexShrink: 0,
        boxShadow: 'none',
      }}
    >
      {workflowController ? (
        <SolutionConversationNotices controller={workflowController} />
      ) : buildController ? (
        <BuildChatNotice controller={buildController} />
      ) : recentTaskAgent && intent !== 'goal' ? (
        <Stack
          direction="row"
          alignItems="center"
          gap={1}
          sx={{ pb: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <AgentAvatar avatar={recentTaskAgent.avatar} name={recentTaskAgent.name} size={24} />
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ flex: 1, minWidth: 0 }}
            title={recentTaskAgent.task}
          >
            Recent task · {recentTaskAgent.name}
          </Typography>
          <Button size="small" color="inherit" onClick={() => onOpenTask?.(recentTaskAgent.runId)}>
            Task controls
          </Button>
        </Stack>
      ) : null}
      <TextField
        autoFocus
        fullWidth
        inputRef={inputRef}
        multiline
        minRows={2}
        maxRows={8}
        variant="standard"
        placeholder={
          workflowController
            ? workflowController.clarification
              ? 'Answer here to continue…'
              : 'Ask about this workflow or describe a change…'
            : buildController
              ? buildController.mode === 'answer'
                ? 'Your answer…'
                : 'Describe the change to this draft…'
              : selectedMode.placeholder
        }
        value={draft}
        inputProps={{
          'aria-label': 'Message Assistant',
          maxLength: workflowController ? 8000 : buildController?.maxLength || 24_000,
        }}
        disabled={!!workflowController?.busy || !!buildController?.busy}
        error={
          !!workflowController?.hasSecret ||
          !!workflowController?.messageTooLong ||
          !!buildController?.hasSecret
        }
        helperText={
          workflowController?.hasSecret || buildController?.hasSecret
            ? 'Add credentials through secure connection setup, not chat.'
            : workflowController?.messageTooLong
              ? 'Shorten this workflow message to 8,000 characters before sending.'
              : undefined
        }
        InputProps={{ disableUnderline: true }}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
            event.preventDefault();
            onSubmit(draft);
          }
        }}
        sx={{
          '& .MuiInputBase-root': {
            alignItems: 'flex-start',
            fontSize: { xs: '1rem', sm: '0.9375rem' },
            lineHeight: 1.5,
          },
          '& .MuiInputBase-inputMultiline': { py: 0.375 },
        }}
      />

      {!workflowController && !buildController && intent === 'goal' ? (
        <Stack gap={0.75} sx={{ pt: 0.75 }}>
          <FormControl fullWidth size="small" disabled={workInProgress}>
            <InputLabel id={`${modeMenuId}-agent-label`}>Agent for this work</InputLabel>
            <Select
              labelId={`${modeMenuId}-agent-label`}
              label="Agent for this work"
              value={selectedAgentId}
              onChange={(event) => onSelectedAgentChange?.(event.target.value)}
              renderValue={(value) => {
                const agent = agents.find((candidate) => candidate.id === value);
                if (agent) return `${agent.name} · ${agent.role || 'Agent'}`;
                if (value) {
                  return agentLookupError
                    ? 'Selected Agent unavailable'
                    : 'Loading selected Agent…';
                }
                return 'Create a new Agent';
              }}
            >
              {selectedAgentId && !selectedAgent ? (
                <MenuItem value={selectedAgentId} disabled>
                  {agentLookupError ? 'Selected Agent unavailable' : 'Loading selected Agent…'}
                </MenuItem>
              ) : null}
              <MenuItem value="">
                <Stack direction="row" alignItems="center" gap={1}>
                  <AgentAvatar name="New Agent" size={28} />
                  <Box>
                    <Typography variant="body2">Create a new Agent</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Build an identity from this assignment
                    </Typography>
                  </Box>
                </Stack>
              </MenuItem>
              {agents.map((agent) => (
                <MenuItem
                  key={agent.id}
                  value={agent.id}
                  disabled={!['active', 'draft', 'proposed'].includes(agent.status)}
                >
                  <Stack direction="row" alignItems="center" gap={1}>
                    <AgentAvatar avatar={agent.avatar} name={agent.name} size={28} />
                    <Box>
                      <Typography variant="body2">{agent.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {agent.role || 'Agent'} · {agent.status}
                      </Typography>
                    </Box>
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {selectedAgentId && !selectedAgent ? (
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              gap={0.75}
            >
              <Typography
                role={agentLookupError ? 'alert' : 'status'}
                variant="caption"
                color={agentLookupError ? 'error' : 'text.secondary'}
              >
                {agentLookupError
                  ? `Could not load the selected Agent. ${agentLookupError.message}`
                  : agentLookupLoading
                    ? 'Loading the selected Agent profile…'
                    : 'Waiting for the selected Agent profile…'}
              </Typography>
              {agentLookupError ? (
                <Button type="button" size="small" color="inherit" onClick={onRetrySelectedAgent}>
                  Retry Agent
                </Button>
              ) : null}
            </Stack>
          ) : selectedAgent ? (
            <Typography variant="caption" color="text.secondary">
              {selectedAgentCanWork
                ? `Reuses ${selectedAgent.name}'s identity and versioned profile. This Goal remains isolated to your workspace and user scope.`
                : `${selectedAgent.name} is ${selectedAgent.status} and cannot accept work. Resume it or select another Agent.`}
            </Typography>
          ) : (
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              alignItems={{ xs: 'stretch', sm: 'center' }}
              gap={{ xs: 0.5, sm: 1 }}
            >
              <Typography
                id={`${modeMenuId}-agent-lifetime-label`}
                variant="caption"
                color="text.secondary"
                sx={{ flexShrink: 0 }}
              >
                New Agent lifetime
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={agentLifetime}
                disabled={workInProgress}
                aria-labelledby={`${modeMenuId}-agent-lifetime-label`}
                onChange={(_event, value) => {
                  if (value) onAgentLifetimeChange?.(value);
                }}
                sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}
              >
                {AGENT_LIFETIME_OPTIONS.map((option) => (
                  <ToggleButton
                    key={option.value}
                    value={option.value}
                    aria-label={`${option.label}. ${option.description}`}
                    sx={{
                      minHeight: 30,
                      px: 1,
                      py: 0.25,
                      flex: { xs: 1, sm: 'initial' },
                      textTransform: 'none',
                    }}
                  >
                    {option.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>
                {
                  AGENT_LIFETIME_OPTIONS.find((option) => option.value === agentLifetime)
                    ?.description
                }
              </Typography>
            </Stack>
          )}
          <Typography variant="caption" color="text.secondary">
            The cloud reasoning service handles research. External actions require a separate exact approval
            before the private n8n runtime can start.
          </Typography>
        </Stack>
      ) : null}

      <Divider sx={{ mt: 0.625, mb: 0.5 }} />

      {workflowController ? (
        <SolutionConversationActions controller={workflowController} />
      ) : buildController ? (
        <BuildChatActions controller={buildController} />
      ) : (
        <Stack direction="row" alignItems="center" gap={0.5} sx={{ minHeight: 44 }}>
          <Button
            ref={modeTriggerRef}
            type="button"
            id={`${modeMenuId}-trigger`}
            size="small"
            color="inherit"
            aria-label={`Action for this message: ${selectedMode.label}`}
            aria-controls={modeMenuOpen ? modeMenuId : undefined}
            aria-haspopup="menu"
            aria-expanded={modeMenuOpen}
            startIcon={<SelectedModeIcon sx={{ fontSize: 17 }} />}
            endIcon={<ExpandMoreRoundedIcon sx={{ fontSize: 17 }} />}
            onClick={(event) => setModeMenuAnchor(event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowDown') return;
              event.preventDefault();
              setModeMenuAnchor(event.currentTarget);
            }}
            sx={{
              minHeight: { xs: 44, sm: 32 },
              minWidth: 0,
              px: 0.75,
              borderRadius: 1.25,
              bgcolor: 'action.selected',
              textTransform: 'none',
              '& .MuiButton-startIcon': { mr: 0.625 },
              '& .MuiButton-endIcon': { ml: 0.375 },
            }}
          >
            {selectedMode.label}
          </Button>
          <Menu
            anchorEl={modeMenuAnchor}
            open={modeMenuOpen}
            onClose={closeModeMenu}
            anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
            transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            MenuListProps={{
              id: modeMenuId,
              'aria-label': 'Choose action for this message',
              dense: true,
            }}
            slotProps={{
              paper: {
                sx: {
                  mt: 0.5,
                  width: 320,
                  maxWidth: 'calc(100vw - 24px)',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  boxShadow: 8,
                },
              },
            }}
          >
            {ASSISTANT_MODE_ORDER.map((value) => {
              const mode = ASSISTANT_MODES[value];
              const ModeIcon = MODE_ICONS[value];
              const selected = intent === value;
              return (
                <MenuItem
                  key={value}
                  role="menuitemradio"
                  aria-checked={selected}
                  selected={selected}
                  onClick={() => chooseMode(value)}
                  sx={{ alignItems: 'flex-start', gap: 1, py: 0.75, borderRadius: 1, mx: 0.5 }}
                >
                  <ModeIcon sx={{ mt: 0.25, fontSize: 18, color: 'text.secondary' }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="baseline" gap={0.75}>
                      <Typography variant="body2" color="text.primary" fontWeight={650}>
                        {mode.label}
                      </Typography>
                      {value === 'auto' ? (
                        <Typography variant="caption" color="text.secondary">
                          Recommended
                        </Typography>
                      ) : null}
                    </Stack>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', lineHeight: 1.35, whiteSpace: 'normal' }}
                    >
                      {mode.description}
                    </Typography>
                  </Box>
                  {selected ? (
                    <CheckRoundedIcon
                      aria-hidden
                      sx={{ mt: 0.25, fontSize: 18, color: 'text.primary' }}
                    />
                  ) : null}
                </MenuItem>
              );
            })}
          </Menu>

          <Box sx={{ flex: 1 }} />

          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ display: { xs: 'none', lg: 'block' }, mr: 0.25 }}
          >
            {workInProgress
              ? 'Draft while this turn runs'
              : 'Enter to send · Shift+Enter for a new line'}
          </Typography>

          {canStop ? (
            <Tooltip title={stopping ? 'Stopping…' : stopLabel}>
              <span>
                <IconButton
                  type="button"
                  size="small"
                  color="inherit"
                  disabled={stopping}
                  onClick={onStop}
                  aria-label={stopping ? 'Stopping current turn' : stopLabel}
                  sx={{
                    position: 'relative',
                    width: 44,
                    height: 44,
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      inset: 4,
                      borderRadius: '50%',
                      bgcolor: 'action.hover',
                    },
                    '& svg': { position: 'relative' },
                    '&.Mui-focusVisible': {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                      outlineOffset: 2,
                    },
                  }}
                >
                  <StopRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
          ) : (
            <Tooltip title={sendLabel}>
              <span>
                <IconButton
                  type="submit"
                  size="small"
                  disabled={workInProgress || !draft.trim() || !selectedAgentCanWork}
                  aria-label={sendLabel}
                  sx={{
                    position: 'relative',
                    width: 44,
                    height: 44,
                    bgcolor: 'transparent',
                    color: 'background.paper',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      inset: 4,
                      borderRadius: '50%',
                      bgcolor: 'text.primary',
                    },
                    '&:hover': { bgcolor: 'transparent' },
                    '&:hover::before': { bgcolor: 'text.secondary' },
                    '&.Mui-disabled::before': {
                      bgcolor: 'action.disabledBackground',
                    },
                    '&.Mui-disabled': { color: 'text.disabled' },
                    '& svg': { position: 'relative' },
                    '&.Mui-focusVisible': {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                      outlineOffset: 2,
                    },
                  }}
                >
                  <ArrowUpwardRoundedIcon sx={{ fontSize: 19 }} />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Stack>
      )}
    </Paper>
  );
}
