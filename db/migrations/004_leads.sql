-- ============================================================================
-- FILE MAP
-- FILE    : db/migrations/004_leads.sql
-- PURPOSE : Migration 004 (nice-to-have N4): the leads table for the name and
--           email of visitors who agree to be contacted about a quote. What is
--           stored: name, email, language, consent text version, time. No IP
--           and no chat content. Rows older than 90 days are deleted by
--           purge_old_leads(). The same security as the other tables.
-- PARTS   : (in the code, search for the text PART n with Ctrl+F)
--    1. Start the transaction
--    2. Table leads and the time index
--    3. Function that deletes leads older than 90 days
--    4. Security: RLS, revoke rights, grant service_role
--    5. Done
-- IF ASKED TO CHANGE:
--    - Change how long leads are kept (90 days): PART 3 and
--      LEAD_RETENTION_DAYS in apps/api/src/leads/store.ts
-- ============================================================================

-- ===== PART 1: Start the transaction =====
-- 004_leads.sql
-- Lead capture (nice-to-have N4): a visitor may leave a name and an email so the PlacidWay team can contact them about a quote.
--
-- What is stored: name, email, chat language, the version of the consent text they ticked, the time. No IP address, no session id,
-- no chat text. Rows older than 90 days are deleted by purge_old_leads(), which the API server calls at start and once a day.
-- Same wall as the other tables: RLS on with no policy, nothing granted to anon or authenticated, only service_role.
--
-- Safe to run twice. Run it once in the Supabase SQL editor (or any psql session as the owner) before the lead card is used.
begin;

-- ===== PART 2: Table leads and the time index =====
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

-- ===== PART 3: Function that deletes leads older than 90 days =====
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

-- ===== PART 4: Security: RLS, revoke rights, grant service_role =====
alter table public.leads enable row level security;

revoke all on table public.leads from public, anon, authenticated;
revoke all on sequence public.leads_id_seq from public, anon, authenticated;
revoke all on function public.purge_old_leads(interval) from public, anon, authenticated;

grant select, insert, update, delete on table public.leads to service_role;
grant usage, select on sequence public.leads_id_seq to service_role;
grant execute on function public.purge_old_leads(interval) to service_role;

-- ===== PART 5: Done =====
commit;
