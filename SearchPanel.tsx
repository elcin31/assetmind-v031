import { useEffect, useState } from 'react';
import type { SearchResult } from '../types';

interface Props {
  code: string;
  onSelect: (r: SearchResult) => void;
}

export function SearchPanel({ code, onSelect }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${code}` },
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(data.error || 'Search failed');
          setResults([]);
          return;
        }

        const unique = new Map<string, SearchResult>();
        for (const result of data.results ?? []) {
          if (result?.symbol && !unique.has(result.symbol)) {
            unique.set(result.symbol, result);
          }
        }
        setResults([...unique.values()]);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('Network error');
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [code, q]);

  return (
    <div className="card">
      <h2>Search asset</h2>
      <input
        className="input"
        type="search"
        placeholder="AAPL, NVDA, …"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
        aria-label="Search asset"
      />
      {loading && <p className="empty compact-empty">Searching…</p>}
      {error && <div className="error-banner inline-banner">{error}</div>}
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.symbol}>
              <button type="button" onClick={() => onSelect(r)}>
                <span className="sym">{r.symbol}</span>
                <span className="name">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
