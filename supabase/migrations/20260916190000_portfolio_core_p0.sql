-- AssetMind Portfolio Core P0. Applied to production project assetmind31 first,
-- retained here so database changes remain reproducible.

alter table public.transactions
  add column if not exists executed_at timestamptz;

alter table public.transactions
  add column if not exists client_request_id text;

alter table public.transactions
  add column if not exists source text not null default 'manual';

update public.transactions
set executed_at = coalesce(executed_at, date::timestamptz, recorded_at, created_at, now())
where executed_at is null;

alter table public.transactions alter column executed_at set default now();
alter table public.transactions alter column executed_at set not null;

create unique index if not exists transactions_portfolio_client_request_uidx
  on public.transactions(portfolio_id, client_request_id)
  where client_request_id is not null;

create index if not exists transactions_user_portfolio_executed_idx
  on public.transactions(user_id, portfolio_id, executed_at, id);

alter table public.user_settings
  add column if not exists analytics_preferences jsonb not null
  default '{"period":"1Y","benchmark":"SPY","rf":0,"mar":0}'::jsonb;

alter table public.user_settings
  add column if not exists portfolio_migrated_at timestamptz;
