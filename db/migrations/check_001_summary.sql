-- ============================================================================
-- FILE MAP
-- FILE    : db/migrations/check_001_summary.sql
-- PURPOSE : Short version of audit 001: one result table, every row must say
--           OK. 'found' is the real database content, 'expected' is what it
--           should be. Read only. The expected number of tables is
--           automatically three, plus one if the leads table exists.
-- PARTS   : (in the code, search for the text PART n with Ctrl+F)
--    1. One result table: tables without RLS, anon rights, functions,
--       sequences, service_role tables
-- ============================================================================

-- ===== PART 1: One result table: tables without RLS, anon rights, functions, sequences, service_role tables =====
-- check_001_summary.sql
-- One result table instead of five. Run it in the Supabase SQL Editor.
-- Every row should say OK. "found" is what the database really has, "expected"
-- is what it should have. Read-only, safe to run any time.
select
  check_name,
  found,
  expected,
  case when found = expected then 'OK' else 'PROBLEM' end as status
from (
  -- 1. Tables in public without row level security.
  select 'tables_without_rls' as check_name, 0 as expected, count(*) as found
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity

  union all

  -- 2. Any privilege on a public table held by anon or authenticated.
  select 'table_privileges_for_anon_or_authenticated', 0, count(*)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) as r (rolname)
  cross join (values ('select'), ('insert'), ('update'), ('delete'),
                     ('truncate'), ('references'), ('trigger')) as p (priv)
  where n.nspname = 'public' and c.relkind = 'r'
    and has_table_privilege(r.rolname, c.oid, p.priv)

  union all

  -- 3. Functions in public that anon or authenticated can execute
  --    (functions owned by an extension are ignored).
  select 'functions_executable_by_anon_or_authenticated', 0, count(*)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated')) as r (rolname)
  where n.nspname = 'public'
    and has_function_privilege(r.rolname, p.oid, 'execute')
    and not exists (
      select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
    )

  union all

  -- 4. Sequences in public that anon or authenticated can use.
  select 'sequence_privileges_for_anon_or_authenticated', 0, count(*)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) as r (rolname)
  where n.nspname = 'public' and c.relkind = 'S'
    and (has_sequence_privilege(r.rolname, c.oid, 'usage')
         or has_sequence_privilege(r.rolname, c.oid, 'select')
         or has_sequence_privilege(r.rolname, c.oid, 'update'))

  union all

  -- 5. Tables where service_role can select, insert, update and delete: 3 after migration 001, 4 once migration 004 (leads) has run.
  select 'tables_service_role_can_fully_use', 3 + (select count(*) from pg_class lc join pg_namespace ln on ln.oid = lc.relnamespace where ln.nspname = 'public' and lc.relname = 'leads' and lc.relkind = 'r'), count(*)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and has_table_privilege('service_role', c.oid, 'select')
    and has_table_privilege('service_role', c.oid, 'insert')
    and has_table_privilege('service_role', c.oid, 'update')
    and has_table_privilege('service_role', c.oid, 'delete')
) as checks
order by case when check_name like 'tables_service_role%' then 2 else 1 end, check_name;
