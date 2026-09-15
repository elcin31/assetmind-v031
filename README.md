# AssetMind

AssetMind is a personal investment portfolio tracker and analytics workspace built with React, TypeScript and Vite.

> **Supabase is connected and active.** AssetMind uses **Supabase Auth** for user registration, login, persistent sessions, email confirmation and password recovery. Portfolio transactions are currently stored in browser `localStorage`, isolated by the authenticated Supabase user ID.

It combines portfolio tracking, market data, price charts and a quantitative laboratory in one interface.

## Supabase integration

Supabase is part of the current application architecture, not a future placeholder.

**Currently used for:**

- email/password registration
- email/password login
- persisted authentication sessions
- email confirmation when enabled in the Supabase project
- password reset and recovery flows
- user identity used to isolate local portfolio storage

**Required client environment variables:**

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_or_anon_key
```

The portfolio database itself has **not** yet been moved to Supabase. Transactions remain local to the browser and are stored separately for each authenticated Supabase user. This distinction is intentional and prevents the README from pretending cloud synchronization exists when it does not.

## Features

- Email/password authentication with Supabase Auth
- Sign up, sign in, sign out and password recovery
- Local portfolio storage scoped to the authenticated user
- BUY and SELL transaction tracking
- Weighted-average cost basis and P&L calculations
- Live quote and historical-price integration through server-side API routes
- Asset search with a built-in fallback catalog
- Interactive price charts with 1M / 3M / 6M / 1Y / 5Y periods
- TradingView chart fallback when internal history data is unavailable
- Portfolio laboratory with quantitative risk and concentration metrics
- Light and dark themes with persisted preference
- JSON portfolio backup export and validated import
- Responsive interface for desktop and mobile

## Portfolio laboratory

The laboratory is synchronized with the current portfolio and includes:

- cost and market portfolio weights
- Herfindahl-Hirschman Index (HHI)
- effective number of positions
- per-asset and whole-portfolio shock scenarios
- historical daily VaR at 95%
- historical Expected Shortfall at 95%
- maximum drawdown
- annualized volatility
- Sharpe ratio with an adjustable risk-free rate

Historical risk metrics require sufficient overlapping price history. The current implementation models today's holdings against historical asset prices rather than reconstructing historical account NAV.

## Architecture

### Authentication

Authentication uses Supabase Auth through `@supabase/supabase-js`.

The app supports:

- email/password registration
- email/password login
- persisted sessions
- email confirmation when enabled in Supabase
- password reset and recovery links
- password updates from recovery mode

The application requires a valid authenticated session before the portfolio interface is rendered.

### Portfolio storage

Portfolio transactions are stored in browser `localStorage`, scoped to the authenticated Supabase user ID.

Supabase is currently used for authentication, not as the portfolio database.

This means:

- portfolio data does not automatically sync between devices
- clearing browser/site data can remove the local portfolio
- private browsing may discard data after the session ends
- exporting JSON backups regularly is recommended

Import validates data before applying changes, skips identical transaction IDs and rejects invalid conflicts without silently corrupting the existing portfolio.

### Market data

Market data is optional for the core transaction ledger but powers quotes, charts and historical risk analytics.

The Vercel API routes use:

```env
FINNHUB_API_KEY=your_finnhub_key
```

A small built-in instrument catalog keeps basic ticker/name search usable when the external provider is unavailable.

Missing quotes are treated as incomplete valuation rather than substituting transaction prices as fake current prices.

## Environment variables

Create a `.env.local` file for local development:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_or_anon_key
FINNHUB_API_KEY=your_finnhub_key
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required for authentication.

`FINNHUB_API_KEY` is required only for extended live market-data functionality.

Never place a Supabase service-role key or other private server credential in a `VITE_*` variable because Vite exposes those variables to the browser bundle.

## Local development

Requirements:

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

For local testing of Vercel API routes, use Vercel's local development environment instead of the plain Vite server.

## Verification

Run the complete verification pipeline:

```bash
npm run verify
```

This runs:

```text
TypeScript typecheck -> tests -> lint -> production build
```

Individual commands:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

## Deployment

The application is designed to deploy on Vercel.

Production must include the same required environment variables:

```env
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
FINNHUB_API_KEY
```

For Supabase Auth, configure the production site URL and allowed redirect URLs in the Supabase dashboard so email confirmation and password-recovery links return to the deployed AssetMind domain.

Additional deployment notes are available in [`docs/DEPLOYMENT_RU.md`](docs/DEPLOYMENT_RU.md).

## Project structure

```text
src/
├── auth/          Supabase authentication and session state
├── components/    Reusable interface components
├── data/          Local/static application data
├── math/          Portfolio, return and risk calculations
├── pages/         Main application screens
├── storage/       Versioned local portfolio persistence and backup logic
├── theme/         Appearance and theme state
├── types/         Shared TypeScript types
└── utils/         Shared helpers

api/               Vercel serverless market-data endpoints
server/            Server-side market-data helpers
tests/             Portfolio and calculation tests
supabase/          Supabase-related project files and historical SQL
```

## Data and calculation notes

- Transactions are the portfolio source of truth.
- Positions use weighted-average cost.
- Portfolio storage is user-scoped but remains browser-local.
- Market valuation can be incomplete when live quotes are unavailable.
- Historical risk metrics depend on available common price observations.
- The current model does not maintain a full cash ledger.
- The current model does not perform automatic FX conversion across currencies.

## Tech stack

- React 19
- TypeScript 6
- Vite 8
- Supabase Auth
- Vercel serverless functions
- Vitest
- Oxlint

---

AssetMind is currently an actively developed personal investment analytics project. Financial calculations and market data are provided for analytical purposes and should not be treated as investment advice.
