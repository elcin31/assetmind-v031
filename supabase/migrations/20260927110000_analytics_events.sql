-- First-party product events. Users may only append their own events and can
-- never read this table through the client Data API.
begin;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  session_id text not null check (length(session_id) between 1 and 128),
  event_name text not null check (event_name in (
    'app_open', 'overview_view', 'xray_view', 'laboratory_view',
    'demo_portfolio_started', 'demo_portfolio_exited', 'portfolio_created',
    'first_position_added', 'position_added', 'transaction_created',
    'share_xray_clicked', 'share_xray_completed', 'benchmark_changed'
  )),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_event_name_idx on public.analytics_events (event_name);
create index if not exists analytics_events_user_id_idx on public.analytics_events (user_id);

alter table public.analytics_events enable row level security;
revoke all on table public.analytics_events from anon, authenticated;
grant insert on table public.analytics_events to authenticated;

drop policy if exists analytics_events_insert_own on public.analytics_events;
create policy analytics_events_insert_own
  on public.analytics_events
  for insert
  to authenticated
  with check (user_id is not null and (select auth.uid()) = user_id);

commit;
