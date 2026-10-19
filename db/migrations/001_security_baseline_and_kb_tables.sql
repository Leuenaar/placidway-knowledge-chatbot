-- ============================================================================
-- PETA FILE
-- FILE    : db/migrations/001_security_baseline_and_kb_tables.sql
-- TUJUAN  : Migrasi 001 (jalankan pertama di Supabase SQL Editor): ekstensi
--           vector, tiga tabel (pages, chunks, unanswered_questions), fungsi
--           penghapus log 30 hari, dan seluruh pengamanan (RLS tanpa
--           kebijakan, semua hak dicabut dari anon dan authenticated, hanya
--           service_role yang diberi akses). Aman dijalankan ulang.
-- BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
--    1. Ekstensi pgvector (di schema extensions)
--    2. Objek baru di public tidak diberi hak ke peran API secara bawaan
--    3. Tabel pages: 7 halaman sumber dan hash teks bersihnya
--    4. Tabel-tabel
--    5. Tabel chunks: potongan teks untuk pencarian, vektor 384, kolom fts
--    6. Tabel unanswered_questions: log pertanyaan tak terjawab (tanpa IP)
--    7. Fungsi penghapus log lebih dari 30 hari
--    8. Kunci semuanya: RLS, cabut hak, beri service_role seperlunya
-- KALAU DIMINTA MENGUBAH:
--    - Menambah kolom atau tabel baru: buat migrasi baru (005_...), jangan
--      ubah 001 yang sudah berjalan (BAGIAN 3)
--    - Mengubah lama simpan log 30 hari: BAGIAN 7 dan purgeOld di
--      apps/api/src/unanswered
-- ============================================================================

-- 001_security_baseline_and_kb_tables.sql
-- PlacidWay Knowledge Chatbot, migration 001.
--
-- Security model: the browser never talks to the database. Only the API server
-- (secret key, Postgres role service_role) may touch data. The roles anon and
-- authenticated get nothing. Walls, in order of importance:
--   1. Grants: only service_role is granted anything. This is the main wall,
--      because service_role bypasses RLS.
--   2. RLS: enabled on every table with ZERO policies (default deny), as a
--      backup in case a grant to anon or authenticated ever slips in.
--   3. Functions: EXECUTE is revoked from everyone except service_role.
--   4. Extensions live in the "extensions" schema, not in "public".
--
-- Run once in the Supabase SQL Editor (it runs as role postgres).
-- Safe to re-run: every statement is idempotent.
--
-- Scope: only tables whose columns are already fixed by the handoff
-- (pages, chunks, unanswered_questions). Rule tables, leads and anything else
-- get their own migration after their design is approved.

begin;

-- ===== BAGIAN 1: Ekstensi pgvector (di schema extensions) =====
-- ---------------------------------------------------------------------------
-- 1. Extensions (before the default-privilege changes below)
-- ---------------------------------------------------------------------------
create extension if not exists vector with schema extensions;

-- ===== BAGIAN 2: Objek baru di public tidak diberi hak ke peran API secara bawaan =====
-- ---------------------------------------------------------------------------
-- 2. New objects in public must not be granted to API roles by default
-- ---------------------------------------------------------------------------
-- "revoke all" instead of listing a few privileges: old defaults also granted
-- truncate, references, trigger (tables) and update (sequences, which is enough
-- to call nextval). Listing only some of them leaves a gap.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

-- ===== BAGIAN 3: Tabel pages: 7 halaman sumber dan hash teks bersihnya =====

-- ===== BAGIAN 4: Tabel-tabel =====
-- ---------------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------------
-- The 7 source pages. cleaned_hash is the sha256 of the cleaned text and is
-- what the Refresh command compares to decide which pages changed.
create table if not exists public.pages (
  page_no       smallint    primary key check (page_no between 1 and 7),
  url           text        not null unique,
  page_type     text        not null check (page_type in (
                              'clinic_profile', 'package', 'videos',
                              'price_list', 'price_comparison')),
  title         text        not null,
  cleaned_hash  text        not null,
  page_modified date,
  fetched_at    timestamptz not null default now()
);

-- ===== BAGIAN 5: Tabel chunks: potongan teks untuk pencarian, vektor 384, kolom fts =====
-- The chunks the bot retrieves from. The id is stable (for example 'P2-cost-1')
-- so Refresh can update per chunk and the model can return ids instead of URLs.
-- embedding is 384 dimensions as a placeholder: the embedding model is not
-- chosen yet. The table is empty now, so changing it later is a one-line fix.
-- No vector index on purpose: with about 200 rows an exact scan is instant and
-- always returns the true nearest chunks.
create table if not exists public.chunks (
  id            text        primary key,
  page_no       smallint    not null references public.pages (page_no) on delete cascade,
  source_url    text        not null,
  page_type     text        not null,
  h1            text        not null,
  section       text,
  kind          text        not null check (kind in (
                              'price', 'included', 'excluded', 'optional', 'faq',
                              'itinerary', 'risks', 'overview', 'destination',
                              'patient_story', 'review', 'disclaimer', 'video_list')),
  text          text        not null check (char_length(text) between 40 and 1800),
  text_hash     text        not null,
  char_len      integer     generated always as (char_length(text)) stored,
  page_modified date,
  fetched_at    timestamptz not null default now(),
  embedding     extensions.vector(384),
  fts           tsvector    generated always as (
                  to_tsvector('english',
                    coalesce(h1, '') || ' ' || coalesce(section, '') || ' ' || text)
                ) stored,
  -- the chunk id must start with its own page number, for example P2-...
  constraint chunks_id_matches_page check (id like 'P' || page_no::text || '-%')
);

create index if not exists chunks_page_no_idx on public.chunks (page_no);
create index if not exists chunks_fts_idx on public.chunks using gin (fts);

-- ===== BAGIAN 6: Tabel unanswered_questions: log pertanyaan tak terjawab (tanpa IP) =====
-- Questions the bot could not answer, to find content gaps. No IP column on
-- purpose. Rows older than 30 days are deleted by purge_old_unanswered_questions().
create table if not exists public.unanswered_questions (
  id          bigint      generated always as identity primary key,
  question    text        not null check (char_length(question) between 1 and 500),
  reason      text        not null check (reason in (
                            'not_in_content', 'price_not_listed',
                            'out_of_scope', 'medical_declined')),
  session_id  uuid,
  created_at  timestamptz not null default now()
);

create index if not exists unanswered_questions_created_at_idx
  on public.unanswered_questions (created_at);

comment on table public.pages is 'The 7 PlacidWay source pages and their cleaned-text hash (used by Refresh).';
comment on table public.chunks is 'Retrieval chunks. Public page content only, no personal data.';
comment on table public.unanswered_questions is 'Questions the bot could not answer. 30 day retention, no IP address.';

-- ===== BAGIAN 7: Fungsi penghapus log lebih dari 30 hari =====
-- ---------------------------------------------------------------------------
-- 4. Function: 30 day retention for unanswered_questions
-- ---------------------------------------------------------------------------
-- security invoker (the default, stated for clarity) and an empty search_path,
-- so nothing can be hijacked through a look-alike object in another schema.
create or replace function public.purge_old_unanswered_questions(
  retention interval default interval '30 days'
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.unanswered_questions
  where created_at < now() - retention;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- ===== BAGIAN 8: Kunci semuanya: RLS, cabut hak, beri service_role seperlunya =====
-- ---------------------------------------------------------------------------
-- 5. Lock everything down
-- ---------------------------------------------------------------------------

-- RLS on, no policies: default deny for anyone who is subject to RLS.
alter table public.pages                enable row level security;
alter table public.chunks               enable row level security;
alter table public.unanswered_questions enable row level security;

-- Take away everything from the public-facing roles (also covers old defaults).
revoke all on table public.pages, public.chunks, public.unanswered_questions
  from public, anon, authenticated;
revoke all on sequence public.unanswered_questions_id_seq
  from public, anon, authenticated;
revoke all on function public.purge_old_unanswered_questions(interval)
  from public, anon, authenticated;

-- Give the API server exactly what it needs and nothing more.
grant select, insert, update, delete on table
  public.pages, public.chunks, public.unanswered_questions to service_role;
grant usage, select on sequence public.unanswered_questions_id_seq to service_role;
grant execute on function public.purge_old_unanswered_questions(interval) to service_role;

commit;
