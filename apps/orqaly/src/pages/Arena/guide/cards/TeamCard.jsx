import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  TextField,
  Typography,
  IconButton,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import SetupCardShell from '../../../../components/Assistant/cards/SetupCardShell';
import AppIcon from '../../../../components/icons/AppIcon';
import { DEPARTMENTS } from '../../../../config/departments';
import {
  fetchArenaPeople,
  saveArenaPeople,
  ensureArenaAgents,
} from '../../../../services/arenaService';

const ALL_ROLES = DEPARTMENTS.flatMap((d) => d.roles).sort();
const OTHER = '__other__';

/**
 * Guide step 5 — who does the work today, and who replicates it. The roster
 * on top (a role from our list or one typed in the owner's own words, plus
 * "what do they do"); one click generates an AI counterpart for every distinct
 * role, so each person's work has an agent running the same jobs.
 */
export default function TeamCard({ onComplete, onSkip, embedded }) {
  const [people, setPeople] = useState([]);
  const [draft, setDraft] = useState({ name: '', role: '', customRole: '', description: '' });
  const [counterparts, setCounterparts] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchArenaPeople()
      .then((rows) => {
        if (alive) setPeople(rows.filter((p) => p.is_active));
      })
      .catch(() => {
        /* an empty roster still works */
      });
    return () => {
      alive = false;
    };
  }, []);

  const roles = useMemo(() => [...new Set(people.map((p) => p.role).filter(Boolean))], [people]);

  const effectiveRole = draft.role === OTHER ? draft.customRole.trim() : draft.role;
  const canAdd = Boolean(draft.name.trim() && effectiveRole);

  const addPerson = () => {
    const name = draft.name.trim();
    if (!name || !effectiveRole) return;
    setPeople((prev) =>
      prev.some((p) => p.name.toLowerCase() === name.toLowerCase())
        ? prev
        : [
            ...prev,
            {
              name,
              role: effectiveRole,
              description: draft.description.trim() || null,
              is_active: true,
            },
          ]
    );
    setDraft({ name: '', role: '', customRole: '', description: '' });
  };

  const generate = async () => {
    if (!roles.length || generating) return;
    setGenerating(true);
    setError(null);
    try {
      // Persist the roster first so a mid-generate refresh loses nothing.
      await saveArenaPeople(people);
      const res = await ensureArenaAgents(roles);
      setCounterparts(res.agents || []);
    } catch (err) {
      setError(err.message || 'Could not generate the counterparts');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!people.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveArenaPeople(people);
      // Saving the step also guarantees the counterparts exist - the whole
      // point of the roster is that every role has its agent to compare with.
      const res = await ensureArenaAgents(roles);
      setCounterparts(res.agents || []);
      await onComplete({ team: true });
    } catch (err) {
      setError(err.message || 'Could not save your team');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SetupCardShell
      title="Who does the work today - and who replicates it"
      embedded={embedded}
      primaryLabel="Save team"
      onPrimary={handleSave}
      primaryDisabled={!people.length}
      busy={busy}
      onSkip={onSkip}
      error={error}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
        Your people
      </Typography>
      {people.map((p) => (
        <Box key={p.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
              {p.name}
            </Typography>
            {p.description && (
              <Typography variant="caption" color="text.disabled" noWrap sx={{ display: 'block' }}>
                {p.description}
              </Typography>
            )}
          </Box>
          <Chip
            size="small"
            variant="outlined"
            label={p.role || 'no role yet'}
            sx={{ fontWeight: 600 }}
          />
          <IconButton
            size="small"
            aria-label={`Remove ${p.name}`}
            onClick={() => setPeople((prev) => prev.filter((x) => x.name !== p.name))}
          >
            <AppIcon name="CloseRounded" fallback={CloseRoundedIcon} sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      ))}

      {/* Add a person: name, role (ours or theirs), and what they do. */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Name"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          inputProps={{ 'aria-label': 'Person name' }}
          sx={{ flex: 1, minWidth: 140 }}
        />
        <TextField
          select
          size="small"
          value={draft.role}
          onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
          inputProps={{ 'aria-label': 'Person role' }}
          sx={{ minWidth: 190 }}
          SelectProps={{ displayEmpty: true }}
        >
          <MenuItem value="">
            <em>What do they do?</em>
          </MenuItem>
          {ALL_ROLES.map((r) => (
            <MenuItem key={r} value={r}>
              {r}
            </MenuItem>
          ))}
          <MenuItem value={OTHER}>
            <em>Something else - I will type it</em>
          </MenuItem>
        </TextField>
        {draft.role === OTHER && (
          <TextField
            size="small"
            placeholder="Their role, in your words"
            value={draft.customRole}
            onChange={(e) => setDraft((d) => ({ ...d, customRole: e.target.value }))}
            inputProps={{ 'aria-label': 'Custom role' }}
            sx={{ minWidth: 190 }}
          />
        )}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="What do they actually do? (optional - helps their agent replicate it)"
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canAdd) {
              e.preventDefault();
              addPerson();
            }
          }}
          inputProps={{ 'aria-label': 'What they do' }}
          sx={{ flex: 1 }}
        />
        <Button
          size="small"
          onClick={addPerson}
          disabled={!canAdd}
          startIcon={<AppIcon name="AddRounded" fallback={AddRoundedIcon} />}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Add
        </Button>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, flex: 1 }}>
          Their AI counterparts
        </Typography>
        <Button
          size="small"
          variant="outlined"
          disabled={!roles.length || generating}
          onClick={generate}
          startIcon={
            generating ? (
              <CircularProgress size={14} color="inherit" />
            ) : (
              <AppIcon name="BoltRounded" fallback={BoltRoundedIcon} sx={{ fontSize: 16 }} />
            )
          }
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
        >
          Generate
        </Button>
      </Box>
      {counterparts.length > 0 ? (
        counterparts.map((a) => (
          <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AppIcon
              name="CheckCircleRounded"
              fallback={CheckCircleRoundedIcon}
              sx={{ fontSize: 16, color: 'success.main' }}
            />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {a.name} · {a.role} (agent)
            </Typography>
          </Box>
        ))
      ) : (
        <Typography variant="caption" color="text.secondary">
          Each person gets an agent with the same role. The agent runs the same tasks and roadmaps,
          and Arena compares the results.
        </Typography>
      )}
    </SetupCardShell>
  );
}
