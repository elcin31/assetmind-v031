# Planning and Portfolio Decisions

The Plan section only simulates changes. `PlanningPage` owns navigation and local
constraint controls; `planningDecisions.ts` and `rebalancing.ts` own pure
calculations. Existing target-allocation persistence and portfolio analytics remain
the source of targets and risk inputs.

## Model scope

- CASH target is the unallocated remainder to 100%. The current allocation uses
  reconciled cash and complete position market values. Targets remain persisted
  through the existing `updateTargetAllocation` function.
- Proposal drift reuses the existing half-sum absolute allocation difference. A
  minimum trade value filters small orders. Max position weight caps suggested
  buys. Minimum cash is a reserve, including when it requires additional sells.
  Buy-only and no-sell both disallow sells. No trade is ever submitted.
- New capital is budgeted separately; existing cash is not consumed. It can only
  suggest purchases of already-priced held symbols. The remainder stays in cash.
  Missing quotes do not become estimates; affected purchases are skipped.
- Proposed share quantity divides notional by the observed market price. Lot sizes,
  spreads, execution costs, taxes and market impact are not modeled.
- What-If supports quantity or notional entry and BUY/SELL. It calls the existing
  `simulateTradeWhatIf` for cash, account and oversell checks. Remaining holdings
  are marked at observed current quotes even if execution price differs. Unknown
  symbols cannot be valued from the entered execution price.
- Counterfactual risk uses the existing selected-window common covariance matrix,
  risk-contribution function and benchmark return engine. Cash is modeled as zero
  market-risk exposure; security covariance is unchanged by trade size. It is a
  current-holdings model, not reconstructed future portfolio history. Beta needs
  aligned benchmark intervals. Historical VaR 95% needs at least 60 observations.
  Metrics remain unavailable with a specific reason when inputs are insufficient.
- Minimum-Variance Research reuses the existing long-only optimizer, weights,
  volatility and one-sided turnover. Cash, target constraints, fees, taxes and lot
  sizes are outside this optimization. Solver iterations remain internal.

## Verification

`npm run verify` runs TypeScript, unit tests, lint, production-auth browser-script
syntax validation and build. `npm run e2e:overview` adds local fixture browser tests
for the main navigation and Planning across supported screen widths, target saving,
new capital, What-If, missing VaR and stale-result invalidation. It uses isolated
fixture data and does not require a production login or write production data.
