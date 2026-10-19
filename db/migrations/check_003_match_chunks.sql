-- ============================================================================
-- PETA FILE
-- FILE    : db/migrations/check_003_match_chunks.sql
-- TUJUAN  : Pemeriksaan setelah migrasi 003 dan setelah `npm run
--           ingest:load`. Setiap query menyebut seperti apa hasil yang baik.
-- BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
--    1. Tetangga dari vektor chunk sendiri (baik: baris pertama P2-price-1, kemiripan 1)
--    2. Siapa yang boleh menjalankan fungsi (baik: service_role saja)
--    3. Batas jumlah hasil (baik: 20)
-- ============================================================================

-- ===== BAGIAN 1: Tetangga dari vektor chunk sendiri (baik: baris pertama P2-price-1, kemiripan 1) =====
-- check_003_match_chunks.sql
-- Run in the Supabase SQL Editor AFTER 003_match_chunks.sql and after "npm run ingest:load".
-- Each query says what a good result looks like.
-- 1. Ask for the neighbours of a chunk's own vector.
--    Good: 3 rows, and the first row is P2-price-1 with similarity 1 (or 0.9999...).
select id, kind, round(similarity::numeric, 4) as similarity
from public.match_chunks(
  (select embedding from public.chunks where id = 'P2-price-1'), 3);

-- ===== BAGIAN 2: Siapa yang boleh menjalankan fungsi (baik: service_role saja) =====
-- 2. Who may run the function?
--    Good: service_role = true, anon = false, authenticated = false.
select
  has_function_privilege('service_role',  'public.match_chunks(extensions.vector, integer)', 'execute') as service_role,
  has_function_privilege('anon',          'public.match_chunks(extensions.vector, integer)', 'execute') as anon,
  has_function_privilege('authenticated', 'public.match_chunks(extensions.vector, integer)', 'execute') as authenticated;

-- ===== BAGIAN 3: Batas jumlah hasil (baik: 20) =====
-- 3. The cap works: asking for 500 rows returns at most 20.
--    Good: 20.
select count(*) as rows_returned
from public.match_chunks(
  (select embedding from public.chunks where id = 'P2-price-1'), 500);
