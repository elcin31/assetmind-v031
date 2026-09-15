import type { SearchResult } from '../types';

/** Small offline catalog. No live prices; extended search remains available through the API. */
const INSTRUMENTS: SearchResult[] = [
  { symbol: 'PLTR', name: 'Palantir Technologies Inc.', exchange: '', country: 'US' },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.', exchange: '', country: 'US' },
  { symbol: 'NFLX', name: 'Netflix Inc.', exchange: '', country: 'US' },
  { symbol: 'COIN', name: 'Coinbase Global Inc.', exchange: '', country: 'US' },
  { symbol: 'SOFI', name: 'SoFi Technologies Inc.', exchange: '', country: 'US' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', exchange: '', country: 'US' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', exchange: '', country: 'US' },
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', country: 'US' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', country: 'US' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', country: 'US' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', country: 'US' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', country: 'US' },
  { symbol: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ', country: 'US' },
  { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', country: 'US' },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', exchange: 'NYSE', country: 'US' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', exchange: 'NYSE', country: 'US' },
  { symbol: 'V', name: 'Visa Inc.', exchange: 'NYSE', country: 'US' },
];


export function searchInstruments(query: string): SearchResult[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  return INSTRUMENTS.filter(i => i.symbol.includes(q) || i.name.toUpperCase().includes(q))
    .sort((a, b) => Number(b.symbol === q) - Number(a.symbol === q));
}
