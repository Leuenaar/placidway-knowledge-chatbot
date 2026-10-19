-- ============================================================================
-- FILE MAP
-- FILE    : db/migrations/check_003_match_chunks.sql
-- PURPOSE : Checks after migration 003 and after `npm run ingest:load`. Each
--           query says what a good result looks like.
-- PARTS   : (in the code, search for the text PART n with Ctrl+F)
--    1. Neighbours of the chunk's own vector (good: the first row is
--       P2-price-1, similarity 1)
--    2. Who may run the function (good: service_role only)
--    3. Limit on the number of results (good: 20)
-- ============================================================================

-- ===== PART 1: Neighbours of the chunk's own vector (good: the first row is P2-price-1, similarity 1) =====
-- check_003_match_chunks.sql
-- Run in the Supabase SQL Editor AFTER 003_match_chunks.sql and after "npm run ingest:load".
-- Each query says what a good result looks like.
-- 1. Ask for the neighbours of a chunk's own vector.
--    Good: 3 rows, and the first row is P2-price-1 with similarity 1 (or 0.9999...).
select id, kind, round(similarity::numeric, 4) as similarity
from public.match_chunks(
  (select embedding from public.chunks where id = 'P2-price-1'), 3);

-- ===== PART 2: Who may run the function (good: service_role only) =====
-- 2. Who may run the function?
--    Good: service_role = true, anon = false, authenticated = false.
select
  has_function_privilege('service_role',  'public.match_chunks(extensions.vector, integer)', 'execute') as service_role,
  has_function_privilege('anon',          'public.match_chunks(extensions.vector, integer)', 'execute') as anon,
  has_function_privilege('authenticated', 'public.match_chunks(extensions.vector, integer)', 'execute') as authenticated;

-- ===== PART 3: Limit on the number of results (good: 20) =====
-- 3. The cap works: asking for 500 rows returns at most 20.
--    Good: 20.
select count(*) as rows_returned
from public.match_chunks(
  (select embedding from public.chunks where id = 'P2-price-1'), 500);
