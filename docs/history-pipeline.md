# Historical market data and analytics

Deployment target: `assetmind-v031-mpsk`, project ID `prj_0OQTvpMdNFAJFm2Ty0o536nHR7Qx`. Keep the existing Git integration; do not import a new project. Seven pre-existing projects were discovered linked to this repository. `scripts/vercel-target.mjs` cancels ignored builds and rejects direct builds unless VERCEL_PROJECT_ID matches this exact target; system environment variables must be enabled in the target project.

## Diagnosis

On 2026-09-16, live production `/api/history` returned HTTP 404 and `{"error":"Historical data unavailable","bars":[]}` for AAPL, AMD, PLTR, MSFT, NVDA, SPY and QQQ. `server/marketData.ts` hid every provider HTTP error, timeout, malformed response and no-data result behind the same cached empty array. This prevented distinguishing a plan restriction from legitimately missing history. The upstream HTTP status was not logged, so the old production response alone cannot establish the exact Finnhub failure.

A second independent defect was `performanceMetrics`: any one null/trade-affected return replaced the entire period's risk sample with an empty array.

## Provider and price basis

History stays behind `/api/history?symbol=...&period=...`. Search and quotes remain on Finnhub. History tries Finnhub `stock/candle`, then Yahoo Finance's server-side chart endpoint when Finnhub is unavailable. Each attempt has a six-second abort timeout; the frontend allows twenty seconds for the chain. Yahoo availability is not guaranteed: failures remain unavailable, with explicit provider diagnostics. There is no generated price series or arbitrary fill.

Both adapters deliberately use **split-adjusted close, excluding dividend reinvestment**. Finnhub daily candles document split adjustment. Yahoo's `quote.close` has the same basis; `adjclose` additionally adjusts dividends and is deliberately NOT substituted. Mixing that field into Finnhub series would create inconsistent returns. These are price-return analytics, not total shareholder return. Dividend/cash/corporate-action accounting remains a limitation of the existing transaction ledger. Historical quantities must be expressed in compatible split units; this change does not claim to reconstruct split events or account NAV.

References:
- https://finnhub.io/docs/api/stock-candles
- https://finance.yahoo.com/quote/AAPL/history/
- https://help.yahoo.com/kb/SLN28256.html

Periods use UTC calendar months: 1m, 3m, 6m, 1y, 2y, 5y, with end-of-month clamping. Normalization requires valid ISO dates, positive finite closes, no future dates, ascending dates; the last valid duplicate wins deterministically. No successful empty history is cached. An IPO can legitimately have less than the requested five years. A response whose first/last dates miss the requested boundaries by over ten calendar days is marked partial; an incomplete Finnhub result also triggers fallback and the longer available series is retained. Coverage metadata and UI coverage details report the actual range without inventing pre-IPO data.

The compatible success response retains `symbol`, `period`, `bars` and adds `provider`, `priceBasis`, `warnings`. A successful fallback reports the primary failure in warnings and server logs. Total failure returns `code`, `error`, `failures` with upstream statuses, never a success-shaped `bars: []`. Codes distinguish authorization, plan restriction, rate limit, timeout, malformed response, empty history, unavailable provider and missing configuration. HTTP 403 means access denied/possible plan restriction, not proof of the exact account entitlement.

Server and frontend deduplicate requests and cache successful data only. Retry adds `refresh=1`, evicts cached success and uses `no-store` to bypass browser caches. Rejected requests are removed immediately. The server never logs the provider key or request URL.

## Calendar and return streams

Portfolio valuation uses the union of **observed sessions as evidence**, then requires prices for every holding actually open on each date. It does not use calendar-day interpolation. A missing valuation drops that point and invalidates the outgoing interval, preventing an artificial multi-day daily return. Weekends and holidays absent from all input series never enter the calendar. An unconditional intersection followed by differencing would conceal missing sessions and bridge them; that approach is deliberately avoided.

Correlation/covariance and proxy returns intersect original **start-date/end-date pairs**, not just end dates. One missing trading close excludes the two affected daily intervals. Closed or not-yet-purchased positions do not invalidate valuations for otherwise complete active holdings.

`performance.returns` is a continuous investment-performance stream; `performance.riskReturns` contains all clean, potentially disconnected daily intervals. Trades are never external cash-flow guesses. A BUY inside 250 closes leaves 248 clean risk intervals, but TWR, cumulative return, CAGR, Calmar, linked return attribution and actual performance drawdown remain unavailable across the unknown-flow gap. Risk statistics and aligned benchmark regression retain those clean observations. This is a conditional sample of observed clean intervals; it cannot measure omitted trade-day risk.

Rolling statistics restart their warm-up after a break. They never label the last 20 disconnected observations a continuous 20-day window. Benchmark beta, alpha, tracking error and correlation use exactly aligned intervals; benchmark cumulative comparisons require continuity. Performance drawdown, trade-affected asset-value drawdown and current-holdings proxy drawdown are distinct. Proxy drawdown requires a continuous proxy series.

## Rate and risk conventions

Annual RF and MAR are **effective annual rates** converted as `daily = expm1(log1p(annual) / 252)`. Sharpe is `252 * mean(r - rf_daily) / annualized_sample_volatility`. Sortino uses the same numerator convention with MAR. Downside deviation is the conditional RMS of deviations **only below daily MAR**, annualized by sqrt(252); at least 20 total and two downside observations are required. This conditional-denominator convention differs from the full-sample lower partial moment convention.

CAGR requires a continuous cumulative series and at least 30 calendar days. Calmar requires both CAGR and nonzero negative maximum drawdown. Risk contributions decompose variance: `variance = w'Σw`, `MCR = Σw`, `RC_i = w_i*MCR_i`, `fraction_i = RC_i/variance`. Tests enforce `sum(RC) = variance` and `sum(fraction) = 1`. Covariance is annualized using 252 sessions.

## Verification

`npm ci`, `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, `npm run verify`.

`tests/history-pipeline.test.ts` uses deterministic synthetic fixtures only inside automated tests: five years (>1000 bars), three calendars, missing session, weekend, trade contamination, HTTP 401/403/429/500, fallback basis, no-data/malformed responses, normalization, retry, risk identities, benchmark identities and finite/unavailable formatting. Live verification must use the deployed API, not these fixtures.
