// Authenticated production E2E for a disposable, EMPTY AssetMind account.
//
// Required:
//   ASSETMIND_E2E_EMAIL
//   ASSETMIND_E2E_PASSWORD
//   ASSETMIND_E2E_CONFIRM_DISPOSABLE=I_UNDERSTAND_THIS_IS_A_DISPOSABLE_ACCOUNT
// Optional:
//   ASSETMIND_E2E_URL=https://assetmind-v031-mpsk.vercel.app
//   PLAYWRIGHT_MODULE_PATH / BROWSER_EXECUTABLE (same runtime-owned pattern as other browser tests)
//
// The mutation portion refuses to run if the account already contains trades or
// cash events. It creates a cash deposit and one synthetic BUY, verifies edit /
// delete, removes the deposit, restores the original Risk Horizon, then signs out.

import assert from 'node:assert/strict';

const base = new URL(process.env.ASSETMIND_E2E_URL || 'https://assetmind-v031-mpsk.vercel.app/');
const email = process.env.ASSETMIND_E2E_EMAIL?.trim();
const password = process.env.ASSETMIND_E2E_PASSWORD;
const disposableConfirmation = process.env.ASSETMIND_E2E_CONFIRM_DISPOSABLE;

assert.equal(base.protocol, 'https:', 'Authenticated E2E requires HTTPS.');
assert.equal(base.pathname, '/', 'ASSETMIND_E2E_URL must be the app origin only.');
assert.ok(email && email.includes('@'), 'ASSETMIND_E2E_EMAIL is required.');
assert.ok(password && password.length >= 8, 'ASSETMIND_E2E_PASSWORD is required.');
assert.equal(
  disposableConfirmation,
  'I_UNDERSTAND_THIS_IS_A_DISPOSABLE_ACCOUNT',
  'Refusing mutations without explicit disposable-account confirmation.',
);

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const consoleErrors = [];
const failedRequests = [];

page.on('pageerror', error => consoleErrors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
    consoleErrors.push(message.text());
  }
});
page.on('requestfailed', request => {
  const url = request.url();
  // The synthetic E2E ticker intentionally has no market data. Its quote/history
  // failures verify partial-valuation behavior and are allowed during the mutation.
  if (!url.includes('symbol=E2E')) failedRequests.push(`${request.method()} ${url}: ${request.failure()?.errorText ?? 'failed'}`);
});

async function waitForPortfolio() {
  await page.getByRole('button', { name: 'Выйти', exact: true }).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Обзор', exact: true }).waitFor();
}

async function openLabRisk() {
  await page.getByRole('button', { name: 'Лаборатория', exact: true }).click();
  await page.getByRole('button', { name: 'Риск', exact: true }).click();
  await page.getByRole('group', { name: 'Risk Horizon' }).waitFor();
}

async function waitForCloudRefresh() {
  await page.waitForTimeout(900);
}

try {
  await page.goto(base.href, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor({ timeout: 30_000 });
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await waitForPortfolio();

  // Session restoration after a hard reload.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForPortfolio();
  assert.equal(await page.getByRole('heading', { name: 'Sign in', exact: true }).count(), 0, 'session restored after reload');

  // Risk Horizon persistence. Preserve and restore the account's original value.
  await openLabRisk();
  const horizonGroup = page.getByRole('group', { name: 'Risk Horizon' });
  const originalHorizon = await horizonGroup.locator('button[aria-pressed="true"]').innerText();
  assert.ok(['20D', '60D', '1Y'].includes(originalHorizon), 'recognized original Risk Horizon');
  const alternateHorizon = originalHorizon === '60D' ? '20D' : '60D';
  await horizonGroup.getByRole('button', { name: alternateHorizon, exact: true }).click();
  await waitForCloudRefresh();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForPortfolio();
  await openLabRisk();
  assert.equal(
    await page.getByRole('group', { name: 'Risk Horizon' }).getByRole('button', { name: alternateHorizon, exact: true }).getAttribute('aria-pressed'),
    'true',
    'Risk Horizon persisted across reload',
  );
  await page.getByRole('group', { name: 'Risk Horizon' }).getByRole('button', { name: originalHorizon, exact: true }).click();
  await waitForCloudRefresh();

  // Mutation tests are permitted only for an empty disposable account.
  await page.getByRole('button', { name: 'Сделки', exact: true }).click();
  const tradeHistory = page.getByRole('heading', { name: /История сделок/ }).locator('..').locator('..');
  const tradeHeading = await page.getByRole('heading', { name: /История сделок/ }).innerText();
  assert.match(tradeHeading, /\b0\b/, 'disposable account must start with zero trades');

  const cashCard = page.getByRole('heading', { name: /Cash ledger/ }).locator('..').locator('..');
  const cashHeading = await page.getByRole('heading', { name: /Cash ledger/ }).innerText();
  assert.match(cashHeading, /\b0\b/, 'disposable account must start with zero cash events');

  // Create funding so the account history is explicit rather than inferred.
  await cashCard.getByLabel('Сумма', { exact: true }).fill('1000');
  await cashCard.getByRole('button', { name: 'Добавить cash event', exact: true }).click();
  await cashCard.getByText('DEPOSIT', { exact: true }).waitFor({ timeout: 20_000 });

  // Create a synthetic BUY. E2E intentionally has no market quote, which also
  // exercises partial valuation / unavailable-market-data handling.
  await page.getByLabel('Тикер', { exact: true }).first().fill('E2E');
  await page.getByLabel('Количество', { exact: true }).fill('1');
  await page.getByLabel(/Цена \(/).fill('10');
  await page.getByRole('button', { name: 'Добавить покупку', exact: true }).click();
  const e2eRow = page.getByRole('row').filter({ hasText: 'E2E' }).first();
  await e2eRow.waitFor({ timeout: 20_000 });
  assert.match(await e2eRow.innerText(), /BUY/);

  // Edit the canonical row and verify the refreshed server-backed state.
  await e2eRow.getByRole('button', { name: 'Изменить', exact: true }).click();
  const editRow = page.locator('.transaction-edit-row');
  await editRow.getByLabel('Количество', { exact: true }).fill('2');
  await editRow.getByLabel('Цена', { exact: true }).fill('12');
  await editRow.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.locator('.transaction-edit-row').waitFor({ state: 'detached', timeout: 20_000 });
  const editedRow = page.getByRole('row').filter({ hasText: 'E2E' }).first();
  assert.match(await editedRow.innerText(), /\b2\b/, 'edited quantity is visible');

  // Hard reload proves Supabase persistence rather than transient React state.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForPortfolio();
  await page.getByRole('button', { name: 'Сделки', exact: true }).click();
  const persistedRow = page.getByRole('row').filter({ hasText: 'E2E' }).first();
  await persistedRow.waitFor({ timeout: 20_000 });
  assert.match(await persistedRow.innerText(), /\b2\b/, 'edited transaction persisted after reload');

  // Cleanup trade.
  await persistedRow.getByRole('button', { name: 'Удалить', exact: true }).click();
  await persistedRow.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click();
  await persistedRow.waitFor({ state: 'detached', timeout: 20_000 });

  // Cleanup funding event.
  const cashCardAfterReload = page.getByRole('heading', { name: /Cash ledger/ }).locator('..').locator('..');
  const depositRow = cashCardAfterReload.getByRole('row').filter({ hasText: 'DEPOSIT' }).first();
  await depositRow.getByRole('button', { name: 'Удалить', exact: true }).click();
  await depositRow.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await depositRow.waitFor({ state: 'detached', timeout: 20_000 });

  // Final reload verifies cleanup persisted and no user data was left behind.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForPortfolio();
  await page.getByRole('button', { name: 'Сделки', exact: true }).click();
  assert.match(await page.getByRole('heading', { name: /История сделок/ }).innerText(), /\b0\b/);
  assert.match(await page.getByRole('heading', { name: /Cash ledger/ }).innerText(), /\b0\b/);

  // Sign out and prove the session is actually cleared.
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor({ timeout: 20_000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor({ timeout: 20_000 });

  assert.deepEqual(consoleErrors, [], `browser console errors: ${consoleErrors.join('\n')}`);
  assert.deepEqual(failedRequests, [], `unexpected failed requests: ${failedRequests.join('\n')}`);
  console.log('PASS authenticated session restore, Risk Horizon persistence, cash funding, BUY/edit/delete persistence, cleanup, sign out');
} finally {
  await context.close();
  await browser.close();
}
