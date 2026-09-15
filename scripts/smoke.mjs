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

const response = await fetch(base, { redirect: 'error', signal: AbortSignal.timeout(30000) });
assert.equal(response.status, 200, `Page returned HTTP ${response.status}`);
assert.match(await response.text(), /id=["']root["']/);
console.log('PASS: app page is available. Verify local transaction persistence in the browser.');
