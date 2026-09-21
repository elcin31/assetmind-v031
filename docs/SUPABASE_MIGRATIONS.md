# Supabase migration workflow

Production project: `AssetMind 31` (`qxajgfbacdoxwnssmjth`).

## Source of truth

`supabase/migrations/` is the canonical **incremental production migration history**. Do not make routine production DDL changes directly in the Supabase SQL/Table editor and then leave them untracked.

`supabase/schema.sql` is a **current bootstrap / disaster-recovery snapshot** of the production data model. It is not a second migration history and must not be applied on top of the existing production database. Likewise, do not bootstrap a fresh database from the current snapshot and then blindly replay every historical migration that led to that same snapshot.

For every schema change:

1. create a migration with the Supabase CLI (`supabase migration new <name>`);
2. review and test it locally;
3. commit the migration with the application change;
4. compare local/remote history with `supabase migration list`;
5. deploy the migration once through the linked production project;
6. verify the affected schema/policies with read-only SQL;
7. rerun Supabase Security and Performance Advisors after changes to tables, policies, functions, triggers, indexes, or grants;
8. update `supabase/schema.sql` when the production bootstrap snapshot changes materially.

Never use `supabase db reset --linked` against production.

## Current reconciled production history

The production project currently records these migrations in order:

- `20260909113417_add_unique_user_portfolio.sql`
- `20260915104028_fix_signup_portfolio_trigger_search_path.sql`
- `20260915104055_restrict_signup_portfolio_trigger_execution.sql`
- `20260916190000_portfolio_core_p0.sql`
- `20260917101444_phase0_supabase_function_security.sql`
- `20260917103508_phase1_transaction_integrity_guard.sql`
- `20260920095104_phase1_split_ledger.sql`
- `20260921121028_harden_rls_and_owner_index.sql`

The 2026-09-21 hardening migration makes browser access explicit and keeps the existing ownership model:

- client-facing policies target `authenticated`, not `PUBLIC`;
- ownership predicates use `(select auth.uid())`;
- UPDATE policies include both `USING` and `WITH CHECK`;
- `anon` table access is revoked;
- the legacy `positions` table remains unavailable to browser clients because positions are derived from the transaction ledger;
- the composite `transactions(portfolio_id, user_id)` foreign key has a covering index.

## Repairing history drift

`supabase migration repair` changes migration tracking only. It must be used only after verifying that the corresponding schema change is already present or absent as intended.

Phase 1 verified the live production objects before repairing the historical `20260916190000_portfolio_core_p0` entry: `executed_at`, `client_request_id`, `source`, analytics preferences, portfolio migration timestamp, and both portfolio transaction indexes were already present.

The earlier production-only migration files were reconstructed from the exact statements stored in `supabase_migrations.schema_migrations`:

- `20260909113417_add_unique_user_portfolio.sql`
- `20260915104028_fix_signup_portfolio_trigger_search_path.sql`
- `20260915104055_restrict_signup_portfolio_trigger_execution.sql`

After reconciliation, local and remote migration versions must match before another production schema deployment.

## Security rules

- All client-reachable tables in exposed schemas require RLS.
- Ownership policies must restrict rows by `(select auth.uid())`; `TO authenticated` alone is authentication, not authorization.
- UPDATE policies must keep ownership in both `USING` and `WITH CHECK`.
- Privileged trigger functions must use a fixed `search_path` and must not retain accidental `PUBLIC` / `anon` / `authenticated` execute grants.
- Browser grants must be explicit. `anon` receives no portfolio-data table access.
- Never expose a service-role or secret key to the browser.
- After any Auth or RLS change, rerun Supabase Advisors and record unresolved warnings intentionally rather than silently ignoring them.
