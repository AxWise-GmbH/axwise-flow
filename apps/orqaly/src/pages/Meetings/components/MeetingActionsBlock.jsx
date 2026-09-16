import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Stack,
  Chip,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Collapse,
  alpha,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import { partnerService } from '../../../services/partnerService';
import { meetingService } from '../../../services/meetingService';
import { addEntry } from '../../../services/partnerHistoryService';
import {
  AGREEMENT_TYPES,
  FUNNEL_STATUSES,
  TRAFFIC_SOURCES,
  GROUP_TYPES,
  GROUP_SUBTYPES,
} from '../../../utils/constants';

import AppIcon from '../../../components/icons/AppIcon';

/**
 * Shows pending "Actions from meeting" - suggested partner updates derived from a meeting transcript.
 * User can apply changes one-by-one, correct the suggested value (Edit), or Apply all.
 */
export default function MeetingActionsBlock({
  meetings = [],
  partner,
  partnerId,
  onPartnerRefetch,
  onMeetingsRefetch,
}) {
  const theme = useTheme();
  const [expandedMeetingId, setExpandedMeetingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [applying, setApplying] = useState(false);

  const meetingsWithActions = (meetings || []).filter(
    (m) =>
      Array.isArray(m.suggestedPartnerUpdates) && m.suggestedPartnerUpdates.some((s) => !s.applied)
  );

  if (meetingsWithActions.length === 0) return null;

  const getApplyPayload = (field, suggestedValue) => {
    if (field === 'trafficSources') {
      const str = typeof suggestedValue === 'string' ? suggestedValue : '';
      return str
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return suggestedValue;
  };

  const handleApplyOne = async (meeting, suggestion) => {
    if (!partnerId || applying) return;
    setApplying(true);
    try {
      const value = getApplyPayload(suggestion.field, suggestion.suggestedValue);
      const payload = { [suggestion.field]: value };
      if (suggestion.field === 'group' && value) {
        payload.groupSubtype = GROUP_SUBTYPES[value] || '';
      }
      await partnerService.update(partnerId, payload);
      await addEntry(partnerId, {
        type: 'interaction',
        title: 'Profile updated from meeting',
        detail: `${suggestion.label}: ${String(suggestion.suggestedValue)}`,
        meta: { meetingId: meeting.id, meetingTitle: meeting.title },
      });
      const updated = (meeting.suggestedPartnerUpdates || []).map((s) =>
        s.id === suggestion.id ? { ...s, applied: true } : s
      );
      await meetingService.update(meeting.id, { suggestedPartnerUpdates: updated });
      onPartnerRefetch?.();
      onMeetingsRefetch?.();
    } finally {
      setApplying(false);
      setEditingId(null);
    }
  };

  const handleApplyAll = async (meeting) => {
    const pending = (meeting.suggestedPartnerUpdates || []).filter((s) => !s.applied);
    for (const suggestion of pending) {
      await handleApplyOne(meeting, suggestion);
    }
  };

  const handleSaveEdit = async (meeting, suggestion) => {
    if (editingId !== suggestion.id || editValue === '') return;
    try {
      const updated = (meeting.suggestedPartnerUpdates || []).map((s) =>
        s.id === suggestion.id ? { ...s, suggestedValue: editValue } : s
      );
      await meetingService.update(meeting.id, { suggestedPartnerUpdates: updated });
      onMeetingsRefetch?.();
      setEditingId(null);
      setEditValue('');
    } catch {
      // ignore
    }
  };

  const renderEditor = (meeting, suggestion) => {
    if (editingId !== suggestion.id) return null;
    const { field, suggestedValue } = suggestion;
    const currentEdit = editValue || suggestedValue;

    if (field === 'agreement') {
      return (
        <FormControl size="small" sx={{ minWidth: 140, mt: 1 }}>
          <InputLabel>Value</InputLabel>
          <Select value={currentEdit} label="Value" onChange={(e) => setEditValue(e.target.value)}>
            {AGREEMENT_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </Select>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              size="small"
              variant="contained"
              onClick={() => handleSaveEdit(meeting, suggestion)}
            >
              Save
            </Button>
            <Button
              size="small"
              onClick={() => {
                setEditingId(null);
                setEditValue('');
              }}
            >
              Cancel
            </Button>
          </Stack>
        </FormControl>
      );
    }
    if (field === 'funnelStatus') {
      return (
        <FormControl size="small" sx={{ minWidth: 180, mt: 1 }}>
          <InputLabel>Value</InputLabel>
          <Select value={currentEdit} label="Value" onChange={(e) => setEditValue(e.target.value)}>
            {FUNNEL_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </Select>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              size="small"
              variant="contained"
              onClick={() => handleSaveEdit(meeting, suggestion)}
            >
              Save
            </Button>
            <Button
              size="small"
              onClick={() => {
                setEditingId(null);
                setEditValue('');
              }}
            >
              Cancel
            </Button>
          </Stack>
        </FormControl>
      );
    }
    if (field === 'group') {
      return (
        <FormControl size="small" sx={{ minWidth: 140, mt: 1 }}>
          <InputLabel>Value</InputLabel>
          <Select value={currentEdit} label="Value" onChange={(e) => setEditValue(e.target.value)}>
            {GROUP_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </Select>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              size="small"
              variant="contained"
              onClick={() => handleSaveEdit(meeting, suggestion)}
            >
              Save
            </Button>
            <Button
              size="small"
              onClick={() => {
                setEditingId(null);
                setEditValue('');
              }}
            >
              Cancel
            </Button>
          </Stack>
        </FormControl>
      );
    }
    if (field === 'trafficSources') {
      return (
        <Box sx={{ mt: 1 }}>
          <TextField
            size="small"
            fullWidth
            label="Comma-separated (e.g. FB, TikTok)"
            value={currentEdit}
            onChange={(e) => setEditValue(e.target.value)}
            sx={{ mb: 1 }}
          />
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="contained"
              onClick={() => handleSaveEdit(meeting, suggestion)}
            >
              Save
            </Button>
            <Button
              size="small"
              onClick={() => {
                setEditingId(null);
                setEditValue('');
              }}
            >
              Cancel
            </Button>
          </Stack>
        </Box>
      );
    }
    return (
      <Box sx={{ mt: 1 }}>
        <TextField
          size="small"
          value={currentEdit}
          onChange={(e) => setEditValue(e.target.value)}
          sx={{ mb: 1, minWidth: 200 }}
        />
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="contained"
            onClick={() => handleSaveEdit(meeting, suggestion)}
          >
            Save
          </Button>
          <Button
            size="small"
            onClick={() => {
              setEditingId(null);
              setEditValue('');
            }}
          >
            Cancel
          </Button>
        </Stack>
      </Box>
    );
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        mb: 2.5,
        borderRadius: 3,
        bgcolor: alpha(theme.palette.primary.main, 0.04),
        border: '1px solid',
        borderColor: alpha(theme.palette.primary.main, 0.2),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <AppIcon
          name="NotificationsActiveOutlined"
          fallback={NotificationsActiveOutlinedIcon}
          sx={{ color: 'primary.main', fontSize: 24 }}
        />
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
          Actions from meetings
        </Typography>
        <Chip
          label={meetingsWithActions.length}
          size="small"
          color="primary"
          sx={{ fontWeight: 700 }}
        />
      </Box>
      <Stack spacing={2}>
        {meetingsWithActions.map((meeting) => {
          const pending = (meeting.suggestedPartnerUpdates || []).filter((s) => !s.applied);
          if (pending.length === 0) return null;
          const isExpanded = expandedMeetingId === meeting.id;

          return (
            <Paper
              key={meeting.id}
              variant="outlined"
              sx={{
                borderRadius: 2,
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 2,
                  py: 1.5,
                  bgcolor: 'background.default',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                }}
                onClick={() => setExpandedMeetingId(isExpanded ? null : meeting.id)}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {meeting.title || 'Meeting'}
                </Typography>
                <Chip
                  label={`${pending.length} change${pending.length > 1 ? 's' : ''}`}
                  size="small"
                />
                {isExpanded ? (
                  <AppIcon name="ExpandLess" fallback={ExpandLessIcon} />
                ) : (
                  <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />
                )}
              </Box>
              <Collapse in={isExpanded}>
                <Box sx={{ px: 2, pb: 2, pt: 0 }}>
                  <Stack spacing={1.5} sx={{ mt: 1 }}>
                    {pending.map((suggestion) => (
                      <Box
                        key={suggestion.id}
                        sx={{
                          p: 1.5,
                          borderRadius: 1.5,
                          bgcolor: 'background.paper',
                          border: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 700, color: 'text.secondary' }}
                        >
                          {suggestion.label}
                        </Typography>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            flexWrap: 'wrap',
                            mt: 0.5,
                          }}
                        >
                          <Typography variant="body2" color="text.secondary">
                            Current: {String(suggestion.currentValue || '-')}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            → Suggested: {String(suggestion.suggestedValue || '-')}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={
                              <AppIcon
                                name="CheckCircleOutline"
                                fallback={CheckCircleOutlineIcon}
                              />
                            }
                            onClick={() => handleApplyOne(meeting, suggestion)}
                            disabled={applying}
                            disableElevation
                          >
                            Apply
                          </Button>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(suggestion.id);
                              setEditValue(suggestion.suggestedValue);
                            }}
                            sx={{ color: 'text.secondary' }}
                          >
                            <AppIcon
                              name="EditOutlined"
                              fallback={EditOutlinedIcon}
                              fontSize="small"
                            />
                          </IconButton>
                        </Box>
                        {renderEditor(meeting, suggestion)}
                      </Box>
                    ))}
                  </Stack>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleApplyAll(meeting)}
                    disabled={applying}
                    sx={{ mt: 2 }}
                  >
                    Apply all ({pending.length})
                  </Button>
                </Box>
              </Collapse>
            </Paper>
          );
        })}
      </Stack>
    </Paper>
  );
}
