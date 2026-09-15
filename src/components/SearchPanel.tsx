import { useEffect, useState } from 'react';
import type { SearchResult } from '../types';
import { searchInstruments } from '../data/instruments';
import { searchAssets } from '../utils/searchAssets';

interface Props { onSelect: (r: SearchResult) => void }
export function SearchPanel({ onSelect }: Props) {
  const [q, setQ] = useState('');
  const query = q.trim();
  const [remote, setRemote] = useState<{ query: string; results: SearchResult[]; offline: boolean } | null>(null);
  const current = remote?.query === query ? remote : null;
  const results = current?.results ?? searchInstruments(query);
  const loading = Boolean(query && !current);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const result = await searchAssets(query, controller.signal);
      if (!controller.signal.aborted) setRemote({ query, ...result });
    }, 300);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [query]);

  return <div className="card">
    <h2>Search asset</h2>
    <input className="input" type="search" placeholder="Palantir, PLTR, AAPL, …" value={q}
      onChange={e => { setQ(e.target.value); setRemote(null); }} autoComplete="off" aria-label="Search asset" />
    {loading && <p className="empty compact-empty" role="status">Checking more assets…</p>}
    {current?.offline && <p className="empty compact-empty" role="status">Showing the built-in catalog. Extended search is temporarily unavailable.</p>}
    {query && !loading && results.length === 0 && <p className="empty compact-empty">No matches. You can enter a ticker and price in the transaction form below.</p>}
    {results.length > 0 && <ul className="search-results">
      {results.map(r => <li key={r.symbol}><button type="button" onClick={() => onSelect(r)}>
        <span className="sym">{r.symbol}</span><span className="name">{r.name}</span>
      </button></li>)}
    </ul>}
  </div>;
}
