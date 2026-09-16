import pg from 'pg';

const { Pool } = pg;

export function createPool(config) {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MS,
    application_name: 'orqaly-agentic-control-plane',
  });
}

export async function withTenantTransaction(pool, principal, operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `select
         set_config('app.organization_id', $1, true),
         set_config('app.workspace_id', $2, true),
         set_config('app.user_id', $3, true),
         set_config('app.actor_type', $4, true),
         set_config('app.request_id', $5, true),
         set_config('search_path', 'agentic,pg_catalog', true)`,
      [
        principal.organizationId,
        principal.workspaceId,
        principal.userId,
        principal.actorType,
        principal.requestId,
      ]
    );
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    client.release();
  }
}
