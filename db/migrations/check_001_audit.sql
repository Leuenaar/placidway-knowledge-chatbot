-- ============================================================================
-- PETA FILE
-- FILE    : db/migrations/check_001_audit.sql
-- TUJUAN  : Audit hanya-baca setelah migrasi 001 (jalankan di Supabase SQL
--           Editor). Setiap pemeriksaan harus mengembalikan NOL baris,
--           kecuali yang terakhir yang mendaftar tabel dengan hak
--           service_role (empat bila migrasi 004 sudah jalan). Aman
--           dijalankan kapan saja.
-- BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
--    1. Check 1: tabel tanpa RLS
--    2. Check 2: hak tabel di tangan anon atau authenticated
--    3. Check 3: fungsi yang bisa dijalankan anon atau authenticated
--    4. Check 4: sequence yang bisa dipakai anon atau authenticated
--    5. Check 5: apa yang boleh dilakukan service_role
-- ============================================================================

-- ===== BAGIAN 1: Check 1: tabel tanpa RLS =====
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

-- ===== BAGIAN 2: Check 2: hak tabel di tangan anon atau authenticated =====
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

-- ===== BAGIAN 3: Check 3: fungsi yang bisa dijalankan anon atau authenticated =====
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

-- ===== BAGIAN 4: Check 4: sequence yang bisa dipakai anon atau authenticated =====
-- Check 4: sequences in public that anon or authenticated can use. Expected: 0 rows.
select c.relname as sequence_name, r.rolname as role_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'), ('authenticated')) as r (rolname)
where n.nspname = 'public' and c.relkind = 'S'
  and (has_sequence_privilege(r.rolname, c.oid, 'usage')
       or has_sequence_privilege(r.rolname, c.oid, 'select')
       or has_sequence_privilege(r.rolname, c.oid, 'update'));

-- ===== BAGIAN 5: Check 5: apa yang boleh dilakukan service_role =====
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
