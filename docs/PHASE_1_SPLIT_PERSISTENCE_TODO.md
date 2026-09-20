# Remaining split persistence wiring

This branch establishes the type, WAC, cash-neutral, Supabase schema, and row-codec foundations for explicit split events.

Before enabling split editing or relaxing actual-history safeguards, `src/storage/portfolio.ts` must be updated atomically so that:

1. canonical Supabase reads select `split_numerator,split_denominator` and include `SPLIT` rows;
2. validation accepts SPLIT only with a valid positive non-1 ratio and without trade quantity/price;
3. migration and mutation writes route SPLIT rows through `splitToCloudTransaction`;
4. retry equality compares ratio fields for SPLIT rows;
5. backup import/export preserves the discriminated transaction payload;
6. authenticated integration tests cover BUY → SPLIT → SELL round trips.

Do not expose partial UI support before those conditions are green. A half-wired corporate action is merely a very elaborate way to corrupt a portfolio.
