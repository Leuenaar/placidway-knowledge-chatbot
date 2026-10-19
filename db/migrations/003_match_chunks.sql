-- ============================================================================
-- PETA FILE
-- FILE    : db/migrations/003_match_chunks.sql
-- TUJUAN  : Migrasi 003: fungsi pencarian match_chunks(vektor, jumlah).
--           Server menanamkan pertanyaan lalu memanggil fungsi ini lewat
--           PostgREST untuk mendapat chunk terdekat. Cosine distance, tanpa
--           indeks vektor (sekitar 150 baris, pencarian penuh instan dan
--           selalu benar). Hasil dibatasi maksimal 20 baris. Hanya
--           service_role yang boleh menjalankan.
-- BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
--    1. Mulai transaksi
--    2. Fungsi match_chunks: kolom hasil dan isi pencarian
--    3. Hak akses: hanya service_role yang boleh menjalankan
--    4. Keterangan fungsi
--    5. Selesai
-- KALAU DIMINTA MENGUBAH:
--    - Mengubah jumlah maksimal hasil (20): BAGIAN 2
-- ============================================================================

-- ===== BAGIAN 1: Mulai transaksi =====
-- 003_match_chunks.sql
-- PlacidWay Knowledge Chatbot, migration 003.
--
-- The retrieval function. The API server embeds the visitor's question, then calls
-- this function through PostgREST (POST /rest/v1/rpc/match_chunks) and gets the
-- closest chunks back. Vector search only: with about 150 rows an exact scan is
-- instant and always returns the true nearest chunks, so there is no vector index.
--
-- Cosine distance (the <=> operator) matches how the vectors are made: they are
-- L2-normalized, so ranking by cosine distance is the same as ranking by dot product.
-- similarity = 1 - distance, so 1 means identical meaning and values near 0 mean unrelated.
--
-- Security stays as in migration 001:
--   * security invoker (default) and an empty search_path, so nothing can be hijacked
--     through a look-alike object. Because the path is empty, every name is schema-qualified
--     and the pgvector operator is written as operator(extensions.<=>).
--   * EXECUTE is revoked from everyone except service_role.
--   * The function only reads public page content.
--
-- Run once in the Supabase SQL Editor. Safe to re-run (create or replace).
begin;

-- ===== BAGIAN 2: Fungsi match_chunks: kolom hasil dan isi pencarian =====
create or replace function public.match_chunks(
  query_embedding extensions.vector(384),
  match_count     integer default 5
)
returns table (
  id            text,
  page_no       smallint,
  source_url    text,
  h1            text,
  section       text,
  kind          text,
  text          text,
  page_modified date,
  similarity    double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.page_no,
    c.source_url,
    c.h1,
    c.section,
    c.kind,
    c.text,
    c.page_modified,
    1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.chunks c
  where c.embedding is not null
  order by c.embedding operator(extensions.<=>) query_embedding
  -- A caller can never ask for more than 20 rows, and never fewer than 1.
  limit greatest(1, least(match_count, 20));
$$;

-- ===== BAGIAN 3: Hak akses: hanya service_role yang boleh menjalankan =====
revoke all on function public.match_chunks(extensions.vector, integer)
  from public, anon, authenticated;
grant execute on function public.match_chunks(extensions.vector, integer)
  to service_role;

-- ===== BAGIAN 4: Keterangan fungsi =====
comment on function public.match_chunks(extensions.vector, integer) is
  'Nearest chunks to a question embedding (cosine). Called by the API server only.';

-- ===== BAGIAN 5: Selesai =====
commit;
