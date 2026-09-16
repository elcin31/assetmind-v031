import { useEffect, useId, useState } from 'react';
import type { HistoryBar } from '../types';
import { TradingViewChart } from './TradingViewChart';
import { loadHistory } from '../analytics/historyCache';
import { chartGeometry } from '../utils/priceHistory';

const periods = [{ value: '1m', label: '1М' }, { value: '3m', label: '3М' }, { value: '6m', label: '6М' }, { value: '1y', label: '1Г' }, { value: '5y', label: '5Л' }];
const number = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 4 });
const date = (value: string) => new Date(value).toLocaleDateString('ru-RU', { timeZone: 'UTC' });
type Result = { key: string; bars: HistoryBar[]; error?: string };

export function PriceChart({ symbol }: { symbol: string }) {
  const [period, setPeriod] = useState('1y');
  const [result, setResult] = useState<Result | null>(null);
  const [retry, setRetry] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const gradient = useId();
  const requestKey = `${symbol}:${period}:${retry}`;
  const current = result?.key === requestKey ? result : null;
  const bars = current?.bars ?? [];
  useEffect(() => {
    let active = true;
    void loadHistory(symbol, period, retry > 0).then(bars => {
      if (active) setResult({ key: requestKey, bars });
    }).catch(error => {
      if (active) setResult({ key: requestKey, bars: [], error: error instanceof Error ? error.message : 'Не удалось загрузить историю цен.' });
    });
    return () => { active = false; };
  }, [symbol, period, requestKey, retry]);
  const { points, min, max } = chartGeometry(bars);
  const first = bars[0];
  const last = bars[bars.length - 1];
  const change = first && last ? (last.close / first.close - 1) * 100 : 0;
  const index = cursor === null ? bars.length - 1 : Math.min(cursor, bars.length - 1);
  const focused = bars[index];
  const line = points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  return <div className="price-chart" aria-busy={!current}>
    <div className="section-heading"><h2>Цена · {symbol}</h2>{last && <span className={change >= 0 ? 'positive' : 'negative'}>{change > 0 ? '+' : ''}{change.toFixed(2)}%</span>}</div>
    <div className="chart-periods" role="group" aria-label="Период графика">{periods.map(p => <button type="button" key={p.value} aria-pressed={period === p.value} onClick={() => { setPeriod(p.value); setCursor(null); }}>{p.label}</button>)}</div>
    {!current ? <div className="chart-placeholder" role="status">Загружаем историю цен…</div> : current.error ? <div><p className="caption" role="status">{current.error}</p><TradingViewChart key={requestKey} symbol={symbol} period={period} /><button type="button" className="btn btn-ghost" onClick={() => { setRetry(n => n + 1); setCursor(null); }}>Повторить</button></div> : bars.length < 2 ? <div><p className="caption" role="status">Недостаточно дневных цен за этот период.</p><TradingViewChart key={requestKey} symbol={symbol} period={period} /></div> : <>
      <div className="chart-readout"><strong>{number(focused.close)}</strong><span>{date(focused.date)}</span></div>
      <svg className="price-plot" viewBox="0 0 600 230" role="img" aria-label={`История цены ${symbol}, от ${date(first.date)} до ${date(last.date)}. Изменение ${change.toFixed(2)} процентов.`}
        onPointerMove={event => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width * 600;
          let nearest = 0;
          for (let i = 1; i < points.length; i++) if (Math.abs(points[i].x - x) < Math.abs(points[nearest].x - x)) nearest = i;
          setCursor(nearest);
        }} onPointerLeave={() => setCursor(null)}>
        <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".24"/><stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs>
        {[16, 110, 204].map(y => <line key={y} x1="16" x2="584" y1={y} y2={y} stroke="var(--border)" strokeDasharray="4 6"/>)}
        <polygon points={`${points[0].x},214 ${line} ${points[points.length - 1].x},214`} fill={`url(#${gradient})`} />
        <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
        <line x1={points[index].x} x2={points[index].x} y1="16" y2="214" stroke="var(--text-muted)" strokeDasharray="3 5"/>
        <circle cx={points[index].x} cy={points[index].y} r="5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2"/>
        <text x="20" y="13" fill="var(--text-muted)" fontSize="11">{number(max)}</text><text x="20" y="227" fill="var(--text-muted)" fontSize="11">{number(min)}</text>
      </svg>
      <div className="range-labels"><span>{date(first.date)}</span><span>{date(last.date)}</span></div>
      <input className="chart-scrubber" type="range" min="0" max={bars.length - 1} value={index} aria-label="Дата на графике" aria-valuetext={`${date(focused.date)}: ${number(focused.close)}`} onChange={event => setCursor(Number(event.target.value))}/>
      <p className="caption">Дневные цены закрытия в валюте котировки. Последняя дата: {date(last.date)}. Источник: серверный market history (Finnhub / Yahoo); цены с поправкой на splits, без реинвестирования дивидендов.</p>
    </>}
  </div>;
}
