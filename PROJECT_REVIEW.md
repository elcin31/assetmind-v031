# AssetMind v2 — Code Review and Fix Report

Review date: 2026-09-14

## Scope

The project was reviewed across the React/Vite frontend, Vercel API functions, Supabase access model/schema, market-data integration, financial calculations, tests, and deployment configuration.

## Critical and high-impact issues fixed

| Area | Issue | Fix applied |
|---|---|---|
| Build boundaries | Server-only Supabase/Finnhub modules were inside `src`, so client TypeScript/build configuration could process Node-only code. | Moved server-only code to `server/` and added a dedicated API TypeScript config. |
| TypeScript | Type-only imports and project boundaries were inconsistent; strict mode was not enabled across the project. | Enabled strict checks and separated app/API/test/config projects. |
| Vite config | ESM project configuration relied on CommonJS-style `__dirname`. | Switched to `import.meta.url`-based path resolution. |
| Dependency compatibility | Vitest 3.x did not match the project's Vite 8 toolchain. | Upgraded Vitest to 4.1.11 and pinned top-level dependency versions. |
| Session restore | A saved invite code was read from `sessionStorage` but did not automatically reload the portfolio. | Added one-time portfolio restoration on app startup. |
| Credential leakage | Invite codes were sent in portfolio query strings. | All browser-facing API routes now use `Authorization: Bearer <invite-code>`. |
| API exposure | Search, quote, and history endpoints could be used without portfolio access. | Added invite authentication to all market-data routes. |
| Transaction race | SELL validation happened before insert, allowing concurrent requests to oversell the same position. | Added an atomic PostgreSQL RPC with transaction-scoped advisory locking per portfolio/symbol. |
| Backdated trades | A SELL could be validated against future BUYs and create an impossible historical negative position. | The RPC now validates the full chronological running quantity before commit. |
| Duplicate trades | A committed transaction could be duplicated when a client retried after a network timeout. | Added UUID idempotency keys, database uniqueness, retry serialization, and replay of identical requests. |
| Determinism | Equal-timestamp transactions had no complete deterministic order. | Ordering is now `timestamp`, `created_at`, then `id` in both API/database calculations and the position engine. |
| Partial market data | Missing quotes silently understated holdings value, allocation, and unrealized P&L. | Added valuation coverage metadata and UI warnings listing unpriced symbols. |
| Time input | `datetime-local` was initialized with UTC text, which shifts the intended local transaction time. | Added a local-time formatter before converting submitted values back to ISO timestamps. |
| Search/quote UX | Requests could race, stale search responses could overwrite newer ones, and quote calls were too eager. | Added debounce, abort handling, and stale-response protection. |
| Supabase security | Public-schema tables had no explicit RLS hardening and RPC execution permissions were too implicit. | Enabled RLS, restricted Data API grants to `service_role`, made the RPC `SECURITY INVOKER`, and revoked RPC execution from `PUBLIC`, `anon`, and `authenticated`. |
| Current Supabase keys | Server setup assumed only the legacy service-role environment variable. | Added preferred `SUPABASE_SECRET_KEY` support with a legacy fallback. |
| Financial semantics | UI called open-position market value “portfolio value,” even though no cash ledger exists. | Renamed user-facing metrics to “Holdings value” and documented the limitation. |
| Risk semantics | Historical risk calculations could be mistaken for actual historical portfolio NAV. | Documentation and code now explicitly describe the series as a current-holdings historical risk proxy. |

## Verification performed in this review

- Strict structural TypeScript checks were run for frontend and API/server code using local declaration stubs for unavailable npm packages.
- Core financial modules were compiled independently and exercised with manual assertions covering:
  - weighted-average cost;
  - realized P&L;
  - deterministic equal-timestamp ordering;
  - invalid/backdated SELL detection;
  - partial valuation metadata;
  - current-holdings historical value series;
  - volatility and Sharpe calculations.
- Client/server boundary searches were performed to ensure Node-only globals and server modules are not imported into browser code.
- Secret-handling paths were reviewed to ensure Supabase/Finnhub credentials stay server-side.

### Environment limitation

The execution environment could not reach the npm registry, so a real `npm install` could not complete. As a result, the exact repository toolchain (`typescript@6.0.2`, Vitest, oxlint, and Vite) could not be run end-to-end here. Before deployment, run the commands in the deployment checklist on a machine with registry access and commit the generated `package-lock.json`.

The Supabase SQL was reviewed statically but was not applied to a live project. Database behavior, grants, and RPC execution still require live verification.

## Remaining P0 / P1 improvements

### P0 — currency correctness

Finnhub quote values are currently treated as if they are already denominated in the portfolio base currency. This is safe only when supported instruments are actually priced in that currency. Before accepting international/multi-currency assets:

1. store instrument/listing currency metadata;
2. obtain FX rates for valuation time;
3. convert market values and P&L into `portfolio.base_currency`;
4. alternatively, explicitly restrict the MVP to instruments priced in the portfolio base currency.

Without this, a EUR- or GBP-priced listing can be numerically mixed into a USD portfolio.

### P0 — production rate limiting

Invite authentication prevents anonymous market-data proxying, but it does not prevent a leaked/guessed valid invite from exhausting Finnhub quota. Add distributed per-IP and per-invite rate limiting at the edge or with a shared store. In-memory function-instance state is not sufficient for this.

### P1 — true account NAV and performance

The current model has no cash ledger. A SELL realizes P&L but the sale proceeds are not represented as cash, so holdings value can fall to zero after a full liquidation even though the account still owns cash. For real portfolio performance, add:

- cash balances;
- deposits/withdrawals;
- dividends/fees/taxes as needed;
- split/corporate-action handling;
- daily NAV reconstruction;
- TWR and/or money-weighted return metrics.

### P1 — stronger authentication and token storage

Invite codes are bearer credentials and are stored in plaintext in the MVP database. For production, prefer user/session authentication or hash reusable access tokens so a database read does not immediately disclose active credentials. Add audit metadata such as creation, revocation, and last-used timestamps.

### P1 — provider failure semantics

The market-data layer currently maps many provider failures to “unavailable” values. Introduce typed provider errors so the API can distinguish:

- unknown/unsupported symbol;
- provider outage;
- rate-limit/quota exhaustion;
- invalid provider credentials;
- unavailable historical entitlement.

### P1 — integration and end-to-end tests

Add automated tests around:

- API authentication;
- transaction idempotency;
- concurrent SELL behavior against a test Postgres/Supabase instance;
- RLS/RPC permissions;
- missing quote behavior;
- session restore;
- search request races;
- transaction form retry after a simulated timeout.

## Deployment checklist

1. Use Node.js 22.12 or newer within the supported project range.
2. Run `npm install` and commit `package-lock.json`.
3. Run `npm run typecheck`.
4. Run `npm test`.
5. Run `npm run lint`.
6. Run `npm run build`.
7. Configure `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `FINNHUB_API_KEY` in Vercel.
8. Apply `supabase/schema.sql` for a new database, or carefully review/back up and apply `supabase/harden_existing.sql` for an existing database.
9. Verify the SQL/RPC checklist in `SUPABASE_HANDOFF.md` against the real Supabase project.
10. Verify both successful and failed Finnhub quote/history calls under the actual provider plan.
11. Add production rate limiting before exposing invite codes broadly.
12. Until FX conversion exists, restrict supported assets to the portfolio base currency.
