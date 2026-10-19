-- ============================================================================
-- PETA FILE
-- FILE    : db/migrations/004_leads.sql
-- TUJUAN  : Migrasi 004 (nice-to-have N4): tabel leads untuk nama dan email
--           pengunjung yang setuju dihubungi tentang penawaran. Yang
--           disimpan: nama, email, bahasa, versi teks persetujuan, waktu.
--           Tanpa IP dan tanpa isi obrolan. Baris lebih dari 90 hari dihapus
--           oleh purge_old_leads(). Pengamanan sama seperti tabel lain.
-- BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
--    1. Mulai transaksi
--    2. Tabel leads dan indeks waktu
--    3. Fungsi penghapus lead lebih dari 90 hari
--    4. Pengamanan: RLS, cabut hak, beri service_role
--    5. Selesai
-- KALAU DIMINTA MENGUBAH:
--    - Mengubah lama simpan lead (90 hari): BAGIAN 3 dan LEAD_RETENTION_DAYS
--      di apps/api/src/leads/store.ts
-- ============================================================================

-- ===== BAGIAN 1: Mulai transaksi =====
-- 004_leads.sql
-- Lead capture (nice-to-have N4): a visitor may leave a name and an email so the PlacidWay team can contact them about a quote.
--
-- What is stored: name, email, chat language, the version of the consent text they ticked, the time. No IP address, no session id,
-- no chat text. Rows older than 90 days are deleted by purge_old_leads(), which the API server calls at start and once a day.
-- Same wall as the other tables: RLS on with no policy, nothing granted to anon or authenticated, only service_role.
--
-- Safe to run twice. Run it once in the Supabase SQL editor (or any psql session as the owner) before the lead card is used.
begin;

-- ===== BAGIAN 2: Tabel leads dan indeks waktu =====
create table if not exists public.leads (
  id               bigint      generated always as identity primary key,
  name             text        not null check (char_length(name) between 1 and 100),
  email            text        not null check (char_length(email) between 3 and 254),
  language         text        check (language is null or char_length(language) between 2 and 20),
  consent_version  text        not null check (char_length(consent_version) between 1 and 20),
  created_at       timestamptz not null default now()
);

create index if not exists leads_created_at_idx on public.leads (created_at);

comment on table public.leads is 'Name and email left by a visitor who agreed to be contacted about a quote. 90 day retention, no IP address, no chat text.';

-- ===== BAGIAN 3: Fungsi penghapus lead lebih dari 90 hari =====
create or replace function public.purge_old_leads(
  retention interval default interval '90 days'
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.leads
  where created_at < now() - retention;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- ===== BAGIAN 4: Pengamanan: RLS, cabut hak, beri service_role =====
alter table public.leads enable row level security;

revoke all on table public.leads from public, anon, authenticated;
revoke all on sequence public.leads_id_seq from public, anon, authenticated;
revoke all on function public.purge_old_leads(interval) from public, anon, authenticated;

grant select, insert, update, delete on table public.leads to service_role;
grant usage, select on sequence public.leads_id_seq to service_role;
grant execute on function public.purge_old_leads(interval) to service_role;

-- ===== BAGIAN 5: Selesai =====
commit;
