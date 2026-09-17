# Authenticated production E2E

This is an opt-in browser test for the real AssetMind deployment. It must use a disposable account created only for E2E. Do not run it with a personal or investor-facing account.

## Safety contract

The script refuses to mutate data unless all of these are supplied:

- `ASSETMIND_E2E_EMAIL`
- `ASSETMIND_E2E_PASSWORD`
- `ASSETMIND_E2E_CONFIRM_DISPOSABLE=I_UNDERSTAND_THIS_IS_A_DISPOSABLE_ACCOUNT`

The mutation scenario also asserts that the account begins with zero trades and zero cash events. If either assertion fails, it stops before creating test data.

By default it targets `https://assetmind-v031-mpsk.vercel.app/`. Override only with an HTTPS app origin in `ASSETMIND_E2E_URL`.

Playwright follows the repository's existing runtime-owned pattern: provide `PLAYWRIGHT_MODULE_PATH` and optionally `BROWSER_EXECUTABLE` when Playwright/Chromium are supplied by the execution environment.

## What the current harness verifies

1. email/password sign in;
2. session restoration after a hard reload;
3. Risk Horizon persistence through Supabase preferences, then restoration of the original horizon;
4. explicit DEPOSIT funding on an empty disposable account;
5. BUY creation using a synthetic `E2E` ticker with unavailable market data;
6. partial-market-data behavior without inventing a quote;
7. transaction edit and persistence after hard reload;
8. transaction delete;
9. cash-event cleanup;
10. a final reload proving the account is empty again;
11. sign out and session clearance after reload;
12. no unexpected browser exceptions or failed network requests.

Run syntax validation in normal CI with:

```bash
npm run e2e:auth:check
```

Run the live authenticated test only in an environment that has the disposable credentials and a Playwright runtime:

```bash
ASSETMIND_E2E_EMAIL='...' \
ASSETMIND_E2E_PASSWORD='...' \
ASSETMIND_E2E_CONFIRM_DISPOSABLE='I_UNDERSTAND_THIS_IS_A_DISPOSABLE_ACCOUNT' \
npm run e2e:auth
```

## Not yet covered automatically

Signup plus real email-confirmation delivery remains separate because it requires a controlled mailbox/inbox. The production E2E must not create arbitrary accounts or depend on somebody's personal email. Password-recovery email delivery has the same requirement.

Issue #15 stays open until the live harness has been executed with a disposable confirmed account and the signup/email-confirmation path has a controlled mailbox strategy.
