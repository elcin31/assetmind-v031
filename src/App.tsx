import { useCallback, useEffect, useRef, useState } from 'react';
import './index.css';
import type { PortfolioSnapshot, Quote, HistoryBar } from './types';
import { PortfolioScreen } from './pages/PortfolioScreen';
import { AuthLoadingScreen, LoginScreen } from './pages/LoginScreen';
import { useAuth } from './auth/AuthContext';
import { buildPortfolioValueSeries } from './math/returns';
import { annualizedVolatility } from './math/volatility';
import { calculateSharpe } from './math/sharpe';
import { enrichPositionsWithQuotes } from './math/pnl';
import { exportPortfolio, getPortfolioStorageKey, importPortfolio, readPortfolio } from './storage/portfolio';

export default function App() {
  const { user, session, loading, recoveryMode, signOut } = useAuth();

  if (loading) return <AuthLoadingScreen />;
  if (recoveryMode || !session || !user) return <LoginScreen />;

  return <AuthenticatedAssetMind key={user.id} userId={user.id} onSignOut={signOut} />;
}

function AuthenticatedAssetMind({ userId, onSignOut }: { userId: string; onSignOut: () => Promise<void> }) {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadPortfolio = useCallback(async () => {
    const run = ++generation.current;
    setError(null);
    try {
      const data = readPortfolio(userId);
      const base = enrichPositionsWithQuotes(data.transactions, new Map());
      let risk: PortfolioSnapshot['risk'] = { available: false, volatility: null, sharpe: null, reason: base.positions.length ? 'insufficient_history' : 'empty_portfolio' };
      setSnapshot({ ...data, ...base, risk });
      setLoading(base.positions.length > 0);
      const quotes = new Map<string, Quote>();
      const history = new Map<string, HistoryBar[]>();
      await Promise.all(base.positions.flatMap(({ symbol }) => [(async () => {
        try {
          const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(6000) });
          if (!res.ok) return;
          const q = await res.json();
          if (q.symbol === symbol && Number.isFinite(q.price) && q.price > 0) quotes.set(symbol, q);
        } catch { /* Market data is optional; local holdings remain usable offline. */ }
      })(), (async () => {
        try {
          const res = await fetch(`/api/history?symbol=${encodeURIComponent(symbol)}&period=1y`, { signal: AbortSignal.timeout(6000) });
          if (!res.ok) return;
          const data = await res.json();
          if (Array.isArray(data.bars) && data.bars.every((b: HistoryBar) => typeof b.date === 'string' && Number.isFinite(b.close) && b.close > 0)) history.set(symbol, data.bars);
        } catch { /* Optional history data. */ }
      })()]));
      let historySeries: PortfolioSnapshot['history'];
      if (base.positions.length) {
        const series = buildPortfolioValueSeries(base.positions, history);
        if (series.available) {
          historySeries = { dates: series.dates, values: series.values, dailyReturns: series.dailyReturns };
          const volatility = annualizedVolatility(series.dailyReturns);
          risk = { available: volatility !== null, volatility, sharpe: calculateSharpe(series.dailyReturns, volatility, 0), reason: volatility === null ? 'insufficient_history' : undefined };
        }
      }
      if (run === generation.current) setSnapshot({ ...data, ...enrichPositionsWithQuotes(data.transactions, quotes), risk, history: historySeries });
    } catch (err) {
      if (run === generation.current) { setSnapshot(null); setError(err instanceof Error ? err.message : 'Could not read portfolio'); }
    } finally { if (run === generation.current) setLoading(false); }
  }, [userId]);

  useEffect(() => {
    const storageKey = getPortfolioStorageKey(userId);
    const update = () => { void loadPortfolio(); };
    const storage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) update(); };
    update();
    window.addEventListener('storage', storage);
    window.addEventListener('assetmind:changed', update);
    return () => { ++generation.current; window.removeEventListener('storage', storage); window.removeEventListener('assetmind:changed', update); };
  }, [loadPortfolio, userId]);

  return <div className="app">
    <details className="backup-panel">
      <summary>Данные и резервные копии <span>На этом устройстве</span></summary>
      <p>Данные хранятся в этом браузере. Сохраните копию перед очисткой данных или переходом на другое устройство.</p>
      <div className="backup-actions">
        <button className="btn btn-ghost" onClick={() => { try { exportPortfolio(userId); } catch { setError('Could not export browser data.'); } }}>Экспорт JSON</button>
        <button className="btn btn-ghost" onClick={() => fileInput.current?.click()}>Импорт JSON</button>
      </div>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Import portfolio backup" onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file) return;
        try {
          if (file.size > 5_000_000) throw new Error('Backup must be smaller than 5 MB.');
          await importPortfolio(await file.text(), userId);
        } catch (err) { setError(err instanceof Error ? err.message : 'Import failed'); }
      }} />
    </details>
    {snapshot ? <PortfolioScreen snapshot={snapshot} userId={userId} onRefresh={loadPortfolio} onSignOut={onSignOut} loading={loading} setError={setError} error={error} /> :
      <main className="card"><h1>AssetMind</h1>{error ? <p role="alert">{error}</p> : <p>Loading portfolio…</p>}<button className="btn btn-primary" onClick={loadPortfolio}>Retry</button></main>}
  </div>;
}
