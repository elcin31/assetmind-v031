import { OverviewPage } from './OverviewPage';
import { lazy, Suspense, useState } from 'react';
import type { PortfolioSnapshot } from '../types';
import { HoldingsList } from '../components/HoldingsList';
import { AllocationCard } from '../components/AllocationCard';
import { TransactionForm } from '../components/TransactionForm';
import { TransactionHistory } from '../components/TransactionHistory';
import { SearchPanel } from '../components/SearchPanel';
import { ThemeToggle } from '../components/ThemeToggle';
import { PriceChart } from '../components/PriceChart';
import { CashLedgerPanel } from '../components/CashLedgerPanel';
import { PlanningPage } from './PlanningPage';
import { usePortfolioAnalytics } from '../analytics/usePortfolioAnalytics';

const Laboratory = lazy(() => import('../components/Laboratory').then((module) => ({ default: module.Laboratory })));

type Tab = 'overview' | 'holdings' | 'planning' | 'trade' | 'lab';
const tabs: { id: Tab; label: string; path: string }[] = [
  { id: 'overview', label: 'Обзор', path: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z' },
  { id: 'holdings', label: 'Портфель', path: 'M4 21V11h4v10M10 21V3h4v18M16 21V7h4v14' },
  { id: 'planning', label: 'План', path: 'M4 4h16v17H4ZM8 9h8M8 13h8M8 17h5' },
  { id: 'lab', label: 'Аналитика', path: 'M9 3h6m-5 0v7L4 20q0 1 2 1h12q2 0 2-1l-6-10V3M7 15h10' },
  { id: 'trade', label: 'Операции', path: 'M4 7h16m-5-5 5 5-5 5M20 17H4m5-5-5 5 5 5' },
];

interface PortfolioScreenProps {
  snapshot: PortfolioSnapshot;
  userId: string;
  onRefresh: () => void;
  onSignOut: () => Promise<void>;
  loading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
}

export function PortfolioScreen({ snapshot: s, userId, onRefresh, onSignOut, loading, error, setError }: PortfolioScreenProps) {
  const controller = usePortfolioAnalytics(s, userId);
  const analytics = controller.analytics;
  const [tab, setTab] = useState<Tab>('overview');
  const [symbol, setSymbol] = useState<string | null>(null);
  const [chartSymbol, setChartSymbol] = useState('');
  const holdingSymbol = s.positions.some(p => p.symbol === chartSymbol) ? chartSymbol : s.positions[0]?.symbol;
  const [signingOut, setSigningOut] = useState(false);
  const handleSignOut = async () => {
    setSigningOut(true);
    setError(null);
    try { await onSignOut(); }
    catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : 'Could not sign out. Please try again.');
      setSigningOut(false);
    }
  };

  const afterTransactionChange = () => { onRefresh(); controller.retry(); };

  return <>
    <header className="brand-bar"><a href="#" className="brand" onClick={e => { e.preventDefault(); setTab('overview'); }}><span className="brand-mark">a</span> assetmind<span className="brand-dot">.</span></a><span className="status-pill">● Личный портфель</span></header>
    <div className="workspace">
      <nav className="site-nav" aria-label="Разделы сайта">{tabs.map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.path}/></svg><span>{t.label}</span></button>)}<div className="nav-note">Ваши активы.<br/>Ваши решения.<br/><span>Всё в одном месте.</span></div></nav>
      <main className="main-content">
        <header className="header"><div><span className="eyebrow">ВАШЕ ФИНАНСОВОЕ ПРОСТРАНСТВО</span><h1>{tabs.find(t => t.id === tab)?.label}</h1><p className="header-sub">{s.portfolio.name} · {s.portfolio.base_currency}</p></div><div className="header-actions"><ThemeToggle /><button className="btn btn-ghost" onClick={() => { onRefresh(); controller.retry(); }} disabled={loading || signingOut}>{loading ? 'Обновление…' : '↻ Обновить'}</button><button className="btn btn-ghost" onClick={() => void handleSignOut()} disabled={signingOut}>{signingOut ? 'Выход…' : 'Выйти'}</button></div></header>
        {error && <div className="error-banner error-with-action" role="alert"><span>{error}</span><button onClick={() => setError(null)}>Закрыть</button></div>}
        {tab !== 'overview' && controller.errors.length > 0 && <div className="notice" role="status">История загружена частично: {controller.errors.join('; ')}. <button className="text-button" onClick={controller.retry}>Повторить загрузку</button></div>}
        {tab === 'overview' && <OverviewPage snapshot={s} controller={controller} onHoldings={() => setTab('holdings')} onTrade={() => setTab('trade')} onAnalytics={() => setTab('lab')} />}
        {tab === 'holdings' && <>{holdingSymbol && <section className="card"><label className="field-label" htmlFor="chart-asset">Актив для графика</label><select id="chart-asset" className="input" value={holdingSymbol} onChange={e => setChartSymbol(e.target.value)}>{s.positions.map(p => <option key={p.symbol} value={p.symbol}>{p.symbol}</option>)}</select><PriceChart key={holdingSymbol} symbol={holdingSymbol} /></section>}<HoldingsList positions={s.positions} currency={s.portfolio.base_currency} analytics={analytics} benchmark={controller.benchmark} />{s.valuation.complete ? <AllocationCard allocation={s.allocation}/> : <p className="notice">Для распределения нужны котировки всех позиций.</p>}</>}
        {tab === 'planning' && <PlanningPage snapshot={s} userId={userId} controller={controller} onChanged={afterTransactionChange} onError={setError} />}
        {tab === 'trade' && <><div className="trade-grid"><div className="trade-discovery"><SearchPanel onSelect={r => setSymbol(r.symbol)} />{symbol && <section className="card"><PriceChart key={symbol} symbol={symbol} /></section>}</div><TransactionForm userId={userId} currency={s.portfolio.base_currency} initialSymbol={symbol} onSuccess={() => { setSymbol(null); afterTransactionChange(); }} onError={message => setError(message || null)} /></div><TransactionHistory transactions={s.transactions} userId={userId} currency={s.portfolio.base_currency} onChanged={afterTransactionChange} onError={setError}/><CashLedgerPanel snapshot={s} userId={userId} onChanged={afterTransactionChange} onError={setError}/></>}
        {tab === 'lab' && <Suspense fallback={<section className="card"><p>Загрузка Лаборатории…</p></section>}><Laboratory snapshot={s} controller={controller} /></Suspense>}
        <footer className="site-footer"><span>assetmind / personal finance</span><span>Расчёты по данным вашего портфеля</span></footer>
      </main>
    </div>
  </>;
}
