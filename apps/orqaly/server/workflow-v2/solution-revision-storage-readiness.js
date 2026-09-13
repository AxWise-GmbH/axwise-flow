// Read-only catalog and privilege checks. Never sample another customer's rows.
export async function verifyRevisionConnectionsReadiness(pool, { api }) {
  for (const name of [
    'solution_revision_connection_members',
    'solution_revision_connections',
    'solution_revision_connection_operations',
  ])
    await pool.query(
      `SELECT tenant_id,solution_id,revision_id,owner_user_id FROM orqaly.${name} LIMIT 0`
    );
  const checks = (
    await pool.query(`SELECT
    (SELECT count(*) FROM pg_class WHERE oid IN
      ('orqaly.solution_revision_connection_members'::regclass,
       'orqaly.solution_revision_connections'::regclass,
       'orqaly.solution_revision_connection_operations'::regclass)
       AND relrowsecurity AND relforcerowsecurity)::integer AS isolated,
    has_table_privilege(current_user,'orqaly.solution_revision_connections','INSERT') AS can_insert,
    has_column_privilege(current_user,'orqaly.solution_revision_connections','status','UPDATE') AS can_update_status,
    has_table_privilege(current_user,'orqaly.solution_revision_connections','UPDATE,DELETE,TRUNCATE') AS broad_write,
    EXISTS (SELECT 1 FROM unnest(ARRAY[
      'orqaly.solution_revision_connection_members',
      'orqaly.solution_revision_connections',
      'orqaly.solution_revision_connection_operations']) AS t(name)
      WHERE has_table_privilege('orqaly_worker',name,'INSERT,UPDATE,DELETE,TRUNCATE')
        OR has_any_column_privilege('orqaly_worker',name,'UPDATE')) AS worker_write,
    (SELECT count(*) FROM pg_policy WHERE polrelid IN
      ('orqaly.solution_revision_connection_members'::regclass,
       'orqaly.solution_revision_connections'::regclass,
       'orqaly.solution_revision_connection_operations'::regclass)
      AND pg_get_expr(polqual,polrelid) LIKE '%build_owner_user_id%'
      AND pg_get_expr(polwithcheck,polrelid) LIKE '%build_owner_user_id%')::integer AS owner_policies,
    (SELECT count(*) FROM pg_trigger g JOIN (VALUES
      ('orqaly.solution_revision_connections'::regclass,'orqaly.guard_revision_connection_binding()'::regprocedure,'revision_connection_binding_guard',23),
      ('orqaly.solution_revision_connection_operations'::regclass,'orqaly.guard_revision_connection_operation()'::regprocedure,'revision_connection_operation_guard',23),
      ('orqaly.solution_revisions'::regclass,'orqaly.guard_revision_connection_pending()'::regprocedure,'revision_connection_pending_guard',19)
    ) e(relation_id,function_id,name,kind) ON g.tgrelid=e.relation_id AND g.tgfoid=e.function_id AND g.tgname=e.name
      WHERE NOT g.tgisinternal AND g.tgenabled IN ('O','A') AND g.tgtype=e.kind)::integer AS guards,
    EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid IN ('orqaly.guard_revision_connection_binding()'::regprocedure,
        'orqaly.guard_revision_connection_operation()'::regprocedure,'orqaly.guard_revision_connection_pending()'::regprocedure)
      AND a.grantee=0 AND a.privilege_type='EXECUTE') AS guard_public_execute`)
  ).rows[0];
  if (
    !checks ||
    checks.isolated !== 3 ||
    checks.owner_policies !== 3 ||
    checks.guards !== 3 ||
    checks.guard_public_execute !== false ||
    checks.can_insert !== api ||
    checks.can_update_status !== api ||
    checks.broad_write ||
    checks.worker_write
  )
    throw new Error('revision_connection_isolation_invalid');
}

export async function verifyFailureProbeReadiness(pool) {
  await pool.query(
    'SELECT id,revision_id,source_snapshot,status,cleanup_state FROM orqaly.solution_failure_probes LIMIT 0'
  );
  const checks = (
    await pool.query(`SELECT
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='orqaly.solution_failure_probes'::regclass) AS isolated,
    (has_table_privilege(current_user,'orqaly.solution_failure_probes','SELECT')
      AND has_table_privilege(current_user,'orqaly.solution_failure_probes','INSERT')) AS api_access,
    has_column_privilege(current_user,'orqaly.solution_failure_probes','status','UPDATE') AS status_update,
    has_table_privilege(current_user,'orqaly.solution_failure_probes','UPDATE,DELETE,TRUNCATE') AS broad_write,
    (has_table_privilege('orqaly_worker','orqaly.solution_failure_probes','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_any_column_privilege('orqaly_worker','orqaly.solution_failure_probes','SELECT,UPDATE')) AS worker_access,
    EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='orqaly.solution_failure_probes'::regclass
      AND pg_get_expr(polqual,polrelid) LIKE '%build_owner_user_id%'
      AND pg_get_expr(polwithcheck,polrelid) LIKE '%build_owner_user_id%') AS owner_policy,
    EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='orqaly.solution_failure_probes'::regclass
      AND tgfoid='orqaly.guard_solution_failure_probe()'::regprocedure AND tgname='solution_failure_probe_guard'
      AND NOT tgisinternal AND tgenabled IN ('O','A') AND tgtype=23) AS guarded_insert_update,
    EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid='orqaly.guard_solution_failure_probe()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') AS guard_public_execute`)
  ).rows[0];
  if (
    !checks?.isolated ||
    !checks.api_access ||
    !checks.status_update ||
    !checks.owner_policy ||
    checks.guarded_insert_update !== true ||
    checks.guard_public_execute !== false ||
    checks.broad_write ||
    checks.worker_access
  )
    throw new Error('failure_probe_isolation_invalid');
}
