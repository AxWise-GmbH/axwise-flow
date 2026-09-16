WITH
settings AS MATERIALIZED (
  -- Catalog deparsers consult search_path. Pin it inside this statement so the
  -- same PostgreSQL 16 schema produces identical text in every session.
  SELECT
    pg_catalog.set_config('search_path', 'pg_catalog', true) AS ignored,
    1 / (
      (pg_catalog.current_setting('server_version_num')::integer / 10000) = 16
    )::integer AS postgres_16_required
),
relevant_role_names(role_name) AS (
  VALUES
    ('orqaly_api'),
    ('orqaly_worker'),
    ('orqaly_identity'),
    ('orqaly_bootstrap'),
    ('orqaly_gateway'),
    ('orqaly_v2_001_identity_login'),
    ('orqaly_v2_001_api_login'),
    ('orqaly_v2_001_worker_login'),
    ('orqaly_v2_001_gateway_login')
),
dependency_rows AS (
  SELECT
    extension.extname AS dependency_name,
    pg_catalog.jsonb_build_object(
      'name', extension.extname,
      'version', extension.extversion,
      'schema', namespace.nspname,
      'relocatable', extension.extrelocatable,
      'owner', 'DATABASE_ADMIN'
    ) AS document
  FROM pg_catalog.pg_extension AS extension
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = extension.extnamespace
  CROSS JOIN settings
  WHERE extension.extname = 'pgcrypto'
),
target_schemas AS MATERIALIZED (
  SELECT namespace.oid, namespace.nspname, namespace.nspowner, namespace.nspacl
  FROM pg_catalog.pg_namespace AS namespace
  CROSS JOIN settings
  WHERE namespace.nspname IN ('orqaly', 'workflow_v2_release')
),
current_database_row AS (
  SELECT pg_catalog.jsonb_build_object(
    'identity', 'CURRENT_DATABASE',
    'owner', CASE
      WHEN database_owner.rolname IN ('postgres', 'cloudsqlsuperuser')
        THEN 'DATABASE_ADMIN'
      ELSE database_owner.rolname
    END,
    'allowConnections', database_record.datallowconn,
    'connectionLimit', database_record.datconnlimit,
    -- The Cloud SQL control-plane owner can differ from a local PostgreSQL
    -- owner. Normalize administrator identities while retaining PUBLIC and
    -- every Orqaly login/role grant that forms the CONNECT boundary.
    'acl', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'grantor', CASE
            WHEN grantor_role.rolname IN (SELECT role_name FROM relevant_role_names)
              THEN grantor_role.rolname
            ELSE 'DATABASE_ADMIN'
          END,
          'grantee', CASE
            WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE grantee_role.rolname
          END,
          'privilege', acl.privilege_type,
          'grantable', acl.is_grantable
        )
        ORDER BY
          (CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END)
            COLLATE "C",
          acl.privilege_type COLLATE "C",
          acl.is_grantable,
          (CASE
            WHEN grantor_role.rolname IN (SELECT role_name FROM relevant_role_names)
              THEN grantor_role.rolname
            ELSE 'DATABASE_ADMIN'
          END) COLLATE "C"
      )
      FROM pg_catalog.aclexplode(
        COALESCE(
          database_record.datacl,
          pg_catalog.acldefault('d'::"char", database_record.datdba)
        )
      ) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = acl.grantor
      LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
      WHERE acl.grantee = 0
         OR grantee_role.rolname IN (SELECT role_name FROM relevant_role_names)
         OR (
           acl.grantee <> database_record.datdba
           AND grantee_role.rolname <> 'postgres'
         )
    ), '[]'::jsonb)
  ) AS document
  FROM pg_catalog.pg_database AS database_record
  JOIN pg_catalog.pg_roles AS database_owner ON database_owner.oid = database_record.datdba
  CROSS JOIN settings
  WHERE database_record.oid = (
    SELECT database_oid.datid
    FROM pg_catalog.pg_stat_get_activity(pg_catalog.pg_backend_pid()) AS database_oid
  )
),
app_role_rows AS (
  SELECT
    role_record.rolname AS role_name,
    pg_catalog.jsonb_build_object(
      'name', role_record.rolname,
      'superuser', role_record.rolsuper,
      'inherit', role_record.rolinherit,
      'createRole', role_record.rolcreaterole,
      'createDatabase', role_record.rolcreatedb,
      'login', role_record.rolcanlogin,
      'replication', role_record.rolreplication,
      'bypassRls', role_record.rolbypassrls,
      'connectionLimit', role_record.rolconnlimit
    ) AS document
  FROM pg_catalog.pg_roles AS role_record
  CROSS JOIN settings
  WHERE role_record.rolname IN (SELECT role_name FROM relevant_role_names)
),
database_role_setting_rows AS (
  SELECT
    CASE
      WHEN role_setting.setdatabase = 0 THEN 'ALL_DATABASES'
      ELSE 'CURRENT_DATABASE'
    END AS database_scope,
    CASE
      WHEN role_setting.setrole = 0 THEN 'ALL_ROLES'
      ELSE role_record.rolname
    END AS role_scope,
    pg_catalog.jsonb_build_object(
      'database', CASE
        WHEN role_setting.setdatabase = 0 THEN 'ALL_DATABASES'
        ELSE 'CURRENT_DATABASE'
      END,
      'role', CASE
        WHEN role_setting.setrole = 0 THEN 'ALL_ROLES'
        ELSE role_record.rolname
      END,
      'config', COALESCE((
        SELECT pg_catalog.jsonb_agg(config_value ORDER BY config_value COLLATE "C")
        FROM pg_catalog.unnest(role_setting.setconfig) AS config_value
      ), '[]'::jsonb)
    ) AS document
  FROM pg_catalog.pg_db_role_setting AS role_setting
  LEFT JOIN pg_catalog.pg_roles AS role_record ON role_record.oid = role_setting.setrole
  CROSS JOIN settings
  WHERE (
    role_setting.setdatabase = (
      SELECT database_oid.datid
      FROM pg_catalog.pg_stat_get_activity(pg_catalog.pg_backend_pid()) AS database_oid
    )
    AND (
      role_setting.setrole = 0
      OR role_record.rolname IN (SELECT role_name FROM relevant_role_names)
    )
  ) OR (
    role_setting.setdatabase = 0
    AND (
      role_setting.setrole = 0
      OR role_record.rolname IN (SELECT role_name FROM relevant_role_names)
    )
  )
),
schema_rows AS (
  SELECT
    namespace.nspname AS schema_name,
    pg_catalog.jsonb_build_object(
      'name', namespace.nspname,
      'owner', pg_catalog.pg_get_userbyid(namespace.nspowner),
      'acl', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'grantor', grantor_role.rolname,
            'grantee', CASE
              WHEN acl.grantee = 0 THEN 'PUBLIC'
              ELSE grantee_role.rolname
            END,
            'privilege', acl.privilege_type,
            'grantable', acl.is_grantable
          )
          ORDER BY
            (CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END)
              COLLATE "C",
            acl.privilege_type COLLATE "C",
            acl.is_grantable,
            grantor_role.rolname COLLATE "C"
        )
        FROM pg_catalog.aclexplode(
          COALESCE(
            namespace.nspacl,
            pg_catalog.acldefault('n'::"char", namespace.nspowner)
          )
        ) AS acl
        LEFT JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = acl.grantor
        LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
      ), '[]'::jsonb)
    ) AS document
  FROM target_schemas AS namespace
),
target_relations AS MATERIALIZED (
  SELECT
    class.oid,
    class.relname,
    class.relkind,
    class.relpersistence,
    class.relowner,
    class.relacl,
    class.relrowsecurity,
    class.relforcerowsecurity,
    class.relreplident,
    class.relispartition,
    class.relpartbound,
    class.reloptions,
    class.reltablespace,
    namespace.nspname AS schema_name,
    access_method.amname AS access_method,
    tablespace.spcname AS tablespace_name
  FROM pg_catalog.pg_class AS class
  JOIN target_schemas AS namespace ON namespace.oid = class.relnamespace
  LEFT JOIN pg_catalog.pg_am AS access_method ON access_method.oid = class.relam
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace ON tablespace.oid = class.reltablespace
  WHERE class.relkind IN ('r', 'p', 'v', 'm', 'S', 'f', 'c', 'i', 'I')
),
relation_rows AS (
  SELECT
    relation.schema_name,
    relation.relname AS relation_name,
    relation.relkind AS relation_kind,
    pg_catalog.jsonb_build_object(
      'schema', relation.schema_name,
      'name', relation.relname,
      'kind', relation.relkind,
      'persistence', relation.relpersistence,
      'owner', pg_catalog.pg_get_userbyid(relation.relowner),
      'acl', CASE
        WHEN relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f') THEN COALESCE((
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'grantor', grantor_role.rolname,
              'grantee', CASE
                WHEN acl.grantee = 0 THEN 'PUBLIC'
                ELSE grantee_role.rolname
              END,
              'privilege', acl.privilege_type,
              'grantable', acl.is_grantable
            )
            ORDER BY
              (CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END)
                COLLATE "C",
              acl.privilege_type COLLATE "C",
              acl.is_grantable,
              grantor_role.rolname COLLATE "C"
          )
          FROM pg_catalog.aclexplode(
            COALESCE(
              relation.relacl,
              pg_catalog.acldefault(
                CASE WHEN relation.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END,
                relation.relowner
              )
            )
          ) AS acl
          LEFT JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = acl.grantor
          LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
        ), '[]'::jsonb)
        ELSE '[]'::jsonb
      END,
      'accessMethod', relation.access_method,
      'tablespace', relation.tablespace_name,
      'options', COALESCE((
        SELECT pg_catalog.jsonb_agg(option_value ORDER BY option_value COLLATE "C")
        FROM pg_catalog.unnest(relation.reloptions) AS option_value
      ), '[]'::jsonb),
      'rowSecurity', relation.relrowsecurity,
      'forceRowSecurity', relation.relforcerowsecurity,
      'replicaIdentity', relation.relreplident,
      'isPartition', relation.relispartition,
      'partitionKey', CASE
        WHEN relation.relkind = 'p' THEN pg_catalog.pg_get_partkeydef(relation.oid)
        ELSE NULL
      END,
      'partitionBound', CASE
        WHEN relation.relpartbound IS NOT NULL
          THEN pg_catalog.pg_get_expr(relation.relpartbound, relation.oid, false)
        ELSE NULL
      END,
      'viewDefinition', CASE
        WHEN relation.relkind IN ('v', 'm')
          THEN pg_catalog.pg_get_viewdef(relation.oid, false)
        ELSE NULL
      END
    ) AS document
  FROM target_relations AS relation
),
column_rows AS (
  SELECT
    relation.schema_name,
    relation.relname AS relation_name,
    attribute.attnum AS ordinal,
    pg_catalog.jsonb_build_object(
      'schema', relation.schema_name,
      'relation', relation.relname,
      'ordinal', attribute.attnum,
      'name', attribute.attname,
      'typeSchema', type_namespace.nspname,
      'typeName', type_record.typname,
      'typeModifier', attribute.atttypmod,
      'arrayDimensions', attribute.attndims,
      'notNull', attribute.attnotnull,
      'identity', attribute.attidentity,
      'generated', attribute.attgenerated,
      'collationSchema', collation_namespace.nspname,
      'collationName', collation_record.collname,
      'default', pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid, false),
      'storage', attribute.attstorage,
      'compression', attribute.attcompression,
      'local', attribute.attislocal,
      'inheritanceCount', attribute.attinhcount,
      'acl', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'grantor', grantor_role.rolname,
            'grantee', CASE
              WHEN acl.grantee = 0 THEN 'PUBLIC'
              ELSE grantee_role.rolname
            END,
            'privilege', acl.privilege_type,
            'grantable', acl.is_grantable
          )
          ORDER BY
            (CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END)
              COLLATE "C",
            acl.privilege_type COLLATE "C",
            acl.is_grantable,
            grantor_role.rolname COLLATE "C"
        )
        FROM pg_catalog.aclexplode(attribute.attacl) AS acl
        LEFT JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = acl.grantor
        LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
      ), '[]'::jsonb)
    ) AS document
  FROM target_relations AS relation
  JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = relation.oid
  JOIN pg_catalog.pg_type AS type_record ON type_record.oid = attribute.atttypid
  JOIN pg_catalog.pg_namespace AS type_namespace ON type_namespace.oid = type_record.typnamespace
  LEFT JOIN pg_catalog.pg_attrdef AS default_record
    ON default_record.adrelid = relation.oid
   AND default_record.adnum = attribute.attnum
  LEFT JOIN pg_catalog.pg_collation AS collation_record
    ON collation_record.oid = attribute.attcollation
  LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
    ON collation_namespace.oid = collation_record.collnamespace
  WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'c')
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
),
constraint_rows AS (
  SELECT
    constraint_namespace.nspname AS constraint_schema,
    relation_namespace.nspname AS relation_schema,
    relation.relname AS relation_name,
    domain_namespace.nspname AS domain_schema,
    domain_type.typname AS domain_name,
    constraint_record.conname AS constraint_name,
    pg_catalog.jsonb_build_object(
      'schema', constraint_namespace.nspname,
      'name', constraint_record.conname,
      'type', constraint_record.contype,
      'relationSchema', relation_namespace.nspname,
      'relation', relation.relname,
      'domainSchema', domain_namespace.nspname,
      'domain', domain_type.typname,
      'referencedRelationSchema', referenced_namespace.nspname,
      'referencedRelation', referenced_relation.relname,
      'backingIndexSchema', index_namespace.nspname,
      'backingIndex', backing_index.relname,
      'definition', pg_catalog.pg_get_constraintdef(constraint_record.oid, false),
      'validated', constraint_record.convalidated,
      'deferrable', constraint_record.condeferrable,
      'initiallyDeferred', constraint_record.condeferred,
      'local', constraint_record.conislocal,
      'inheritanceCount', constraint_record.coninhcount,
      'noInherit', constraint_record.connoinherit
    ) AS document
  FROM pg_catalog.pg_constraint AS constraint_record
  JOIN pg_catalog.pg_namespace AS constraint_namespace
    ON constraint_namespace.oid = constraint_record.connamespace
  LEFT JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_record.conrelid
  LEFT JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation.relnamespace
  LEFT JOIN pg_catalog.pg_type AS domain_type ON domain_type.oid = constraint_record.contypid
  LEFT JOIN pg_catalog.pg_namespace AS domain_namespace
    ON domain_namespace.oid = domain_type.typnamespace
  LEFT JOIN pg_catalog.pg_class AS referenced_relation
    ON referenced_relation.oid = constraint_record.confrelid
  LEFT JOIN pg_catalog.pg_namespace AS referenced_namespace
    ON referenced_namespace.oid = referenced_relation.relnamespace
  LEFT JOIN pg_catalog.pg_class AS backing_index
    ON backing_index.oid = constraint_record.conindid
  LEFT JOIN pg_catalog.pg_namespace AS index_namespace
    ON index_namespace.oid = backing_index.relnamespace
  WHERE constraint_record.connamespace IN (SELECT oid FROM target_schemas)
     OR relation.relnamespace IN (SELECT oid FROM target_schemas)
     OR domain_type.typnamespace IN (SELECT oid FROM target_schemas)
),
index_rows AS (
  SELECT
    index_namespace.nspname AS index_schema,
    index_relation.relname AS index_name,
    table_relation.schema_name AS relation_schema,
    table_relation.relname AS relation_name,
    pg_catalog.jsonb_build_object(
      'schema', index_namespace.nspname,
      'name', index_relation.relname,
      'relationSchema', table_relation.schema_name,
      'relation', table_relation.relname,
      'owner', pg_catalog.pg_get_userbyid(index_relation.relowner),
      'accessMethod', access_method.amname,
      'tablespace', tablespace.spcname,
      'options', COALESCE((
        SELECT pg_catalog.jsonb_agg(option_value ORDER BY option_value COLLATE "C")
        FROM pg_catalog.unnest(index_relation.reloptions) AS option_value
      ), '[]'::jsonb),
      'definition', pg_catalog.pg_get_indexdef(index_record.indexrelid, 0, false),
      'expressions', pg_catalog.pg_get_expr(
        index_record.indexprs, index_record.indrelid, false
      ),
      'predicate', pg_catalog.pg_get_expr(
        index_record.indpred, index_record.indrelid, false
      ),
      'attributes', index_record.indnatts,
      'keyAttributes', index_record.indnkeyatts,
      'unique', index_record.indisunique,
      'nullsNotDistinct', index_record.indnullsnotdistinct,
      'primary', index_record.indisprimary,
      'exclusion', index_record.indisexclusion,
      'immediate', index_record.indimmediate,
      'clustered', index_record.indisclustered,
      'valid', index_record.indisvalid,
      'ready', index_record.indisready,
      'live', index_record.indislive,
      'replicaIdentity', index_record.indisreplident
    ) AS document
  FROM pg_catalog.pg_index AS index_record
  JOIN target_relations AS table_relation ON table_relation.oid = index_record.indrelid
  JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_record.indexrelid
  JOIN pg_catalog.pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  LEFT JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_relation.relam
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace
    ON tablespace.oid = index_relation.reltablespace
),
policy_rows AS (
  SELECT
    relation.schema_name,
    relation.relname AS relation_name,
    policy.polname AS policy_name,
    pg_catalog.jsonb_build_object(
      'schema', relation.schema_name,
      'relation', relation.relname,
      'name', policy.polname,
      'command', policy.polcmd,
      'permissive', policy.polpermissive,
      'roles', COALESCE((
        SELECT pg_catalog.jsonb_agg(role_name ORDER BY role_name COLLATE "C")
        FROM (
          SELECT DISTINCT CASE
            WHEN policy_role.role_oid = 0 THEN 'PUBLIC'
            ELSE role_record.rolname
          END AS role_name
          FROM pg_catalog.unnest(policy.polroles) AS policy_role(role_oid)
          LEFT JOIN pg_catalog.pg_roles AS role_record
            ON role_record.oid = policy_role.role_oid
        ) AS normalized_roles
      ), '[]'::jsonb),
      'using', pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false),
      'check', pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false)
    ) AS document
  FROM pg_catalog.pg_policy AS policy
  JOIN target_relations AS relation ON relation.oid = policy.polrelid
),
trigger_rows AS (
  SELECT
    relation.schema_name,
    relation.relname AS relation_name,
    trigger_record.tgname AS trigger_name,
    pg_catalog.jsonb_build_object(
      'schema', relation.schema_name,
      'relation', relation.relname,
      'name', trigger_record.tgname,
      'enabled', trigger_record.tgenabled,
      'type', trigger_record.tgtype,
      'functionSchema', function_namespace.nspname,
      'function', function_record.proname,
      'functionArguments', pg_catalog.pg_get_function_identity_arguments(function_record.oid),
      'definition', pg_catalog.pg_get_triggerdef(trigger_record.oid, false)
    ) AS document
  FROM pg_catalog.pg_trigger AS trigger_record
  JOIN target_relations AS relation ON relation.oid = trigger_record.tgrelid
  JOIN pg_catalog.pg_proc AS function_record
    ON function_record.oid = trigger_record.tgfoid
  JOIN pg_catalog.pg_namespace AS function_namespace
    ON function_namespace.oid = function_record.pronamespace
  WHERE NOT trigger_record.tgisinternal
),
rule_rows AS (
  SELECT
    relation.schema_name,
    relation.relname AS relation_name,
    rewrite.rulename AS rule_name,
    pg_catalog.jsonb_build_object(
      'schema', relation.schema_name,
      'relation', relation.relname,
      'name', rewrite.rulename,
      'event', rewrite.ev_type,
      'enabled', rewrite.ev_enabled,
      'instead', rewrite.is_instead,
      'definition', pg_catalog.pg_get_ruledef(rewrite.oid, false)
    ) AS document
  FROM pg_catalog.pg_rewrite AS rewrite
  JOIN target_relations AS relation ON relation.oid = rewrite.ev_class
  -- A view's generated _RETURN rule is represented canonically by
  -- relation_rows.viewDefinition; only user-defined rules belong here.
  WHERE rewrite.rulename <> '_RETURN'
),
target_functions AS MATERIALIZED (
  SELECT
    function_record.*,
    namespace.nspname AS schema_name,
    language.lanname AS language_name
  FROM pg_catalog.pg_proc AS function_record
  JOIN target_schemas AS namespace ON namespace.oid = function_record.pronamespace
  JOIN pg_catalog.pg_language AS language ON language.oid = function_record.prolang
  WHERE function_record.prokind IN ('f', 'p', 'w')
),
function_rows AS (
  SELECT
    function_record.schema_name,
    function_record.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(function_record.oid) AS identity_arguments,
    pg_catalog.jsonb_build_object(
      'schema', function_record.schema_name,
      'name', function_record.proname,
      'identityArguments', pg_catalog.pg_get_function_identity_arguments(function_record.oid),
      'result', pg_catalog.pg_get_function_result(function_record.oid),
      'kind', function_record.prokind,
      'language', function_record.language_name,
      'owner', pg_catalog.pg_get_userbyid(function_record.proowner),
      'securityDefiner', function_record.prosecdef,
      'leakproof', function_record.proleakproof,
      'volatility', function_record.provolatile,
      'parallel', function_record.proparallel,
      'strict', function_record.proisstrict,
      'returnsSet', function_record.proretset,
      'cost', function_record.procost,
      'rows', function_record.prorows,
      'config', COALESCE((
        SELECT pg_catalog.jsonb_agg(config_value ORDER BY config_value COLLATE "C")
        FROM pg_catalog.unnest(function_record.proconfig) AS config_value
      ), '[]'::jsonb),
      'acl', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'grantor', grantor_role.rolname,
            'grantee', CASE
              WHEN acl.grantee = 0 THEN 'PUBLIC'
              ELSE grantee_role.rolname
            END,
            'privilege', acl.privilege_type,
            'grantable', acl.is_grantable
          )
          ORDER BY
            (CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END)
              COLLATE "C",
            acl.privilege_type COLLATE "C",
            acl.is_grantable,
            grantor_role.rolname COLLATE "C"
        )
        FROM pg_catalog.aclexplode(
          COALESCE(
            function_record.proacl,
            pg_catalog.acldefault('f'::"char", function_record.proowner)
          )
        ) AS acl
        LEFT JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = acl.grantor
        LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
      ), '[]'::jsonb),
      'definition', pg_catalog.pg_get_functiondef(function_record.oid)
    ) AS document
  FROM target_functions AS function_record
),
scoped_owner_oids AS MATERIALIZED (
  SELECT nspowner AS owner_oid FROM target_schemas
  UNION
  SELECT relowner FROM target_relations
  UNION
  SELECT proowner FROM target_functions
),
default_acl_rows AS (
  SELECT
    COALESCE(namespace.nspname, '*') AS schema_name,
    owner_role.rolname AS owner_name,
    default_acl.defaclobjtype AS object_type,
    pg_catalog.jsonb_build_object(
      'schema', namespace.nspname,
      'owner', owner_role.rolname,
      'objectType', default_acl.defaclobjtype,
      'acl', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'grantor', grantor_role.rolname,
            'grantee', CASE
              WHEN acl.grantee = 0 THEN 'PUBLIC'
              ELSE grantee_role.rolname
            END,
            'privilege', acl.privilege_type,
            'grantable', acl.is_grantable
          )
          ORDER BY
            (CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END)
              COLLATE "C",
            acl.privilege_type COLLATE "C",
            acl.is_grantable,
            grantor_role.rolname COLLATE "C"
        )
        FROM pg_catalog.aclexplode(default_acl.defaclacl) AS acl
        LEFT JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = acl.grantor
        LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
      ), '[]'::jsonb)
    ) AS document
  FROM pg_catalog.pg_default_acl AS default_acl
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = default_acl.defaclrole
  LEFT JOIN target_schemas AS namespace ON namespace.oid = default_acl.defaclnamespace
  CROSS JOIN settings
  WHERE namespace.oid IS NOT NULL
     OR (
       default_acl.defaclnamespace = 0
       AND (
         default_acl.defaclrole IN (SELECT owner_oid FROM scoped_owner_oids)
         OR owner_role.rolname IN (SELECT role_name FROM relevant_role_names)
       )
     )
),
role_membership_rows AS (
  SELECT
    granted_role.rolname AS granted_role_name,
    member_role.rolname AS member_role_name,
    grantor_role.rolname AS grantor_role_name,
    pg_catalog.jsonb_build_object(
      'role', granted_role.rolname,
      'member', member_role.rolname,
      -- Cloud SQL records platform-mediated grants as cloudsqladmin while a
      -- standalone PostgreSQL cluster records the same owner-authorized grant
      -- as postgres. Preserve unexpected grantors, but normalize the two
      -- administrator identities exactly as the database ACL section does.
      'grantor', CASE
        WHEN grantor_role.rolname IN ('postgres', 'cloudsqladmin')
          THEN 'DATABASE_ADMIN'
        ELSE grantor_role.rolname
      END,
      'admin', membership.admin_option,
      -- Retain the raw PostgreSQL 16 membership option. The application pools
      -- do not issue SET ROLE, so their narrow group privileges intentionally
      -- require INHERIT TRUE on these memberships even though the login role's
      -- NOINHERIT attribute supplies a restrictive default for future grants.
      'inherit', membership.inherit_option,
      'set', membership.set_option
    ) AS document
  FROM pg_catalog.pg_auth_members AS membership
  JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
  JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
  JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = membership.grantor
  CROSS JOIN settings
  WHERE granted_role.rolname IN (SELECT role_name FROM relevant_role_names)
     OR member_role.rolname IN (SELECT role_name FROM relevant_role_names)
),
sections AS (
  SELECT
    'format'::text AS section,
    pg_catalog.jsonb_build_object(
      'name', 'orqaly.catalog-fingerprint',
      'version', 1,
      'postgresMajor', 16
    ) AS payload
  UNION ALL
  SELECT 'currentDatabase', document FROM current_database_row
  UNION ALL
  SELECT 'dependencies', COALESCE(
    pg_catalog.jsonb_agg(document ORDER BY document::text COLLATE "C"), '[]'::jsonb
  ) FROM dependency_rows
  UNION ALL
  SELECT 'roles', COALESCE(
    pg_catalog.jsonb_agg(document ORDER BY document::text COLLATE "C"), '[]'::jsonb
  ) FROM app_role_rows
  UNION ALL
  SELECT 'databaseRoleSettings', COALESCE(
    pg_catalog.jsonb_agg(
      document ORDER BY document::text COLLATE "C"
    ), '[]'::jsonb
  ) FROM database_role_setting_rows
  UNION ALL
  SELECT 'schemas', COALESCE(
    pg_catalog.jsonb_agg(document ORDER BY document::text COLLATE "C"), '[]'::jsonb
  ) FROM schema_rows
  UNION ALL
  SELECT 'relations', COALESCE(
    pg_catalog.jsonb_agg(
      document ORDER BY document::text COLLATE "C"
    ), '[]'::jsonb
  ) FROM relation_rows
  UNION ALL
  SELECT 'columns', COALESCE(
    pg_catalog.jsonb_agg(
      document ORDER BY document::text COLLATE "C"
    ), '[]'::jsonb
  ) FROM column_rows
  UNION ALL
  SELECT 'constraints', COALESCE(
    pg_catalog.jsonb_agg(
      document ORDER BY document::text COLLATE "C"
    ), '[]'::jsonb
  ) FROM constraint_rows
  UNION ALL
  SELECT 'indexes', COALESCE(
    pg_catalog.jsonb_agg(
      document ORDER BY document::text COLLATE "C"
    ), '[]'::jsonb
  ) FROM index_rows
  UNION ALL
  SELECT 'policies', COALESCE(
    pg_catalog.jsonb_agg(
      document ORDER BY document::text COLLATE "C"
    ), '[]'::jsonb
  ) FROM policy_rows
  UNION ALL
  SELECT 'triggers', COALESCE(
    pg_catalog.jsonb_agg(
      document ORDER BY document::text COLLATE "C"
    ), '[]'::jsonb
  ) FROM trigger_rows
  UNION ALL
  SELECT 'rules', COALESCE(
    pg_catalog.jsonb_agg(
      document ORDER BY document::text COLLATE "C"
    ), '[]'::jsonb
  ) FROM rule_rows
  UNION ALL
  SELECT 'functions', COALESCE(
    pg_catalog.jsonb_agg(
      document ORDER BY document::text COLLATE "C"
    ), '[]'::jsonb
  ) FROM function_rows
  UNION ALL
  SELECT 'defaultAcls', COALESCE(
    pg_catalog.jsonb_agg(
      document ORDER BY document::text COLLATE "C"
    ), '[]'::jsonb
  ) FROM default_acl_rows
  UNION ALL
  SELECT 'roleMemberships', COALESCE(
    pg_catalog.jsonb_agg(
      document ORDER BY document::text COLLATE "C"
    ), '[]'::jsonb
  ) FROM role_membership_rows
),
canonical AS (
  SELECT pg_catalog.jsonb_object_agg(
    section, payload ORDER BY section COLLATE "C"
  ) AS document
  FROM sections
)
SELECT pg_catalog.encode(
  public.digest(
    pg_catalog.convert_to(canonical.document::text, 'UTF8'),
    'sha256'
  ),
  'hex'
) AS catalog_fingerprint
FROM canonical;
