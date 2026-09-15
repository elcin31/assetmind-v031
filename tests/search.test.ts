import { afterEach, expect, it, vi } from 'vitest';
import { searchInstruments } from '../src/data/instruments';
import { searchAssets } from '../src/utils/searchAssets';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
it('finds Palantir by name and ticker without network', () => {
  for (const query of ['palantir', ' PLTR ', 'Palantir Technologies']) expect(searchInstruments(query)[0].symbol).toBe('PLTR');
  expect(searchInstruments(' ')).toEqual([]);
});
it.each([502, 500, 404])('keeps Palantir selectable when API returns %i', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
  const result = await searchAssets('palantir', new AbortController().signal);
  expect(result.offline).toBe(true); expect(result.results[0].symbol).toBe('PLTR');
});
it('survives HTML responses and network failures', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>')));
  expect((await searchAssets('pltr', new AbortController().signal)).results[0].symbol).toBe('PLTR');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  expect((await searchAssets('pltr', new AbortController().signal)).results[0].symbol).toBe('PLTR');
});
it('merges valid API results without duplicate symbols', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ results: [{ symbol: 'PLTR', name: 'Palantir' }, { symbol: 'TEST', name: 'Test instrument' }, null] })));
  const result = await searchAssets('pltr', new AbortController().signal);
  expect(result.results.map(r => r.symbol)).toEqual(['PLTR', 'TEST']);
});
it('server falls back instead of throwing when Finnhub key is absent', async () => {
  vi.stubEnv('FINNHUB_API_KEY', '');
  const { search } = await import('../server/marketData');
  expect((await search('palantir'))[0].symbol).toBe('PLTR');
});
