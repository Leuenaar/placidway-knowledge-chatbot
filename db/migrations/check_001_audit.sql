-- ============================================================================
-- FILE MAP
-- FILE    : db/migrations/check_001_audit.sql
-- PURPOSE : Read-only audit after migration 001 (run it in the Supabase SQL
--           Editor). Every check must return ZERO rows, except the last one,
--           which lists the tables with service_role rights (four once
--           migration 004 has run). Safe to run at any time.
-- PARTS   : (in the code, search for the text PART n with Ctrl+F)
--    1. Check 1: tables without RLS
--    2. Check 2: table rights held by anon or authenticated
--    3. Check 3: functions that anon or authenticated can run
--    4. Check 4: sequences that anon or authenticated can use
--    5. Check 5: what service_role may do
-- ============================================================================

-- ===== PART 1: Check 1: tables without RLS =====
-- check_001_audit.sql
-- Read-only audit. Run it in the Supabase SQL Editor after migration 001.
-- Every check should return ZERO rows, except the last one, which should list
-- the tables with service_role privileges (four once migration 004 has run). Safe to run any time, and worth
-- re-running after every future migration.
-- Check 1: tables in public WITHOUT row level security. Expected: 0 rows.
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- ===== PART 2: Check 2: table rights held by anon or authenticated =====
-- Check 2: any privilege on any public table held by anon or authenticated.
-- (anon and authenticated also inherit anything granted to PUBLIC.) Expected: 0 rows.
select c.relname as table_name, r.rolname as role_name, p.priv as privilege
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'), ('authenticated')) as r (rolname)
cross join (values ('select'), ('insert'), ('update'), ('delete'),
                   ('truncate'), ('references'), ('trigger')) as p (priv)
where n.nspname = 'public' and c.relkind = 'r'
  and has_table_privilege(r.rolname, c.oid, p.priv);

-- ===== PART 3: Check 3: functions that anon or authenticated can run =====
-- Check 3: functions in public that anon or authenticated can execute
-- (functions owned by an extension are ignored). Expected: 0 rows.
select p.oid::regprocedure as function_name, r.rolname as role_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as r (rolname)
where n.nspname = 'public'
  and has_function_privilege(r.rolname, p.oid, 'execute')
  and not exists (
    select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
  );

-- ===== PART 4: Check 4: sequences that anon or authenticated can use =====
-- Check 4: sequences in public that anon or authenticated can use. Expected: 0 rows.
select c.relname as sequence_name, r.rolname as role_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'), ('authenticated')) as r (rolname)
where n.nspname = 'public' and c.relkind = 'S'
  and (has_sequence_privilege(r.rolname, c.oid, 'usage')
       or has_sequence_privilege(r.rolname, c.oid, 'select')
       or has_sequence_privilege(r.rolname, c.oid, 'update'));

-- ===== PART 5: Check 5: what service_role may do =====
-- Check 5: what service_role can do. Expected: pages, chunks and
-- unanswered_questions, each with select, insert, update and delete.
select c.relname as table_name,
       string_agg(p.priv, ', ' order by p.priv) as service_role_privileges
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join (values ('select'), ('insert'), ('update'), ('delete')) as p (priv)
where n.nspname = 'public' and c.relkind = 'r'
  and has_table_privilege('service_role', c.oid, p.priv)
group by c.relname
order by c.relname;
