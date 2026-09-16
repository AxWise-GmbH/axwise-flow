import { useEffect, useMemo, useState } from 'react';
import { Typography } from '@mui/material';
import SetupCardShell from '../../../../components/Assistant/cards/SetupCardShell';
import RatesGrid from '../../RatesGrid';
import { DEPARTMENTS, DEPARTMENT_BY_ID } from '../../../../config/departments';
import {
  fetchArenaRates,
  saveArenaRates,
  fetchArenaPeople,
  fetchArenaDepartments,
} from '../../../../services/arenaService';

const EMPTY_ROW = { scope: 'person', key: '', hourly_rate: '', per_job_cost: '' };
const ALL_ROLES = DEPARTMENTS.flatMap((d) => d.roles).sort();

/**
 * Guide step 6 — what the people cost. Optional: without it Arena shows time
 * and quality but no money, and will not recommend a handover on cost.
 *
 * Easy start: with nothing saved yet, the grid opens with one row per person
 * from the Team step and one per department the company runs - fill in a few
 * numbers and you are done.
 */
export default function RatesCard({ onComplete, onSkip, embedded }) {
  const [rows, setRows] = useState([EMPTY_ROW]);
  const [currency, setCurrency] = useState('EUR');
  const [people, setPeople] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchArenaRates().catch(() => []),
      fetchArenaPeople().catch(() => []),
      fetchArenaDepartments().catch(() => ({ configured: [] })),
    ]).then(([rates, roster, deps]) => {
      if (!alive) return;
      const activePeople = roster.filter((p) => p.is_active);
      const enabledDepts = (deps.configured || [])
        .filter((c) => c.enabled)
        .map((c) => ({
          id: c.department,
          label: c.label || DEPARTMENT_BY_ID[c.department]?.label || c.department,
        }));
      setPeople(activePeople);
      setDepartments(enabledDepts);

      if (rates.length) {
        setRows(
          rates.map((r) => ({
            scope: r.scope,
            key: r.key,
            hourly_rate: r.hourly_rate ?? '',
            per_job_cost: r.per_job_cost ?? '',
          }))
        );
        setCurrency(rates[0]?.currency || 'EUR');
      } else {
        // Easy start: one row per person, one per department, numbers left to fill.
        const seeded = [
          ...activePeople.map((p) => ({
            scope: 'person',
            key: p.name,
            hourly_rate: '',
            per_job_cost: '',
          })),
          ...enabledDepts.map((d) => ({
            scope: 'department',
            key: d.id,
            hourly_rate: '',
            per_job_cost: '',
          })),
        ];
        if (seeded.length) setRows(seeded);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const roleOptions = useMemo(
    () => [...new Set([...people.map((p) => p.role).filter(Boolean), ...ALL_ROLES])],
    [people]
  );

  const filled = rows.filter(
    (r) => r.key.trim() && (r.hourly_rate !== '' || r.per_job_cost !== '')
  );
  const invalid = rows.some(
    (r) =>
      r.key.trim() &&
      ((r.hourly_rate !== '' && Number(r.hourly_rate) < 0) ||
        (r.per_job_cost !== '' && Number(r.per_job_cost) < 0))
  );

  const handleSave = async () => {
    if (busy || invalid || !filled.length) return;
    setBusy(true);
    setError(null);
    try {
      await saveArenaRates(
        filled.map((r) => ({
          scope: r.scope,
          key: r.key.trim(),
          currency,
          hourly_rate: r.hourly_rate === '' ? null : Number(r.hourly_rate),
          per_job_cost: r.per_job_cost === '' ? null : Number(r.per_job_cost),
        }))
      );
      await onComplete({ rates: true });
    } catch (err) {
      setError(err.message || 'Could not save those rates');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SetupCardShell
      title="What your people cost"
      embedded={embedded}
      primaryLabel="Save rates"
      onPrimary={handleSave}
      primaryDisabled={invalid || !filled.length}
      busy={busy}
      onSkip={onSkip}
      error={invalid ? 'A rate cannot be negative.' : error}
    >
      <RatesGrid
        rows={rows}
        currency={currency}
        peopleOptions={people.map((p) => p.name)}
        roleOptions={roleOptions}
        departmentOptions={departments}
        onPatchRow={(i, next) =>
          setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...next } : r)))
        }
        onAddRow={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])}
        onRemoveRow={(i) => setRows((prev) => prev.filter((_, j) => j !== i))}
        onCurrencyChange={setCurrency}
      />
      <Typography variant="caption" color="text.secondary">
        Rows with no number are simply not saved. A person rate beats a role rate, which beats a
        department rate. You can skip this - Arena then shows time and quality, just no money.
      </Typography>
    </SetupCardShell>
  );
}
