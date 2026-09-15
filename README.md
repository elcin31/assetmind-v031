# AssetMind

AssetMind is a personal investment portfolio tracker and quantitative analytics workspace built with React, TypeScript and Vite.

It combines authenticated access, portfolio tracking, market data, interactive price charts and a synchronized quantitative laboratory in one responsive interface.

> **Current architecture:** Supabase is connected and actively used for authentication. Portfolio transactions are still stored locally in the browser, isolated by the authenticated Supabase `user.id`. Supabase Database is **not yet** the portfolio data store.

## Current status

| Area | Implementation |
| --- | --- |
| Authentication | Supabase Auth |
| Registration / login | Email + password |
| Sessions | Persisted and auto-refreshed by Supabase |
| Password recovery | Supabase recovery flow |
| Portfolio storage | Browser `localStorage`, scoped per authenticated user |
| Cloud portfolio sync | Not implemented yet |
| Market data | Finnhub through server-side Vercel API routes |
| Price charts | Internal historical-data chart + TradingView fallback |
| Quant analytics | Local TypeScript calculation layer |
| Deployment target | Vercel |

## Features

- Supabase email/password authentication
- Sign up, sign in, sign out and password recovery
- Authenticated-session gate before the portfolio interface is rendered
- User-scoped local portfolio storage
- BUY and SELL transaction tracking
- Weighted-average cost basis
- Position, allocation and unrealized P&L calculations
- Live quotes and historical market data through server-side endpoints
- Ticker/name search with a built-in fallback instrument catalog
- Interactive asset price charts with `1M`, `3M`, `6M`, `1Y` and `5Y` periods
- TradingView chart fallback when internal historical data is unavailable
- Portfolio laboratory synchronized with current positions
- Light and dark themes
- JSON backup export and validated import
- Responsive desktop/mobile interface

## Supabase integration

Supabase is already connected to the application through `@supabase/supabase-js`.

### What Supabase currently does

Supabase Auth provides:

- account registration with email and password
- login with email and password
- persisted sessions
- automatic token refresh
- email confirmation when confirmation is enabled in the Supabase project
- sign out
- password-reset emails
- password recovery callbacks
- password updates from recovery mode

`AuthProvider` is mounted at the application root, and `App` requires a valid session and authenticated user before rendering AssetMind.

### What Supabase does **not** currently do

Portfolio transactions, positions and backups are **not stored in Supabase Database yet**.

The authenticated Supabase user ID is used to isolate browser-local portfolio data:

```text
Supabase Auth
     ↓
session + user.id
     ↓
assetmind:<user.id>:portfolio.v1
     ↓
localStorage
```

As a result, logging into the same account on another browser or device does **not** currently restore the same portfolio.

This is an intentional description of the current code, not a cloud-sync claim disguised by sufficiently enthusiastic README wording.

## Portfolio storage

Transactions are the source of truth for the portfolio.

For an authenticated user, the storage key follows this format:

```text
assetmind:<user-id>:portfolio.v1
```

The application validates the user ID before accessing local portfolio data.

### Legacy-data migration

Older builds stored the portfolio under:

```text
assetmind.portfolio.v1
```

If a valid legacy portfolio exists and the authenticated user does not yet have user-scoped data, AssetMind attempts to move the legacy data into that user's private storage key and remove the legacy key.

The migration is designed to avoid intentionally deleting the original portfolio when isolation fails.

### Storage safety

- writes are validated before being saved
- current browsers must support Web Locks for serialized portfolio writes
- identical retry/request IDs are handled idempotently
- storage events refresh portfolio state in other tabs
- an internal `assetmind:changed` event refreshes the active tab after writes
- storage failures are surfaced instead of being reported as successful saves
- corrupted stored data is not silently overwritten

### Important local-storage limitations

Because portfolio data remains browser-local:

- portfolios do not automatically sync between devices
- different browsers have separate copies
- preview and production origins have separate storage
- clearing site data can delete the portfolio
- private/incognito browsing may discard data after the session ends

Regular JSON backups are recommended until cloud portfolio storage is implemented.

## Backup and import

AssetMind can export the current portfolio to:

```text
assetmind-backup.json
```

Imports are validated before modifying existing data.

The importer checks, among other things:

- backup version
- portfolio metadata
- transaction IDs
- ticker format
- transaction type
- quantity and price validity
- timestamps
- portfolio currency consistency
- duplicate request IDs
- historically invalid SELL operations

When importing into an existing portfolio, identical transaction IDs are skipped while conflicting transactions are rejected without intentionally changing the current dataset.

## Market data

Market data is accessed through Vercel serverless endpoints:

```text
/api/search
/api/quote
/api/history
```

The current provider is Finnhub and its API key remains server-side.

Market data powers:

- extended instrument search
- current quotes
- price charts
- historical portfolio-risk calculations

Local transactions remain usable when the market-data provider is unavailable.

If current quotes are missing, AssetMind reports an incomplete valuation instead of pretending historical trade prices are current market prices.

## Price charts

The application can display historical prices for:

- a selected search result in the Trade section
- current holdings in the Assets section

Supported periods:

```text
1M / 3M / 6M / 1Y / 5Y
```

When internal historical data cannot be rendered, AssetMind can display an official TradingView advanced-chart widget as a visual fallback.

The TradingView widget receives chart configuration such as the ticker, period and current theme. Portfolio quantities and transaction history are not supplied to the widget by AssetMind.

TradingView data may be delayed and does not feed AssetMind's valuation or risk calculations.

## Portfolio laboratory

The laboratory is synchronized with the current portfolio and operates on the current open positions.

### 1. Portfolio weights

AssetMind can calculate weights using either cost basis or complete current market value:

$$
w_i = \frac{V_i}{\sum_j V_j}
$$

Market-value weights are only shown when quotes are available for all open positions.

### 2. Herfindahl-Hirschman Index

Portfolio concentration is measured using:

$$
HHI = \sum_i w_i^2
$$

A value closer to `1` means stronger concentration.

### 3. Effective number of positions

AssetMind converts HHI into an intuitive equal-weight equivalent:

$$
N_{eff} = \frac{1}{HHI}
$$

This is a concentration measure only. It does not account for correlations between assets.

### 4. Stress scenarios

The laboratory can apply a hypothetical shock from `-80%` to `+80%` to one position or the entire portfolio:

$$
V' = \sum_i V_i(1+s_i)
$$

$$
\Delta V = V' - V
$$

Cost-basis scenarios are explicitly hypothetical. The model does not account for liquidity, commissions, FX effects or correlation changes during market stress.

### 5. Historical VaR 95%

For historical daily returns sorted from worst to best:

$$
k = \lceil 0.05n \rceil
$$

$$
VaR_{95} = \max(0,-r_{(k)})
$$

The metric represents an empirical one-day loss threshold from the available sample. It is not a maximum possible loss.

### 6. Expected Shortfall 95%

Expected Shortfall averages the worst 5% of observed daily returns:

$$
ES_{95} = \max\left(0,-\frac{1}{k}\sum_{i=1}^{k}r_{(i)}\right)
$$

### 7. Maximum drawdown

$$
MDD = \max_t\left(1-\frac{V_t}{\max_{s\le t}V_s}\right)
$$

This measures the largest peak-to-trough decline in the modeled historical value series.

### 8. Annualized volatility

Daily sample volatility is annualized using 252 trading days:

$$
\sigma_{ann}=\sigma_{daily}\sqrt{252}
$$

### 9. Sharpe ratio

The laboratory allows the user to adjust the annual risk-free rate:

$$
Sharpe = \frac{252\cdot\overline{r}_{daily}-r_f}{\sigma_{ann}}
$$

The current implementation uses a simple annual extrapolation of average daily return.

### Historical-model limitation

Historical portfolio metrics model **today's fixed holdings** against overlapping historical asset prices.

They do **not** reconstruct the actual historical NAV of the account from transaction dates, deposits, withdrawals or historical position sizes.

At least 21 common price observations are required before the historical-risk metrics are shown.

## Portfolio calculations

### Positions

Positions are derived from transaction history rather than stored as an independent source of truth.

BUY and SELL operations are processed chronologically. SELL quantities cannot exceed the position available at that point in history.

### Cost basis

Open positions use weighted-average cost accounting.

### Market valuation

When all required quotes are available, the application calculates current market value and unrealized P&L.

When one or more quotes are missing, valuation is marked incomplete rather than silently substituting trade prices.

## Authentication configuration

Create `.env.local` for local development:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase-publishable-or-anon-key
FINNHUB_API_KEY=your-finnhub-api-key
```

Or copy the included template:

```bash
cp .env.example .env.local
```

### Required variables

`VITE_SUPABASE_URL`

Supabase project URL used by the browser authentication client.

`VITE_SUPABASE_ANON_KEY`

Supabase public/publishable or legacy anon key used by the browser authentication client.

### Optional variable

`FINNHUB_API_KEY`

Used server-side for live quotes, extended search and historical market data.

### Security note

Never put a Supabase `service_role`, secret key or other privileged server credential in a `VITE_*` variable. Vite exposes `VITE_*` values to the browser bundle.

The Supabase public/publishable key is intended for client-side use. Authorization still depends on Supabase Auth configuration and, when database access is introduced, correct Row Level Security policies.

## Supabase dashboard configuration

For production authentication, configure Supabase Auth with the deployed AssetMind URL.

The project's Site URL and allowed redirect URLs must support:

- email-confirmation redirects
- password-reset redirects
- recovery callbacks

Whether sign-up requires email confirmation depends on the Supabase project's authentication settings and email delivery configuration.

## Local development

### Requirements

- Node.js `22.22.2+` or `24.15.0+`
- npm `12+`

Install dependencies:

```bash
npm ci
```

Start the Vite development server:

```bash
npm run dev
```

The plain Vite dev server is enough for the frontend, authentication and local portfolio functionality.

For the Vercel serverless market-data routes, use Vercel's local development environment.

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run typecheck
npm test
npm run test:watch
npm run lint
npm run smoke
npm run verify
```

`npm run verify` executes the main verification pipeline:

```text
TypeScript typecheck → tests → lint → production build
```

## Deployment

AssetMind is designed to deploy on Vercel.

Production environment variables:

```env
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
FINNHUB_API_KEY
```

`FINNHUB_API_KEY` must remain server-side.

After changing environment variables in Vercel, a new deployment is required for the frontend build to receive updated `VITE_*` values.

Additional deployment notes are available in [`docs/DEPLOYMENT_RU.md`](docs/DEPLOYMENT_RU.md).

## Project structure

```text
src/
├── auth/          Supabase authentication, session and recovery logic
├── components/    Portfolio UI, charts, search and laboratory components
├── data/          Built-in instrument data and local fallback search
├── math/          Positions, P&L, returns, volatility, Sharpe and lab math
├── pages/         Login and authenticated portfolio screens
├── storage/       Versioned local persistence, migration and backup logic
├── theme/         Light/dark theme persistence
├── types/         Shared TypeScript models
└── utils/         Formatting and shared helpers

api/               Vercel serverless search/quote/history endpoints
server/            Server-side market-data helpers
tests/             Persistence and financial-calculation tests
scripts/           Local verification/smoke utilities
docs/              Deployment and project documentation
supabase/          Supabase-related project files and retained SQL/history
```

## Tech stack

- React 19
- TypeScript 6
- Vite 8
- Supabase JS / Supabase Auth
- Vercel serverless functions
- Finnhub market data
- TradingView embedded charts
- Vitest
- Oxlint

## Current limitations

The current version deliberately does not claim capabilities that are not implemented.

- portfolio data is not yet stored in Supabase Database
- there is no cross-device portfolio synchronization
- there is no full cash ledger
- there is no deposit/withdrawal model
- there is no automatic FX conversion
- portfolios currently default to USD
- historical laboratory analytics are not a transaction-accurate historical NAV backtest
- HHI/effective-position metrics do not model asset correlations
- market valuation and historical analytics depend on external market-data availability

## Data model direction

A natural next architectural step is to move portfolio persistence from browser-only storage to Supabase Database while keeping local storage as an optional cache/offline layer.

A cloud-backed version would allow authenticated users to access the same portfolios and transactions across devices, but that migration is **not implemented in the current repository yet**.

---

AssetMind is an actively developed personal investment analytics project. Financial calculations, scenarios and market data are provided for analytical purposes and should not be treated as investment advice.
