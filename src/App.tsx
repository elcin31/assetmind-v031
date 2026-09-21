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
import { getPortfolioStorageKey, readPortfolioSyncedWithStatus } from './storage/portfolio';
import { readPlanningState } from './storage/planning';
import { exportAccountBackup, importAccountBackup } from './storage/accountBackup';

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
  const cashLedger = buildCashLedger(
    data.transactions,
    planning.cashEvents,
    asOf,
    data.portfolio.base_currency,
  );
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
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const generation = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadPortfolio = useCallback(async () => {
    const run = ++generation.current;
    const capitalAsOf = new Date().toISOString();
    setError(null);
    try {
      const sync = await readPortfolioSyncedWithStatus(userId);
      const data = sync.portfolio;
      const planning = await readPlanningState(userId, data.portfolio.id, data.portfolio.base_currency);
      const base = enrichPositionsWithQuotes(data.transactions, new Map());
      if (run !== generation.current) return;
      setSyncWarning(sync.warning);
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
      if (run === generation.current) {
        setSnapshot(null);
        setSyncWarning(null);
        setError(err instanceof Error ? err.message : 'Could not read portfolio');
      }
    } finally { if (run === generation.current) setLoading(false); }
  }, [userId]);

  useEffect(() => {
    const generationRef = generation;
    const storageKey = getPortfolioStorageKey(userId);
    const update = () => { void loadPortfolio(); };
    const storage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) update(); };
    update();
    window.addEventListener('storage', storage);
    window.addEventListener('assetmind:changed', update);
    return () => { ++generationRef.current; window.removeEventListener('storage', storage); window.removeEventListener('assetmind:changed', update); };
  }, [loadPortfolio, userId]);

  const handleExport = async () => {
    setBackupBusy(true); setBackupStatus(null); setError(null);
    try {
      const backup = await exportAccountBackup(userId);
      setBackupStatus(`Полный backup создан: ${backup.transactions.length} trades · ${backup.cashEvents.length} cash events · ${backup.targetAllocation.length} targets.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось создать backup.'); }
    finally { setBackupBusy(false); }
  };

  return <div className="app">
    <details className="backup-panel">
      <summary>Данные и резервные копии <span>Аккаунт + локальный кэш</span></summary>
      <p>Полный account backup включает BUY/SELL, cash events, target allocation и настройки аналитики. Импорт работает как merge: существующие записи не удаляются, конфликты блокируются до записи. Старые trades-only backup тоже поддерживаются.</p>
      <div className="backup-actions">
        <button className="btn btn-ghost" disabled={backupBusy} onClick={() => void handleExport()}>{backupBusy ? 'Подготовка…' : 'Экспорт полного backup'}</button>
        <button className="btn btn-ghost" disabled={backupBusy} onClick={() => fileInput.current?.click()}>Импорт backup</button>
      </div>
      {backupStatus && <p className="caption" role="status">{backupStatus}</p>}
      <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Import AssetMind account backup" onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file) return;
        setBackupBusy(true); setBackupStatus(null); setError(null);
        try {
          if (file.size > 5_000_000) throw new Error('Backup must be smaller than 5 MB.');
          const result = await importAccountBackup(await file.text(), userId);
          await loadPortfolio();
          setBackupStatus(result.kind === 'legacy-trades'
            ? `Старый trades backup импортирован: +${result.importedTransactions} операций.`
            : `Account backup восстановлен: +${result.importedTransactions} trades · +${result.importedCashEvents} cash events · ${result.targetCount} targets.`);
        } catch (err) { setError(err instanceof Error ? err.message : 'Import failed'); }
        finally { setBackupBusy(false); }
      }} />
    </details>
    {syncWarning && <p className="warning-banner" role="status" aria-live="polite">{syncWarning}</p>}
    {snapshot ? <PortfolioScreen snapshot={snapshot} userId={userId} onRefresh={() => { void loadPortfolio(); }} onSignOut={onSignOut} loading={loading} setError={setError} error={error} /> :
      <main className="card"><h1>AssetMind</h1>{error ? <p role="alert">{error}</p> : <p>Loading portfolio…</p>}<button className="btn btn-primary" onClick={() => void loadPortfolio()}>Retry</button></main>}
  </div>;
}
