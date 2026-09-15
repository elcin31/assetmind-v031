# AssetMind v2

Risk-first portfolio intelligence tool (MVP).

## Architecture

```text
Browser → Vercel Serverless API → Supabase / Finnhub
```

- Transactions are the source of truth.
- Positions are derived with weighted average cost (WAC).
- Supabase and Finnhub secrets stay server-side.
- The app opens without login. All visitors read and write the shared portfolio selected by server-only `DEFAULT_PORTFOLIO_ID`.
- `portfolioValue` is the marked-to-market value of **open holdings**, not a cash-inclusive account balance.

## Project structure

| Directory | Contents |
|-----------|----------|
| `src/` | React entry point, app and shared styles |
| `src/pages/` | Portfolio screen |
| `src/components/` | Portfolio cards, holdings, search and transaction form |
| `src/math/` | Positions, P&L, returns and risk calculations |
| `src/types/` | Shared TypeScript types |
| `src/utils/` | Formatting helpers |
| `api/` | Vercel API routes; transaction endpoint in `api/portfolio/` |
| `server/` | Server-only portfolio selection, Supabase and market-data helpers |
| `tests/` | Financial calculation tests |
| `supabase/` | Database schema and hardening SQL |
| `public/` | Static images and icons served by Vite |
| `docs/` | Project review and Supabase handoff |

Build configuration, `index.html`, `package.json` and environment examples stay at the repository root.
Keep server-only helpers in `server/`; browser code belongs in `src/`.

Further documentation: [project review](docs/PROJECT_REVIEW.md) and [Supabase handoff](docs/SUPABASE_HANDOFF.md).

## Deployment

Пошаговая инструкция: [DEPLOYMENT_RU.md](docs/DEPLOYMENT_RU.md).

## Requirements

- Node.js 22.22.2+ (22.x) or 24.15.0+ (24.x)
- npm 12.0.2
- Vercel CLI for full local API testing

The runtime range matches the pinned npm installer used in CI and Vercel.

## Setup

```bash
npm install --global npm@12.0.2
npm ci
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
| `DEFAULT_PORTFOLIO_ID` | UUID of the shared portfolio; required, no automatic selection |
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

Run `supabase/seed_demo.sql` once, or select an existing portfolio explicitly.
Set its returned UUID as `DEFAULT_PORTFOLIO_ID` in Vercel.

### Existing project

Review and run `supabase/harden_existing.sql` before deploying the updated transaction API.

## Open access

No login, invite code or Authorization header is required. Every visitor can read and add transactions to the same configured portfolio. Client-supplied portfolio IDs are ignored. Missing or malformed server configuration returns 503 instead of selecting an arbitrary portfolio. Supabase credentials and direct database access remain server-only.

Existing invite rows are retained as unused legacy data; the app no longer reads them.

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

`package-lock.json` is committed. Use `npm ci` for reproducible installations. GitHub Actions runs the verification commands on pushes and pull requests.

## Supabase verification

This repository does not prove that a live Supabase project has been configured. After applying SQL and environment variables, verify:

1. requests without credentials load only the configured shared portfolio;
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
- This is an intentionally shared, unauthenticated app. Separate private portfolios require a new identity and access model.
