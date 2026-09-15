import assert from 'node:assert/strict';

const rawUrl = process.env.SMOKE_BASE_URL;
assert.ok(rawUrl, 'Set SMOKE_BASE_URL to the deployed app URL.');
const base = new URL(rawUrl);
assert.ok(
  base.protocol === 'https:' ||
    (base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)),
  'Use HTTPS, or HTTP only for localhost.'
);
assert.ok(!base.username && !base.password && base.pathname === '/' && !base.search && !base.hash,
  'Use only the app origin, without credentials, paths or query parameters.');

async function request(path) {
  const response = await fetch(new URL(path, base), {
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

// Read only: never print portfolio data.
const { response, body } = await request('/api/portfolio');
assert.equal(response.status, 200, `Portfolio request failed with HTTP ${response.status}`);
assert.ok(body?.portfolio?.id, 'Portfolio response is missing its ID.');
assert.ok(Array.isArray(body.positions), 'Portfolio response is missing positions.');
assert.ok(Array.isArray(body.transactions), 'Portfolio response is missing transactions.');
assert.ok(typeof body.valuation?.complete === 'boolean', 'Valuation coverage metadata is missing.');
console.log('PASS: portfolio response without login');
console.log('Read-only smoke checks passed. Live quotes, history and transaction writes still need the deployment checklist.');
