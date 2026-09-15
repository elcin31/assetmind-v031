import { useCallback, useEffect, useState } from 'react';
import './index.css';
import type { PortfolioSnapshot } from './types';
import { PortfolioScreen } from './pages/PortfolioScreen';

export default function App() {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPortfolio = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portfolio', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to load portfolio');
        return;
      }
      setSnapshot(data as PortfolioSnapshot);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPortfolio(); }, [loadPortfolio]);

  return (
    <div className="app">
      {snapshot ? (
        <PortfolioScreen snapshot={snapshot} onRefresh={loadPortfolio}
          loading={loading} setError={setError} error={error} />
      ) : (
        <main className="card" aria-busy={loading}>
          <h1>AssetMind</h1>
          {loading && <p role="status">Loading portfolio…</p>}
          {error && <div className="error-banner" role="alert">{error}</div>}
          {!loading && <button className="btn btn-primary" onClick={loadPortfolio}>Retry</button>}
        </main>
      )}
    </div>
  );
}
