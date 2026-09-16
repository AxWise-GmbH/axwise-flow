/**
 * CreatePulseDialog — schedule a pulse (multi-entry) on an owner, on a schedule.
 * Visual shell matches Task Manager "Create Task" dialog.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Stack,
  Typography,
  TextField,
  MenuItem,
  Button,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  InputAdornment,
  Chip,
  Alert,
} from '@mui/material';
import FormDialog, {
  FormDialogSection,
  FORM_FIELD_SX,
  FORM_LABEL_PROPS,
  FORM_INPUT_FONT,
} from '../Common/FormDialog';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import PlaylistAddOutlinedIcon from '@mui/icons-material/PlaylistAddOutlined';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { INSTRUMENTS } from '../../data/instruments';
import { getAgents, syncAgentsFromSupabase } from '../../services/agentHubService';
import { getAllTeams } from '../../services/conciliumTeamsService';
import { listOrganizations } from '../../services/organizationService';
import { listGoals } from '../../services/goalService';
import { createPulseSchedule } from '../../services/pulseScheduleService';
import { defaultDateTimeLocal } from '../../utils/pulseSchedule';
import PulseScheduleFields from './PulseScheduleFields';

import AppIcon from '../icons/AppIcon';

const fieldSx = FORM_FIELD_SX;
const labelProps = FORM_LABEL_PROPS;
const inputFont = FORM_INPUT_FONT;

const OWNER_TYPES = [
  { value: 'agent', label: 'Agent', icon: SmartToyOutlinedIcon },
  { value: 'team', label: 'Team', icon: GroupsOutlinedIcon },
  { value: 'organization', label: 'Organization', icon: CorporateFareOutlinedIcon },
];

const ENTRY_KINDS = [
  { value: 'instrument', label: 'Instrument', icon: CategoryOutlinedIcon },
  { value: 'repeat_goal', label: 'Repeat Goal', icon: ReplayOutlinedIcon },
];

const INSTRUMENT_OPTIONS = INSTRUMENTS.filter((it) => it.group === 'instruments').map((it) => ({
  slug: it.slug,
  label: it.label,
  route: it.inAppRoute,
}));

function ownerTypeMeta(value) {
  return OWNER_TYPES.find((o) => o.value === value) || OWNER_TYPES[0];
}

function entryKindMeta(value) {
  return ENTRY_KINDS.find((k) => k.value === value) || ENTRY_KINDS[0];
}

function newInstrumentEntry() {
  return {
    kind: 'instrument',
    instrumentSlug: INSTRUMENT_OPTIONS[0]?.slug || '',
    prompt: '',
    ref: '',
  };
}

function newRepeatGoalEntry() {
  return { kind: 'repeat_goal', sourceGoalId: '', prompt: '' };
}

function entryIsValid(e) {
  if (!e.prompt?.trim()) return false;
  if (e.kind === 'instrument') return !!e.instrumentSlug;
  if (e.kind === 'repeat_goal') return !!e.sourceGoalId;
  return false;
}

function normalizeGoalsList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

const ownerEntityLabel = { agent: 'Agent', team: 'Team', organization: 'Organization' };

export default function CreatePulseDialog({
  open,
  onClose,
  onCreated,
  prefill = null,
  lockOwner = false,
}) {
  const [ownerType, setOwnerType] = useState(prefill?.ownerType || 'agent');
  const [ownerId, setOwnerId] = useState(prefill?.ownerId || '');
  const [entries, setEntries] = useState(() => [
    prefill?.instruction
      ? { ...newInstrumentEntry(), prompt: prefill.instruction }
      : newInstrumentEntry(),
  ]);
  const [scheduleKind, setScheduleKind] = useState('once');
  const [runAt, setRunAt] = useState(defaultDateTimeLocal());
  const [timeOfDay, setTimeOfDay] = useState('09:00');
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);

  const [owners, setOwners] = useState([]);
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [completedGoals, setCompletedGoals] = useState([]);
  const [loadingGoals, setLoadingGoals] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setOwnerType(prefill?.ownerType || 'agent');
    setOwnerId(prefill?.ownerId || '');
    setEntries([
      prefill?.instruction
        ? { ...newInstrumentEntry(), prompt: prefill.instruction }
        : newInstrumentEntry(),
    ]);
    setScheduleKind('once');
    setRunAt(defaultDateTimeLocal());
    setCompletedGoals([]);
    setLoadingGoals(false);
  }, [open, prefill]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingOwners(true);
      try {
        let list = [];
        if (ownerType === 'agent') {
          await syncAgentsFromSupabase().catch(() => {});
          list = (getAgents() || []).map((a) => ({ id: a.id, name: a.name || a.role || 'Agent' }));
        } else if (ownerType === 'team') {
          const teams = await getAllTeams().catch(() => []);
          list = (teams || []).map((t) => ({ id: t.id, name: t.name || 'Team' }));
        } else if (ownerType === 'organization') {
          const res = await listOrganizations().catch(() => ({ organizations: [] }));
          const orgs = res?.organizations || res || [];
          list = (orgs || []).map((o) => ({ id: o.id, name: o.name || 'Organization' }));
        }
        if (!cancelled) setOwners(list);
      } finally {
        if (!cancelled) setLoadingOwners(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ownerType]);

  const needsGoals = useMemo(() => entries.some((e) => e.kind === 'repeat_goal'), [entries]);
  useEffect(() => {
    if (!open || !needsGoals) return;
    let cancelled = false;
    setLoadingGoals(true);
    (async () => {
      try {
        const data = await listGoals('completed').catch(() => []);
        const list = normalizeGoalsList(data).filter((g) => g.status === 'completed');
        if (!cancelled) setCompletedGoals(list);
      } catch {
        if (!cancelled) setCompletedGoals([]);
      } finally {
        if (!cancelled) setLoadingGoals(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, needsGoals]);

  const ownerName = useMemo(
    () => owners.find((o) => String(o.id) === String(ownerId))?.name || prefill?.ownerName || '',
    [owners, ownerId, prefill]
  );

  const updateEntry = useCallback((idx, patch) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }, []);

  const setEntryKind = useCallback((idx, kind) => {
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i !== idx) return e;
        return kind === 'repeat_goal' ? newRepeatGoalEntry() : newInstrumentEntry();
      })
    );
  }, []);

  const addEntry = useCallback(() => {
    setEntries((prev) => [...prev, newInstrumentEntry()]);
  }, []);

  const removeEntry = useCallback((idx) => {
    setEntries((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }, []);

  const canSubmit = !!ownerId && entries.length > 0 && entries.every(entryIsValid) && !submitting;

  const handleSubmit = useCallback(async () => {
    setError('');
    if (!canSubmit) {
      setError('Pick an owner and complete every entry (each needs a prompt).');
      return;
    }
    setSubmitting(true);
    try {
      const payloadEntries = entries.map((e) => {
        if (e.kind === 'repeat_goal') {
          const src = completedGoals.find((g) => String(g.id) === String(e.sourceGoalId));
          return {
            kind: 'repeat_goal',
            source_goal_id: e.sourceGoalId,
            source_goal_title: src?.title || '',
            prompt: e.prompt.trim(),
          };
        }
        const instrument = INSTRUMENT_OPTIONS.find((i) => i.slug === e.instrumentSlug) || null;
        return {
          kind: 'instrument',
          instrument: instrument ? { slug: instrument.slug, route: instrument.route } : null,
          prompt: e.prompt.trim(),
          ref: e.ref?.trim() || '',
        };
      });
      await createPulseSchedule({
        ownerType,
        ownerId,
        ownerName,
        entries: payloadEntries,
        scheduleKind,
        runAt: scheduleKind === 'once' ? new Date(runAt).toISOString() : null,
        timeOfDay: scheduleKind === 'once' ? null : timeOfDay,
        weekday: scheduleKind === 'weekly' ? weekday : undefined,
        dayOfMonth: scheduleKind === 'monthly' ? dayOfMonth : undefined,
      });
      onCreated?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Failed to create pulse');
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    entries,
    completedGoals,
    ownerType,
    ownerId,
    ownerName,
    scheduleKind,
    runAt,
    timeOfDay,
    weekday,
    dayOfMonth,
    onCreated,
    onClose,
  ]);

  const OwnerTypeIcon = ownerTypeMeta(ownerType).icon;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="New Pulse"
      icon={EventRepeatOutlinedIcon}
      formId="create-pulse-form"
      onSubmit={() => {
        handleSubmit();
      }}
      primaryLabel="Create Pulse"
      primaryDisabled={!canSubmit}
      primaryLoading={submitting}
    >
      <Stack spacing={3.5}>
        {error && (
          <Alert severity="error" sx={{ fontSize: '0.8rem', borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {/* Owner */}
        <FormDialogSection title="Owner" icon={OwnerTypeIcon}>
          {lockOwner ? (
            <Chip
              icon={<AppIcon fallback={OwnerTypeIcon} sx={{ fontSize: '16px !important' }} />}
              label={ownerName || prefill?.ownerName || 'Selected owner'}
              sx={{ fontWeight: 600, borderRadius: 1.5, alignSelf: 'flex-start' }}
            />
          ) : (
            <>
              <FormControl fullWidth size="small" sx={fieldSx}>
                <InputLabel shrink id="pulse-owner-type-label" sx={labelProps.sx}>
                  Owner type
                </InputLabel>
                <Select
                  labelId="pulse-owner-type-label"
                  value={ownerType}
                  label="Owner type"
                  onChange={(e) => {
                    setOwnerType(e.target.value);
                    setOwnerId('');
                  }}
                  sx={inputFont}
                  renderValue={(val) => {
                    const meta = ownerTypeMeta(val);
                    const Icon = meta.icon;
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AppIcon fallback={Icon} sx={{ fontSize: 17, color: 'text.secondary' }} />
                        <span>{meta.label}</span>
                      </Box>
                    );
                  }}
                >
                  {OWNER_TYPES.map((o) => (
                    <MenuItem key={o.value} value={o.value}>
                      {o.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small" required sx={fieldSx}>
                <InputLabel shrink id="pulse-owner-id-label" sx={labelProps.sx}>
                  {ownerEntityLabel[ownerType] || 'Owner'}
                </InputLabel>
                <Select
                  labelId="pulse-owner-id-label"
                  value={ownerId}
                  label={ownerEntityLabel[ownerType] || 'Owner'}
                  onChange={(e) => setOwnerId(e.target.value)}
                  disabled={loadingOwners}
                  displayEmpty
                  sx={inputFont}
                  renderValue={(val) => {
                    const name = owners.find((o) => String(o.id) === String(val))?.name;
                    if (!val)
                      return (
                        <Typography color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                          Select…
                        </Typography>
                      );
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AppIcon
                          name="PersonOutline"
                          fallback={PersonOutlineIcon}
                          sx={{ fontSize: 17, color: 'text.secondary' }}
                        />
                        <span>{name || val}</span>
                      </Box>
                    );
                  }}
                >
                  <MenuItem value="" disabled>
                    <em>
                      {loadingOwners
                        ? 'Loading…'
                        : `Select ${ownerEntityLabel[ownerType]?.toLowerCase() || 'owner'}`}
                    </em>
                  </MenuItem>
                  {owners.map((o) => (
                    <MenuItem key={o.id} value={o.id}>
                      {o.name}
                    </MenuItem>
                  ))}
                </Select>
                {!loadingOwners && !owners.length && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 0.5, display: 'block' }}
                  >
                    No {ownerType}s found
                  </Typography>
                )}
              </FormControl>
            </>
          )}
        </FormDialogSection>

        {/* Entries */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <AppIcon
              name="PlaylistAddOutlined"
              fallback={PlaylistAddOutlinedIcon}
              sx={{ fontSize: 18, color: 'primary.main' }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
              Entries
            </Typography>
          </Box>
          <Stack spacing={2}>
            {entries.map((entry, idx) => {
              const kindMeta = entryKindMeta(entry.kind);
              const KindIcon = kindMeta.icon;
              return (
                <FormDialogSection
                  key={idx}
                  title={`Entry ${idx + 1}`}
                  icon={KindIcon}
                  action={
                    entries.length > 1 ? (
                      <IconButton
                        size="small"
                        onClick={() => removeEntry(idx)}
                        aria-label="Remove entry"
                        sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                      >
                        <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 17 }} />
                      </IconButton>
                    ) : null
                  }
                >
                  <FormControl fullWidth size="small" sx={fieldSx}>
                    <InputLabel shrink id={`pulse-entry-kind-${idx}`} sx={labelProps.sx}>
                      Entry type
                    </InputLabel>
                    <Select
                      labelId={`pulse-entry-kind-${idx}`}
                      value={entry.kind}
                      label="Entry type"
                      onChange={(e) => setEntryKind(idx, e.target.value)}
                      sx={inputFont}
                      renderValue={(val) => {
                        const meta = entryKindMeta(val);
                        const Icon = meta.icon;
                        return (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AppIcon
                              fallback={Icon}
                              sx={{ fontSize: 17, color: 'text.secondary' }}
                            />
                            <span>{meta.label}</span>
                          </Box>
                        );
                      }}
                    >
                      {ENTRY_KINDS.map((k) => (
                        <MenuItem key={k.value} value={k.value}>
                          {k.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {entry.kind === 'instrument' ? (
                    <>
                      <FormControl fullWidth size="small" required sx={fieldSx}>
                        <InputLabel shrink id={`pulse-instrument-${idx}`} sx={labelProps.sx}>
                          Instrument
                        </InputLabel>
                        <Select
                          labelId={`pulse-instrument-${idx}`}
                          value={entry.instrumentSlug}
                          label="Instrument"
                          onChange={(e) => updateEntry(idx, { instrumentSlug: e.target.value })}
                          sx={inputFont}
                          renderValue={(val) => {
                            const inst = INSTRUMENT_OPTIONS.find((i) => i.slug === val);
                            return (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <AppIcon
                                  name="CategoryOutlined"
                                  fallback={CategoryOutlinedIcon}
                                  sx={{ fontSize: 17, color: 'text.secondary' }}
                                />
                                <span>{inst?.label || val}</span>
                              </Box>
                            );
                          }}
                        >
                          {INSTRUMENT_OPTIONS.map((i) => (
                            <MenuItem key={i.slug} value={i.slug}>
                              {i.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        label="Prompt"
                        required
                        fullWidth
                        multiline
                        minRows={3}
                        size="small"
                        value={entry.prompt}
                        onChange={(e) => updateEntry(idx, { prompt: e.target.value })}
                        placeholder="e.g. Check Task Manager backend tasks for this week and today"
                        InputLabelProps={labelProps}
                        InputProps={{
                          sx: { fontSize: '0.9375rem', py: 1.25 },
                          startAdornment: (
                            <InputAdornment
                              position="start"
                              sx={{
                                color: 'text.secondary',
                                alignSelf: 'flex-start',
                                mt: 1.5,
                                mr: 0,
                              }}
                            >
                              <AppIcon
                                name="NotesOutlined"
                                fallback={NotesOutlinedIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </InputAdornment>
                          ),
                        }}
                        sx={fieldSx}
                      />
                      <TextField
                        label="Reference (id / number / name)"
                        fullWidth
                        size="small"
                        value={entry.ref}
                        onChange={(e) => updateEntry(idx, { ref: e.target.value })}
                        placeholder="Optional — task id, category, or board name"
                        InputLabelProps={labelProps}
                        InputProps={{
                          sx: inputFont,
                          startAdornment: (
                            <InputAdornment
                              position="start"
                              sx={{ color: 'text.secondary', mr: 0 }}
                            >
                              <AppIcon
                                name="LocalOfferOutlined"
                                fallback={LocalOfferOutlinedIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </InputAdornment>
                          ),
                        }}
                        sx={fieldSx}
                      />
                    </>
                  ) : (
                    <>
                      <FormControl
                        fullWidth
                        size="small"
                        required
                        sx={fieldSx}
                        disabled={loadingGoals}
                      >
                        <InputLabel shrink id={`pulse-goal-${idx}`} sx={labelProps.sx}>
                          Completed goal
                        </InputLabel>
                        <Select
                          labelId={`pulse-goal-${idx}`}
                          value={entry.sourceGoalId}
                          label="Completed goal"
                          onChange={(e) => updateEntry(idx, { sourceGoalId: e.target.value })}
                          displayEmpty
                          sx={inputFont}
                          renderValue={(val) => {
                            if (!val) {
                              return (
                                <Typography color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                  {loadingGoals ? 'Loading…' : 'Select goal'}
                                </Typography>
                              );
                            }
                            const g = completedGoals.find((x) => String(x.id) === String(val));
                            return (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <AppIcon
                                  name="TaskAltOutlined"
                                  fallback={TaskAltOutlinedIcon}
                                  sx={{ fontSize: 17, color: 'text.secondary' }}
                                />
                                <span>{g?.title || val}</span>
                              </Box>
                            );
                          }}
                        >
                          <MenuItem value="" disabled>
                            <em>Select a completed goal</em>
                          </MenuItem>
                          {completedGoals.map((g) => (
                            <MenuItem key={g.id} value={g.id}>
                              {g.title || `Goal ${g.id}`}
                            </MenuItem>
                          ))}
                        </Select>
                        {!loadingGoals && !completedGoals.length && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ mt: 0.5, display: 'block' }}
                          >
                            No completed goals yet — finish a goal first
                          </Typography>
                        )}
                      </FormControl>
                      <TextField
                        label="Prompt"
                        required
                        fullWidth
                        multiline
                        minRows={3}
                        size="small"
                        value={entry.prompt}
                        onChange={(e) => updateEntry(idx, { prompt: e.target.value })}
                        placeholder="Regenerate with new idea, style, color, form, materials…"
                        InputLabelProps={labelProps}
                        InputProps={{
                          sx: { fontSize: '0.9375rem', py: 1.25 },
                          startAdornment: (
                            <InputAdornment
                              position="start"
                              sx={{
                                color: 'text.secondary',
                                alignSelf: 'flex-start',
                                mt: 1.5,
                                mr: 0,
                              }}
                            >
                              <AppIcon
                                name="NotesOutlined"
                                fallback={NotesOutlinedIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </InputAdornment>
                          ),
                        }}
                        sx={fieldSx}
                      />
                    </>
                  )}
                </FormDialogSection>
              );
            })}
          </Stack>
          <Button
            onClick={addEntry}
            size="small"
            variant="outlined"
            startIcon={
              <AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: '16px !important' }} />
            }
            sx={{
              mt: 1.5,
              borderRadius: 1.5,
              fontWeight: 600,
              fontSize: '0.75rem',
              textTransform: 'none',
            }}
          >
            Add entry
          </Button>
        </Box>

        <PulseScheduleFields
          scheduleKind={scheduleKind}
          onScheduleKindChange={setScheduleKind}
          runAt={runAt}
          onRunAtChange={setRunAt}
          timeOfDay={timeOfDay}
          onTimeOfDayChange={setTimeOfDay}
          weekday={weekday}
          onWeekdayChange={setWeekday}
          dayOfMonth={dayOfMonth}
          onDayOfMonthChange={setDayOfMonth}
        />
      </Stack>
    </FormDialog>
  );
}
