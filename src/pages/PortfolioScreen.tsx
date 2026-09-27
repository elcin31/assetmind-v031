import { OverviewPage } from './OverviewPage';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
import { XRayHero } from '../components/growth/XRayHero';
import { trackEvent } from '../analytics/events';

const Laboratory = lazy(() => import('../components/Laboratory').then((module) => ({ default: module.Laboratory })));

type Tab = 'overview' | 'holdings' | 'xray' | 'lab' | 'planning' | 'trade';
const tabs: { id: Tab; label: string; path: string }[] = [
  { id: 'overview', label: 'Обзор', path: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z' },
  { id: 'holdings', label: 'Портфель', path: 'M4 21V11h4v10M10 21V3h4v18M16 21V7h4v14' },
  { id: 'xray', label: 'X-Ray', path: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z' },
  { id: 'lab', label: 'Аналитика', path: 'M9 3h6m-5 0v7L4 20q0 1 2 1h12q2 0 2-1l-6-10V3M7 15h10' },
  { id: 'planning', label: 'План', path: 'M4 4h16v17H4ZM8 9h8M8 13h8M8 17h5' },
];

interface PortfolioScreenProps {
  snapshot: PortfolioSnapshot;
  userId: string;
  onRefresh: () => void;
  onSignOut: () => Promise<void>;
  loading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  isDemo: boolean;
  onDemo: (preset: string) => void;
  onExitDemo: () => void;
}

export function PortfolioScreen({ snapshot: s, userId, onRefresh, onSignOut, loading, error, setError, isDemo, onDemo, onExitDemo }: PortfolioScreenProps) {
  const controller = usePortfolioAnalytics(s, userId);
  const analytics = controller.analytics;
  const [tab, setTab] = useState<Tab>('overview');
  const lastBenchmark = useRef(controller.benchmark);
  useEffect(() => {
    if (tab === 'overview') trackEvent('overview_view', { demo: isDemo }, userId);
    if (tab === 'lab') trackEvent('laboratory_view', { demo: isDemo }, userId);
    if (tab === 'xray') {
      trackEvent('xray_view', { demo: isDemo }, userId);
    }
  }, [tab, isDemo, userId]);
  useEffect(() => {
    if (lastBenchmark.current !== controller.benchmark) trackEvent('benchmark_changed', { benchmark: controller.benchmark }, userId);
    lastBenchmark.current = controller.benchmark;
  }, [controller.benchmark, userId]);
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

  const visibleTabs = isDemo ? tabs.filter(t => t.id !== 'planning') : tabs;
  return <>
    <header className="brand-bar"><a href="#" className="brand" onClick={e => { e.preventDefault(); setTab('overview'); }}><span className="brand-mark">a</span> assetmind<span className="brand-dot">.</span></a><span className="status-pill">● Личный портфель</span></header>
    <div className="workspace">
      <nav className="site-nav" aria-label="Разделы сайта">{visibleTabs.map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.path}/></svg><span>{t.label}</span></button>)}<div className="nav-note">Ваши активы.<br/>Ваши решения.<br/><span>Всё в одном месте.</span></div></nav>
      <main className="main-content">
        {isDemo && <section className="demo-ribbon"><div><strong>DEMO</strong><p>Учебный preset · не связан с вашим портфелем или транзакциями. Исторические данные не являются прогнозом доходности.</p></div><button className="btn btn-ghost" onClick={onExitDemo}>Выйти из демо</button></section>}
        <header className="header"><div><span className="eyebrow">ВАШЕ ФИНАНСОВОЕ ПРОСТРАНСТВО</span><h1>{tab === 'trade' ? 'Операции' : tabs.find(t => t.id === tab)?.label}</h1><p className="header-sub">{s.portfolio.name} · {s.portfolio.base_currency}</p></div><div className="header-actions"><ThemeToggle /><button className="btn btn-ghost" onClick={() => { onRefresh(); controller.retry(); }} disabled={loading || signingOut}>{loading ? 'Обновление…' : '↻ Обновить'}</button><button className="btn btn-ghost" onClick={() => void handleSignOut()} disabled={signingOut}>{signingOut ? 'Выход…' : 'Выйти'}</button></div></header>
        {error && <div className="error-banner error-with-action" role="alert"><span>{error}</span><button onClick={() => setError(null)}>Закрыть</button></div>}
        {tab !== 'overview' && controller.errors.length > 0 && <div className="notice" role="status">История загружена частично: {controller.errors.join('; ')}. <button className="text-button" onClick={controller.retry}>Повторить загрузку</button></div>}
        {tab === 'overview' && <><XRayHero empty={s.positions.length === 0} onOpenXray={() => setTab('xray')} onDemo={onDemo} />{isDemo ? <section className="card"><h2>Исследуйте демонстрационный портфель</h2><p className="caption">Это пример структуры активов. Денежная стоимость и P&amp;L скрыты; аналитика риска и диверсификации использует текущие рыночные данные и существующие расчёты AssetMind.</p><button className="btn btn-primary" onClick={() => setTab('xray')}>Открыть Portfolio X-Ray</button></section> : <OverviewPage snapshot={s} controller={controller} onHoldings={() => setTab('holdings')} onTrade={() => setTab('trade')} onAnalytics={() => setTab('xray')} />}</>}
        {tab === 'holdings' && <>{holdingSymbol && <section className="card"><label className="field-label" htmlFor="chart-asset">Актив для графика</label><select id="chart-asset" className="input" value={holdingSymbol} onChange={e => setChartSymbol(e.target.value)}>{s.positions.map(p => <option key={p.symbol} value={p.symbol}>{p.symbol}</option>)}</select><PriceChart key={holdingSymbol} symbol={holdingSymbol} /></section>}<HoldingsList positions={s.positions} currency={s.portfolio.base_currency} analytics={analytics} benchmark={controller.benchmark} onTrade={() => setTab('trade')} />{s.valuation.complete ? <AllocationCard allocation={s.allocation}/> : <p className="notice">Для распределения нужны котировки всех позиций.</p>}</>}
        {tab === 'planning' && <PlanningPage snapshot={s} userId={userId} controller={controller} onChanged={afterTransactionChange} onError={setError} />}
        {tab === 'trade' && <><div className="trade-grid"><div className="trade-discovery"><SearchPanel onSelect={r => setSymbol(r.symbol)} />{symbol && <section className="card"><PriceChart key={symbol} symbol={symbol} /></section>}</div><TransactionForm userId={userId} currency={s.portfolio.base_currency} initialSymbol={symbol} existingSymbols={s.positions.map(position => position.symbol)} isPortfolioEmpty={s.transactions.length === 0} onSuccess={() => { setSymbol(null); afterTransactionChange(); }} onError={message => setError(message || null)} /></div><TransactionHistory transactions={s.transactions} userId={userId} currency={s.portfolio.base_currency} onChanged={afterTransactionChange} onError={setError}/><CashLedgerPanel snapshot={s} userId={userId} onChanged={afterTransactionChange} onError={setError}/></>}
        {(tab === 'lab' || tab === 'xray') && <Suspense fallback={<section className="card"><p>Загрузка аналитики…</p></section>}><Laboratory key={tab} initialTab={tab === 'xray' ? 'xray' : 'performance'} snapshot={s} controller={controller} userId={userId} isDemo={isDemo} /></Suspense>}
        <footer className="site-footer"><span>assetmind / personal finance</span><span>Расчёты по данным вашего портфеля</span></footer>
      </main>
    </div>
  </>;
}
