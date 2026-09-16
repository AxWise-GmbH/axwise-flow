import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  IconButton,
  TextField,
  MenuItem,
  useTheme,
  alpha,
  Alert,
  Stack,
  keyframes,
} from '@mui/material';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CloseIcon from '@mui/icons-material/Close';
import MicOutlinedIcon from '@mui/icons-material/MicOutlined';
import StopOutlinedIcon from '@mui/icons-material/StopOutlined';
import { getVoiceUnsupportedMessage } from '../../hooks/useVoiceControl';
import { GROUP_TYPES, AGREEMENT_TYPES } from '../../utils/constants';

import AppIcon from '../icons/AppIcon';

const recordPulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.15); }
`;

const NAV_PATHS = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/partners', label: 'Partners' },
  { path: '/task-manager', label: 'Tasks' },
];

export default function VoiceConfirmationModal({
  open,
  onClose,
  actions = [],
  onApproveAll,
  onApproveOne,
  onParseText,
  onRetryVoice,
  onAddMore,
  onStopAddMore,
  isAddMoreRecording,
}) {
  const theme = useTheme();
  const [mode, setMode] = useState('list'); // 'list' | 'onebyone'
  const [approved, setApproved] = useState(new Set());
  const [skipped, setSkipped] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [editPayload, setEditPayload] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { successCount, total, errors: [] }
  const [textInput, setTextInput] = useState('');
  useEffect(() => {
    if (actions.length > 0) setTextInput('');
  }, [actions.length]);

  const pending = actions.filter((a) => !approved.has(a.id) && !skipped.has(a.id));
  const currentAction = mode === 'onebyone' ? pending[0] : null;
  const currentIndex = currentAction ? actions.findIndex((a) => a.id === currentAction.id) + 1 : 0;

  const handleClose = () => {
    setMode('list');
    setApproved(new Set());
    setSkipped(new Set());
    setEditingId(null);
    setEditPayload({});
    setResult(null);
    onClose();
  };

  const createPartnerActionsMissingName = actions.filter(
    (a) => a.type === 'create_partner' && !(a.name || '').toString().trim()
  );
  const canApproveAll = actions.length > 0 && createPartnerActionsMissingName.length === 0;

  const handleApproveAll = async () => {
    if (actions.length === 0 || !canApproveAll) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await onApproveAll(actions);
      setResult(res);
      if (res.successCount === actions.length && (!res.errors || res.errors.length === 0)) {
        setTimeout(handleClose, 2000);
      }
    } catch (err) {
      setResult({ successCount: 0, total: actions.length, errors: [{ message: err.message }] });
    } finally {
      setLoading(false);
    }
  };

  const handleReviewOneByOne = () => {
    setMode('onebyone');
    setResult(null);
  };

  const getEditableValue = (action) => {
    if (action.type === 'navigate') return editPayload[action.id]?.path ?? action.path;
    if (action.type === 'create_partner') return editPayload[action.id]?.name ?? action.name ?? '';
    if (action.type === 'create_task') return editPayload[action.id]?.title ?? action.title ?? '';
    return null;
  };

  const getPartnerPayload = (action) => ({
    name: (editPayload[action.id]?.name ?? action.name ?? '').toString().trim(),
    group: editPayload[action.id]?.group ?? action.group ?? '',
    team: (editPayload[action.id]?.team ?? action.team ?? '').toString().trim(),
    agreement: editPayload[action.id]?.agreement ?? action.agreement ?? '',
    geos: Array.isArray(editPayload[action.id]?.geos)
      ? editPayload[action.id].geos
      : Array.isArray(action.geos)
        ? action.geos
        : [],
  });

  const getPartnerSummaryLabel = (payload) => {
    const parts = [];
    if (payload.name) parts.push(`"${payload.name}"`);
    if (payload.group) parts.push(`group ${payload.group}`);
    if (payload.team) parts.push(`team ${payload.team}`);
    if (payload.agreement) parts.push(`agreement ${payload.agreement}`);
    if (payload.geos?.length) parts.push(`geo ${payload.geos.join(', ')}`);
    return parts.length > 0
      ? `Create partner: ${parts.join(', ')}`
      : 'Create new partner (name required)';
  };

  const hasRequiredPartnerName = (action) => {
    if (action.type !== 'create_partner') return true;
    const name = (editPayload[action.id]?.name ?? action.name ?? '').toString().trim();
    return name.length > 0;
  };

  const handleSaveEdit = (action) => {
    const v = getEditableValue(action);
    if (action.type === 'navigate' && v) action.path = v;
    if (action.type === 'create_partner') {
      const payload = getPartnerPayload(action);
      action.name = payload.name;
      action.group = payload.group || undefined;
      action.team = payload.team || undefined;
      action.agreement = payload.agreement || undefined;
      action.geos = payload.geos?.length ? payload.geos : undefined;
      action.label = getPartnerSummaryLabel(payload);
    }
    if (action.type === 'create_task' && v) action.title = v;
    if (action.type === 'create_task') {
      action.label = `Create task "${action.title}"`;
    }
    if (action.type === 'navigate') {
      action.label = `Navigate to ${NAV_PATHS.find((p) => p.path === v)?.label || v}`;
    }
    setEditingId(null);
    setEditPayload((prev) => ({ ...prev, [action.id]: {} }));
  };

  const handleApproveOne = async (action) => {
    const toRun = { ...action };
    if (action.type === 'navigate' && editPayload[action.id]?.path)
      toRun.path = editPayload[action.id].path;
    if (action.type === 'create_partner') {
      const payload = getPartnerPayload(action);
      if (!payload.name) return;
      toRun.name = payload.name;
      toRun.group = payload.group || undefined;
      toRun.team = payload.team || undefined;
      toRun.agreement = payload.agreement || undefined;
      toRun.geos = payload.geos?.length ? payload.geos : undefined;
    }
    if (action.type === 'create_task' && editPayload[action.id]?.title)
      toRun.title = editPayload[action.id].title;
    setLoading(true);
    try {
      const res = await onApproveOne(toRun);
      if (res.ok) {
        setApproved((prev) => new Set(prev).add(action.id));
      } else {
        setResult((r) => ({
          ...r,
          errors: [...(r?.errors || []), { actionId: action.id, message: res.error }],
        }));
      }
    } catch (err) {
      setResult((r) => ({
        ...r,
        errors: [...(r?.errors || []), { actionId: action.id, message: err.message }],
      }));
    } finally {
      setLoading(false);
    }
    setEditingId(null);
  };

  const handleSkipOne = (action) => {
    setSkipped((prev) => new Set(prev).add(action.id));
    setEditingId(null);
  };

  const allApprovedOrSkipped = pending.length === 0 && (approved.size > 0 || skipped.size > 0);
  const oneByOneComplete = mode === 'onebyone' && pending.length === 0;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          border: '1px solid',
          borderColor: alpha(theme.palette.primary.main, 0.2),
        },
      }}
      aria-labelledby="voice-confirmation-title"
      aria-describedby="voice-confirmation-description"
    >
      <DialogTitle
        id="voice-confirmation-title"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: 'divider',
          pb: 2,
        }}
      >
        <Typography variant="h6" fontWeight={700}>
          You finished?
        </Typography>
        <IconButton onClick={handleClose} aria-label="Close" size="small">
          <AppIcon name="Close" fallback={CloseIcon} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Typography
          id="voice-confirmation-description"
          variant="body2"
          color="text.secondary"
          sx={{ mb: 2 }}
        >
          Detected actions from your voice input. Approve all or review one by one.
        </Typography>

        {result && (
          <Alert
            severity={result.errors?.length ? 'warning' : 'success'}
            sx={{ mb: 2 }}
            onClose={() => setResult(null)}
          >
            {result.successCount === result.total && !result.errors?.length
              ? `✓ ${result.successCount} action(s) completed successfully.`
              : `${result.successCount} of ${result.total} succeeded. ${result.errors?.length || 0} failed.`}
          </Alert>
        )}

        {mode === 'list' && (
          <>
            <List
              dense
              sx={{ bgcolor: alpha(theme.palette.primary.main, 0.04), borderRadius: 2, py: 0 }}
            >
              {actions.map((a, i) => (
                <ListItem
                  key={a.id}
                  sx={{
                    borderBottom: i < actions.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider',
                  }}
                >
                  <AppIcon
                    name="CheckBoxOutlineBlank"
                    fallback={CheckBoxOutlineBlankIcon}
                    sx={{ color: 'text.secondary', mr: 1.5, fontSize: 22 }}
                  />
                  <ListItemText
                    primary={`${i + 1}. ${a.label}`}
                    primaryTypographyProps={{ fontWeight: 500 }}
                  />
                </ListItem>
              ))}
            </List>
            {actions.length === 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {onRetryVoice
                    ? 'No actions detected. If voice didn’t work (e.g. no internet), try the microphone again or type your command below.'
                    : getVoiceUnsupportedMessage()}
                </Typography>
                {onRetryVoice && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AppIcon name="MicOutlined" fallback={MicOutlinedIcon} />}
                    onClick={onRetryVoice}
                    sx={{ mb: 1.5 }}
                    aria-label="Try microphone again"
                  >
                    Try microphone again
                  </Button>
                )}
                {onParseText && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="e.g. Go to Tasks and create task Review report"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && onParseText(textInput)}
                      aria-label="Type command"
                    />
                    <Button
                      variant="contained"
                      onClick={() => onParseText(textInput)}
                      disabled={!textInput.trim()}
                    >
                      Parse
                    </Button>
                  </Stack>
                )}
              </Box>
            )}
          </>
        )}

        {mode === 'onebyone' && currentAction && (
          <Box sx={{ py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Action {currentIndex} of {actions.length}
            </Typography>
            <Box
              sx={{
                mt: 1,
                p: 2,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, 0.15),
              }}
            >
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                {currentAction.label}
              </Typography>
              {editingId === currentAction.id ? (
                <Box sx={{ mt: 1 }}>
                  {currentAction.type === 'navigate' && (
                    <TextField
                      select
                      size="small"
                      fullWidth
                      label="Page"
                      value={editPayload[currentAction.id]?.path ?? currentAction.path}
                      onChange={(e) =>
                        setEditPayload((prev) => ({
                          ...prev,
                          [currentAction.id]: { ...prev[currentAction.id], path: e.target.value },
                        }))
                      }
                    >
                      {NAV_PATHS.map((p) => (
                        <MenuItem key={p.path} value={p.path}>
                          {p.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                  {currentAction.type === 'create_task' && (
                    <TextField
                      size="small"
                      fullWidth
                      label="Task title"
                      value={editPayload[currentAction.id]?.title ?? currentAction.title ?? ''}
                      onChange={(e) =>
                        setEditPayload((prev) => ({
                          ...prev,
                          [currentAction.id]: { ...prev[currentAction.id], title: e.target.value },
                        }))
                      }
                    />
                  )}
                  {currentAction.type === 'create_partner' && (
                    <Stack spacing={1.5}>
                      <Typography variant="caption" fontWeight={700} color="text.secondary">
                        Final verdict — data will be applied to the correct columns
                      </Typography>
                      <TextField
                        size="small"
                        fullWidth
                        required
                        label="Partner name (required)"
                        placeholder="e.g. Acme Corp"
                        value={editPayload[currentAction.id]?.name ?? currentAction.name ?? ''}
                        onChange={(e) =>
                          setEditPayload((prev) => ({
                            ...prev,
                            [currentAction.id]: { ...prev[currentAction.id], name: e.target.value },
                          }))
                        }
                      />
                      <TextField
                        select
                        size="small"
                        fullWidth
                        label="Group"
                        value={editPayload[currentAction.id]?.group ?? currentAction.group ?? ''}
                        onChange={(e) =>
                          setEditPayload((prev) => ({
                            ...prev,
                            [currentAction.id]: {
                              ...prev[currentAction.id],
                              group: e.target.value,
                            },
                          }))
                        }
                      >
                        <MenuItem value="">—</MenuItem>
                        {GROUP_TYPES.map((g) => (
                          <MenuItem key={g} value={g}>
                            {g}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        size="small"
                        fullWidth
                        label="Team"
                        placeholder="e.g. gamma unit"
                        value={editPayload[currentAction.id]?.team ?? currentAction.team ?? ''}
                        onChange={(e) =>
                          setEditPayload((prev) => ({
                            ...prev,
                            [currentAction.id]: { ...prev[currentAction.id], team: e.target.value },
                          }))
                        }
                      />
                      <TextField
                        select
                        size="small"
                        fullWidth
                        label="Agreement"
                        value={
                          editPayload[currentAction.id]?.agreement ?? currentAction.agreement ?? ''
                        }
                        onChange={(e) =>
                          setEditPayload((prev) => ({
                            ...prev,
                            [currentAction.id]: {
                              ...prev[currentAction.id],
                              agreement: e.target.value,
                            },
                          }))
                        }
                      >
                        <MenuItem value="">—</MenuItem>
                        {AGREEMENT_TYPES.map((a) => (
                          <MenuItem key={a} value={a}>
                            {a}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        size="small"
                        fullWidth
                        label="Geos (comma-separated, e.g. BR, US)"
                        placeholder="BR, US"
                        value={
                          Array.isArray(editPayload[currentAction.id]?.geos)
                            ? editPayload[currentAction.id].geos.join(', ')
                            : Array.isArray(currentAction.geos)
                              ? currentAction.geos.join(', ')
                              : ''
                        }
                        onChange={(e) => {
                          const geos = e.target.value
                            .split(/[\s,]+/)
                            .map((s) => s.trim().toUpperCase())
                            .filter(Boolean);
                          setEditPayload((prev) => ({
                            ...prev,
                            [currentAction.id]: { ...prev[currentAction.id], geos },
                          }));
                        }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                        {getPartnerSummaryLabel(getPartnerPayload(currentAction))}
                      </Typography>
                    </Stack>
                  )}
                  <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handleSaveEdit(currentAction)}
                    >
                      Save
                    </Button>
                    <Button size="small" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </Stack>
                </Box>
              ) : (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap">
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<AppIcon name="CheckBox" fallback={CheckBoxIcon} />}
                    onClick={() => handleApproveOne(currentAction)}
                    disabled={loading || !hasRequiredPartnerName(currentAction)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleSkipOne(currentAction)}
                    disabled={loading}
                  >
                    Skip
                  </Button>
                  {['navigate', 'create_partner', 'create_task'].includes(currentAction.type) && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AppIcon name="EditOutlined" fallback={EditOutlinedIcon} />}
                      onClick={() => setEditingId(currentAction.id)}
                      disabled={loading}
                    >
                      Edit
                    </Button>
                  )}
                </Stack>
              )}
            </Box>
          </Box>
        )}

        {mode === 'onebyone' && !currentAction && pending.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            All actions reviewed. {approved.size} approved, {skipped.size} skipped.
          </Typography>
        )}
      </DialogContent>
      {isAddMoreRecording && onStopAddMore && (
        <Box
          sx={{
            px: 3,
            py: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            bgcolor: (t) => alpha(t.palette.error.main, 0.08),
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              bgcolor: 'error.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: `${recordPulse} 1.2s ease-in-out infinite`,
            }}
          >
            <AppIcon
              name="MicOutlined"
              fallback={MicOutlinedIcon}
              sx={{ color: '#fff', fontSize: 22 }}
            />
          </Box>
          <Typography variant="body2" fontWeight={600} color="text.primary">
            Recording... Speak your additional commands, then click Stop.
          </Typography>
          <Button
            variant="contained"
            color="error"
            size="small"
            startIcon={<AppIcon name="StopOutlined" fallback={StopOutlinedIcon} />}
            onClick={onStopAddMore}
            sx={{ ml: 'auto' }}
          >
            Stop
          </Button>
        </Box>
      )}
      <DialogActions sx={{ px: 3, pb: 2, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        {mode === 'list' && (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            {onAddMore && (
              <Button
                variant="outlined"
                onClick={onAddMore}
                disabled={loading}
                startIcon={<AppIcon name="MicOutlined" fallback={MicOutlinedIcon} />}
              >
                Add More
              </Button>
            )}
            <Button
              variant="outlined"
              onClick={handleReviewOneByOne}
              disabled={actions.length === 0 || loading}
            >
              Review One by One
            </Button>
            <Button
              variant="contained"
              onClick={handleApproveAll}
              disabled={!canApproveAll || loading}
              title={
                createPartnerActionsMissingName.length > 0
                  ? 'Enter partner name(s) in Review One by One first'
                  : undefined
              }
            >
              {loading ? 'Executing...' : 'Approve All'}
            </Button>
            {createPartnerActionsMissingName.length > 0 && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5 }}
              >
                Partner name required — use Review One by One to enter name(s).
              </Typography>
            )}
          </>
        )}
        {mode === 'onebyone' && (
          <>
            <Button onClick={() => setMode('list')}>Back to list</Button>
            {(oneByOneComplete || allApprovedOrSkipped) && (
              <Button variant="contained" onClick={handleClose}>
                Done
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
