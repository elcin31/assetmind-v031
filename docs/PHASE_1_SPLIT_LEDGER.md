# Phase 1: split-aware security ledger

AssetMind treats stock splits as explicit ledger events. Provider-reported split metadata is never silently applied to user inventory.

## Invariants

- `SPLIT` carries an exact `split_numerator / split_denominator` ratio.
- A split changes share quantity by the ratio and average cost inversely.
- Total cost basis and realized P&L do not change at the split event.
- A split creates no cash movement.
- Post-split SELL validation uses split-adjusted inventory.
- Invalid or missing corporate-action history remains unavailable rather than being inferred.

## Persistence contract

Supabase `transactions` stores `SPLIT` rows with `quantity`, `price`, and `amount` as `NULL`, plus positive `split_numerator` and `split_denominator`. The database integrity trigger replays BUY/SELL/SPLIT rows chronologically before accepting mutations.

The application layer has separate split serialization helpers so cash-trade code cannot accidentally invent a notional for a corporate action. The remaining storage integration must include SPLIT rows in canonical reads and route SPLIT writes through that codec before the actual-history safeguard can be relaxed.
