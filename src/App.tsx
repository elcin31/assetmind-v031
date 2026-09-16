import { useCallback, useEffect, useRef, useState } from 'react';
import './index.css';
import type { PortfolioSnapshot, Quote } from './types';
import type { EnrichedPortfolio } from './math/pnl';
import type { LocalPortfolio } from './storage/portfolio';
import type { PlanningState } from './storage/planning';
import { PortfolioScreen } from './pages/PortfolioScreen';
import { AuthLoadingScreen, LoginScreen } from './pages/LoginScreen';
import { useAuth } from './auth/AuthContext';
import { enrichPositionsWithQuotes } from './math/pnl';
import { buildCashLedger } from './math/cashLedger';
import { moneyWeightedReturn } from './math/xirr';
import { exportPortfolio, getPortfolioStorageKey, importPortfolio, readPortfolioSynced } from './storage/portfolio';
import { readPlanningState } from './storage/planning';

export default function App() {
  const { user, session, loading, recoveryMode, signOut } = useAuth();

  if (loading) return <AuthLoadingScreen />;
  if (recoveryMode || !session || !user) return <LoginScreen />;

  return <AuthenticatedAssetMind key={user.id} userId={user.id} onSignOut={signOut} />;
}

function composeSnapshot(
  data: LocalPortfolio,
  market: EnrichedPortfolio,
  planning: PlanningState,
  asOf: string,
): PortfolioSnapshot {
  const cashLedger = buildCashLedger(data.transactions, planning.cashEvents, asOf);
  const accountValue = market.valuation.complete && cashLedger.complete
    ? market.portfolioValue + cashLedger.balance
    : null;
  const moneyWeighted = moneyWeightedReturn(planning.cashEvents, accountValue, asOf, cashLedger.complete);
  return {
    ...data,
    ...market,
    cashEvents: planning.cashEvents,
    targetAllocation: planning.targetAllocation,
    cashLedger,
    accountValue,
    moneyWeighted,
  };
}

function AuthenticatedAssetMind({ userId, onSignOut }: { userId: string; onSignOut: () => Promise<void> }) {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadPortfolio = useCallback(async () => {
    const run = ++generation.current;
    const capitalAsOf = new Date().toISOString();
    setError(null);
    try {
      const data = await readPortfolioSynced(userId);
      const planning = await readPlanningState(userId, data.portfolio.id, data.portfolio.base_currency);
      const base = enrichPositionsWithQuotes(data.transactions, new Map());
      if (run !== generation.current) return;
      setSnapshot(composeSnapshot(data, base, planning, capitalAsOf));
      setLoading(base.positions.length > 0);
      const quotes = new Map<string, Quote>();
      await Promise.all(base.positions.map(async ({ symbol }) => {
        try {
          const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(6000) });
          if (!res.ok) return;
          const q = await res.json();
          if (q.symbol === symbol && Number.isFinite(q.price) && q.price > 0) quotes.set(symbol, q);
        } catch { /* Market data is optional; cached holdings remain usable if quotes fail. */ }
      }));
      if (run === generation.current) {
        setSnapshot(composeSnapshot(data, enrichPositionsWithQuotes(data.transactions, quotes), planning, capitalAsOf));
      }
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
      <summary>Данные и резервные копии <span>Аккаунт + локальный кэш</span></summary>
      <p>Портфель и capital layer синхронизируются с вашим аккаунтом. JSON сейчас остаётся резервной копией торгового ledger; cash events и target allocation хранятся в Supabase.</p>
      <div className="backup-actions">
        <button className="btn btn-ghost" onClick={() => { try { exportPortfolio(userId); } catch { setError('Could not export browser data.'); } }}>Экспорт trades JSON</button>
        <button className="btn btn-ghost" onClick={() => fileInput.current?.click()}>Импорт trades JSON</button>
      </div>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Import portfolio backup" onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file) return;
        try {
          if (file.size > 5_000_000) throw new Error('Backup must be smaller than 5 MB.');
          await importPortfolio(await file.text(), userId);
          await loadPortfolio();
        } catch (err) { setError(err instanceof Error ? err.message : 'Import failed'); }
      }} />
    </details>
    {snapshot ? <PortfolioScreen snapshot={snapshot} userId={userId} onRefresh={() => { void loadPortfolio(); }} onSignOut={onSignOut} loading={loading} setError={setError} error={error} /> :
      <main className="card"><h1>AssetMind</h1>{error ? <p role="alert">{error}</p> : <p>Loading portfolio…</p>}<button className="btn btn-primary" onClick={() => void loadPortfolio()}>Retry</button></main>}
  </div>;
}
