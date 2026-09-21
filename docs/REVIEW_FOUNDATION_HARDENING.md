# Review foundation hardening

This follow-up addresses issues found in the 2026-09-21 production review.

## Scope

1. Make factual account history consume canonical `SPLIT` ledger rows instead of rejecting every split.
2. Keep provider-detected held splits unavailable when no matching canonical split exists.
3. Derive factual raw-price coverage from the first actually observed valuation bar, not from the requested 5-year window.
4. Reconcile the repository database bootstrap with the live Supabase schema and migration history.
5. Surface cloud/cache sync state explicitly instead of silently presenting stale local data as canonical.
6. Require CI before production merges through repository rules/branch protection.

## Safety rules

- No replacement Vercel project.
- No auth/storage rewrite.
- No change to weighted-average-cost methodology.
- No zero substitution for unavailable analytics.
- No proxy series presented as factual portfolio history.
- Database changes must be additive/idempotent and verified against the live `assetmind31` Supabase project before production use.
