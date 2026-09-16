# AssetMind

AssetMind is a personal investment portfolio tracker and quantitative analytics workspace built with React, TypeScript and Vite.

It combines authenticated cloud-backed portfolio storage, live market data, transaction-aware analytics, risk research, capital planning and account backup in one responsive interface.

## Current architecture

| Area | Implementation |
| --- | --- |
| Authentication | Supabase Auth |
| Registration / login | Email + password |
| Sessions | Persisted and auto-refreshed by Supabase |
| Password recovery | Supabase recovery flow |
| Portfolio storage | Supabase Database is canonical; validated localStorage is a cache/offline fallback |
| Cross-device sync | Supported through the authenticated Supabase account |
| Trades | BUY / SELL transaction ledger |
| Cash ledger | DEPOSIT / WITHDRAWAL / DIVIDEND / FEE |
| Target allocation | Persisted per portfolio |
| Analytics preferences | Persisted per user |
| Market quotes/search | Finnhub through server-side Vercel API routes |
| Historical prices | Server-side adjusted-price history with explicit provider failures and fallback |
| Quant analytics | Pure typed TypeScript calculation layer |
| Deployment target | Existing Vercel project `assetmind-v031-mpsk` |

The production Vercel project is intentionally fixed to:

```text
assetmind-v031-mpsk
project id: prj_0OQTvpMdNFAJFm2Ty0o536nHR7Qx
```

Do not create replacement projects or deploy this repository to `assetmind-v031` without the `-mpsk` suffix.

## Features

- Supabase email/password authentication
- sign up, sign in, sign out and password recovery
- cloud-backed portfolio synchronization
- validated local cache and legacy localStorage migration
- BUY and SELL transaction tracking
- DEPOSIT, WITHDRAWAL, DIVIDEND and FEE cash events
- weighted-average cost basis and realized/unrealized P&L
- reconciled cash balance and account value
- XIRR / money-weighted return
- target allocation and rebalance deltas
- pre-trade What-If analysis
- live quotes and ticker/name search
- historical adjusted-price data through `/api/history`
- interactive price charts and TradingView visual fallback
- transaction-aware historical portfolio reconstruction
- TWR / Total Return / CAGR when the observable return chain is complete
- volatility, Sharpe, Sortino, Calmar, VaR and Expected Shortfall
- rolling volatility and rolling Sharpe
- drawdown and recovery analysis
- correlation/covariance matrices
- variance-based risk contribution decomposition
- benchmark analytics against SPY / QQQ / DIA / IWM
- P&L and return attribution
- configurable stress scenarios
- current-holdings historical risk proxy
- long-only minimum-variance research portfolio
- effective risk-bet diagnostics
- historical worst-window stress for the current-holdings proxy
- full account JSON backup and conflict-safe restore
- backward-compatible import of legacy trades-only backups
- lazy-loaded Laboratory workspace
- application error boundary for render/runtime recovery
- light and dark themes
- responsive desktop/mobile interface

## Supabase integration

Supabase is used for both authentication and portfolio persistence.

### Authentication

`AuthProvider` gates the application behind a valid authenticated session. Supabase Auth handles:

- account registration
- login
- persisted sessions
- token refresh
- optional email confirmation
- sign out
- password-reset email
- recovery callbacks
- password updates in recovery mode

### Portfolio data

The authenticated user owns a cloud portfolio. Supabase stores:

- portfolio metadata
- BUY / SELL operations
- cash events
- target allocation
- analytics preferences

Row-level access is scoped by the authenticated user. The browser keeps validated user-scoped local data as a cache/offline fallback rather than as the canonical database.

### Local cache and migration

Current local portfolio cache key:

```text
assetmind:<user-id>:portfolio.v1
```

Older builds used:

```text
assetmind.portfolio.v1
```

Valid legacy data can be migrated into the authenticated user's private cache and then synchronized to the cloud portfolio. Writes are serialized with Web Locks where required, request IDs are idempotent, and corrupted data is not silently overwritten.

## Transactions and capital ledger

### Trades

BUY and SELL operations remain strongly typed trading transactions. Positions are derived from the ledger and are never stored as an independent source of truth.

SELL quantity cannot exceed the position available at that point in transaction history.

### Cash events

Cash operations are deliberately separate from BUY/SELL:

```text
DEPOSIT
WITHDRAWAL
DIVIDEND
FEE
```

The cash ledger reconciles those events with trade notionals. It does not invent missing funding. If historical funding is insufficient for recorded purchases, the ledger is marked incomplete instead of silently assuming a deposit.

When current security valuation and the cash ledger are both complete:

```text
Account Value = Market Value of Securities + Reconciled Cash
```

### Money-weighted return / XIRR

XIRR uses dated external cash flows and the terminal account value. DEPOSIT and WITHDRAWAL are external investor flows; DIVIDEND and FEE remain internal investment income/cost.

The solver refuses unavailable, invalid or ambiguous cases instead of returning a fabricated rate.

## Target allocation, rebalancing and What-If

Target weights are persisted per portfolio. Any unassigned remainder to 100% is treated as target cash.

The rebalance model reports:

- current weight
- target weight
- target value
- value delta
- approximate quantity delta when a valid quote exists
- total allocation drift

It does not automatically execute trades.

Pre-trade What-If simulates a hypothetical BUY or SELL and shows the resulting cash, concentration and target drift. A BUY that exceeds reconciled cash is rejected by the model.

## Backup and restore

P3 introduced a full account backup format:

```text
assetmind-account-backup-YYYY-MM-DD.json
```

A full backup includes:

- portfolio metadata
- BUY / SELL transactions
- cash events
- target allocation
- analytics preferences

Restore is merge-oriented and idempotent for ledger records. Existing records are not silently deleted. Conflicting IDs or retry IDs are rejected before the corresponding write.

Legacy pre-P3 trades-only JSON backups remain importable.

## Market data

Market data is accessed through Vercel serverless endpoints:

```text
/api/search
/api/quote
/api/history
```

Finnhub remains the quote/search provider. Historical analytics use normalized adjusted-price history; provider authentication, permission, rate-limit, timeout, malformed-response and empty-history failures remain distinct instead of collapsing to an empty array.

Historical bars are normalized with these rules:

- uppercase symbols
- ISO dates
- finite positive close values
- ascending order
- duplicate dates removed
- no future bars
- UTC-safe day handling
- adjusted prices used consistently when available
- no forward fill
- no interpolation
- no synthetic zero-return gaps

PriceChart and analytics share the client history cache. Failed requests are evicted so retry actually performs a new request.

## Portfolio analytics

AssetMind deliberately separates three concepts:

1. **Historical Portfolio Value**: transaction-aware historical inventory valued on historical prices.
2. **Observable portfolio performance**: only return intervals that are mathematically known.
3. **Current Holdings Historical Risk Proxy**: today's quantities applied to historical adjusted prices.

They are not interchangeable.

### Historical portfolio reconstruction

For each UTC valuation day:

```text
q_i(t) = buys through t - sells through t
V(t) = Σ q_i(t) × P_i(t)
```

Closed symbols remain part of historical reconstruction while they were held. Missing active-position prices omit that valuation. The next return is not bridged across the missing observation.

### TWR / Total Return / CAGR

Known one-period return:

```text
r_t = (V_t - V_(t-1) - CF_t) / V_(t-1)
```

Cumulative return:

```text
TWR = Π(1 + r_t) - 1
```

CAGR:

```text
CAGR = (1 + TWR)^(365.25 / calendarDays) - 1
```

CAGR requires at least 30 calendar days.

Important limitation: the application has a cash ledger and XIRR, but exact intraday/subperiod TWR around every BUY/SELL still requires valuations around the trade/flow timing. A trade-contaminated interval therefore remains unavailable for exact cumulative TWR. Clean market-return intervals before and after it are still retained for risk analytics.

Unknown intervals are `null`, never zero.

### Risk metrics

Risk statistics use clean one-day return intervals only.

| Metric | Convention |
| --- | --- |
| Volatility | Sample standard deviation × √252 |
| Sharpe | Annualized excess arithmetic mean / annual volatility |
| Downside deviation | Downside observations relative to daily-equivalent MAR |
| Sortino | Annualized excess arithmetic mean / annual downside deviation |
| Calmar | CAGR / absolute max performance drawdown |
| VaR 95% | Historical empirical lower-tail loss |
| Expected Shortfall 95% | Mean loss in the same historical tail |

Annual Rf and MAR are converted to daily-equivalent rates consistently where required. Most risk/correlation calculations require at least 20 valid observations.

### Drawdown

Performance drawdown is calculated from the chained return index rather than raw account value so contributions are not automatically interpreted as investment gains/losses.

A separate asset-value drawdown can be shown, clearly labelled as affected by portfolio flows and position changes.

### Correlation and covariance

Asset return intervals are matched by both endpoints:

```text
(startDate, endDate)
```

No multi-day return is paired with a one-day return merely because they end on the same date.

Annual covariance:

```text
Σ_annual = sampleCovariance × 252
```

### Variance-based risk contributions

For current market weights `w`:

```text
portfolioVariance = w'Σw
MCR_i = (Σw)_i
RC_i = w_i × MCR_i
riskShare_i = RC_i / portfolioVariance
```

The implementation validates:

```text
Σ RC_i = portfolioVariance
Σ riskShare_i = 1
```

Negative contributions can occur for hedging assets.

### Benchmark analytics

Selectable benchmarks:

```text
SPY / QQQ / DIA / IWM
```

Metrics include:

- portfolio cumulative return when a continuous aligned chain exists
- benchmark cumulative return
- Beta
- Jensen Alpha
- Tracking Error
- Information Ratio

Regression metrics use exact common return intervals.

### Attribution

Lifetime monetary P&L attribution uses the existing weighted-average-cost engine.

Return attribution is separate and only available when the selected performance chain is complete enough to support beginning-period weights and linked contributions.

### Stress testing

Interactive scenarios revalue current holdings under user-defined shocks:

```text
V' = Σ V_i(1 + shock_i)
```

Presets only populate hypothetical shocks. They are not forecasts.

The historical stress engine also scans the Current Holdings Historical Risk Proxy for the worst contiguous compounded windows such as 1D, 5D, 20D and 63D. Windows never bridge missing return intervals.

## Portfolio Intelligence research

P2 adds research tools based on the observed covariance matrix.

### Long-only minimum-variance portfolio

The optimizer solves a long-only, fully-invested securities allocation on the exact common covariance sample:

```text
minimize w'Σw
subject to w_i >= 0
           Σ w_i = 1
```

The implementation uses projected optimization on the simplex and checks that the optimized variance does not exceed the current feasible portfolio variance within numerical tolerance.

It does **not** estimate expected returns and therefore does not pretend to produce a statistically meaningful max-Sharpe portfolio.

The panel compares:

- current vs minimum-variance weights
- current vs optimized volatility
- turnover
- diversification ratio
- effective risk bets

This is research output, not an investment recommendation.

## Data Quality Center

The UI distinguishes:

- provider failures
- partial current valuation
- insufficient clean portfolio intervals
- insufficient common asset intervals
- benchmark alignment sample
- current-holdings proxy sample
- cash-ledger completeness

Unavailable numbers render as `—`, not fabricated zeros.

## Interface and performance

Main sections:

```text
Overview
Assets
Trades
Laboratory
```

The Laboratory contains performance, risk, diversification, attribution, scenarios and benchmark/research views.

P3 lazy-loads the Laboratory bundle so the initial portfolio screen does not need to download the entire analytical workspace before first render.

`AppErrorBoundary` provides a recovery screen for unexpected render errors instead of leaving a blank application.

## Verification

Main verification pipeline:

```bash
npm ci
npm run typecheck
npm test
npm run lint
npm run build
npm run verify
```

`npm run verify` gates TypeScript, unit/integration tests, lint and production build.

Tests cover, among other things:

- historical transaction ordering and inventory
- missing/future market data
- history normalization and provider failures
- flow-adjusted performance
- drawdown
- risk ratios and tail risk
- exact interval correlation/covariance
- benchmark alignment
- variance risk-contribution identities
- cash reconciliation
- XIRR
- target allocation and rebalancing
- What-If cash constraints
- minimum-variance optimization
- gap-safe historical stress windows
- full-account backup validation
- idempotent/conflict-safe cash restore planning

Production dependency audit currently reports no high-severity production dependency vulnerability. Development/transitive tooling may report advisories that require breaking dependency changes and are therefore reviewed separately rather than force-upgraded blindly.

## Authentication configuration

Create `.env.local` for local development:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
FINNHUB_API_KEY=your-finnhub-api-key
```

Never put a Supabase `service_role` or other privileged secret in a `VITE_*` variable. Vite exposes `VITE_*` variables to the browser bundle.

## Local development

Requirements:

- Node.js 22+
- npm 12+

Install and run:

```bash
npm ci
npm run dev
```

Use Vercel's local environment when testing the serverless `/api/*` market-data routes.

## Project structure

```text
src/
├── auth/          Supabase authentication/session/recovery
├── analytics/     analytics controller, history cache and preferences
├── components/    portfolio UI, charts and analytical panels
├── data/          fallback instrument metadata
├── math/          pure portfolio/performance/risk/planning/research math
├── pages/         login and authenticated portfolio screens
├── storage/       cloud/local persistence, planning and account backup
├── theme/         light/dark theme persistence
├── types/         shared TypeScript models
└── utils/         formatting and helpers

api/               Vercel serverless search/quote/history endpoints
server/            server-side market-data providers and normalization
tests/             persistence, math and integration tests
scripts/           smoke and verification utilities
docs/              deployment and methodology notes
supabase/           Supabase-related project files and retained SQL/history
```

## Methodological limits

AssetMind intentionally reports unavailable data rather than filling gaps with convenient fiction.

Current limitations include:

- no historical FX conversion for multi-currency portfolios
- no dedicated corporate-action ledger for transaction quantities
- no exchange-calendar service; provider observations define available trading intervals
- exact intraday TWR around trades/flows is not reconstructed from end-of-day prices alone
- historical coverage depends on the upstream provider and may be shorter than a user's transaction history
- current-composition covariance, proxy stress and actual historical portfolio performance are different models
- the minimum-variance optimizer uses historical covariance only and has no expected-return model
- no options analytics or Monte Carlo engine
- no AI-generated trade recommendation is treated as quantitative fact

## Deployment

Production is deployed only to the existing Vercel project:

```text
assetmind-v031-mpsk
prj_0OQTvpMdNFAJFm2Ty0o536nHR7Qx
```

Environment variables:

```env
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
FINNHUB_API_KEY
```

See [`docs/DEPLOYMENT_RU.md`](docs/DEPLOYMENT_RU.md) for deployment notes.

---

AssetMind is an actively developed personal investment analytics project. Financial calculations, research portfolios, scenarios and market data are analytical tools and are not investment advice.
