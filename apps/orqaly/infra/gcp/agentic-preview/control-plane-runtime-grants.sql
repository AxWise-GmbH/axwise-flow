\set ON_ERROR_STOP on

begin;

revoke all privileges on schema agentic from public;
revoke all privileges on schema agentic from :"runtime_role";
grant usage on schema agentic to :"runtime_role";

revoke all privileges on all tables in schema agentic from public;
revoke all privileges on all tables in schema agentic from :"runtime_role";
grant select, insert, update, delete on all tables in schema agentic to :"runtime_role";

revoke all privileges on all sequences in schema agentic from public;
revoke all privileges on all sequences in schema agentic from :"runtime_role";
grant usage, select on all sequences in schema agentic to :"runtime_role";

revoke execute on all functions in schema agentic from public;
revoke all privileges on all functions in schema agentic from :"runtime_role";
grant execute on all functions in schema agentic to :"runtime_role";

revoke all privileges on schema agentic_meta from public, :"runtime_role";
revoke all privileges on all tables in schema agentic_meta from public, :"runtime_role";

alter default privileges for role :"migration_role" in schema agentic
  revoke execute on functions from public;
alter default privileges for role :"migration_role" in schema agentic
  grant select, insert, update, delete on tables to :"runtime_role";
alter default privileges for role :"migration_role" in schema agentic
  grant usage, select on sequences to :"runtime_role";
alter default privileges for role :"migration_role" in schema agentic
  grant execute on functions to :"runtime_role";

do $verify$
declare
  runtime_name text := 'orqaly_agentic_preview_001_runtime';
  migration_name text := 'orqaly_agentic_preview_001_migrator';
begin
  if exists (
    select 1
      from pg_roles
     where rolname = runtime_name
       and (rolsuper or rolcreatedb or rolcreaterole or rolinherit
            or rolreplication or rolbypassrls or not rolcanlogin)
  ) then
    raise exception 'Agent runtime role is privileged';
  end if;

  if exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('agentic', 'agentic_meta')
       and c.relkind in ('r', 'p', 'S', 'v', 'm')
       and pg_get_userbyid(c.relowner) = runtime_name
  ) then
    raise exception 'Agent runtime role owns schema objects';
  end if;

  if exists (
    select 1
      from pg_namespace
     where nspname in ('agentic', 'agentic_meta')
       and pg_get_userbyid(nspowner) <> migration_name
  ) then
    raise exception 'Agent schema ownership is not migration-only';
  end if;

  if has_schema_privilege(runtime_name, 'agentic', 'CREATE')
     or not has_schema_privilege(runtime_name, 'agentic', 'USAGE')
     or has_schema_privilege(runtime_name, 'agentic_meta', 'USAGE') then
    raise exception 'Agent runtime schema privileges differ from the allowlist';
  end if;

  if exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'agentic'
       and c.relkind in ('r', 'p')
       and (not c.relrowsecurity or not c.relforcerowsecurity)
  ) then
    raise exception 'Agent table is missing forced row-level security';
  end if;
end
$verify$;

commit;
