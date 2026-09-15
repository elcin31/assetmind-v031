import { useState } from 'react';
import type { PortfolioSnapshot } from '../types';
import { concentration, historicalRisk, stressValue } from '../math/lab';
import { formatCurrency } from '../utils/format';

const pct = (v: number | undefined | null) => v == null ? '—' : `${(v * 100).toFixed(2)}%`;
function Formula({ name, formula, children }: { name: string; formula: string; children: React.ReactNode }) {
  return <details className="formula"><summary>{name}<span>Формула ↗</span></summary><code>{formula}</code><p>{children}</p></details>;
}
export function Laboratory({ snapshot: s }: { snapshot: PortfolioSnapshot }) {
  const [shock, setShock] = useState(-20);
  const [target, setTarget] = useState('*');
  const [basis, setBasis] = useState<'cost' | 'market'>('cost');
  const [rf, setRf] = useState(0);
  const complete = s.positions.length > 0 && s.valuation.complete;
  const available = basis === 'cost' ? s.positions.length > 0 : complete;
  const values = s.positions.map(p => ({ symbol: p.symbol, value: basis === 'cost' ? p.costBasis : p.marketValue ?? 0 }));
  const selected = target === '*' || values.some(p => p.symbol === target) ? target : '*';
  const c = available ? concentration(values.map(p => p.value)) : null;
  const stress = available ? stressValue(values, shock / 100, selected) : null;
  const history = s.history;
  const risk = history ? historicalRisk(history.values, history.dailyReturns) : null;
  const volatility = risk ? s.risk?.volatility : null;
  const sharpe = risk && volatility && volatility > 0 ? (risk.meanDaily * 252 - rf / 100) / volatility : null;
  const money = (n: number) => formatCurrency(n, s.portfolio.base_currency);
  return <>
    <section className="lab-intro"><div><span className="eyebrow">PORTFOLIO SCIENCE</span><h2>Лаборатория</h2><p>Изучайте структуру, проверяйте гипотезы и понимайте риск.</p></div><span className="status-pill">● {s.transactions.length} сделок · синхронизировано</span></section>
    <div className="lab-grid">
      <section className="card"><div className="section-heading"><h2>01 / Структура</h2><span className="tag">Математика</span></div>
        <label className="field-label" htmlFor="lab-basis">База оценки</label><select id="lab-basis" className="input" value={basis} onChange={e => setBasis(e.target.value as 'cost' | 'market')}><option value="cost">Себестоимость открытых позиций</option><option value="market">Текущая рыночная стоимость</option></select>
        {!available && <p className="empty">{s.positions.length ? 'Для рыночных весов нужны котировки всех позиций.' : 'Добавьте покупку: здесь появится структура портфеля.'}</p>}
        <div className="stat-pair"><div><small>Индекс HHI</small><strong>{c ? c.hhi.toFixed(3) : '—'}</strong></div><div><small>Эффективных позиций</small><strong>{c ? c.effectivePositions.toFixed(2) : '—'}</strong></div></div>
        {available && values.map(p => <div className="weight-row" key={p.symbol}><span>{p.symbol}</span><div><i style={{ width: `${p.value / values.reduce((n, v) => n + v.value, 0) * 100}%` }} /></div><b>{pct(p.value / values.reduce((n, v) => n + v.value, 0))}</b></div>)}
        <Formula name="Концентрация и диверсификация" formula="wᵢ = Vᵢ / ΣVⱼ; HHI = Σwᵢ²; N_eff = 1 / HHI">HHI близкий к 1 означает концентрацию в одной позиции. N_eff — число равновесных позиций с той же концентрацией. Это не оценка корреляции активов. База: {basis === 'cost' ? 'себестоимость' : 'рыночная стоимость'}.</Formula>
      </section>
      <section className="card scenario-card"><div className="section-heading"><h2>02 / Стресс-сценарий</h2><span className="tag">What if</span></div>
        <label className="field-label" htmlFor="lab-target">Применить изменение к</label><select id="lab-target" className="input" value={selected} onChange={e => setTarget(e.target.value)}><option value="*">Весь портфель</option>{s.positions.map(p => <option key={p.symbol} value={p.symbol}>{p.symbol}</option>)}</select>
        <div className="shock-number">{shock > 0 ? '+' : ''}{shock}%</div><label htmlFor="lab-shock" className="field-label">Изменение выбранной базы оценки</label><input id="lab-shock" type="range" min="-80" max="80" step="1" value={shock} onChange={e => setShock(Number(e.target.value))} /><div className="range-labels"><span>−80%</span><span>0%</span><span>+80%</span></div>
        <div className="stat-pair"><div><small>После изменения</small><strong>{stress ? money(stress.after) : '—'}</strong></div><div><small>Разница</small><strong className={shock < 0 ? 'negative' : 'positive'}>{stress ? money(stress.change) : '—'}</strong></div></div>
        <p className="caption">{basis === 'cost' ? 'Условный сценарий относительно себестоимости, не прогноз рыночного убытка.' : 'Сценарий относительно полной текущей рыночной оценки.'} Сделки не изменяются.</p>
        <Formula name="Переоценка сценария" formula="V′ = Σ Vᵢ × (1 + sᵢ); ΔV = V′ − V">Шок s применяется к выбранному активу или всем позициям. Модель не учитывает валюты, ликвидность, комиссии и изменение корреляций.</Formula>
      </section>
      <section className="card"><div className="section-heading"><h2>03 / Исторический риск</h2><span className="tag">Quant</span></div>
        <p className="caption">Сегодняшние количества активов на общих исторических датах. Это модель текущего состава, а не фактическая доходность счёта.</p>
        {!risk && <div className="notice">Нужно минимум 21 общее наблюдение цен для всех позиций. Метрики появятся автоматически, когда история станет доступна.</div>}
        <div className="stat-pair"><div><small>VaR 95% · 1 день</small><strong>{pct(risk?.var95)}</strong></div><div><small>Expected Shortfall</small><strong>{pct(risk?.es95)}</strong></div></div>
        <div className="metric-row"><span>Максимальная просадка</span><b>{pct(risk?.maxDrawdown)}</b></div><div className="metric-row"><span>Доходностей в выборке</span><b>{risk?.observations ?? '—'}</b></div>
        <Formula name="VaR и Expected Shortfall" formula="k = ceil(0.05n); VaR = max(0, −r₍k₎); ES = max(0, −mean(r₍1:k₎))">Доходности сортируются по возрастанию. VaR — эмпирический порог потери, ES — средняя потеря в худших k наблюдениях. Это историческая оценка, а не предел возможного убытка. Малые выборки нестабильны.</Formula>
        <Formula name="Максимальная просадка" formula="MDD = maxₜ(1 − Vₜ / maxₛ≤ₜ Vₛ)">Наибольшее падение от предшествовавшего максимума модельной стоимости.</Formula>
      </section>
      <section className="card"><div className="section-heading"><h2>04 / Доходность и риск</h2><span className="tag">Модель</span></div>
        <div className="stat-pair"><div><small>Волатильность · год</small><strong>{pct(volatility)}</strong></div><div><small>Коэффициент Sharpe</small><strong>{sharpe === null ? '—' : sharpe.toFixed(2)}</strong></div></div>
        <label htmlFor="lab-rf" className="field-label">Безрисковая ставка: {rf}% в год</label><input id="lab-rf" type="range" min="0" max="15" step="0.25" value={rf} onChange={e => setRf(Number(e.target.value))} />
        <Formula name="Волатильность" formula="σ_ann = stdev_sample(r_daily) × √252">Выборочное стандартное отклонение дневных доходностей, приведённое к 252 торговым дням. История текущего состава не гарантирует будущий риск.</Formula>
        <Formula name="Sharpe" formula="S = (252 × mean(r_daily) − r_f) / σ_ann">Простая годовая экстраполяция средней дневной доходности. При нулевой волатильности коэффициент не определён. Ставка меняется только для этой модели.</Formula>
      </section>
    </div>
  </>;
}
