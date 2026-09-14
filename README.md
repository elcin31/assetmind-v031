# AssetMind v2

Risk-first portfolio intelligence tool (MVP).

## Architecture

```text
Browser → Vercel Serverless API → Supabase / Finnhub
```

- Transactions are the source of truth.
- Positions are derived with weighted average cost (WAC).
- Supabase and Finnhub secrets stay server-side.
- The invite code is treated as a bearer credential and is sent in the `Authorization` header, not in URLs.
- `portfolioValue` is the marked-to-market value of **open holdings**, not a cash-inclusive account balance.

## Requirements

- Node.js 22.12+
- npm
- Vercel CLI for full local API testing

Vite 8 supports Node 20.19+ / 22.12+, but this project standardizes on Node 22.12+ so the frontend and current server dependencies share one runtime baseline.

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local`, then use one of these modes:

```bash
# Frontend only. /api routes will not work by themselves.
npm run dev

# Full Vercel app including /api routes.
vercel dev
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Supabase secret key, server only (preferred) |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy service-role key fallback during migration |
| `FINNHUB_API_KEY` | Finnhub API key, server only |

Never prefix server secrets with `VITE_`.

## Database

### Fresh project

Run `supabase/schema.sql` in the Supabase SQL editor.

The schema:

- enables RLS on all public tables;
- grants Data API table access only to `service_role`;
- installs an atomic `add_portfolio_transaction` RPC;
- revokes that RPC from `PUBLIC`, `anon`, and `authenticated`;
- serializes writes per portfolio + symbol to prevent concurrent oversells;
- validates the complete chronological quantity history, including backdated transactions;
- makes transaction creation idempotent so a client retry cannot duplicate a committed trade.

Then seed a portfolio and invite code:

```sql
INSERT INTO public.portfolios (name, base_currency)
VALUES ('Demo', 'USD')
RETURNING id;

INSERT INTO public.invite_codes (code, portfolio_id, active)
VALUES ('am_your_secret_code_here', '<portfolio-uuid>', true);
```

### Existing project

Review and run `supabase/harden_existing.sql` before deploying the updated transaction API.

## API authentication

All browser-facing API routes require:

```http
Authorization: Bearer <invite-code>
```

The invite code is intentionally not placed in query strings because URLs are commonly captured by browser history, access logs, proxies, and observability tools.

## API contract

- `GET /api/portfolio`
- `GET /api/search?q=`
- `GET /api/quote?symbol=`
- `GET /api/history?symbol=&period=1y`
- `POST /api/portfolio/transaction`

Example transaction body:

```json
{
  "idempotencyKey": "0f91ed0f-3f94-4ed5-a717-020c2d796887",
  "transaction": {
    "symbol": "AAPL",
    "type": "BUY",
    "quantity": 10,
    "price": 200,
    "currency": "USD",
    "timestamp": "2026-09-14T10:00:00Z"
  }
}
```

## Financial model

Transactions → Positions (WAC) → Valuation → P&L → Allocation → Risk

Risk metrics use historical prices for the **current holdings mix**. They are a historical risk proxy, not a reconstruction of the portfolio's actual past NAV when quantities changed over time.

If a live quote is unavailable, the API returns valuation coverage metadata and the UI warns that holdings value, allocation, and unrealized P&L are partial instead of silently presenting them as complete.

## Verification

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

A `package-lock.json` should be committed after a successful `npm install`. Top-level dependency versions are pinned in `package.json`; the lockfile is still required to pin transitive dependencies.

## Supabase verification

This repository does not prove that a live Supabase project has been configured. After applying SQL and environment variables, verify:

1. inactive/invalid invite → 401;
2. valid BUY persists;
3. oversized SELL is rejected;
4. a backdated SELL that makes any historical position negative is rejected;
5. two concurrent SELL requests cannot oversell the same position;
6. retrying the exact same transaction with the same idempotency key returns the original row without creating a duplicate;
7. reusing an idempotency key with a different payload is rejected;
8. `anon` and `authenticated` cannot execute `add_portfolio_transaction`;
9. client bundles do not contain `SUPABASE_SECRET_KEY`, legacy `SUPABASE_SERVICE_ROLE_KEY`, or `FINNHUB_API_KEY`.

## Known MVP limitations

- Market prices are currently treated as if they are already denominated in the portfolio base currency. Before supporting non-base-currency listings, add instrument-currency metadata and FX conversion, or explicitly restrict supported instruments to the base currency.
- The model has no cash ledger, deposits, withdrawals, dividends, splits, or other corporate actions. `portfolioValue` therefore means open-holdings value, not total account NAV.
- Risk uses the current holdings mix over historical closes. True portfolio-performance analytics require daily cash-inclusive NAV reconstruction and cash-flow-aware return metrics.
- In-memory market-data caches are per server instance. Production scale should use shared caching and distributed rate limiting.
- Invite codes are MVP bearer credentials. A production authentication model should use stronger identity/session controls and store reusable access tokens in a non-plaintext form where practical.
