import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { HandleWithNumber, useHandleNumbers } from './HandleWithNumber';
import {
  Box,
  Typography,
  Button,
  Divider,
  Popover,
  TextField,
  MenuItem,
  IconButton,
  Stack,
  Tooltip,
  Autocomplete,
  Checkbox,
  Chip,
  alpha,
  useTheme,
} from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import CheckBoxOutlineBlankRoundedIcon from '@mui/icons-material/CheckBoxOutlineBlankRounded';
import CheckBoxRoundedIcon from '@mui/icons-material/CheckBoxRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { createHoverGlowShadow } from '../../../theme/hoverGlow';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import HttpOutlinedIcon from '@mui/icons-material/HttpOutlined';
import CallSplitRoundedIcon from '@mui/icons-material/CallSplitRounded';
import TransformOutlinedIcon from '@mui/icons-material/TransformOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import WebhookOutlinedIcon from '@mui/icons-material/WebhookOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CalendarTodayRoundedIcon from '@mui/icons-material/CalendarTodayRounded';
import InputAdornment from '@mui/material/InputAdornment';
import { getBlockById } from './blockLibrary';
import { useWorkflowOptions } from './WorkflowOptionsContext';
import {
  SMS_PROVIDERS,
  EMAIL_PROVIDERS,
  POSTBACK_ACTIONS,
  TRAFFIC_SOURCE_OPTIONS,
} from '../../../services/workflowService';
import { COUNTRY_FLAGS } from '../../../utils/constants';

import AppIcon from '../../../components/icons/AppIcon';
import { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL } from '../../../config/assistantBrain';

/** Small (i) icon with hover tooltip for field explanations. */
function InfoTip({ text }) {
  return (
    <Tooltip
      title={text}
      arrow
      placement="top"
      slotProps={{
        tooltip: {
          sx: {
            maxWidth: 280,
            fontSize: '0.78rem',
            lineHeight: 1.5,
            bgcolor: 'grey.900',
            '& .MuiTooltip-arrow': { color: 'grey.900' },
          },
        },
      }}
    >
      <AppIcon
        name="InfoOutlined"
        fallback={InfoOutlinedIcon}
        sx={{
          fontSize: 16,
          color: 'text.disabled',
          cursor: 'help',
          flexShrink: 0,
          '&:hover': { color: 'primary.main' },
        }}
      />
    </Tooltip>
  );
}

/** Wraps a field label + InfoTip into a row for use as InputAdornment or standalone label. */
function FieldWithInfo({ children, tip }) {
  if (!tip) return children;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%' }}>
      <Box sx={{ flex: 1 }}>{children}</Box>
      <InfoTip text={tip} />
    </Box>
  );
}

/** Icons for execution-engine block types (n8n imports / workflow engine). */
const BLOCK_TYPE_ICONS = {
  trigger: <AppIcon name="PlayArrowRounded" fallback={PlayArrowRoundedIcon} />,
  llm: <AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} />,
  http: <AppIcon name="HttpOutlined" fallback={HttpOutlinedIcon} />,
  condition: <AppIcon name="CallSplitRounded" fallback={CallSplitRoundedIcon} />,
  transform: <AppIcon name="TransformOutlined" fallback={TransformOutlinedIcon} />,
  delay: <AppIcon name="TimerOutlined" fallback={TimerOutlinedIcon} />,
  webhook: <AppIcon name="WebhookOutlined" fallback={WebhookOutlinedIcon} />,
  tool: <AppIcon name="BuildOutlined" fallback={BuildOutlinedIcon} />,
};

/** Tooltip descriptions for every configurable field per block type. */
const FIELD_TIPS = {
  // Trigger
  trigger_event:
    'The event name that starts this workflow (e.g. "manual", "webhook", "schedule"). Trigger data is passed to the next connected node.',

  // LLM
  llm_provider:
    'The AI provider to use. Groq is fastest, OpenAI has GPT-4o, Anthropic has Claude. Your API key must be configured in Settings.',
  llm_model:
    'The model ID to call (e.g. "gpt-4o", "claude-sonnet-5", "llama-3.3-70b-versatile"). Must match the selected provider.',
  llm_systemPrompt:
    "Instructions that define the AI's behavior and role. This is sent as the system message before the user prompt.",
  llm_prompt:
    "The user message sent to the AI. Use {{input.fieldName}} to inject data from the previous node's output dynamically.",
  llm_temperature:
    'Controls randomness: 0 = deterministic, 1 = creative, 2 = very random. Default is usually 0.7. Leave empty for provider default.',

  // HTTP
  http_method:
    'The HTTP method for the request. GET for fetching data, POST for sending data, PUT/PATCH for updating, DELETE for removing.',
  http_url:
    'The full API endpoint URL. Use {{input.field}} to inject dynamic values from the previous node.',
  http_headers:
    'HTTP headers as JSON. Include authorization tokens here, e.g. {"Authorization": "Bearer sk-xxx", "Content-Type": "application/json"}.',
  http_body:
    'Request body as JSON (for POST/PUT/PATCH). Use {{input.field}} for dynamic values from upstream nodes.',

  // Webhook
  webhook_url:
    'The URL to send the webhook notification to. The workflow execution data will be POSTed to this endpoint.',
  webhook_method:
    'HTTP method for the webhook call. POST is standard for webhooks, GET for simple pings.',

  // Condition
  condition_field:
    'The data field to evaluate, using dot notation. E.g. "input.status", "input.user.role". References the previous node\'s output.',
  condition_operator:
    'How to compare the field value. "equals" for exact match, "includes" for substring check, comparison operators for numbers.',
  condition_value:
    'The value to compare against. The workflow follows the True branch if the condition passes, False branch otherwise.',
  condition_expression:
    'Advanced: a JavaScript-like expression (e.g. "input.score > 80 && input.status === \'active\'"). Overrides field/operator/value if set.',

  // Transform
  transform_mapping:
    'Define how to reshape data between nodes. Use JSON with $.path for JSONPath or {{path}} for template syntax. E.g. {"name": "$.input.user.fullName"}.',

  // Delay
  delay_ms:
    'Pause duration in milliseconds before continuing to the next node. 1000 = 1 second. Max 5 seconds in serverless (Vercel) mode.',

  // Tool
  tool_toolId:
    'The ID of a tool registered in Agent Hub \u2192 Tools. The tool will be invoked with the payload you configure below.',
  tool_payload:
    'JSON payload to send to the tool. Use {{input.field}} to pass data from the previous node dynamically.',

  // Loop
  loop_arrayPath:
    'Dot-path to an array in the input data (e.g. "input.items"). The loop body executes once per array element.',
  loop_maxIterations:
    'Safety limit to prevent infinite loops. The loop stops after this many iterations even if the array is longer.',

  // Funnel blocks
  landing_page:
    'Select a saved landing page or upload a new one. This defines the web page visitors will see at this step.',
  campaign:
    'Attach a campaign with postback tracking and unique links. Tracks conversions and user actions.',
  sms_provider:
    'Select the SMS gateway provider to send messages through. Configure API credentials in the provider settings.',
  sms_text:
    'The SMS message body. Keep it concise \u2014 most carriers limit to 160 characters per segment.',
  sms_sender:
    'The sender name or number shown to the recipient. Must comply with carrier regulations.',
  email_provider:
    'Select the email service provider (SMTP, SendGrid, etc.) to deliver emails through.',
  email_subject:
    'The email subject line. Keep it compelling and under 60 characters for best open rates.',
  email_body:
    'The email HTML or plain text body. You can include dynamic variables from the workflow.',
  schedule_datetime:
    'When this workflow step should execute. The workflow pauses here until the scheduled time.',
  schedule_startDate:
    'The start date for this scheduled step. All send-out entries are relative to this date.',
  schedule_timezone: 'Time zone for all scheduled times in this block.',
  schedule_sendOuts:
    'Define when to send. Each entry specifies days after start, time of day, and an optional link.',
  actions_type:
    'The type of action to trigger: send an SMS, email, webhook call, or other automated action.',
  database_partner:
    'Select a partner from your partner list. Each partner offers specific databases you can query.',
  database_name:
    'Select the database offered by the chosen partner. Data will be pulled from this source.',
  traffic_source:
    'Select where the traffic for this workflow step originates from (Google Ads, Facebook, organic, etc.).',
  report_format:
    'Choose the report format: "summary" for a brief overview, "full" for complete execution details.',
};

function toDatetimeLocal(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TIMEZONES = [
  { id: 'UTC', label: 'UTC (+00:00)' },
  { id: 'Europe/London', label: 'London (+00/+01)' },
  { id: 'Europe/Berlin', label: 'Berlin (+01/+02)' },
  { id: 'Europe/Moscow', label: 'Moscow (+03:00)' },
  { id: 'Asia/Dubai', label: 'Dubai (+04:00)' },
  { id: 'Asia/Kolkata', label: 'Kolkata (+05:30)' },
  { id: 'Asia/Shanghai', label: 'Shanghai (+08:00)' },
  { id: 'Asia/Tokyo', label: 'Tokyo (+09:00)' },
  { id: 'Australia/Sydney', label: 'Sydney (+10/+11)' },
  { id: 'Pacific/Auckland', label: 'Auckland (+12/+13)' },
  { id: 'America/New_York', label: 'New York (-05/-04)' },
  { id: 'America/Chicago', label: 'Chicago (-06/-05)' },
  { id: 'America/Denver', label: 'Denver (-07/-06)' },
  { id: 'America/Los_Angeles', label: 'Los Angeles (-08/-07)' },
  { id: 'America/Sao_Paulo', label: 'São Paulo (-03:00)' },
];

const SEND_OUT_DAY_OPTIONS = [1, 2, 3, 4, 5, 7, 10, 14, 21, 30];

/**
 * Custom node: block label + icon. Click opens popover with block-type-specific config
 * (landing select/upload, campaign select, SMS provider, Email provider, schedule).
 */
function WorkflowNode({ id, data, selected }) {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const auxInitRef = useRef(false);
  const [showAuxHandles, setShowAuxHandles] = useState(Boolean(data?.justAdded));
  const open = Boolean(anchorEl);
  const { leftNumber, rightNumber, topNumber, bottomNumber } = useHandleNumbers(id);
  const { landings = [], campaigns = [], partners = [] } = useWorkflowOptions();
  const block = data?.blockId ? getBlockById(data.blockId) : null;
  const label = data?.label ?? block?.label ?? 'Block';
  const config = data?.config ?? {};
  const onConfigChange = data?.onConfigChange;
  const onRemove = data?.onRemove;
  const nodeId = data?.nodeId;
  const incomingCount = data?.incomingCount ?? 0;
  const outgoingCount = data?.outgoingCount ?? 0;
  const onDisconnectIncoming = data?.onDisconnectIncoming;
  const onDisconnectOutgoing = data?.onDisconnectOutgoing;
  const incomingConnections = Array.isArray(data?.incomingConnections)
    ? data.incomingConnections
    : [];
  const outgoingConnections = Array.isArray(data?.outgoingConnections)
    ? data.outgoingConnections
    : [];

  const handleOpen = (e) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => setAnchorEl(null);

  const handleConfig = (key, value) => {
    onConfigChange?.(key, value);
  };

  useEffect(() => {
    if (auxInitRef.current) return;
    if (!data?.justAdded) return;
    auxInitRef.current = true;
    setShowAuxHandles(true);
    const t = setTimeout(() => setShowAuxHandles(false), 2200);
    return () => clearTimeout(t);
  }, [data?.justAdded]);

  const handlesVisible = isHovered || showAuxHandles || selected;
  const handleVisibilityStyle = handlesVisible
    ? { opacity: 1, pointerEvents: 'auto' }
    : { opacity: 0, pointerEvents: 'none' };
  // Keep legacy handle IDs for persisted edges, but don't show/capture pointer events for them.
  const legacyHandleStyle = { opacity: 0, pointerEvents: 'none' };

  const renderConfigContent = () => {
    const blockId = data?.blockId;
    if (!blockId)
      return (
        <Typography variant="body2" color="text.secondary">
          No options.
        </Typography>
      );

    switch (blockId) {
      case 'landing-page': {
        const emptyCheckIcon = (
          <AppIcon
            name="CheckBoxOutlineBlankRounded"
            fallback={CheckBoxOutlineBlankRoundedIcon}
            fontSize="small"
          />
        );
        const filledCheckIcon = (
          <AppIcon name="CheckBoxRounded" fallback={CheckBoxRoundedIcon} fontSize="small" />
        );
        const countries = Object.keys(COUNTRY_FLAGS);
        const geoOptions = countries.map((code) => ({
          code,
          label: `${COUNTRY_FLAGS[code] || ''} ${code}`.trim(),
        }));

        const templateValue = config.template ?? '';
        const domainValue = config.domain ?? '';
        const geos = Array.isArray(config.geos) ? config.geos : config.geo ? [config.geo] : [];

        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <FieldWithInfo tip={FIELD_TIPS.landing_page}>
              <TextField
                select
                size="small"
                label="Template"
                value={templateValue}
                onChange={(e) => handleConfig('template', e.target.value)}
                fullWidth
              >
                <MenuItem value="">- Select template -</MenuItem>
                {/* Intentionally empty for now (to be wired to templates). */}
              </TextField>
            </FieldWithInfo>
            <Autocomplete
              multiple
              blurOnSelect
              disablePortal
              popupIcon={<AppIcon name="ExpandMoreRounded" fallback={ExpandMoreRoundedIcon} />}
              options={geoOptions}
              value={geoOptions.filter((opt) => geos.includes(opt.code))}
              onChange={(_, nextValues) => {
                const nextGeos = nextValues.map((item) => item.code);
                handleConfig('geos', nextGeos);
                // Back-compat: keep a single-value geo as first selection.
                handleConfig('geo', nextGeos[0] || '');
              }}
              isOptionEqualToValue={(opt, val) => opt.code === val.code}
              getOptionLabel={(opt) => opt.label}
              renderOption={(props, option, { selected: isSelected }) => (
                <li {...props}>
                  <Checkbox
                    icon={emptyCheckIcon}
                    checkedIcon={filledCheckIcon}
                    checked={isSelected}
                    size="small"
                    sx={{ mr: 1 }}
                  />
                  {option.label}
                </li>
              )}
              renderTags={(value, getTagProps) =>
                value.map((option, idx) => (
                  <Chip
                    size="small"
                    label={option.label}
                    {...getTagProps({ index: idx })}
                    key={option.code}
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Geo"
                  placeholder={geos.length ? '' : 'Choose one or more'}
                  size="small"
                />
              )}
            />
            <TextField
              select
              size="small"
              label="Domain"
              value={domainValue}
              onChange={(e) => handleConfig('domain', e.target.value)}
              fullWidth
            >
              <MenuItem value="">- Select domain -</MenuItem>
              {/* Intentionally empty for now (to be wired to domains). */}
            </TextField>
            {/* Keep old behavior accessible until templates/domains are wired. */}
            <Divider />
            <Button
              size="small"
              startIcon={<AppIcon name="CloudUploadOutlined" fallback={CloudUploadOutlinedIcon} />}
              variant="outlined"
              fullWidth
              onClick={() => handleConfig('uploadNow', true)}
            >
              Upload now
            </Button>
          </Box>
        );
      }

      case 'campaign-attach': {
        const campaignList = campaigns.filter(Boolean);
        const current = config.campaignId ?? config.campaignName ?? '';
        const options = [
          ...new Set(
            campaignList
              .map((c) => (typeof c === 'object' ? (c?.name ?? c?.id) : c))
              .filter(Boolean)
          ),
        ];
        return (
          <FieldWithInfo tip={FIELD_TIPS.campaign}>
            <TextField
              select
              size="small"
              label="Select campaign"
              value={options.includes(current) ? current : ''}
              onChange={(e) => {
                handleConfig('campaignName', e.target.value);
                handleConfig('campaignId', e.target.value);
              }}
              fullWidth
            >
              <MenuItem value="">- None -</MenuItem>
              {options.map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt}
                </MenuItem>
              ))}
            </TextField>
          </FieldWithInfo>
        );
      }

      case 'sms-sendout': {
        const value = config.smsProvider ?? config.provider ?? '';
        return (
          <FieldWithInfo tip={FIELD_TIPS.sms_provider}>
            <TextField
              select
              size="small"
              label="SMS provider"
              value={SMS_PROVIDERS.some((p) => p.id === value) ? value : ''}
              onChange={(e) => handleConfig('smsProvider', e.target.value)}
              fullWidth
            >
              <MenuItem value="">- None -</MenuItem>
              {SMS_PROVIDERS.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.label}
                </MenuItem>
              ))}
            </TextField>
          </FieldWithInfo>
        );
      }

      case 'email-sendout': {
        const value = config.emailProvider ?? config.provider ?? '';
        return (
          <FieldWithInfo tip={FIELD_TIPS.email_provider}>
            <TextField
              select
              size="small"
              label="Email provider"
              value={EMAIL_PROVIDERS.some((p) => p.id === value) ? value : ''}
              onChange={(e) => handleConfig('emailProvider', e.target.value)}
              fullWidth
            >
              <MenuItem value="">- None -</MenuItem>
              {EMAIL_PROVIDERS.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.label}
                </MenuItem>
              ))}
            </TextField>
          </FieldWithInfo>
        );
      }

      case 'schedule': {
        const startDate = config.startDate ?? '';
        const timezone = config.timezone ?? 'UTC';
        const sendOuts = Array.isArray(config.sendOuts) ? config.sendOuts : [];

        const updateSendOut = (idx, field, value) => {
          const next = sendOuts.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
          handleConfig('sendOuts', next);
        };
        const addSendOut = () => {
          const lastDay = sendOuts.length > 0 ? sendOuts[sendOuts.length - 1].days : 0;
          handleConfig('sendOuts', [...sendOuts, { days: lastDay + 1, time: '09:00', link: '' }]);
        };
        const removeSendOut = (idx) => {
          handleConfig(
            'sendOuts',
            sendOuts.filter((_, i) => i !== idx)
          );
        };

        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {/* ── Start Date Section ── */}
            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
                textTransform: 'uppercase',
                color: 'text.secondary',
                letterSpacing: 0.5,
              }}
            >
              Start Date
            </Typography>
            <FieldWithInfo tip={FIELD_TIPS.schedule_startDate}>
              <TextField
                size="small"
                label="Date"
                type="date"
                value={startDate}
                onChange={(e) => handleConfig('startDate', e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <AppIcon
                        name="CalendarTodayRounded"
                        fallback={CalendarTodayRoundedIcon}
                        sx={{ fontSize: 16 }}
                      />
                    </InputAdornment>
                  ),
                }}
              />
            </FieldWithInfo>
            <FieldWithInfo tip={FIELD_TIPS.schedule_timezone}>
              <TextField
                select
                size="small"
                label="Time Zone"
                value={TIMEZONES.some((tz) => tz.id === timezone) ? timezone : 'UTC'}
                onChange={(e) => handleConfig('timezone', e.target.value)}
                fullWidth
              >
                {TIMEZONES.map((tz) => (
                  <MenuItem key={tz.id} value={tz.id}>
                    {tz.label}
                  </MenuItem>
                ))}
              </TextField>
            </FieldWithInfo>
            <Divider />
            {/* ── Send-Out Schedule Section ── */}
            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
                textTransform: 'uppercase',
                color: 'text.secondary',
                letterSpacing: 0.5,
              }}
            >
              Send-Out Schedule
            </Typography>
            {sendOuts.length === 0 && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontStyle: 'italic', fontSize: '0.8rem' }}
              >
                No send-outs configured. Click "Add Day" below.
              </Typography>
            )}
            <Stack spacing={1.5}>
              {sendOuts.map((entry, idx) => (
                <Box
                  key={idx}
                  sx={{
                    position: 'relative',
                    p: 1.5,
                    pt: 2,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.6),
                    bgcolor: alpha(theme.palette.background.paper, 0.4),
                  }}
                >
                  <IconButton
                    size="small"
                    onClick={() => removeSendOut(idx)}
                    sx={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 22,
                      height: 22,
                      color: 'text.secondary',
                      '&:hover': { color: 'error.main' },
                    }}
                  >
                    <AppIcon
                      name="CloseRounded"
                      fallback={CloseRoundedIcon}
                      sx={{ fontSize: 14 }}
                    />
                  </IconButton>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, color: 'text.secondary', mb: 1, display: 'block' }}
                  >
                    Entry {idx + 1}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    <TextField
                      select
                      size="small"
                      label="Days"
                      value={SEND_OUT_DAY_OPTIONS.includes(entry.days) ? entry.days : ''}
                      onChange={(e) => updateSendOut(idx, 'days', Number(e.target.value))}
                      sx={{ flex: 1 }}
                    >
                      {SEND_OUT_DAY_OPTIONS.map((d) => (
                        <MenuItem key={d} value={d}>
                          Day {d}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      size="small"
                      label="Time"
                      type="time"
                      value={entry.time ?? '09:00'}
                      onChange={(e) => updateSendOut(idx, 'time', e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      sx={{ flex: 1 }}
                    />
                  </Stack>
                  <TextField
                    size="small"
                    label="Link"
                    placeholder="https://..."
                    value={entry.link ?? ''}
                    onChange={(e) => updateSendOut(idx, 'link', e.target.value)}
                    fullWidth
                  />
                </Box>
              ))}
            </Stack>
            <Button
              size="small"
              variant="outlined"
              startIcon={
                <AppIcon name="AddRounded" fallback={AddRoundedIcon} sx={{ fontSize: 16 }} />
              }
              onClick={addSendOut}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 1.5,
                borderStyle: 'dashed',
                color: 'text.secondary',
                borderColor: alpha(theme.palette.divider, 0.6),
                '&:hover': {
                  borderStyle: 'dashed',
                  borderColor: 'primary.main',
                  color: 'primary.main',
                },
              }}
            >
              Add Day
            </Button>
          </Box>
        );
      }

      case 'actions': {
        const actionId = config.actionType ?? config.action ?? '';
        const selectedAction = POSTBACK_ACTIONS.find((a) => a.id === actionId);
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <FieldWithInfo tip={FIELD_TIPS.actions_type}>
              <TextField
                select
                size="small"
                label="When postback received, do"
                value={POSTBACK_ACTIONS.some((a) => a.id === actionId) ? actionId : ''}
                onChange={(e) => handleConfig('actionType', e.target.value)}
                fullWidth
              >
                <MenuItem value="">- Select action -</MenuItem>
                {POSTBACK_ACTIONS.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.label}
                  </MenuItem>
                ))}
              </TextField>
            </FieldWithInfo>
            {selectedAction?.description && (
              <Typography variant="caption" color="text.secondary">
                {selectedAction.description}
              </Typography>
            )}
            {(actionId === 'webhook' || actionId === 'trigger-workflow') && (
              <TextField
                size="small"
                label={actionId === 'webhook' ? 'Webhook URL' : 'Workflow ID'}
                placeholder={actionId === 'webhook' ? 'https://api.example.com/postback' : 'wf-xxx'}
                value={config.webhookUrl ?? config.workflowId ?? ''}
                onChange={(e) =>
                  handleConfig(actionId === 'webhook' ? 'webhookUrl' : 'workflowId', e.target.value)
                }
                fullWidth
              />
            )}
          </Box>
        );
      }

      case 'send-report-to-system': {
        const reportTypes = [
          { id: 'summary', label: 'Summary report' },
          { id: 'full', label: 'Full report' },
        ];
        const value = config.reportType ?? config.report ?? 'summary';
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <FieldWithInfo tip={FIELD_TIPS.report_format}>
              <TextField
                select
                size="small"
                label="Report type"
                value={reportTypes.some((r) => r.id === value) ? value : 'summary'}
                onChange={(e) => handleConfig('reportType', e.target.value)}
                fullWidth
              >
                {reportTypes.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.label}
                  </MenuItem>
                ))}
              </TextField>
            </FieldWithInfo>
          </Box>
        );
      }

      case 'database': {
        const partnerId = config.partnerId ?? config.partner ?? '';
        const selectedPartner = partners.find((p) => p.id === partnerId);
        const defaultDatabases = [
          { id: 'main', label: 'Main database' },
          { id: 'leads', label: 'Leads database' },
          { id: 'crm-export', label: 'CRM export' },
        ];
        const databaseOptions =
          Array.isArray(selectedPartner?.databases) && selectedPartner.databases.length > 0
            ? selectedPartner.databases.map((db) =>
                typeof db === 'string'
                  ? { id: db, label: db }
                  : { id: db.id || db.name || db, label: db.name || db.id || db }
              )
            : defaultDatabases;
        const databaseId = config.databaseId ?? config.database ?? '';
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <FieldWithInfo tip={FIELD_TIPS.database_partner}>
              <TextField
                select
                size="small"
                label="Select partner"
                value={partnerId}
                onChange={(e) => {
                  const id = e.target.value;
                  handleConfig('partnerId', id);
                  handleConfig('partnerName', partners.find((p) => p.id === id)?.name ?? '');
                  handleConfig('databaseId', '');
                  handleConfig('databaseName', '');
                }}
                fullWidth
              >
                <MenuItem value="">- None -</MenuItem>
                {partners.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name || p.id}
                  </MenuItem>
                ))}
              </TextField>
            </FieldWithInfo>
            <FieldWithInfo tip={FIELD_TIPS.database_name}>
              <TextField
                select
                size="small"
                label="Database offered by partner"
                value={
                  !partnerId
                    ? ''
                    : databaseOptions.some((d) => d.id === databaseId)
                      ? databaseId
                      : (databaseOptions[0]?.id ?? '')
                }
                onChange={(e) => {
                  const id = e.target.value;
                  handleConfig('databaseId', id);
                  handleConfig(
                    'databaseName',
                    databaseOptions.find((d) => d.id === id)?.label ?? id
                  );
                }}
                fullWidth
                disabled={!partnerId}
              >
                <MenuItem value="">- None -</MenuItem>
                {databaseOptions.map((d) => (
                  <MenuItem key={d.id} value={d.id}>
                    {d.label}
                  </MenuItem>
                ))}
              </TextField>
            </FieldWithInfo>
            {!partnerId && (
              <Typography variant="caption" color="text.secondary">
                Select a partner first, then choose the database they offer.
              </Typography>
            )}
          </Box>
        );
      }

      case 'traffic-source': {
        const value = config.trafficSource ?? '';
        return (
          <FieldWithInfo tip={FIELD_TIPS.traffic_source}>
            <TextField
              select
              size="small"
              label="Traffic source"
              value={TRAFFIC_SOURCE_OPTIONS.some((t) => t.id === value) ? value : ''}
              onChange={(e) => handleConfig('trafficSource', e.target.value)}
              fullWidth
            >
              <MenuItem value="">- Select traffic source -</MenuItem>
              {TRAFFIC_SOURCE_OPTIONS.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
          </FieldWithInfo>
        );
      }

      /* ---- Workflow Execution block types ---- */

      case 'trigger':
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              size="small"
              label="Event name"
              placeholder="manual, webhook, schedule..."
              value={config.event ?? ''}
              onChange={(e) => handleConfig('event', e.target.value)}
              fullWidth
              slotProps={{ input: { endAdornment: <InfoTip text={FIELD_TIPS.trigger_event} /> } }}
            />
          </Box>
        );

      case 'llm': {
        const provider = config.provider ?? DEFAULT_LLM_PROVIDER;
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <FieldWithInfo tip={FIELD_TIPS.llm_provider}>
              <TextField
                select
                size="small"
                label="Provider"
                value={provider}
                onChange={(e) => handleConfig('provider', e.target.value)}
                fullWidth
              >
                <MenuItem value="gemini">Google Gemini</MenuItem>
                <MenuItem value="groq">Groq</MenuItem>
                <MenuItem value="openai">OpenAI</MenuItem>
                <MenuItem value="anthropic">Anthropic</MenuItem>
              </TextField>
            </FieldWithInfo>
            <TextField
              size="small"
              label="Model"
              placeholder={DEFAULT_LLM_MODEL}
              value={
                typeof config.model === 'object'
                  ? (config.model?.id ?? config.model?.name ?? JSON.stringify(config.model))
                  : (config.model ?? '')
              }
              onChange={(e) => handleConfig('model', e.target.value)}
              fullWidth
              slotProps={{ input: { endAdornment: <InfoTip text={FIELD_TIPS.llm_model} /> } }}
            />
            <TextField
              size="small"
              label="System prompt"
              multiline
              rows={3}
              placeholder="You are a helpful assistant..."
              value={config.systemPrompt ?? ''}
              onChange={(e) => handleConfig('systemPrompt', e.target.value)}
              fullWidth
              slotProps={{
                input: {
                  endAdornment: <InfoTip text={FIELD_TIPS.llm_systemPrompt} />,
                  sx: { fontFamily: 'monospace', fontSize: 12 },
                },
              }}
            />
            <TextField
              size="small"
              label="Prompt"
              multiline
              rows={3}
              placeholder="Use {{input.field}} for dynamic values"
              value={config.prompt ?? ''}
              onChange={(e) => handleConfig('prompt', e.target.value)}
              fullWidth
              slotProps={{
                input: {
                  endAdornment: <InfoTip text={FIELD_TIPS.llm_prompt} />,
                  sx: { fontFamily: 'monospace', fontSize: 12 },
                },
              }}
            />
            <TextField
              size="small"
              label="Temperature"
              type="number"
              inputProps={{ min: 0, max: 2, step: 0.1 }}
              value={config.temperature ?? ''}
              onChange={(e) =>
                handleConfig('temperature', e.target.value ? Number(e.target.value) : '')
              }
              fullWidth
              slotProps={{ input: { endAdornment: <InfoTip text={FIELD_TIPS.llm_temperature} /> } }}
            />
          </Box>
        );
      }

      case 'http': {
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <FieldWithInfo tip={FIELD_TIPS.http_method}>
              <TextField
                select
                size="small"
                label="Method"
                value={config.method ?? 'GET'}
                onChange={(e) => handleConfig('method', e.target.value)}
                fullWidth
              >
                <MenuItem value="GET">GET</MenuItem>
                <MenuItem value="POST">POST</MenuItem>
                <MenuItem value="PUT">PUT</MenuItem>
                <MenuItem value="PATCH">PATCH</MenuItem>
                <MenuItem value="DELETE">DELETE</MenuItem>
              </TextField>
            </FieldWithInfo>
            <TextField
              size="small"
              label="URL"
              placeholder="https://api.example.com/endpoint"
              value={config.url ?? ''}
              onChange={(e) => handleConfig('url', e.target.value)}
              fullWidth
              slotProps={{
                input: {
                  endAdornment: <InfoTip text={FIELD_TIPS.http_url} />,
                  sx: { fontFamily: 'monospace', fontSize: 12 },
                },
              }}
            />
            <TextField
              size="small"
              label="Headers (JSON)"
              multiline
              rows={2}
              placeholder='{"Authorization": "Bearer ..."}'
              value={config.headers ?? ''}
              onChange={(e) => handleConfig('headers', e.target.value)}
              fullWidth
              slotProps={{
                input: {
                  endAdornment: <InfoTip text={FIELD_TIPS.http_headers} />,
                  sx: { fontFamily: 'monospace', fontSize: 12 },
                },
              }}
            />
            <TextField
              size="small"
              label="Body (JSON)"
              multiline
              rows={3}
              placeholder='{"key": "{{input.value}}"}'
              value={config.body ?? ''}
              onChange={(e) => handleConfig('body', e.target.value)}
              fullWidth
              slotProps={{
                input: {
                  endAdornment: <InfoTip text={FIELD_TIPS.http_body} />,
                  sx: { fontFamily: 'monospace', fontSize: 12 },
                },
              }}
            />
          </Box>
        );
      }

      case 'webhook':
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              size="small"
              label="Webhook URL"
              placeholder="https://hooks.example.com/..."
              value={config.url ?? ''}
              onChange={(e) => handleConfig('url', e.target.value)}
              fullWidth
              slotProps={{
                input: {
                  endAdornment: <InfoTip text={FIELD_TIPS.webhook_url} />,
                  sx: { fontFamily: 'monospace', fontSize: 12 },
                },
              }}
            />
            <FieldWithInfo tip={FIELD_TIPS.webhook_method}>
              <TextField
                select
                size="small"
                label="Method"
                value={config.method ?? 'POST'}
                onChange={(e) => handleConfig('method', e.target.value)}
                fullWidth
              >
                <MenuItem value="POST">POST</MenuItem>
                <MenuItem value="GET">GET</MenuItem>
              </TextField>
            </FieldWithInfo>
          </Box>
        );

      case 'condition': {
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              size="small"
              label="Field"
              placeholder="input.status"
              value={config.field ?? ''}
              onChange={(e) => handleConfig('field', e.target.value)}
              fullWidth
              slotProps={{
                input: {
                  endAdornment: <InfoTip text={FIELD_TIPS.condition_field} />,
                  sx: { fontFamily: 'monospace', fontSize: 12 },
                },
              }}
            />
            <FieldWithInfo tip={FIELD_TIPS.condition_operator}>
              <TextField
                select
                size="small"
                label="Operator"
                value={config.operator ?? '==='}
                onChange={(e) => handleConfig('operator', e.target.value)}
                fullWidth
              >
                <MenuItem value="===">equals (===)</MenuItem>
                <MenuItem value="!==">not equals (!==)</MenuItem>
                <MenuItem value=">">greater than (&gt;)</MenuItem>
                <MenuItem value="<">less than (&lt;)</MenuItem>
                <MenuItem value=">=">greater or equal (&gt;=)</MenuItem>
                <MenuItem value="<=">less or equal (&lt;=)</MenuItem>
                <MenuItem value="includes">includes</MenuItem>
                <MenuItem value="startsWith">starts with</MenuItem>
              </TextField>
            </FieldWithInfo>
            <TextField
              size="small"
              label="Value"
              placeholder="expected value"
              value={config.value ?? ''}
              onChange={(e) => handleConfig('value', e.target.value)}
              fullWidth
              slotProps={{
                input: {
                  endAdornment: <InfoTip text={FIELD_TIPS.condition_value} />,
                  sx: { fontFamily: 'monospace', fontSize: 12 },
                },
              }}
            />
            <TextField
              size="small"
              label="Expression (advanced)"
              placeholder="input.score > 80"
              value={config.expression ?? ''}
              onChange={(e) => handleConfig('expression', e.target.value)}
              fullWidth
              helperText="If set, overrides field/operator/value above"
              slotProps={{
                input: {
                  endAdornment: <InfoTip text={FIELD_TIPS.condition_expression} />,
                  sx: { fontFamily: 'monospace', fontSize: 12 },
                },
              }}
            />
          </Box>
        );
      }

      case 'transform':
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              size="small"
              label="Mapping (JSON)"
              multiline
              rows={4}
              placeholder='{"outputField": "$.input.sourceField"}'
              value={
                config.mapping
                  ? typeof config.mapping === 'string'
                    ? config.mapping
                    : JSON.stringify(config.mapping, null, 2)
                  : ''
              }
              onChange={(e) => handleConfig('mapping', e.target.value)}
              fullWidth
              helperText="Map output fields using $.path or {{path}} syntax"
              slotProps={{
                input: {
                  endAdornment: <InfoTip text={FIELD_TIPS.transform_mapping} />,
                  sx: { fontFamily: 'monospace', fontSize: 12 },
                },
              }}
            />
          </Box>
        );

      case 'delay':
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              size="small"
              label="Delay (ms)"
              type="number"
              inputProps={{ min: 0, max: 60000, step: 100 }}
              value={config.ms ?? 1000}
              onChange={(e) => handleConfig('ms', Number(e.target.value))}
              fullWidth
              slotProps={{ input: { endAdornment: <InfoTip text={FIELD_TIPS.delay_ms} /> } }}
            />
          </Box>
        );

      case 'tool':
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              size="small"
              label="Tool ID"
              placeholder="ID of a registered tool"
              value={config.toolId ?? ''}
              onChange={(e) => handleConfig('toolId', e.target.value)}
              fullWidth
              slotProps={{ input: { endAdornment: <InfoTip text={FIELD_TIPS.tool_toolId} /> } }}
            />
            <TextField
              size="small"
              label="Payload (JSON)"
              multiline
              rows={3}
              placeholder='{"param": "{{input.value}}"}'
              value={config.payload ?? ''}
              onChange={(e) => handleConfig('payload', e.target.value)}
              fullWidth
              slotProps={{
                input: {
                  endAdornment: <InfoTip text={FIELD_TIPS.tool_payload} />,
                  sx: { fontFamily: 'monospace', fontSize: 12 },
                },
              }}
            />
          </Box>
        );

      case 'loop':
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              size="small"
              label="Array path"
              placeholder="input.items"
              value={config.arrayPath ?? ''}
              onChange={(e) => handleConfig('arrayPath', e.target.value)}
              fullWidth
              slotProps={{
                input: {
                  endAdornment: <InfoTip text={FIELD_TIPS.loop_arrayPath} />,
                  sx: { fontFamily: 'monospace', fontSize: 12 },
                },
              }}
            />
            <TextField
              size="small"
              label="Max iterations"
              type="number"
              inputProps={{ min: 1, max: 1000 }}
              value={config.maxIterations ?? 100}
              onChange={(e) => handleConfig('maxIterations', Number(e.target.value))}
              fullWidth
              slotProps={{
                input: { endAdornment: <InfoTip text={FIELD_TIPS.loop_maxIterations} /> },
              }}
            />
          </Box>
        );

      default:
        return (
          <Typography variant="body2" color="text.secondary">
            No options for this block.
          </Typography>
        );
    }
  };

  return (
    <>
      <Box
        className={selected ? 'workflow-node workflow-node--selected' : 'workflow-node'}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          minWidth: 220,
          height: 68,
          borderRadius: 3,
          border: '1px solid',
          borderColor: selected ? 'primary.main' : 'divider',
          bgcolor: 'background.paper',
          boxShadow: selected
            ? `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`
            : '0 2px 6px rgba(0,0,0,0.04)',
          overflow: 'visible',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          px: 2,
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: 'primary.main',
            boxShadow: createHoverGlowShadow(theme),
            transform: 'translateY(-1px)',
          },
        }}
      >
        {/* Left side: allow start+end connections reliably (target + source overlapped). */}
        <Handle
          type="source"
          id="left-in"
          position={Position.Left}
          isConnectableStart
          isConnectableEnd
          style={{
            left: -7,
            top: '50%',
            transform: 'translateY(-50%)',
            ...legacyHandleStyle,
          }}
          className="workflow-handle"
        />
        <HandleWithNumber
          number={leftNumber}
          sx={{
            position: 'absolute',
            left: -7,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 14,
            height: 14,
          }}
        >
          <Handle
            type="source"
            id="left-out"
            position={Position.Left}
            isConnectableStart
            isConnectableEnd
            style={{
              left: -7,
              top: '50%',
              transform: 'translateY(-50%)',
              ...handleVisibilityStyle,
              transition: 'opacity 140ms ease',
            }}
            className="workflow-handle"
          />
        </HandleWithNumber>

        {/* Top: auxiliary connection points (hidden by default). */}
        <Handle
          type="source"
          id="top-in"
          position={Position.Top}
          isConnectableStart
          isConnectableEnd
          style={{
            top: -7,
            left: '50%',
            transform: 'translateX(-50%)',
            ...legacyHandleStyle,
          }}
          className="workflow-handle workflow-handle-aux"
        />
        <HandleWithNumber
          number={topNumber}
          badgePosition="above"
          sx={{
            position: 'absolute',
            top: -7,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 14,
            height: 14,
          }}
        >
          <Handle
            type="source"
            id="top-out"
            position={Position.Top}
            isConnectableStart
            isConnectableEnd
            style={{
              top: -7,
              left: '50%',
              transform: 'translateX(-50%)',
              ...handleVisibilityStyle,
              transition: 'opacity 140ms ease',
            }}
            className="workflow-handle workflow-handle-aux"
          />
        </HandleWithNumber>

        {incomingCount > 0 && typeof onDisconnectIncoming === 'function' && (
          <Tooltip
            title={
              incomingCount > 1
                ? `Disconnect ${incomingCount} incoming connections`
                : 'Disconnect incoming connection'
            }
          >
            <IconButton
              className="workflow-disconnect-btn workflow-disconnect-btn--left nodrag nopan"
              size="small"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (nodeId) onDisconnectIncoming(nodeId);
              }}
              sx={{
                position: 'absolute',
                left: -28,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 22,
                height: 22,
                bgcolor: alpha(theme.palette.background.paper, 0.92),
                border: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.9),
                color: 'text.secondary',
                boxShadow: `0 8px 22px ${alpha(theme.palette.common.black, 0.12)}`,
                '&:hover': {
                  color: theme.palette.error.main,
                  bgcolor: alpha(
                    theme.palette.error.main,
                    theme.palette.mode === 'dark' ? 0.16 : 0.1
                  ),
                  borderColor: alpha(theme.palette.error.main, 0.55),
                  opacity: 1,
                },
              }}
            >
              <AppIcon name="LinkOffRounded" fallback={LinkOffRoundedIcon} sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}

        {/* Icon */}
        <Box
          sx={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(theme.palette.primary.main, 0.08),
            color: 'primary.main',
            borderRadius: 2,
            mr: 1.5,
            flexShrink: 0,
            '& svg': { fontSize: 24 },
          }}
        >
          {block?.icon || BLOCK_TYPE_ICONS[data?.blockType] || (
            <AppIcon name="SettingsOutlined" fallback={SettingsOutlinedIcon} />
          )}
        </Box>

        {/* Text Content */}
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              fontSize: '0.85rem',
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              fontSize: '0.7rem',
              mt: 0.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {block?.type === 'funnel' ? 'Workflow Step' : 'Node'}
          </Typography>
        </Box>

        {/* Settings Action */}
        <IconButton
          size="small"
          onClick={handleOpen}
          sx={{
            ml: 1,
            color: 'text.secondary',
            '& svg': { fontSize: 22 },
            '&:hover': {
              color: 'primary.main',
              bgcolor: alpha(theme.palette.primary.main, 0.08),
            },
          }}
        >
          <AppIcon name="SettingsOutlined" fallback={SettingsOutlinedIcon} fontSize="small" />
        </IconButton>

        {/* Right side: allow start+end connections reliably (target + source overlapped). */}
        <Handle
          type="source"
          id="right-in"
          position={Position.Right}
          isConnectableStart
          isConnectableEnd
          style={{
            left: 'auto',
            right: -7,
            top: '50%',
            transform: 'translateY(-50%)',
            ...legacyHandleStyle,
          }}
          className="workflow-handle"
        />
        <HandleWithNumber
          number={rightNumber}
          sx={{
            position: 'absolute',
            left: 'auto',
            right: -7,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 14,
            height: 14,
          }}
        >
          <Handle
            type="source"
            id="right-out"
            position={Position.Right}
            isConnectableStart
            isConnectableEnd
            style={{
              left: 'auto',
              right: -7,
              top: '50%',
              transform: 'translateY(-50%)',
              ...handleVisibilityStyle,
              transition: 'opacity 140ms ease',
            }}
            className="workflow-handle"
          />
        </HandleWithNumber>

        {/* Bottom: auxiliary connection points (hidden by default). */}
        <Handle
          type="source"
          id="bottom-in"
          position={Position.Bottom}
          isConnectableStart
          isConnectableEnd
          style={{
            bottom: -7,
            left: '50%',
            transform: 'translateX(-50%)',
            ...legacyHandleStyle,
          }}
          className="workflow-handle workflow-handle-aux"
        />
        <HandleWithNumber
          number={bottomNumber}
          badgePosition="below"
          sx={{
            position: 'absolute',
            bottom: -7,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 14,
            height: 14,
          }}
        >
          <Handle
            type="source"
            id="bottom-out"
            position={Position.Bottom}
            isConnectableStart
            isConnectableEnd
            style={{
              bottom: -7,
              left: '50%',
              transform: 'translateX(-50%)',
              ...handleVisibilityStyle,
              transition: 'opacity 140ms ease',
            }}
            className="workflow-handle workflow-handle-aux"
          />
        </HandleWithNumber>

        {outgoingCount > 0 && typeof onDisconnectOutgoing === 'function' && (
          <Tooltip
            title={
              outgoingCount > 1
                ? `Disconnect ${outgoingCount} outgoing connections`
                : 'Disconnect outgoing connection'
            }
          >
            <IconButton
              className="workflow-disconnect-btn workflow-disconnect-btn--right nodrag nopan"
              size="small"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (nodeId) onDisconnectOutgoing(nodeId);
              }}
              sx={{
                position: 'absolute',
                right: -28,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 22,
                height: 22,
                bgcolor: alpha(theme.palette.background.paper, 0.92),
                border: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.9),
                color: 'text.secondary',
                boxShadow: `0 8px 22px ${alpha(theme.palette.common.black, 0.12)}`,
                '&:hover': {
                  color: theme.palette.error.main,
                  bgcolor: alpha(
                    theme.palette.error.main,
                    theme.palette.mode === 'dark' ? 0.16 : 0.1
                  ),
                  borderColor: alpha(theme.palette.error.main, 0.55),
                  opacity: 1,
                },
              }}
            >
              <AppIcon name="LinkOffRounded" fallback={LinkOffRoundedIcon} sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{ paper: { sx: { minWidth: 280, maxWidth: 360, p: 2, borderRadius: 2 } } }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          {block?.description}
        </Typography>
        {renderConfigContent()}

        <Divider sx={{ my: 2 }} />

        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
          <Tooltip
            title={
              incomingCount > 0
                ? incomingCount > 1
                  ? `Disconnect ${incomingCount} incoming connections`
                  : 'Disconnect incoming connection'
                : 'No incoming connections'
            }
          >
            <span>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                startIcon={
                  <AppIcon
                    name="LinkOffRounded"
                    fallback={LinkOffRoundedIcon}
                    sx={{ fontSize: 18 }}
                  />
                }
                disabled={
                  !nodeId || incomingCount === 0 || typeof onDisconnectIncoming !== 'function'
                }
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDisconnectIncoming?.(nodeId);
                }}
                sx={{ flex: 1, textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}
              >
                Incoming {incomingCount ? `(${incomingCount})` : ''}
              </Button>
            </span>
          </Tooltip>

          <Tooltip
            title={
              outgoingCount > 0
                ? outgoingCount > 1
                  ? `Disconnect ${outgoingCount} outgoing connections`
                  : 'Disconnect outgoing connection'
                : 'No outgoing connections'
            }
          >
            <span>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                startIcon={
                  <AppIcon
                    name="LinkOffRounded"
                    fallback={LinkOffRoundedIcon}
                    sx={{ fontSize: 18 }}
                  />
                }
                disabled={
                  !nodeId || outgoingCount === 0 || typeof onDisconnectOutgoing !== 'function'
                }
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDisconnectOutgoing?.(nodeId);
                }}
                sx={{ flex: 1, textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}
              >
                Outgoing {outgoingCount ? `(${outgoingCount})` : ''}
              </Button>
            </span>
          </Tooltip>
        </Stack>

        {(incomingConnections.length > 0 || outgoingConnections.length > 0) && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
              Connections
            </Typography>

            {incomingConnections.length > 0 && (
              <Box sx={{ mb: 1.25 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 0.5 }}
                >
                  Incoming
                </Typography>
                <Stack spacing={0.5}>
                  {incomingConnections.map((c) => (
                    <Box
                      key={c.edgeId}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                        px: 1,
                        py: 0.75,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: alpha(theme.palette.divider, 0.85),
                        bgcolor: alpha(theme.palette.background.paper, 0.5),
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.8rem' }}
                          noWrap
                        >
                          {c.connectionId || c.edgeId}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          From {c.fromLabel || c.fromNodeId}
                        </Typography>
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          textTransform: 'uppercase',
                          fontWeight: 800,
                        }}
                      >
                        {c.connectionType || '-'}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

            {outgoingConnections.length > 0 && (
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 0.5 }}
                >
                  Outgoing
                </Typography>
                <Stack spacing={0.5}>
                  {outgoingConnections.map((c) => (
                    <Box
                      key={c.edgeId}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                        px: 1,
                        py: 0.75,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: alpha(theme.palette.divider, 0.85),
                        bgcolor: alpha(theme.palette.background.paper, 0.5),
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.8rem' }}
                          noWrap
                        >
                          {c.connectionId || c.edgeId}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          To {c.toLabel || c.toNodeId}
                        </Typography>
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          textTransform: 'uppercase',
                          fontWeight: 800,
                        }}
                      >
                        {c.connectionType || '-'}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
          </>
        )}

        <Button
          size="small"
          variant="outlined"
          color="error"
          startIcon={
            <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} sx={{ fontSize: 16 }} />
          }
          fullWidth
          onClick={() => {
            handleClose();
            onRemove?.();
          }}
          sx={{
            mt: 2,
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 1.5,
          }}
        >
          Remove
        </Button>
      </Popover>
    </>
  );
}

export default memo(WorkflowNode);
