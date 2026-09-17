# Phase 0 — Production baseline

Date: 2026-09-17

## Scope

Phase 0 freezes and verifies the production baseline before broader product work. The goal is to ensure repository, CI, Vercel, Supabase, market-data routes and operational documentation refer to the same system before changing portfolio math or product architecture.

## Verified production identity

- GitHub repository: `elcin31/assetmind-v031`
- Baseline commit before hardening: `31e10094cd51edbebd9767748b0b7f36539e3c3c`
- Phase 0 merge commit: `bd2acdddaee5397a2c7996ec7f974a91bbd89c9a`
- Vercel project: `assetmind-v031-mpsk`
- Vercel project ID: `prj_0OQTvpMdNFAJFm2Ty0o536nHR7Qx`
- Production domain: `https://assetmind-v031-mpsk.vercel.app`
- Phase 0 production deployment: `dpl_3tVeqxwKYPN3cB3bjw7GmmQCXfXh`
- Production branch: `main`
- Production Node major: `24`
- Active Supabase project: `AssetMind 31` (`qxajgfbacdoxwnssmjth`)

No new Vercel project was created. Production continues to deploy only to `assetmind-v031-mpsk`.

## Verification status

The post-merge GitHub Verify workflow completed successfully on Node 24.

- 17 test files passed
- 125 tests passed
- TypeScript typecheck passed
- Oxlint passed with 0 warnings and 0 errors
- Vite production build passed
- production dependency audit (`npm audit --omit=dev --audit-level=high`) reports 0 vulnerabilities

The full development dependency tree still reports advisories in tooling dependencies, primarily around `@vercel/node` and transitive development packages. They are not production dependency vulnerabilities and should not be “fixed” with a forced downgrade that would destabilize the runtime toolchain.

## Live production smoke checks

The permanent production domain was checked after the Phase 0 deployment.

| Check | Result |
| --- | --- |
| `GET /` | HTTP 200 |
| `GET /api/search?q=AAPL` | HTTP 200 |
| `GET /api/quote?symbol=AAPL` | HTTP 200 |
| `GET /api/history?symbol=AAPL&period=1m` | HTTP 200 |

The history endpoint returned adjusted Yahoo history with 22 observations, no duplicate dates and sorted output during the audit.

## Supabase baseline

The active `AssetMind 31` project contains the current application tables (`profiles`, `portfolios`, `transactions`, `user_settings`) with RLS enabled. `positions` also has RLS enabled but is not used by the current application and has no client policy, so it remains inaccessible through the Data API.

Phase 0 found two actionable function-security warnings:

1. `public.handle_new_user()` was a `SECURITY DEFINER` trigger function directly executable by `anon` and `authenticated` through RPC.
2. `public.set_updated_at()` had a mutable/default `search_path`.

Production migration `20260917101444_phase0_supabase_function_security` fixed both findings by:

- setting an empty function `search_path`;
- revoking direct execution from `PUBLIC`, `anon` and `authenticated`;
- revoking automatic execute grants for future functions created by `postgres` in `public`.

After the migration, those security-advisor warnings disappeared.

## Corrections completed in Phase 0

1. Aligned local and CI Node with production Node 24.
2. Made lint warnings fail verification.
3. Removed all six existing lint warnings.
4. Fixed selected-symbol synchronization without synchronous state changes in a React effect.
5. Replaced stale localStorage-only deployment documentation with the actual Supabase + local cache architecture.
6. Verified the correct GitHub-to-Vercel production binding.
7. Verified market-data search, quote and history routes in production.
8. Audited active Supabase tables/RLS and closed exposed trigger-function RPC access.
9. Recorded the production database security migration in source control.

## Known follow-up items

These are not hidden and should be handled in the next hardening/product phases:

- Supabase Auth leaked-password protection is disabled. This is an Auth project setting rather than an application-code defect and should be enabled before broader external user onboarding.
- `public.positions` is a legacy/unused table with RLS enabled and no policies. It is currently closed to clients; decide later whether to remove it or formally model ownership if it becomes part of the architecture.
- Production runtime emits Node `DEP0169` warnings on market-data routes. AssetMind source does not call `url.parse()` directly; the same deprecation appears in external Node/tooling paths, so it must not be “fixed” by suppressing errors in application code.
- Main client bundle is approximately 559 kB minified and exceeds Vite's 500 kB warning threshold. This is a performance/code-splitting task.
- Authenticated browser E2E QA is still required for session restoration, signup/email flows, transaction persistence and cross-device Supabase sync.
- Supabase has historical migration drift: some older production migrations are recorded remotely while one repository migration was originally applied outside the tracked migration history. The current schema matches the application, but migration history should be normalized before substantial schema evolution.

## Phase 0 status

**Phase 0 is complete for production baseline and preflight hardening.**

The application has a reproducible Node/CI baseline, strict lint gate, passing tests/build, verified production routing, documented infrastructure identity and materially safer Supabase function permissions. The remaining items are explicitly tracked and move into the next hardening and product phases rather than being mistaken for completed work.
