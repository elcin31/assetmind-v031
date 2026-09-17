# Phase 0 — Production baseline

Date: 2026-09-17

## Scope

Phase 0 freezes the current production baseline before broader product work. The goal is to verify that repository, CI, Vercel target, runtime APIs and operational documentation all point to the same system before changing portfolio math or architecture.

## Verified production identity

- GitHub repository: `elcin31/assetmind-v031`
- Baseline `main` commit: `31e10094cd51edbebd9767748b0b7f36539e3c3c`
- Vercel project: `assetmind-v031-mpsk`
- Vercel project ID: `prj_0OQTvpMdNFAJFm2Ty0o536nHR7Qx`
- Production domain: `https://assetmind-v031-mpsk.vercel.app`
- Baseline production deployment: `dpl_2oZW1Sf4sHzRfjpqDaNQLHXAYLhe`
- Production deployment state at audit: `READY`
- Production branch: `main`
- Production Node major: `24`

The baseline production deployment is tied to the same GitHub commit as `main`.

## Verification status at baseline

GitHub Verify for the baseline commit completed successfully.

- 17 test files passed
- 125 tests passed
- TypeScript build passed
- Vite production build passed
- Production dependency audit is part of CI

The baseline lint step completed with 6 warnings and 0 errors. Phase 0 removes those warnings and changes lint verification so future warnings fail CI.

## Live production smoke checks

The permanent production domain was checked directly.

| Check | Result |
| --- | --- |
| `GET /` | HTTP 200 |
| `GET /api/search?q=AAPL` | HTTP 200 |
| `GET /api/quote?symbol=AAPL` | HTTP 200 |
| `GET /api/history?symbol=AAPL&period=1m` | HTTP 200 |

For the history smoke check at audit time:

- provider: Yahoo
- price type: adjusted
- observations: 22
- duplicate dates: 0
- sorted: true

These checks prove that the current production shell and core public market-data endpoints are reachable. They do not replace authenticated browser QA for Supabase session restore, transaction persistence or analytics UI.

## Phase 0 corrections

Work is isolated in `chore/phase-0-preflight` until CI and preview are green.

1. Align local/CI Node major with production Node 24.
2. Fail CI when Oxlint emits warnings.
3. Remove the six lint warnings present in the baseline build.
4. Replace stale deployment documentation that incorrectly described the app as localStorage-only.
5. Keep the production target explicitly pinned in operational documentation.

## Known follow-up items

These are recorded but intentionally not mixed into the preflight patch unless they block verification:

- Production runtime emits Node `DEP0169` warnings on market-data routes. No direct `url.parse()` usage exists in the repository, so dependency/runtime attribution is required before changing application code.
- Main client bundle is approximately 559 kB minified and exceeds Vite's 500 kB warning threshold. This is a performance/code-splitting task, not a correctness blocker for Phase 0.
- Authenticated end-to-end browser QA is required before an investor-ready release because static/API smoke tests cannot validate session restoration and cloud portfolio persistence.

## Exit criteria

Phase 0 is complete only when:

- the preflight branch passes GitHub Verify on Node 24;
- lint reports zero warnings;
- Vercel preview is `READY`;
- root/search/quote/history smoke checks pass on preview;
- no new runtime error cluster is introduced;
- only then is the patch eligible to merge into `main` and update the existing production project.
