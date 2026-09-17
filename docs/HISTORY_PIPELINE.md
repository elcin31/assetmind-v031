# Historical market-data pipeline

AssetMind keeps historical price-provider logic on the server. React requests only:

```text
GET /api/history?symbol=...&period=...
```

Supported periods are `1m`, `3m`, `6m`, `1y`, `2y`, and `5y`.

## Providers

- **Finnhub:** live quote and instrument search provider. `/stock/candle` can be probed with the server-side diagnostics path, but provider/plan failures are not collapsed into an empty array.
- **Yahoo Chart:** historical analytics provider. AssetMind consumes the daily **adjusted close** series consistently for every historical symbol. This avoids mixing raw-close and adjusted-close histories across assets and prevents split/dividend adjustments from appearing as artificial risk spikes.

A historical-provider failure is represented explicitly as authentication, forbidden/plan restriction, rate limit, timeout, malformed response, empty history, HTTP failure, or symbol-not-found. Failed/empty requests are not retained as successful cache entries.

## Normalization

Before history reaches analytics it is normalized to:

- uppercase requested symbols;
- valid UTC `YYYY-MM-DD` dates;
- finite `close > 0` values;
- ascending order;
- one observation per date;
- no future dates;
- no forward filling, interpolation, synthetic prices, or zero returns for missing observations.

The current UTC day is excluded from the server request so an unfinished daily candle cannot enter daily analytics.

## Trading intervals

Weekends and exchange holidays are not gaps because analytics operate on provider trading observations, not calendar days.

Multi-asset statistics align returns by the exact pair `(startDate, endDate)`. If one asset misses a trading observation, only intervals that cannot be matched exactly are removed. The application never bridges that missing observation and never substitutes `0`.

## Actual account history

Production analytics reconstruct end-of-day account value from two explicit components:

```text
accountValue_t = cashBalance_t + Σ(quantity_i,t × adjustedClose_i,t)
```

The cash balance is transaction-aware:

- `BUY` reduces cash by the actual execution notional and increases holdings;
- `SELL` increases cash by the actual execution notional and reduces holdings;
- `DEPOSIT` and `WITHDRAWAL` are external cash flows;
- `DIVIDEND` and `FEE` change account performance as income/expense;
- no deposit is inferred from a purchase and no missing cash is fabricated.

If the explicit cash ledger would become negative, actual account performance is unavailable until the missing funding history is entered. The securities-only reconstruction remains a diagnostic/legacy calculation, not the production definition of actual portfolio performance.

## Performance versus risk returns

Return semantics are deliberately conservative:

1. **BUY/SELL are internal account transfers.** When the cash ledger is complete, they do not break an account return merely because holdings changed.
2. **DEPOSIT/WITHDRAWAL intervals are not assigned an exact TWR return from EOD data.** Exact TWR requires a portfolio valuation immediately around the external-flow timestamp. AssetMind does not silently impose an end-of-day timing assumption or label Modified Dietz as exact TWR.
3. **Missing-price intervals remain gaps.** They are never bridged and never converted to zero return.
4. **Historical risk returns** retain every clean observed account-return interval around those breaks, so one external flow or provider gap does not erase all usable risk observations.

MWR/XIRR remains a separate cash-flow-aware metric. It is not relabelled as TWR.

Current Holdings Historical Risk Proxy remains explicitly labelled as a proxy. Its return intervals are aligned by exact start/end dates and are never presented as actual transaction-aware performance.

## Return attribution boundary

Account-level performance can remain valid through internal BUY/SELL, but securities return attribution is intentionally narrower. AssetMind only publishes linked security return contributions when:

- holdings are unchanged after the selected baseline;
- no cash event changes the account after the baseline;
- baseline account value is fully explained by the priced securities (no unallocated cash component).

Otherwise return attribution is unavailable instead of forcing a securities-only decomposition onto a changing cash-aware account.

## Rate convention

Annual Rf and MAR inputs are treated as effective annual rates and converted to an equivalent trading-day rate:

```text
r_daily = (1 + r_annual)^(1/252) - 1
```

The same convention is used by Sharpe, Sortino, and benchmark alpha.

## Risk contribution

For annual covariance matrix `Σ` and current market weights `w`:

```text
portfolioVariance = w'Σw
MCR_i = (Σw)_i
RC_i = w_i × MCR_i
riskShare_i = RC_i / portfolioVariance
```

Tests enforce `Σ RC_i ≈ portfolioVariance` and `Σ riskShare_i ≈ 1`.
