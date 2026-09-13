import { useEffect, useMemo, useState } from 'react';
import { Box, Chip, TextField, Typography, IconButton } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SetupCardShell from '../../../../components/Assistant/cards/SetupCardShell';
import AppIcon from '../../../../components/icons/AppIcon';
import {
  fetchArenaDepartments,
  fetchArenaStack,
  saveArenaStack,
} from '../../../../services/arenaService';
import { questionsForDepartments, buildStackRows, customKey } from '../stackQuiz';

/**
 * Guide step 2 — the stack quiz. Plain-language questions, choice chips, and a
 * "something else" escape per question for tools we do not cover; those become
 * gaps the developer-brief step handles. No jargon anywhere on this card.
 */
export default function StackQuizCard({ onComplete, onSkip, embedded }) {
  const [enabledDepartments, setEnabledDepartments] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [pickedDept, setPickedDept] = useState(new Map());
  const [custom, setCustom] = useState([]); // [{label, department}]
  const [drafts, setDrafts] = useState({}); // questionId -> text being typed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchArenaDepartments().catch(() => ({})),
      fetchArenaStack().catch(() => ({})),
    ]).then(([deps, stack]) => {
      if (!alive) return;
      setEnabledDepartments(
        (deps.configured || []).filter((c) => c.enabled).map((c) => c.department)
      );
      const rows = stack.rows || [];
      setPicked(new Set(rows.filter((r) => r.source === 'catalog').map((r) => r.key)));
      setPickedDept(
        new Map(
          rows
            .filter((r) => r.source === 'catalog' && r.department)
            .map((r) => [r.key, r.department])
        )
      );
      setCustom(
        rows
          .filter((r) => r.source === 'custom')
          .map((r) => ({ label: r.label, department: r.department || null }))
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  const questions = useMemo(
    () => questionsForDepartments(enabledDepartments),
    [enabledDepartments]
  );

  const toggle = (catalogId, department) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(catalogId)) next.delete(catalogId);
      else next.add(catalogId);
      return next;
    });
    setPickedDept((prev) => {
      const next = new Map(prev);
      if (!next.has(catalogId) && department) next.set(catalogId, department);
      return next;
    });
  };

  const addCustom = (questionId, department) => {
    const label = (drafts[questionId] || '').trim();
    if (!label) return;
    setCustom((prev) =>
      prev.some((c) => customKey(c.label) === customKey(label))
        ? prev
        : [...prev, { label, department: department || null }]
    );
    setDrafts((prev) => ({ ...prev, [questionId]: '' }));
  };

  const total = picked.size + custom.length;

  const handleSave = async () => {
    if (!total || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveArenaStack(buildStackRows(picked, custom, pickedDept));
      await onComplete({ stack: true });
    } catch (err) {
      setError(err.message || 'Could not save your stack');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SetupCardShell
      title="What does your company work in?"
      embedded={embedded}
      primaryLabel={total ? `Save ${total} tool${total === 1 ? '' : 's'}` : 'Save'}
      onPrimary={handleSave}
      primaryDisabled={!total}
      busy={busy}
      onSkip={onSkip}
      error={error}
    >
      {questions.map((q) => {
        const dept = q.departments.find((d) => enabledDepartments.includes(d)) || null;
        return (
          <Box key={q.id}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.75 }}>
              {q.question}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
              {q.options.map((o) => (
                <Chip
                  key={o.catalogId}
                  label={o.label}
                  clickable
                  color={picked.has(o.catalogId) ? 'primary' : 'default'}
                  variant={picked.has(o.catalogId) ? 'filled' : 'outlined'}
                  onClick={() => toggle(o.catalogId, dept)}
                  sx={{ fontWeight: 600 }}
                />
              ))}
              <TextField
                size="small"
                placeholder="+ something else"
                value={drafts[q.id] || ''}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustom(q.id, dept);
                  }
                }}
                inputProps={{ 'aria-label': `${q.question} - something else` }}
                sx={{ width: 170, '& .MuiInputBase-input': { py: 0.6, fontSize: '0.82rem' } }}
              />
              {(drafts[q.id] || '').trim() && (
                <IconButton
                  size="small"
                  onClick={() => addCustom(q.id, dept)}
                  aria-label={`Add ${drafts[q.id]}`}
                >
                  <AppIcon name="AddRounded" fallback={AddRoundedIcon} sx={{ fontSize: 18 }} />
                </IconButton>
              )}
            </Box>
          </Box>
        );
      })}

      {custom.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
            Yours, handled in the next steps
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
            {custom.map((c) => (
              <Chip
                key={customKey(c.label)}
                label={c.label}
                color="secondary"
                variant="outlined"
                onDelete={() => setCustom((prev) => prev.filter((x) => x.label !== c.label))}
                deleteIcon={<AppIcon name="CloseRounded" fallback={CloseRoundedIcon} />}
                sx={{ fontWeight: 600 }}
              />
            ))}
          </Box>
        </Box>
      )}

      <Typography variant="caption" color="text.secondary">
        Tick what you use - you do not need to know how anything connects.
      </Typography>
    </SetupCardShell>
  );
}
