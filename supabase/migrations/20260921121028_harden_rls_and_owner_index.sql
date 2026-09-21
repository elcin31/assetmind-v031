-- Review hardening: preserve the existing owner-scoped access model while making
-- Data API exposure explicit, tightening UPDATE checks, and avoiding per-row
-- auth.uid() re-evaluation in RLS policies.

begin;

-- The composite FK transactions(portfolio_id, user_id) -> portfolios(id, user_id)
-- should have a matching leading-column index for validation/cascade work.
create index if not exists transactions_portfolio_owner_idx
  on public.transactions(portfolio_id, user_id);

-- Existing AssetMind data is private to signed-in users. Keep anon out even if
-- Data API default grants change on the Supabase platform.
revoke all on table
  public.profiles,
  public.portfolios,
  public.positions,
  public.transactions,
  public.user_settings
from anon;

-- positions is legacy/non-canonical; positions are derived from transactions.
-- Keep the table inaccessible from the browser until it has an intentional use.
revoke all on table public.positions from authenticated;

-- Explicit grants are required for browser-side supabase-js on projects where
-- new public tables are no longer auto-exposed to the Data API.
grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table
  public.portfolios,
  public.transactions,
  public.user_settings
  to authenticated;

alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.positions enable row level security;
alter table public.transactions enable row level security;
alter table public.user_settings enable row level security;

-- profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- portfolios
drop policy if exists portfolios_select_own on public.portfolios;
create policy portfolios_select_own
  on public.portfolios
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists portfolios_insert_own on public.portfolios;
create policy portfolios_insert_own
  on public.portfolios
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists portfolios_update_own on public.portfolios;
create policy portfolios_update_own
  on public.portfolios
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists portfolios_delete_own on public.portfolios;
create policy portfolios_delete_own
  on public.portfolios
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- transactions
drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own
  on public.transactions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists transactions_insert_own on public.transactions;
create policy transactions_insert_own
  on public.transactions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists transactions_update_own on public.transactions;
create policy transactions_update_own
  on public.transactions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists transactions_delete_own on public.transactions;
create policy transactions_delete_own
  on public.transactions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- user_settings
drop policy if exists settings_select_own on public.user_settings;
create policy settings_select_own
  on public.user_settings
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists settings_insert_own on public.user_settings;
create policy settings_insert_own
  on public.user_settings
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists settings_update_own on public.user_settings;
create policy settings_update_own
  on public.user_settings
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists settings_delete_own on public.user_settings;
create policy settings_delete_own
  on public.user_settings
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

commit;
