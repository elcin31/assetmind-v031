# Overview dashboard

`PortfolioScreen` owns navigation and the shared analytics controller. `OverviewPage`
renders existing results; `analytics/overview.ts` contains presentation selectors
and deterministic attention rules. There are no new data requests, storage keys,
or changes to history reconstruction, WAC P&L, authentication, or analytics math.

## Metric scope

- Hero: current account value when available, otherwise explicitly labeled assets
  value. An incomplete valuation is unavailable, never replaced by cost basis.
- Monetary period change: last historical valuation minus the first historical
  valuation. This includes deposits/withdrawals and is labeled accordingly; it is
  not investment P&L. Return uses the existing flow-aware performance result.
- Benchmark: existing normalized comparison, only when complete factual performance
  and both selected-period endpoints match. No fragment is shown as a full period.
  Excess return is the difference of these matched returns, in percentage points.
- CAGR and Max Drawdown use the performance period. Sharpe and annualized Volatility
  use the existing actual-portfolio 20D/60D/1Y risk window. Proxy is not a fallback.
- Attribution uses existing lifetime WAC P&L: top three strictly positive or
  strictly negative results. Null and zero results are not ranked.
- Holdings show five positions, lifetime P&L and existing market-price/average-cost
  return. Allocation weights refer to securities, not securities plus cash.
- Allocation shows up to four labels: top three plus the combined remainder when
  needed. Full holdings and allocation remain in Holdings.

## Attention thresholds

At most three signals, severity descending, then stable rule order:

| Rule | MEDIUM | HIGH |
| --- | --- | --- |
| Missing market data | Missing history or history request errors | Incomplete current valuation |
| Largest securities weight | >=25% | >=40% |
| Largest model variance contribution | >=40% | >=60% |
| Existing rebalance-plan drift | >=5% | >=10% |
| Current factual drawdown from selected-period peak | >=10% decline | >=20% decline |

Drawdown of 5–10% is LOW. These are fixed product heuristics, not investment
recommendations. Risk contribution is explicitly labeled as a model of the current
holdings. Drift requires saved targets, reconciled cash and complete valuation.
History-dependent signals wait for loading to finish. A clean result means no
confirmed signals in available data, not a guarantee of low risk.

## Detailed views preserved

- Laboratory / Performance: factual history, formulas, CapitalSummary and XIRR/MWR.
- Laboratory / Risk: Sortino and Current Holdings Historical Risk Proxy.
- Laboratory / Diversification: covariance, Diversification Ratio, Average Correlation.
- Laboratory / Attribution and Market: full AttributionPanel and BenchmarkPanel.
- Laboratory / Data: DataQualityPanel, sample descriptions and diagnostics.
- Holdings: full HoldingsList and target allocation planning.

## Verification

- `npm run verify`: TypeScript, unit/analytics tests, lint, auth-test syntax and build.
- `npm run e2e:overview`: fixture-only browser checks at 320/375/390/430/768/1440,
  light/dark themes, all selectors, navigation, limits, preserved analytics tabs,
  cache reuse, empty portfolio, incomplete valuation, unavailable benchmark/history,
  unknown trade flows and large monetary values.
- Browser tests accept `PLAYWRIGHT_MODULE_PATH` and `BROWSER_EXECUTABLE` for an
  installed Playwright and Chromium. They start and stop their own Vite server.
  The exact expected missing-auth-config console message is ignored in this isolated
  fixture; other console errors and all page exceptions fail the run.

Deployment configuration is unchanged. The sole authorized production destination
is `assetmind-v031-mpsk` (`prj_0OQTvpMdNFAJFm2Ty0o536nHR7Qx`).
