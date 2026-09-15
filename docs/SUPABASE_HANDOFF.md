# Supabase Handoff — AssetMind v2

This repository was reviewed without applying changes to a live Supabase project.

## Files

1. `supabase/schema.sql` — fresh-project schema, RLS, explicit service-role grants, atomic transaction RPC
2. `supabase/harden_existing.sql` — hardening SQL for an already-created AssetMind database
3. `.env.example` — required server environment variables
4. `server/` — server-only Supabase and market-data helpers
5. `api/` — Vercel functions

## Required env vars

```text
SUPABASE_URL=
SUPABASE_SECRET_KEY=
# Legacy fallback only:
# SUPABASE_SERVICE_ROLE_KEY=
DEFAULT_PORTFOLIO_ID=
FINNHUB_API_KEY=
```

## Access model

The frontend never receives Supabase credentials. No login is required: every visitor reads and writes the portfolio explicitly selected by server-only `DEFAULT_PORTFOLIO_ID`. The transaction RPC accepts `p_portfolio_id` from server configuration. Client IDs cannot override it.

Public tables have RLS enabled and no `anon`/`authenticated` policies. The server-side `service_role` is explicitly granted the table privileges it needs.

## Transaction RPC

`public.add_portfolio_transaction(...)` is `SECURITY INVOKER`, callable only by `service_role`, and performs the insert + position-validity check in one database transaction.

It first serializes retries for the same `(portfolio_id, client_request_id)` and returns the existing row when an identical request is repeated. Reusing the same idempotency key with a different payload is rejected.

It also acquires a PostgreSQL advisory transaction lock per `portfolio_id + symbol`, which prevents concurrent SELL requests from both validating against the same pre-sale quantity.

## Verification checklist

- [ ] Apply `schema.sql` on a fresh project, or `harden_existing.sql` on the existing project
- [ ] Confirm service-role Data API reads/writes work
- [ ] Confirm `anon` cannot read portfolios and transactions
- [ ] Confirm `anon` and `authenticated` cannot execute `add_portfolio_transaction`
- [ ] Select or seed a shared portfolio and configure DEFAULT_PORTFOLIO_ID
- [ ] Confirm `GET /api/portfolio` without credentials returns the portfolio
- [ ] Confirm client portfolio IDs cannot override server configuration
- [ ] Confirm valid BUY succeeds
- [ ] Confirm SELL larger than current position is rejected
- [ ] Confirm a backdated SELL that creates any negative historical quantity is rejected
- [ ] Fire two concurrent SELLs whose combined quantity exceeds the position; only a valid sequence may commit
- [ ] Confirm transaction currency must match portfolio base currency
- [ ] Retry the exact same POST with the same idempotency key; confirm only one row exists
- [ ] Reuse an idempotency key with a different payload; confirm it is rejected
- [ ] Confirm missing DEFAULT_PORTFOLIO_ID returns 503
- [ ] Confirm service role key is never present in client bundles

## Still requires live verification

- Supabase connectivity and grants
- RPC execution through PostgREST with the service-role client
- SQL behavior against existing production data
- Vercel environment variables
- Finnhub quota/plan behavior

Do not mark the database integration as production-verified until those checks have been run against the real project.
