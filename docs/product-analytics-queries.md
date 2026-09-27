# AssetMind product analytics

Run these queries only from a trusted SQL console or a server-side reporting job with restricted operator access. The browser client has `INSERT` access only; it cannot read event rows.

## DAU, WAU, MAU

```sql
select
  count(distinct user_id) filter (where created_at >= now() - interval '1 day') as dau,
  count(distinct user_id) filter (where created_at >= now() - interval '7 days') as wau,
  count(distinct user_id) filter (where created_at >= now() - interval '30 days') as mau
from public.analytics_events
where user_id is not null and event_name = 'app_open';
```

## Product funnel and adoption

```sql
with user_flags as (
  select user_id,
    bool_or(event_name = 'portfolio_created') as created_portfolio,
    bool_or(event_name = 'first_position_added') as added_first_position,
    bool_or(event_name = 'xray_view') as viewed_xray,
    bool_or(event_name = 'share_xray_clicked') as clicked_share,
    bool_or(event_name = 'share_xray_completed') as shared_xray,
    bool_or(event_name = 'demo_portfolio_started') as tried_demo
  from public.analytics_events
  where user_id is not null and created_at >= now() - interval '30 days'
  group by user_id
)
select count(*) as active_users,
  count(*) filter (where created_portfolio) as portfolio_created,
  count(*) filter (where added_first_position) as first_position_added,
  count(*) filter (where viewed_xray) as xray_users,
  count(*) filter (where clicked_share) as share_click_users,
  count(*) filter (where shared_xray) as share_completed_users,
  round(100.0 * count(*) filter (where viewed_xray) / nullif(count(*), 0), 1) as xray_adoption_pct,
  round(100.0 * count(*) filter (where shared_xray) / nullif(count(*) filter (where viewed_xray), 0), 1) as share_rate_pct
from user_flags;
```

## Demo to real portfolio conversion

```sql
with demo_starts as (
  select user_id, min(created_at) as started_at
  from public.analytics_events
  where event_name = 'demo_portfolio_started' and user_id is not null
    and created_at >= now() - interval '30 days'
  group by user_id
), conversions as (
  select distinct d.user_id
  from demo_starts d
  join public.analytics_events e on e.user_id = d.user_id
    and e.event_name = 'portfolio_created' and e.created_at > d.started_at
)
select count(*) as demo_users, (select count(*) from conversions) as converted_users,
  round(100.0 * (select count(*) from conversions) / nullif(count(*), 0), 1) as conversion_pct
from demo_starts;
```

## Weekly retention

Week 0 is each user's first recorded `app_open`. A user is retained for a week when they open the app again during that week.

```sql
with first_open as (
  select user_id, date_trunc('week', min(created_at)) as cohort_week
  from public.analytics_events
  where event_name = 'app_open' and user_id is not null
  group by user_id
), activity as (
  select distinct user_id, date_trunc('week', created_at) as active_week
  from public.analytics_events
  where event_name = 'app_open' and user_id is not null
)
select f.cohort_week, ((a.active_week - f.cohort_week) / interval '7 days')::int as week_number,
  count(distinct f.user_id) as retained_users
from first_open f join activity a on a.user_id = f.user_id
where a.active_week >= f.cohort_week and a.active_week < f.cohort_week + interval '5 weeks'
group by f.cohort_week, week_number
order by f.cohort_week desc, week_number;
```
