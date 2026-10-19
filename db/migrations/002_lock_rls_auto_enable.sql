-- ============================================================================
-- PETA FILE
-- FILE    : db/migrations/002_lock_rls_auto_enable.sql
-- TUJUAN  : Migrasi 002 (khusus Supabase): mengunci fungsi rls_auto_enable()
--           dari PUBLIC, anon dan authenticated lewat percobaan aman dalam
--           satu transaksi (tabel uji dibuat, dicek, dihapus). Bila
--           pemeriksaan gagal, semuanya dibatalkan.
-- BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
--    1. Mulai transaksi
--    2. Percobaan: RLS otomatis aktif sebelum dan sesudah pencabutan
--    3. Selesai
-- ============================================================================

-- ===== BAGIAN 1: Mulai transaksi =====
-- 002_lock_rls_auto_enable.sql
-- Supabase's "Enable automatic RLS" option installs an event trigger function,
-- public.rls_auto_enable(), that turns on RLS for every new table. By default
-- anyone (PUBLIC) is allowed to execute it. It is a trigger function, so it cannot
-- be called directly, but we lock it anyway so the audit has zero exceptions.
--
-- This script is a safe experiment in one transaction:
--   1. Create a probe table and check that RLS was switched on by itself
--      (baseline: proves the automatic RLS works today).
--   2. Revoke execute from PUBLIC, anon and authenticated.
--   3. Create a second probe table and check again
--      (proves automatic RLS still works after the revoke).
--   4. Drop both probe tables.
-- If any check fails, an error is raised and EVERYTHING is rolled back, so the
-- database is left exactly as it was.
begin;

-- ===== BAGIAN 2: Percobaan: RLS otomatis aktif sebelum dan sesudah pencabutan =====
do $$
declare
  rls_on boolean;
begin
  create table public._rls_probe_before (id int);
  select relrowsecurity into rls_on
  from pg_class where oid = 'public._rls_probe_before'::regclass;
  if not rls_on then
    raise exception 'Baseline failed: new tables do not get RLS automatically. Nothing was changed.';
  end if;

  revoke all on function public.rls_auto_enable() from public, anon, authenticated;

  create table public._rls_probe_after (id int);
  select relrowsecurity into rls_on
  from pg_class where oid = 'public._rls_probe_after'::regclass;
  if not rls_on then
    raise exception 'Automatic RLS stopped working after the revoke. Rolled back.';
  end if;

  drop table public._rls_probe_before, public._rls_probe_after;
end;
$$;

-- ===== BAGIAN 3: Selesai =====
commit;
