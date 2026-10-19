-- ============================================================================
-- FILE MAP
-- FILE    : db/migrations/003_match_chunks.sql
-- PURPOSE : Migration 003: the search function match_chunks(vector, count).
--           The server embeds the question and calls this function through
--           PostgREST to get the nearest chunks. Cosine distance, no vector
--           index (about 150 rows, a full scan is instant and always correct).
--           The result is capped at 20 rows. Only service_role may run it.
-- PARTS   : (in the code, search for the text PART n with Ctrl+F)
--    1. Start the transaction
--    2. Function match_chunks: result columns and the search body
--    3. Access rights: only service_role may run it
--    4. Function description
--    5. Done
-- IF ASKED TO CHANGE:
--    - Change the maximum number of results (20): PART 2
-- ============================================================================

-- ===== PART 1: Start the transaction =====
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

-- ===== PART 2: Function match_chunks: result columns and the search body =====
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

-- ===== PART 3: Access rights: only service_role may run it =====
revoke all on function public.match_chunks(extensions.vector, integer)
  from public, anon, authenticated;
grant execute on function public.match_chunks(extensions.vector, integer)
  to service_role;

-- ===== PART 4: Function description =====
comment on function public.match_chunks(extensions.vector, integer) is
  'Nearest chunks to a question embedding (cosine). Called by the API server only.';

-- ===== PART 5: Done =====
commit;
