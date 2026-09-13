import { useState, useEffect } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Divider,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Stack,
  Switch,
  FormControlLabel,
  useTheme,
  alpha,
  Radio,
  RadioGroup,
  FormLabel,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import WebhookOutlinedIcon from '@mui/icons-material/WebhookOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import PublicRoundedIcon from '@mui/icons-material/PublicRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PlaylistPlayOutlinedIcon from '@mui/icons-material/PlaylistPlayOutlined';
import InputAdornment from '@mui/material/InputAdornment';
import { TRAFFIC_SOURCES } from '../../../utils/constants';
import { ACTION_TYPES, SMS_PROVIDERS, EMAIL_PROVIDERS } from '../../../services/workflowService';

import AppIcon from '../../../components/icons/AppIcon';

const SCHEDULE_IMMEDIATE = 'immediate';
const SCHEDULE_DATETIME = 'scheduled';

function toDatetimeLocal(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value) {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const ACTION_ICONS = {
  sms: <AppIcon name="SmsOutlined" fallback={SmsOutlinedIcon} sx={{ fontSize: 18 }} />,
  email: <AppIcon name="EmailOutlined" fallback={EmailOutlinedIcon} sx={{ fontSize: 18 }} />,
  webhook: <AppIcon name="WebhookOutlined" fallback={WebhookOutlinedIcon} sx={{ fontSize: 18 }} />,
};

function SectionCard({ icon, title, subtitle, children, sx = {} }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        mb: 2,
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          bgcolor: theme.palette.primary.main,
          borderRadius: '2.5px 0 0 2.5px',
        },
        ...sx,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: subtitle ? 0.5 : 1.25 }}>
        <Box sx={{ color: 'primary.main', display: 'flex', alignItems: 'center' }}>{icon}</Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
          {title}
        </Typography>
      </Box>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>
          {subtitle}
        </Typography>
      )}
      {children}
    </Box>
  );
}

export default function WorkflowDrawer({ open, onClose, workflow, onSave }) {
  const theme = useTheme();
  const isEdit = Boolean(workflow?.id);

  const [name, setName] = useState('');
  const [landingPageUrl, setLandingPageUrl] = useState('');
  const [trafficSources, setTrafficSources] = useState([]);
  const [actions, setActions] = useState([]);
  const [enabled, setEnabled] = useState(true);
  const [visibility, setVisibility] = useState('public');
  const [trackingCampaign, setTrackingCampaign] = useState({ id: '', name: '' });
  const [smsService, setSmsService] = useState({
    provider: 'twilio',
    apiKey: '',
    apiSecret: '',
    fromNumber: '',
    apiUrl: '',
  });
  const [emailService, setEmailService] = useState({
    provider: 'sendgrid',
    apiKey: '',
    fromEmail: '',
    apiUrl: '',
  });

  const normalizeActionConfig = (config) => {
    const c = config || {};
    const scheduleType =
      c.scheduleType === SCHEDULE_DATETIME ? SCHEDULE_DATETIME : SCHEDULE_IMMEDIATE;
    return {
      ...c,
      scheduleType,
      scheduledAt: scheduleType === SCHEDULE_DATETIME ? c.scheduledAt || null : null,
    };
  };

  useEffect(() => {
    if (workflow) {
      setName(workflow.name || '');
      setLandingPageUrl(workflow.landingPageUrl || '');
      setTrafficSources(Array.isArray(workflow.trafficSources) ? [...workflow.trafficSources] : []);
      setActions(
        Array.isArray(workflow.actions) && workflow.actions.length > 0
          ? workflow.actions.map((a) => ({
              type: a.type || 'sms',
              config: normalizeActionConfig(a.config),
            }))
          : [{ type: 'sms', config: normalizeActionConfig({}) }]
      );
      setEnabled(workflow.enabled !== false);
      setVisibility(workflow.visibility || 'public');
      setTrackingCampaign({
        id: workflow.trackingCampaign?.id || '',
        name: workflow.trackingCampaign?.name || '',
      });
      setSmsService({
        provider: workflow.smsService?.provider || 'twilio',
        apiKey: workflow.smsService?.apiKey || '',
        apiSecret: workflow.smsService?.apiSecret || '',
        fromNumber: workflow.smsService?.fromNumber || '',
        apiUrl: workflow.smsService?.apiUrl || '',
      });
      setEmailService({
        provider: workflow.emailService?.provider || 'sendgrid',
        apiKey: workflow.emailService?.apiKey || '',
        fromEmail: workflow.emailService?.fromEmail || '',
        apiUrl: workflow.emailService?.apiUrl || '',
      });
    } else {
      setName('');
      setLandingPageUrl('');
      setTrafficSources([]);
      setActions([{ type: 'sms', config: normalizeActionConfig({}) }]);
      setEnabled(true);
      setTrackingCampaign({ id: '', name: '' });
      setSmsService({ provider: 'twilio', apiKey: '', apiSecret: '', fromNumber: '', apiUrl: '' });
      setEmailService({ provider: 'sendgrid', apiKey: '', fromEmail: '', apiUrl: '' });
    }
  }, [workflow, open]);

  const handleTrafficToggle = (source) => {
    setTrafficSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    );
  };

  const handleAddAction = () => {
    setActions((prev) => [...prev, { type: 'sms', config: {} }]);
  };

  const handleRemoveAction = (index) => {
    setActions((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handleActionTypeChange = (index, type) => {
    setActions((prev) => {
      const next = [...prev];
      const existingConfig = next[index]?.config || {};
      next[index] = { type, config: { ...existingConfig } };
      return next;
    });
  };

  const handleActionScheduleChange = (index, scheduleType, scheduledAt = null) => {
    setActions((prev) => {
      const next = [...prev];
      const config = {
        ...(next[index]?.config || {}),
        scheduleType,
        scheduledAt: scheduleType === SCHEDULE_DATETIME ? scheduledAt : null,
      };
      next[index] = { ...next[index], config };
      return next;
    });
  };

  const handleActionScheduledAtChange = (index, datetimeLocalValue) => {
    const iso = fromDatetimeLocal(datetimeLocalValue);
    setActions((prev) => {
      const next = [...prev];
      const config = { ...(next[index]?.config || {}), scheduledAt: iso };
      next[index] = { ...next[index], config };
      return next;
    });
  };

  const handleSaveClick = () => {
    const payload = {
      name: name.trim() || 'Untitled Workflow',
      landingPageUrl: landingPageUrl.trim(),
      trafficSources,
      actions,
      enabled,
      visibility,
      trackingCampaign: trackingCampaign.id || trackingCampaign.name ? trackingCampaign : null,
      smsService: smsService.apiKey || smsService.apiUrl ? smsService : null,
      emailService: emailService.apiKey || emailService.apiUrl ? emailService : null,
    };
    onSave(workflow?.id, payload);
    onClose();
  };

  const canSave = name.trim() && landingPageUrl.trim();

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box
        sx={{
          width: 580,
          maxWidth: '100vw',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
          overflow: 'hidden',
        }}
      >
        {/* Header - same style as Finance drawer */}
        <Box
          sx={{
            p: 2.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'primary.main',
                flexShrink: 0,
              }}
            >
              <AppIcon
                name="AccountTreeOutlined"
                fallback={AccountTreeOutlinedIcon}
                sx={{ fontSize: 26 }}
              />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                {isEdit ? 'Edit Workflow' : 'Create Workflow'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                Connect a landing page URL. When postback data is received, the selected actions
                will run.
              </Typography>
            </Box>
          </Box>
          <IconButton
            onClick={onClose}
            size="small"
            aria-label="Close"
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}
          >
            <AppIcon name="Close" fallback={CloseIcon} fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
          {/* Basics */}
          <SectionCard
            icon={
              <AppIcon name="LabelOutlined" fallback={LabelOutlinedIcon} sx={{ fontSize: 20 }} />
            }
            title="Workflow basics"
            subtitle="Name and landing page that receives postbacks."
          >
            <TextField
              label="Workflow name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              size="small"
              placeholder="e.g. FB Lead → SMS + Email"
              sx={{ mb: 1.5 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon
                      name="LabelOutlined"
                      fallback={LabelOutlinedIcon}
                      sx={{ fontSize: 18, color: 'text.secondary' }}
                    />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="Landing page URL"
              value={landingPageUrl}
              onChange={(e) => setLandingPageUrl(e.target.value)}
              fullWidth
              size="small"
              placeholder="https://your-landing.com/offer"
              helperText="Postbacks from this URL will trigger the actions below."
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon
                      name="LinkOutlined"
                      fallback={LinkOutlinedIcon}
                      sx={{ fontSize: 18, color: 'text.secondary' }}
                    />
                  </InputAdornment>
                ),
              }}
            />
          </SectionCard>

          {/* Campaign for tracking */}
          <SectionCard
            icon={
              <AppIcon
                name="CampaignOutlined"
                fallback={CampaignOutlinedIcon}
                sx={{ fontSize: 20 }}
              />
            }
            title="Campaign for tracking"
            subtitle="Optional: link this workflow to a campaign for conversion tracking."
          >
            <Stack direction="row" spacing={1}>
              <TextField
                label="Campaign ID"
                value={trackingCampaign.id}
                onChange={(e) => setTrackingCampaign((p) => ({ ...p, id: e.target.value }))}
                fullWidth
                size="small"
                placeholder="e.g. camp_abc123"
              />
              <TextField
                label="Campaign name"
                value={trackingCampaign.name}
                onChange={(e) => setTrackingCampaign((p) => ({ ...p, name: e.target.value }))}
                fullWidth
                size="small"
                placeholder="e.g. FB Lead Gen"
              />
            </Stack>
          </SectionCard>

          {/* Traffic sources */}
          <SectionCard
            icon={
              <AppIcon name="PublicOutlined" fallback={PublicOutlinedIcon} sx={{ fontSize: 20 }} />
            }
            title="Traffic sources"
            subtitle="Optional: limit this workflow to specific traffic sources."
          >
            <Stack direction="row" flexWrap="wrap" gap={0.75}>
              {TRAFFIC_SOURCES.map((source) => (
                <Chip
                  key={source}
                  label={source}
                  size="small"
                  onClick={() => handleTrafficToggle(source)}
                  variant={trafficSources.includes(source) ? 'filled' : 'outlined'}
                  sx={{
                    borderRadius: 1.5,
                    fontWeight: 600,
                    ...(trafficSources.includes(source)
                      ? { bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main' }
                      : {}),
                  }}
                />
              ))}
            </Stack>
          </SectionCard>

          {/* SMS API */}
          <SectionCard
            icon={<AppIcon name="SmsOutlined" fallback={SmsOutlinedIcon} sx={{ fontSize: 20 }} />}
            title="SMS send-out (API)"
            subtitle="Connect an SMS provider to send messages when workflow actions run."
          >
            <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
              <InputLabel>Provider</InputLabel>
              <Select
                value={smsService.provider}
                label="Provider"
                onChange={(e) => setSmsService((p) => ({ ...p, provider: e.target.value }))}
              >
                {SMS_PROVIDERS.map((opt) => (
                  <MenuItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {smsService.provider === 'other' ? (
              <TextField
                label="API URL"
                value={smsService.apiUrl}
                onChange={(e) => setSmsService((p) => ({ ...p, apiUrl: e.target.value }))}
                size="small"
                fullWidth
                placeholder="https://api.sms-provider.com/v1/send"
                sx={{ mb: 1 }}
              />
            ) : null}
            <TextField
              label="API Key / Account SID"
              value={smsService.apiKey}
              onChange={(e) => setSmsService((p) => ({ ...p, apiKey: e.target.value }))}
              size="small"
              fullWidth
              placeholder={smsService.provider === 'twilio' ? 'ACxxxxxxxx' : 'API key'}
              sx={{ mb: 1 }}
              type="password"
              autoComplete="off"
            />
            {(smsService.provider === 'twilio' || smsService.provider === 'nexmo') && (
              <TextField
                label="Auth Token / API Secret"
                value={smsService.apiSecret}
                onChange={(e) => setSmsService((p) => ({ ...p, apiSecret: e.target.value }))}
                size="small"
                fullWidth
                placeholder="Secret"
                sx={{ mb: 1 }}
                type="password"
                autoComplete="off"
              />
            )}
            <TextField
              label="From number"
              value={smsService.fromNumber}
              onChange={(e) => setSmsService((p) => ({ ...p, fromNumber: e.target.value }))}
              size="small"
              fullWidth
              placeholder="+1234567890"
            />
          </SectionCard>

          {/* Email API */}
          <SectionCard
            icon={
              <AppIcon name="EmailOutlined" fallback={EmailOutlinedIcon} sx={{ fontSize: 20 }} />
            }
            title="Email send-out (API)"
            subtitle="Connect an email provider to send messages when workflow actions run."
          >
            <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
              <InputLabel>Provider</InputLabel>
              <Select
                value={emailService.provider}
                label="Provider"
                onChange={(e) => setEmailService((p) => ({ ...p, provider: e.target.value }))}
              >
                {EMAIL_PROVIDERS.map((opt) => (
                  <MenuItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {emailService.provider === 'other' ? (
              <TextField
                label="API URL"
                value={emailService.apiUrl}
                onChange={(e) => setEmailService((p) => ({ ...p, apiUrl: e.target.value }))}
                size="small"
                fullWidth
                placeholder="https://api.email-provider.com/send"
                sx={{ mb: 1 }}
              />
            ) : null}
            <TextField
              label="API Key"
              value={emailService.apiKey}
              onChange={(e) => setEmailService((p) => ({ ...p, apiKey: e.target.value }))}
              size="small"
              fullWidth
              placeholder="SG.xxx or key-xxx"
              sx={{ mb: 1 }}
              type="password"
              autoComplete="off"
            />
            <TextField
              label="From email"
              value={emailService.fromEmail}
              onChange={(e) => setEmailService((p) => ({ ...p, fromEmail: e.target.value }))}
              size="small"
              fullWidth
              placeholder="noreply@yourdomain.com"
            />
          </SectionCard>

          {/* Actions on postback */}
          <SectionCard
            icon={
              <AppIcon
                name="PlaylistPlayOutlined"
                fallback={PlaylistPlayOutlinedIcon}
                sx={{ fontSize: 20 }}
              />
            }
            title="Actions on postback"
            subtitle="When postback data is received from the landing page URL, these actions run in order."
            sx={{ mb: 0 }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.25 }}>
              <Button
                size="small"
                startIcon={<AppIcon name="Add" fallback={AddIcon} />}
                onClick={handleAddAction}
                variant="outlined"
                sx={{ borderRadius: 1.5 }}
              >
                Add action
              </Button>
            </Box>
            <Stack spacing={1.5}>
              {actions.map((action, index) => {
                const config = action.config || {};
                const scheduleType =
                  config.scheduleType === SCHEDULE_DATETIME
                    ? SCHEDULE_DATETIME
                    : SCHEDULE_IMMEDIATE;
                const scheduledAtLocal = toDatetimeLocal(config.scheduledAt);
                return (
                  <Box
                    key={index}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: alpha(theme.palette.background.default, 0.5),
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel>Action type</InputLabel>
                        <Select
                          value={action.type}
                          label="Action type"
                          onChange={(e) => handleActionTypeChange(index, e.target.value)}
                        >
                          {ACTION_TYPES.map((opt) => (
                            <MenuItem key={opt.id} value={opt.id}>
                              <Stack direction="row" alignItems="center" gap={1}>
                                {ACTION_ICONS[opt.id] || ACTION_ICONS.sms}
                                {opt.label}
                              </Stack>
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveAction(index)}
                        disabled={actions.length <= 1}
                        aria-label="Remove action"
                      >
                        <AppIcon
                          name="DeleteOutline"
                          fallback={DeleteOutlineIcon}
                          fontSize="small"
                        />
                      </IconButton>
                    </Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 0.75 }}
                    >
                      {ACTION_TYPES.find((a) => a.id === action.type)?.description}
                    </Typography>
                    <FormLabel
                      sx={{
                        mt: 1.25,
                        mb: 0.5,
                        display: 'block',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: 'text.secondary',
                      }}
                    >
                      When to run
                    </FormLabel>
                    <RadioGroup
                      row
                      value={scheduleType}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === SCHEDULE_DATETIME && !config.scheduledAt) {
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          tomorrow.setHours(9, 0, 0, 0);
                          handleActionScheduleChange(
                            index,
                            SCHEDULE_DATETIME,
                            tomorrow.toISOString()
                          );
                        } else {
                          handleActionScheduleChange(index, v);
                        }
                      }}
                      sx={{ gap: 0.5 }}
                    >
                      <FormControlLabel
                        value={SCHEDULE_IMMEDIATE}
                        control={<Radio size="small" />}
                        label={<Typography variant="caption">Immediately</Typography>}
                      />
                      <FormControlLabel
                        value={SCHEDULE_DATETIME}
                        control={<Radio size="small" />}
                        label={<Typography variant="caption">Schedule</Typography>}
                      />
                    </RadioGroup>
                    {scheduleType === SCHEDULE_DATETIME && (
                      <TextField
                        label="Date & time"
                        type="datetime-local"
                        value={scheduledAtLocal}
                        onChange={(e) => handleActionScheduledAtChange(index, e.target.value)}
                        size="small"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        inputProps={{ min: toDatetimeLocal(new Date().toISOString()) }}
                        sx={{ mt: 1 }}
                      />
                    )}
                  </Box>
                );
              })}
            </Stack>
          </SectionCard>

          <FormControlLabel
            control={
              <Switch
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Workflow enabled
              </Typography>
            }
            sx={{ mt: 1, mb: 0.5 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={visibility === 'private'}
                onChange={(e) => setVisibility(e.target.checked ? 'private' : 'public')}
                color="warning"
                size="small"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {visibility === 'private' ? (
                  <AppIcon
                    name="LockOutlined"
                    fallback={LockOutlinedIcon}
                    sx={{ fontSize: 16, color: 'warning.main' }}
                  />
                ) : (
                  <AppIcon
                    name="PublicRounded"
                    fallback={PublicRoundedIcon}
                    sx={{ fontSize: 16, color: 'text.secondary' }}
                  />
                )}
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {visibility === 'private' ? 'Private' : 'Public'}
                </Typography>
              </Box>
            }
            sx={{ mb: 1 }}
          />
        </Box>

        <Box
          sx={{
            p: 2.5,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.background.default, 0.4),
          }}
        >
          <Stack direction="row" spacing={1.5} justifyContent="flex-end">
            <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 2 }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveClick}
              disabled={!canSave}
              sx={{ borderRadius: 2, fontWeight: 700 }}
            >
              {isEdit ? 'Save changes' : 'Create workflow'}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Drawer>
  );
}
