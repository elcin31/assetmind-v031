-- Restored verbatim from production migration history.
-- Production already records version 20260909113417 as applied.

-- One portfolio per user for now (matches the client's single assetmind_portfolio_v2 blob).
-- Needed so upsert(...).onConflict('user_id') from the sync layer works.
alter table public.portfolios
  add constraint uq_portfolios_user_id unique (user_id);
