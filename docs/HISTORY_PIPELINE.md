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

## Performance versus risk returns

Two return concepts are deliberately separate:

1. **Cumulative investment performance** requires a continuous chain. A BUY/SELL interval with unknown external cash flow, or a missing-price interval, makes Total Return/TWR/CAGR unavailable across that break.
2. **Historical risk returns** retain every other clean one-day market-return interval. A single BUY/SELL does not erase a year of volatility, Sharpe, Sortino, VaR/ES, correlation, covariance, beta, or tracking statistics.

Current Holdings Historical Risk Proxy remains explicitly labelled as a proxy. Its return intervals are also aligned by exact start/end dates and are never presented as actual transaction-aware performance.

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
