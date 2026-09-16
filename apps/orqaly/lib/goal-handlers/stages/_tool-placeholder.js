async function inspectOwnedTool(admin, toolId, userId) {
  try {
    const { data, error } = await admin
      .from('tools')
      .select('id, user_id')
      .eq('id', toolId)
      .eq('user_id', userId)
      .maybeSingle();
    return error ? { row: null, error } : { row: data || null, error: null };
  } catch (error) {
    return { row: null, error };
  }
}

/**
 * Ensure the current owner has a placeholder for a canonical tool id.
 * Migration 216 makes (user_id, id) unique, so a concurrent insert is an
 * idempotent success. PostgREST may surface a committed response-loss as
 * either a thrown error or `{ error }`; reread the owner-scoped identity
 * before deciding that provisioning failed.
 */
export async function ensureOwnedToolPlaceholder(admin, row) {
  const toolId = String(row?.id || '').trim();
  const userId = String(row?.user_id || '').trim();
  if (!admin || !toolId || !userId) {
    throw new Error('Owned tool placeholder requires admin, id, and user_id');
  }

  const before = await inspectOwnedTool(admin, toolId, userId);
  if (before.error) {
    throw new Error(`Unable to inspect tool placeholder: ${before.error.message}`);
  }
  if (before.row) return { row: before.row, created: false };

  let writeError = null;
  try {
    const result = await admin.from('tools').insert(row);
    writeError = result?.error || null;
  } catch (error) {
    writeError = error;
  }
  if (!writeError) return { row, created: true };

  const after = await inspectOwnedTool(admin, toolId, userId);
  if (after.row) return { row: after.row, created: true, recovered: true };
  if (after.error) {
    throw new Error(
      `Tool placeholder insert outcome is unknown: ${after.error.message || writeError.message}`
    );
  }

  const error = new Error(`Unable to create tool placeholder: ${writeError.message}`);
  error.code = writeError.code;
  throw error;
}
