import { searchInstruments } from '../data/instruments';
import type { SearchResult } from '../types';

export async function searchAssets(query: string, signal: AbortSignal): Promise<{ results: SearchResult[]; offline: boolean }> {
  const local = searchInstruments(query);
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
    });
    if (!response.ok) throw new Error('Search endpoint unavailable');
    const data = await response.json();
    if (!Array.isArray(data.results)) throw new Error('Invalid search response');
    const unique = new Map(local.map(item => [item.symbol, item]));
    for (const item of data.results) {
      if (item && typeof item.symbol === 'string' && /^[A-Z0-9.-]{1,20}$/.test(item.symbol) && typeof item.name === 'string') {
        unique.set(item.symbol, { symbol: item.symbol, name: item.name, exchange: typeof item.exchange === 'string' ? item.exchange : '', country: typeof item.country === 'string' ? item.country : '' });
      }
    }
    return { results: [...unique.values()], offline: data.source === 'catalog' };
  } catch {
    return { results: local, offline: true };
  }
}
