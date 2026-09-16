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
- Transaction-aware portfolio history, performance and benchmark dashboard
- Segmented laboratory for risk, diversification, attribution and stress scenarios
- Expandable holdings with position-level analytics
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

## Portfolio Analytics

AssetMind separates **transaction-aware historical asset value**, **actual observable price performance**, and **current-holdings risk models**. Analytics run locally in pure, typed TypeScript modules. Supabase Auth, user-scoped localStorage, persisted BUY/SELL types and the existing Weighted Average Cost engine are unchanged.

### Historical portfolio reconstruction

`src/math/portfolioHistory.ts` replays BUY/SELL in the same `timestamp → created_at → id` order as the position engine. For each end-of-day UTC valuation:

```text
q_i(t) = buys through t − sells through t
V(t) = Σ q_i(t) × close_i(t)
```

It includes previously closed symbols, multiple buys, partial sells and backdated operations. Today's quantities never replace historical inventory. A symbol needs a price only while held. Missing active-position prices omit that valuation; the next return stays unavailable instead of bridging the missing observation. Future prices and forward filling are never used.

The UI calls this **Историческая стоимость активов / Historical Portfolio Value**. It is the value of reconstructed positions, **not full account NAV**: there is no cash account.

### Performance, cash flows and TWR

```text
r_t = (V_t − V_(t−1) − CF_t) / V_(t−1)
Total Return = TWR = Π(1 + r_subperiod) − 1
CAGR = (1 + Total Return)^(365.25 / calendarDays) − 1
```

The current BUY/SELL ledger cannot distinguish a deposit from reinvestment of cash or identify withdrawals. Therefore **BUY/SELL notional is not treated as external cash flow**. `externalFlow: null` means unknown, not zero. Trade-free intervals measure observable price returns of the reconstructed holdings; intervals containing trades are unavailable. A selected period with any unknown return has no Total Return, TWR, CAGR, performance-based risk or return attribution. The UI explains why and allows choosing a trade-free period. No proxy silently substitutes for actual performance.

`flowAdjustedReturn` accepts explicitly known end-period external flows. It requires a correct flow-timing convention; it is not an exact intraday TWR estimator. `timeWeightedReturn` geometrically links supplied valid subperiod returns; exact flow-aware TWR needs valuations around every cash flow. The separate `CashEvent` boundary anticipates DEPOSIT, WITHDRAWAL, DIVIDEND and FEE without changing persisted transaction types. Dividends/fees are internal investment income/costs, not deposits/withdrawals.

CAGR requires at least 30 calendar days. Its formula explanation warns that annualizing short samples is unstable. Best/worst day and positive/negative day percentages use a complete selected daily-return series; flat days stay in the denominator.

Monthly returns compound available intervals within calendar months. Unknown intervals make the month unavailable. Boundary months may be partial and are labelled as such. Calendar YTD requires a valuation before January 1 and every elapsed month; an incomplete initial January cannot produce a fabricated YTD.

### Drawdown and recovery

Investment drawdown uses a chained return index W, so capital changes are not mistaken for losses:

```text
DD(t) = W(t) / max(W through t) − 1
```

Current/max drawdown, underwater chart and episodes expose start, bottom, recovery date, depth, duration and recovery duration. An episode starts on the first below-high observation and ends when the previous high is reached or exceeded. Durations are calendar days; recovery duration is from bottom to recovery. Open episodes remain unrecovered. The separate collapsible **asset-value drawdown** uses V directly and explicitly warns that trades affect it; it is not investment-risk drawdown.

### Risk and rolling metrics

| Metric | Convention / minimum |
| --- | --- |
| Volatility | Sample standard deviation × √252; ≥20 returns |
| Sharpe | `(252 × mean(r) − Rf) / volatility`; ≥20 returns |
| Downside deviation | `sqrt(mean(min(r − MAR/252, 0)^2)) × sqrt(252)`; ≥20 returns |
| Sortino | `(252 × mean(r) − MAR) / annual downside deviation`; ≥20 returns |
| Calmar | CAGR / absolute max investment drawdown; requires available CAGR and negative drawdown |
| VaR 95% | `max(0, −r_(ceil(.05n)))`, ascending returns; ≥20 returns |
| Expected Shortfall 95% | Mean loss in the same worst `ceil(.05n)` observations; ≥20 returns |
| Rolling volatility | Complete windows of 20 / 60 / 252 trading observations |
| Rolling Sharpe | Complete windows of 63 / 126 / 252 observations |

Rf and MAR are configurable annual **arithmetic** rates, default zero. Numerators use arithmetic annualized mean, not CAGR. Downside MAR is divided by 252, consistently with that convention. Near-zero denominators return null. Rolling warm-up and undefined windows are not plotted. A 20-point minimum is a gate, not a claim of statistical reliability; VaR/ES are particularly unstable with small samples.

### Diversification and current-composition risk

Returns are aligned by **both start and end dates**. We never pair a multi-day return from a sparse series with a one-day return ending on the same day. A matrix uses the same common sample for every holding (minimum 20 intervals); missing holdings are not silently dropped.

```text
correlation_ij = Cov(R_i, R_j) / (sd_i × sd_j)
Σ_annual = sampleCovariance × 252
portfolioVariance = wᵀΣw
portfolioVolatility = sqrt(wᵀΣw)
MCR_i = (Σw)_i / portfolioVolatility
RC_i = w_i × MCR_i
riskShare_i = RC_i / ΣRC
Diversification Ratio = Σ(w_i × sd_i) / portfolioVolatility
```

Current market weights require all quotes. Sum of RC equals portfolio volatility; negative contributions can reflect hedging. The matrix shows correlations and a collapsible annual covariance table in squared decimal-return units. Correlation is undefined for zero-variance assets, so a joint correlation/covariance panel is unavailable in that case. A pure portfolio-variance function also validates symmetry and positive semidefiniteness. Average correlation is the unweighted mean of unique asset pairs, with no arbitrary good/bad label. HHI/effective positions measure concentration separately from correlation.

The previous fixed-quantity series remains as `buildCurrentHoldingsRiskProxy` (legacy alias retained) and **Исторический риск текущего состава · proxy**: how today's quantities would have behaved on historical prices. Its volatility/Sharpe are explicitly model metrics, never historical portfolio performance.

### Benchmark

SPY is the default; QQQ, DIA and IWM are selectable. Prices use the existing market-history API and shared client cache. The comparison compounds portfolio and benchmark returns from the same start at 100, only with uninterrupted common intervals.

- **Beta:** `Cov(Rp, Rm) / Var(Rm)`.
- **Jensen Alpha:** `252mean(Rp) − [Rf + Beta × (252mean(Rm) − Rf)]`.
- **Tracking Error:** `sampleStdev(Rp − Rm) × sqrt(252)`.
- **Information Ratio:** `252mean(Rp − Rm) / Tracking Error`.

Regression/risk metrics require ≥20 matched intervals. Identical series give Beta 1, Alpha 0 and tracking error 0; Information Ratio is unavailable when tracking error is zero. This is **price-return** comparison, not dividend-reinvested total return.

### Attribution and scenarios

P&L attribution reuses WAC, includes closed symbols and shows realized, unrealized and total lifetime P&L. Missing live quotes make the affected total unavailable. Contributors/detractors are sortable and visualized with horizontal bars.

Return attribution is separate: `c_i,t = weight_i,t−1 × return_i,t`. It uses reconstructed beginning weights and links contributions with preceding cumulative wealth, `C_i = Σ W_t−1 c_i,t`. This makes the sum equal compounded portfolio return. It is available only for a complete selected period without unknown flows.

Simple stress sliders and per-asset shocks use `V′ = Σ V_i(1 + shock_i)` with current market values. Presets fill shocks only:

- broad sell-off: −15% for all holdings;
- technology correction: −25% for user-selected group, −8% for others;
- high-volatility shock: −35% for user-selected group, −12% for others;
- custom/reset: zero shocks before user edits.

Group membership is explicitly selected by the user, not guessed from tickers. Every scenario says **Гипотетический сценарий, не прогноз**. No transactions are changed.

### Interface and data flow

Overview prioritizes value, history, four performance/risk metrics, benchmark, P&L contributors, allocation and open positions. Laboratory renders one of six sections: Доходность, Риск, Диверсификация, Атрибуция, Сценарии, Рынок. Holdings expand into P&L, return, weight, risk contribution, volatility, correlation with the **current-holdings proxy**, Beta and the existing PriceChart.

`calculatePortfolioAnalytics` produces view models; components do not build covariance matrices or replay transactions. A public-market-data cache deduplicates in-flight requests and caches successful symbol/period responses for five minutes, with bounded entries and failed-request eviction. Analytics load up to 5 years once per symbol, including closed symbols and the benchmark; period/tab switches reuse those prices. PriceChart shares the cache while retaining its periods, cursor and TradingView fallback.

Supported portfolio periods: 1M / 3M / 6M / YTD / 1Y / ALL. The last available close preceding the period boundary is included as a baseline. **ALL means all available API history, at most 5 years**, not a lifetime guarantee. Actual date range and observation counts are displayed. Loading, empty, insufficient, provider-error and partial-data states remain distinct. Tables/heatmaps scroll inside their containers on narrow screens; unavailable numbers use `—`, never fabricated zeros.

### Methodological limits

- No cash ledger, external flow classification, dividend/fee history or full account NAV. Known price returns are not net total returns.
- UTC day grouping cannot resolve intraday execution/flow timing. Returns start from the first reconstructed close, not the first trade execution price.
- No split/corporate-action ledger, historical FX conversion or provider adjustment metadata. Inventory reconstruction assumes prices and recorded quantities use compatible units; affected securities need validated price/transaction history before relying on results.
- Provider observations define the trading calendar. There is no exchange-calendar service; simultaneous missing dates across every series cannot be detected. No forward fill, interpolation or look-ahead is performed.
- Provider coverage may start after the first transaction, end before today or be unavailable for a closed/delisted ticker. The displayed range is authoritative. PriceChart's TradingView fallback does not supply analytics prices.
- Current-composition covariance/proxy risk and historical performance are different models. Return attribution and monetary P&L use different time horizons, clearly labelled.
- All newly exposed ratios validate inputs and return null for insufficient/invalid data or near-zero denominators. No optimizer, options analytics, Monte Carlo or AI recommendations are included.

### Verification

```bash
npm ci
npm run typecheck
npm test
npm run lint
npm run build
npm run verify
```

Unit/integration tests cover historical inventory/order, missing/future data, flow-adjusted returns, TWR/CAGR/monthly/YTD, drawdown episodes, downside/ratios/tails, correlation/covariance/variance/RC identities, benchmark identities, attribution, scenarios, numerical guards and shared-cache behavior.

Optional browser regressions (Playwright with Chromium installed):

```bash
node tests/browser/analytics.mjs
node tests/browser/search-selection.mjs
```

The scripts start isolated Vite fixtures. `PLAYWRIGHT_MODULE_PATH` and `BROWSER_EXECUTABLE` may select runtime-owned installations. Analytics checks cover 320/375/390/430/768/1440 px, navigation, periods, benchmark, scrubber, holding details, scenarios, request deduplication, empty/partial/provider-error states and console exceptions. Fixtures use synthetic market data; they do not validate live provider credentials, subscription access or authenticated production sessions.

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
├── analytics/     Shared history cache, analytics hook and metric explanations
├── math/          Pure history, performance, risk, diversification, benchmark and attribution modules
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
- reconstructed historical asset value excludes cash; transaction-aware positions do not imply full account NAV
- HHI/effective-position metrics do not model asset correlations
- market valuation and historical analytics depend on external market-data availability

## Data model direction

A natural next architectural step is to move portfolio persistence from browser-only storage to Supabase Database while keeping local storage as an optional cache/offline layer.

A cloud-backed version would allow authenticated users to access the same portfolios and transactions across devices, but that migration is **not implemented in the current repository yet**.

---

AssetMind is an actively developed personal investment analytics project. Financial calculations, scenarios and market data are provided for analytical purposes and should not be treated as investment advice.
