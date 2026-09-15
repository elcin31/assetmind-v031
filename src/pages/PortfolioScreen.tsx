import { useState } from 'react';
import type { PortfolioSnapshot } from '../types';
import { HoldingsList } from '../components/HoldingsList';
import { OverviewCard } from '../components/OverviewCard';
import { AllocationCard } from '../components/AllocationCard';
import { TransactionForm } from '../components/TransactionForm';
import { SearchPanel } from '../components/SearchPanel';
import { Laboratory } from '../components/Laboratory';
import { formatCurrency } from '../utils/format';

type Tab = 'overview' | 'holdings' | 'trade' | 'lab';
const tabs: { id: Tab; label: string; path: string }[] = [
  { id: 'overview', label: 'Обзор', path: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z' },
  { id: 'holdings', label: 'Активы', path: 'M4 21V11h4v10M10 21V3h4v18M16 21V7h4v14' },
  { id: 'trade', label: 'Сделки', path: 'M4 7h16m-5-5 5 5-5 5M20 17H4m5-5-5 5 5 5' },
  { id: 'lab', label: 'Лаборатория', path: 'M9 3h6m-5 0v7L4 20q0 1 2 1h12q2 0 2-1l-6-10V3M7 15h10' },
];
export function PortfolioScreen({ snapshot: s, onRefresh, loading, error, setError }: { snapshot: PortfolioSnapshot; onRefresh: () => void; loading: boolean; error: string | null; setError: (e: string | null) => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [symbol, setSymbol] = useState<string | null>(null);
  const money = (v: number) => formatCurrency(v, s.portfolio.base_currency);
  const cost = s.positions.reduce((n, p) => n + p.costBasis, 0);
  return <>
    <header className="brand-bar"><a href="#" className="brand" onClick={e => { e.preventDefault(); setTab('overview'); }}><span className="brand-mark">a</span> assetmind<span className="brand-dot">.</span></a><span className="status-pill">● Личный портфель</span></header>
    <div className="workspace">
      <nav className="site-nav" aria-label="Разделы сайта">{tabs.map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.path}/></svg><span>{t.label}</span></button>)}<div className="nav-note">Ваши активы.<br/>Ваши решения.<br/><span>Всё в одном месте.</span></div></nav>
      <main className="main-content">
        <header className="header"><div><span className="eyebrow">ВАШЕ ФИНАНСОВОЕ ПРОСТРАНСТВО</span><h1>{tabs.find(t => t.id === tab)?.label}</h1><p className="header-sub">{s.portfolio.name} · {s.portfolio.base_currency}</p></div><button className="btn btn-ghost" onClick={onRefresh} disabled={loading}>{loading ? 'Обновление…' : '↻ Обновить'}</button></header>
        {error && <div className="error-banner error-with-action" role="alert"><span>{error}</span><button onClick={() => setError(null)}>Закрыть</button></div>}
        {tab === 'overview' && <>
          <section className="portfolio-hero"><div><span className="eyebrow">{s.valuation.complete ? 'СТОИМОСТЬ АКТИВОВ' : 'СЕБЕСТОИМОСТЬ ПОЗИЦИЙ'}</span><div className="hero-value">{money(s.valuation.complete ? s.portfolioValue : cost)}</div><p>{s.valuation.complete ? 'Рыночная оценка открытых позиций' : 'Рыночная оценка неполная: ожидаем котировки'}</p><button className="btn btn-primary" onClick={() => setTab('trade')}>＋ Добавить сделку</button></div><div className="hero-aside"><span className="orbit" aria-hidden="true">a</span><div><b>{s.positions.length}</b><span>активов</span><b>{s.transactions.length}</b><span>сделок</span></div></div></section>
          <div className="dashboard-grid"><OverviewCard snapshot={s} /><section className="card lab-teaser"><span className="eyebrow">НОВОЕ / LAB</span><h2>Узнайте свой<br/>портфель глубже.</h2><p>Как изменится оценка при падении рынка на 20%? Сколько в портфеле концентрации?</p><button className="text-button" onClick={() => setTab('lab')}>Открыть лабораторию ↗</button></section><AllocationCard allocation={s.allocation} /><HoldingsList positions={s.positions} currency={s.portfolio.base_currency} /></div>
        </>}
        {tab === 'holdings' && <><HoldingsList positions={s.positions} currency={s.portfolio.base_currency} /><AllocationCard allocation={s.allocation} /></>}
        {tab === 'trade' && <><div className="trade-grid"><SearchPanel onSelect={r => setSymbol(r.symbol)} /><TransactionForm currency={s.portfolio.base_currency} initialSymbol={symbol} onSuccess={() => { setSymbol(null); onRefresh(); }} onError={message => setError(message || null)} /></div><section className="card"><h2>История сделок <span className="tag">{s.transactions.length}</span></h2>{!s.transactions.length ? <p className="empty">Начните с первой покупки. Позиции и лаборатория обновятся автоматически.</p> : <div className="table-scroll"><table><thead><tr><th>Актив</th><th>Операция</th><th>Количество</th><th>Цена</th><th>Дата</th></tr></thead><tbody>{[...s.transactions].sort((a,b) => Date.parse(b.timestamp)-Date.parse(a.timestamp)).map(tx => <tr key={tx.id}><td><b>{tx.symbol}</b></td><td><span className={`trade-badge ${tx.type === 'BUY' ? 'positive' : 'negative'}`}>{tx.type}</span></td><td>{tx.quantity}</td><td>{money(tx.price)}</td><td>{new Date(tx.timestamp).toLocaleDateString('ru-RU')}</td></tr>)}</tbody></table></div>}</section></>}
        {tab === 'lab' && <Laboratory snapshot={s} />}
        <footer className="site-footer"><span>assetmind / personal finance</span><span>Расчёты по данным вашего портфеля</span></footer>
      </main>
    </div>
  </>;
}
