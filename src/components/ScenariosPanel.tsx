import { useState } from 'react';
import type { PortfolioSnapshot } from '../types';
import type { AnalyticsController } from '../analytics/usePortfolioAnalytics';
import { scenarioPreset, scenarioValue, type ScenarioPreset } from '../math/scenarios';
import { Formula } from './AnalyticsMetric';
import { WhatIfPanel } from './WhatIfPanel';
import { EfficientFrontierPanel } from './EfficientFrontierPanel';
import { pct } from '../utils/analyticsFormat';
import { formatCurrency } from '../utils/format';
import { buildXRayInsights } from '../math/xrayInsights';

const sections = [
  { id: 'stress', label: 'Stress Test' },
  { id: 'replay', label: 'Historical Replay' },
  { id: 'whatif', label: 'What-if Portfolio' },
  { id: 'frontier', label: 'Efficient Frontier' },
] as const;

export function ScenariosPanel({ snapshot, controller, weights, onWeightsChange }: { snapshot: PortfolioSnapshot; controller: AnalyticsController; weights: (number | null)[] | null; onWeightsChange: (weights: (number | null)[]) => void }) {
  const [section, setSection] = useState<(typeof sections)[number]['id']>('stress');
  return <div className="scenario-lab">
    <div className="scenario-tabs" role="group" aria-label="Scenario modules">{sections.map((item) => <button key={item.id} type="button" aria-pressed={section === item.id} onClick={() => setSection(item.id)}>{item.label}</button>)}</div>
    {section === 'stress' && <StressTestPanel snapshot={snapshot} />}
    {section === 'replay' && <HistoricalReplayPanel snapshot={snapshot} controller={controller} />}
    {section === 'whatif' && <WhatIfPanel snapshot={snapshot} controller={controller} weights={weights} onWeightsChange={onWeightsChange} />}
    {section === 'frontier' && <EfficientFrontierPanel snapshot={snapshot} controller={controller} onLoadWeights={(nextWeights) => { onWeightsChange(nextWeights); setSection('whatif'); }} />}
  </div>;
}

function StressTestPanel({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const symbols = snapshot.positions.map((position) => position.symbol);
  const values = snapshot.positions.map((position) => ({ symbol: position.symbol, value: position.marketValue ?? Number.NaN }));
  const [shocks, setShocks] = useState<Record<string, number | null>>({});
  const [affected, setAffected] = useState<string[]>([]);
  const [preset, setPreset] = useState<ScenarioPreset>('custom');
  const current = snapshot.valuation.complete ? scenarioValue(values, Object.fromEntries(symbols.map((symbol) => [symbol, shocks[symbol] ?? Number.NaN]))) : null;
  const stressInsights = current ? buildXRayInsights({ positions: [], averagePairwiseCorrelation: null, currentDrawdown: null, maxDrawdown: null, commonObservations: 20, requiredObservations: 20, stressScenario: { name: preset, impactPct: current.percentage, assetImpacts: current.assetImpacts.map((item) => ({ symbol: item.symbol, impactPct: item.portfolioImpactPct! })) } }).filter((item) => item.id.startsWith('stress-concentration-')) : [];
  const applyPreset = (value: ScenarioPreset) => {
    setPreset(value);
    if (value === 'custom') { setShocks({}); return; }
    const mapped = scenarioPreset(symbols, value, affected);
    setShocks(mapped);
  };
  const updateAffected = (symbol: string, checked: boolean) => setAffected((previous) => {
    const next = checked ? [...previous, symbol] : previous.filter((item) => item !== symbol);
    if (preset === 'tech' || preset === 'volatility' || preset === 'customEqual') setShocks(scenarioPreset(symbols, preset, next));
    return next;
  });
  const setEqualShock = (symbol: string, shock: number) => setShocks((previous) => ({ ...previous, [symbol]: shock }));
  const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? 'Недостаточно данных' : formatCurrency(value, snapshot.portfolio.base_currency);
  return <div className="lab-grid stress-layout">
    <section className="card">
      <div className="section-heading"><div><h2>Stress Test</h2><p className="caption">Детерминированное изменение текущей рыночной стоимости по заданным пользователем шокам.</p></div><span className="tag">Local sandbox</span></div>
      {!snapshot.valuation.complete && <p className="notice">Нужны актуальные цены всех открытых позиций.</p>}
      {!symbols.length && <p className="empty">Пустой портфель — нечего переоценивать.</p>}
      <label className="field-label" htmlFor="stress-preset">Preset scenario</label>
      <select id="stress-preset" className="input" value={preset} onChange={(event) => applyPreset(event.target.value as ScenarioPreset)}>
        <option value="custom">Custom per-asset shocks</option><option value="broad">Broad Market −10%</option><option value="broad20">Broad Market −20%</option><option value="tech">Manual selected-assets shock −25% / −8%</option><option value="volatility">Manual selected-assets shock −35% / −12%</option><option value="customEqual">Custom Equal Shock</option>
      </select>
      {(preset === 'tech' || preset === 'volatility' || preset === 'customEqual') && <div className="stress-selection"><p className="caption">Preset не определяет сектора автоматически. Отметьте затрагиваемые активы вручную.</p>{symbols.map((symbol) => <label key={symbol}><input type="checkbox" checked={affected.includes(symbol)} onChange={(event) => updateAffected(symbol, event.target.checked)} /> {symbol}</label>)}</div>}
      {symbols.map((symbol) => {
        const value = shocks[symbol]; const weight = snapshot.portfolioValue > 0 && snapshot.positions.find((position) => position.symbol === symbol)?.marketValue != null ? snapshot.positions.find((position) => position.symbol === symbol)!.marketValue! / snapshot.portfolioValue : null;
        return <div className="shock-row" key={symbol}><div className="shock-symbol"><b>{symbol}</b><small>{weight == null || !Number.isFinite(weight) ? 'Weight unavailable' : pct(weight)}</small></div><label><span className="sr-only">Shock {symbol}, percent</span><input aria-label={`Shock ${symbol}, percent`} className="input" type="number" min="-100" max="500" step="0.1" value={value == null || !Number.isFinite(value) ? '' : (value * 100).toFixed(1)} onChange={(event) => setEqualShock(symbol, event.target.value.trim() === '' ? Number.NaN : Number(event.target.value) / 100)} /></label><span>%</span><small>{current?.assetImpacts.find((item) => item.symbol === symbol) ? money(current.assetImpacts.find((item) => item.symbol === symbol)!.impactValue) : 'Недостаточно данных'}</small></div>;
      })}
      {preset === 'customEqual' && <label className="field-label">All-position shock % <input className="input" type="number" min="-100" max="500" step="1" onChange={(event) => { const next = event.target.value.trim() === '' ? Number.NaN : Number(event.target.value) / 100; setShocks(Object.fromEntries(symbols.map((symbol) => [symbol, next]))); }} /></label>}
      <div className="stress-result"><div><span>Portfolio Impact</span><b>{current ? pct(current.percentage) : 'Недостаточно данных'}</b></div><div><span>Portfolio Impact Value</span><b>{current ? money(current.impact) : 'Недостаточно данных'}</b></div><div><span>Scenario Value</span><b>{current ? money(current.after) : 'Недостаточно данных'}</b></div></div>
      {stressInsights.map((item) => <p className="caption" key={item.id}>{item.title}: {item.message}</p>)}
      {current && <div className="table-scroll"><table><thead><tr><th>Asset</th><th>Current Weight</th><th>Shock</th><th>Portfolio Contribution</th><th>Dollar Impact</th></tr></thead><tbody>{current.assetImpacts.map((item) => <tr key={item.symbol}><th scope="row">{item.symbol}</th><td>{pct(item.weight)}</td><td>{pct(item.shockPct)}</td><td>{pct(item.portfolioImpactPct)}</td><td>{money(item.impactValue)}</td></tr>)}</tbody></table></div>}
      <Formula name="Linear stress model" formula="ΔV = Σᵢ(Vᵢ × shockᵢ); impact% = Σᵢ(wᵢ × shockᵢ)">The model revalues current positions once using the shocks entered above. There is no portfolio persistence or transaction creation.</Formula>
    </section>
    <section className="card stress-disclaimer"><h2>Что означает этот результат</h2><p>Stress tests are hypothetical deterministic scenarios. Это не прогноз и не оценка вероятности сценария. Модель не учитывает ликвидность, изменение correlation, динамическое изменение weights, налоги, комиссии и FX. Она не гарантирует аналогичную реакцию рынка в будущем.</p><p className="caption">Шоки preset — задаваемые сценарные параметры, а не исторические оценки и не рекомендации. Состав портфеля в системе не меняется.</p></section>
  </div>;
}

function HistoricalReplayPanel({ snapshot, controller }: { snapshot: PortfolioSnapshot; controller: AnalyticsController }) {
  const replay = controller.analytics.historicalReplay;
  const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? 'Недостаточно данных' : formatCurrency(value, snapshot.portfolio.base_currency);
  return <div className="lab-grid replay-layout">
    <section className="card"><div className="section-heading"><div><h2>Current Holdings Historical Scenario Replay</h2><p className="caption">Текущие веса применены к общим историческим доходностям активов.</p></div><span className="tag">Historical scenario · not account return</span></div>
      {!snapshot.valuation.complete && <p className="notice">Точные текущие weights недоступны.</p>}
      {!replay.length && <p className="notice">Нет достаточно длинной общей истории с непрерывными интервалами для replay.</p>}
      {replay.length > 0 && <div className="table-scroll"><table><thead><tr><th>Window</th><th>Worst observed return</th><th>Scenario value change</th><th>Start</th><th>End</th><th>Observations</th></tr></thead><tbody>{replay.map((item) => <tr key={item.window}><th scope="row">{item.window} interval{item.window === 1 ? '' : 's'}</th><td>{pct(item.return)}</td><td>{snapshot.valuation.complete && snapshot.portfolioValue > 0 ? money(snapshot.portfolioValue * item.return) : 'Недостаточно данных'}</td><td>{item.startDate}</td><td>{item.endDate}</td><td>{item.observations}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="card"><h2>Ограничения Historical Replay</h2><ul><li>Используются текущие holdings и текущие веса.</li><li>Используются фактические historical adjusted-close returns активов с общими точными интервалами.</li><li>Исторические transaction quantities игнорируются.</li><li>Это proxy/scenario analysis, а не transaction-aware historical portfolio return.</li><li>При разрывах цены интервал не заполняется и не соединяется через пропуск.</li></ul><p className="caption">Ни один replay result не является прогнозом будущего или исторической доходностью реального портфеля.</p></section>
  </div>;
}
