# Supabase migration workflow

Production project: `AssetMind 31` (`qxajgfbacdoxwnssmjth`).

## Source of truth

`supabase/migrations/` is the canonical schema-change history. Do not make routine production DDL changes directly in the Supabase SQL/Table editor and then leave them untracked.

For every schema change:

1. create a migration with the Supabase CLI (`supabase migration new <name>`);
2. review and test it locally;
3. commit the migration with the application change;
4. compare local/remote history with `supabase migration list`;
5. deploy the migration once through the linked production project;
6. rerun Supabase Security Advisor after changes to tables, policies, functions, triggers, or grants.

Never use `supabase db reset --linked` against production.

## Repairing history drift

`supabase migration repair` changes migration tracking only. It must be used only after verifying that the corresponding schema change is already present (or absent, for a revert).

Phase 1 verified the live production objects before repairing the historical `20260916190000_portfolio_core_p0` entry: `executed_at`, `client_request_id`, `source`, analytics preferences, portfolio migration timestamp, and both portfolio transaction indexes were already present.

The earlier production-only migration files were reconstructed from the exact `statements` stored in `supabase_migrations.schema_migrations`:

- `20260909113417_add_unique_user_portfolio.sql`
- `20260915104028_fix_signup_portfolio_trigger_search_path.sql`
- `20260915104055_restrict_signup_portfolio_trigger_execution.sql`

After reconciliation, `supabase migration list` should have matching LOCAL and REMOTE versions for every file in `supabase/migrations/`.

## Security rules

- All client-reachable tables in exposed schemas require RLS.
- Ownership policies must restrict rows by `auth.uid()`; `TO authenticated` alone is not authorization.
- Privileged trigger functions must use a fixed `search_path` and must not retain accidental `PUBLIC`/`anon`/`authenticated` execute grants.
- Never expose a service-role or secret key to the browser.
