import { useEffect, useState } from 'react';
import SetupCardShell from '../../../../components/Assistant/cards/SetupCardShell';
import DepartmentGrid from '../../DepartmentGrid';
import { DEPARTMENTS, isCustomDepartment } from '../../../../config/departments';
import { fetchArenaDepartments, saveArenaDepartments } from '../../../../services/arenaService';

/**
 * Guide step 1 — which departments the business runs, including any it names
 * itself. Saving is the step's primary action; the wizard advances on success.
 */
export default function DepartmentsCard({ onComplete, onSkip, embedded }) {
  const [rows, setRows] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchArenaDepartments()
      .then((d) => {
        if (!alive) return;
        const configured = d.configured || [];
        const byId = Object.fromEntries(configured.map((c) => [c.department, c]));
        const next = Object.fromEntries(
          DEPARTMENTS.map((dep) => [
            dep.id,
            {
              enabled: byId[dep.id]?.enabled ?? false,
              stakes: byId[dep.id]?.stakes ?? 'medium',
              monthly_volume: byId[dep.id]?.monthly_volume ?? '',
            },
          ])
        );
        // The company's own departments come back with their label.
        for (const c of configured) {
          if (isCustomDepartment(c.department)) {
            next[c.department] = {
              enabled: !!c.enabled,
              stakes: c.stakes ?? 'medium',
              monthly_volume: c.monthly_volume ?? '',
              label: c.label || c.department,
              description: c.description || '',
              removed: false,
            };
          }
        }
        setRows(next);
      })
      .catch(() => {
        /* an empty grid still works */
      });
    return () => {
      alive = false;
    };
  }, []);

  const anyEnabled = Object.values(rows).some((r) => r?.enabled);
  const patch = (id, next) => setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));

  const addCustom = ({ id, label, description }) =>
    setRows((prev) => ({
      ...prev,
      [id]: {
        stakes: 'medium',
        monthly_volume: '',
        ...(prev[id] || {}),
        // Re-adding a department the owner removed switches it back on.
        enabled: true,
        removed: false,
        label,
        description,
      },
    }));

  // A removed custom row is kept, switched off, so saving disables it server-side.
  const removeCustom = (id) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], enabled: false, removed: true } }));

  const handleSave = async () => {
    if (!anyEnabled || busy) return;
    setBusy(true);
    setError(null);
    try {
      const builtIns = DEPARTMENTS.map((d) => ({
        department: d.id,
        enabled: !!rows[d.id]?.enabled,
        stakes: rows[d.id]?.stakes || 'medium',
        monthly_volume: toVolume(rows[d.id]?.monthly_volume),
      }));
      const customs = Object.entries(rows)
        .filter(([id]) => isCustomDepartment(id))
        .map(([id, r]) => ({
          department: id,
          enabled: !!r.enabled && !r.removed,
          stakes: r.stakes || 'medium',
          monthly_volume: toVolume(r.monthly_volume),
          label: r.label || id,
          description: r.description || null,
        }));
      await saveArenaDepartments([...builtIns, ...customs]);
      await onComplete({ departments: true });
    } catch (err) {
      setError(err.message || 'Could not save that');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SetupCardShell
      title="Which departments do you run?"
      embedded={embedded}
      primaryLabel="Save departments"
      onPrimary={handleSave}
      primaryDisabled={!anyEnabled}
      busy={busy}
      onSkip={onSkip}
      error={error}
    >
      <DepartmentGrid
        rows={rows}
        onPatch={patch}
        onAddCustom={addCustom}
        onRemoveCustom={removeCustom}
      />
    </SetupCardShell>
  );
}

function toVolume(v) {
  return v === '' || v == null ? null : Number(v);
}
