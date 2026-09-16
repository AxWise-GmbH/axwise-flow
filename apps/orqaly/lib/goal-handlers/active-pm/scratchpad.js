/**
 * Ralph-style PM scratchpad.
 *
 * Persistent memory the Active PM writes to between iterations so it
 * doesn't re-try approaches that already failed. Stored as a string
 * under goal.data.pm_notes (plain markdown, LLM-friendly).
 *
 * API:
 *   readScratchpad(goal) -> string
 *   appendNote(admin, goal, note) -> writes append to goal.data.pm_notes
 *   clearScratchpad(admin, goalId) -> reset on goal retry
 */

export function readScratchpad(goal) {
  return goal?.data?.pm_notes || '';
}

export async function appendNote(admin, goal, note) {
  if (!goal?.id || !note) return;
  const stamp = new Date().toISOString().slice(11, 19);
  const existing = goal.data?.pm_notes || '';
  const updated = `${existing}${existing ? '\n' : ''}- [${stamp}] ${String(note).slice(0, 600)}`;
  // Cap total scratchpad at 8k chars to avoid bloating the goals row.
  const capped = updated.length > 8000 ? updated.slice(-8000) : updated;
  await admin
    .from('goals')
    .update({
      data: { ...(goal.data || {}), pm_notes: capped },
      updated_at: new Date().toISOString(),
    })
    .eq('id', goal.id);
}

export async function clearScratchpad(admin, goalId) {
  if (!goalId) return;
  const { data: goal } = await admin.from('goals').select('data').eq('id', goalId).maybeSingle();
  if (!goal) return;
  const next = { ...(goal.data || {}) };
  delete next.pm_notes;
  await admin.from('goals').update({ data: next }).eq('id', goalId);
}
