import { z } from 'zod';

const assignmentScope = z
  .object({
    tenantId: z.uuid(),
    ownerUserId: z.string().regex(/^user_[A-Za-z0-9]+$/),
    environmentId: z.string().regex(/^[a-z0-9-]{8,63}$/),
  })
  .strict();

/** Read assignments using the caller's existing API role and tenant RLS policy.
 * The caller owns the connected client; no credentials, grants, or role changes
 * are part of this helper. Rollback clears the transaction-local tenant scope.
 */
export async function readPreviewSolutionAssignments(client, scope) {
  const { tenantId, ownerUserId, environmentId } = assignmentScope.parse(scope);
  let readError;
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SELECT set_config('orqaly.tenant_id', $1, true)", [tenantId]);
    const result = await client.query(
      `SELECT id FROM orqaly.customer_solutions
       WHERE tenant_id = $1 AND owner_user_id = $2 AND environment_id = $3`,
      [tenantId, ownerUserId, environmentId]
    );
    return result.rows.map(({ id }) => ({ id }));
  } catch (error) {
    readError = error;
    throw error;
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Preserve the primary diagnostic if the connection also fails cleanup.
      // A cleanup failure after a successful read still makes the operation fail.
      if (!readError) throw rollbackError;
    }
  }
}
