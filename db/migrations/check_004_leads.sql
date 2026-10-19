-- ============================================================================
-- FILE MAP
-- FILE    : db/migrations/check_004_leads.sql
-- PURPOSE : Read-only audit of migration 004 (contacts). One result table,
--           every row must be OK. It reads no names or emails, only counts and
--           settings.
-- PARTS   : (in the code, search for the text PART n with Ctrl+F)
--    1. Seven checks of the leads table: it exists, RLS is on, no policies, no
--       anon rights, service_role rights, the purge function
-- ============================================================================

-- ===== PART 1: Seven checks of the leads table: it exists, RLS is on, no policies, no anon rights, service_role rights, the purge function =====
-- check_004_leads.sql
-- Read-only audit for migration 004 (lead capture). Run it in the Supabase SQL Editor after 004_leads.sql.
-- One result table. Every row should say OK. "found" is what the database really has, "expected" is what it should have.
-- Safe to run any time. It reads no names and no emails, only counts and settings.
select
  check_name,
  found,
  expected,
  case when found = expected then 'OK' else 'PROBLEM' end as status
from (
  -- 1. The table exists.
  select 'leads table exists' as check_name,
         (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'leads' and c.relkind = 'r') as found,
         '1' as expected
  union all
  -- 2. Row level security is on.
  select 'row level security is on',
         (select c.relrowsecurity::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'leads'),
         'true'
  union all
  -- 3. The public roles have no privilege on the table.
  select 'anon and authenticated privileges on leads',
         (select count(*)::text from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'leads' and grantee in ('anon', 'authenticated', 'PUBLIC')),
         '0'
  union all
  -- 4. The server key (service_role) can read and write.
  select 'service_role privileges on leads',
         (select count(*)::text from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'leads' and grantee = 'service_role'
             and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),
         '4'
  union all
  -- 5. Only the agreed columns exist: no IP address, no session id, no chat text.
  select 'columns of leads',
         (select string_agg(column_name, ',' order by column_name) from information_schema.columns
           where table_schema = 'public' and table_name = 'leads'),
         'consent_version,created_at,email,id,language,name'
  union all
  -- 6. The purge function exists and only service_role may run it.
  select 'purge_old_leads: who may execute',
         (select string_agg(r, ',' order by r) from (
            select r from unnest(array['anon', 'authenticated', 'service_role']) as r
             where has_function_privilege(r, 'public.purge_old_leads(interval)', 'execute')) t),
         'service_role'
  union all
  -- 7. Nothing older than 90 days is left (the server runs the purge at start and once a day).
  select 'rows older than 90 days',
         (select count(*)::text from public.leads where created_at < now() - interval '90 days'),
         '0'
) checks;
