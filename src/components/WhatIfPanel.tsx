import { useMemo, useState } from 'react';
import type { AnalyticsController } from '../analytics/usePortfolioAnalytics';
import type { PortfolioSnapshot } from '../types';
import { evaluateWhatIfPortfolio, normalizeScenarioWeights } from '../math/whatIf';
import { pct, numeric } from '../utils/analyticsFormat';
import { buildXRayInsights } from '../math/xrayInsights';

export function WhatIfPanel({ snapshot, controller: c, weights: controlledWeights, onWeightsChange }: { snapshot: PortfolioSnapshot; controller: AnalyticsController; weights?: (number | null)[] | null; onWeightsChange?: (weights: (number | null)[]) => void }) {
  const positions = snapshot.positions;
  const currentWeights = useMemo(() => {
    if (!snapshot.valuation.complete || !positions.length || !(snapshot.portfolioValue > 0)) return [];
    return positions.map((position) => position.marketValue == null ? null : position.marketValue / snapshot.portfolioValue);
  }, [positions, snapshot.portfolioValue, snapshot.valuation.complete]);
  const [scenarioWeights, setScenarioWeights] = useState<(number | null)[]>(currentWeights);
  const effectiveScenario = controlledWeights == null
    ? (scenarioWeights.length === currentWeights.length ? scenarioWeights : currentWeights)
    : controlledWeights.length === currentWeights.length ? controlledWeights : currentWeights;
  const saveWeights = (next: (number | null)[]) => { setScenarioWeights(next); onWeightsChange?.(next); };
  const completeWeights = effectiveScenario.length > 0 && effectiveScenario.every((weight): weight is number => weight !== null && Number.isFinite(weight) && weight >= 0);
  const scenarioSum = completeWeights ? effectiveScenario.reduce((sum, weight) => sum + weight, 0) : null;
  const validScenario = completeWeights && scenarioSum !== null && Math.abs(scenarioSum - 1) <= 1e-6;
  const symbols = positions.map((position) => position.symbol);
  const matrix = c.analytics.matrix;
  const currentAnalytics = useMemo(() => evaluateWhatIfPortfolio(symbols, currentWeights.every((weight): weight is number => weight !== null) ? currentWeights : [], matrix, c.analytics.whatIfBenchmarkReturns, c.rf / 100), [symbols, currentWeights, matrix, c.analytics.whatIfBenchmarkReturns, c.rf]);
  const scenarioAnalytics = useMemo(() => validScenario ? evaluateWhatIfPortfolio(symbols, effectiveScenario as number[], matrix, c.analytics.whatIfBenchmarkReturns, c.rf / 100) : null, [validScenario, symbols, effectiveScenario, matrix, c.analytics.whatIfBenchmarkReturns, c.rf]);
  const changeWeight = (index: number, value: string) => {
    const previous = effectiveScenario;
    const next = previous.length === currentWeights.length ? [...previous] : [...currentWeights];
    next[index] = value.trim() === '' ? null : Number(value) / 100;
    saveWeights(next);
  };
  const reset = () => saveWeights([...currentWeights]);
  const normalize = () => {
    if (!completeWeights) return;
    const result = normalizeScenarioWeights(effectiveScenario as number[]);
    if (result) saveWeights(result);
  };
  const rc = new Map((scenarioAnalytics?.riskContributions ?? []).map((item) => [item.symbol, item.contribution]));
  const currentRc = new Map(currentAnalytics.riskContributions.map((item) => [item.symbol, item.contribution]));
  const scenarioInsights = scenarioAnalytics ? buildXRayInsights({ positions: [], averagePairwiseCorrelation: null, currentDrawdown: null, maxDrawdown: null, commonObservations: c.analytics.riskMatrix.commonObservations, requiredObservations: c.analytics.riskMatrix.required, scenarioComparison: { currentVolatility: currentAnalytics.volatility, scenarioVolatility: scenarioAnalytics.volatility, currentEffectiveHoldings: currentAnalytics.effectiveHoldings, scenarioEffectiveHoldings: scenarioAnalytics.effectiveHoldings } }).filter((item) => item.id.startsWith('whatif-')) : [];

  return <div className="lab-grid whatif-layout">
    <section className="card">
      <div className="section-heading"><div><h2>What-if Portfolio</h2><p className="caption">Временная модель весов. Реальные позиции, транзакции и хранилище не меняются.</p></div><span className="tag">Sandbox · {c.riskHorizon}</span></div>
      {!snapshot.valuation.complete && <p className="notice">Для начальных весов нужны текущие цены всех позиций.</p>}
      {!positions.length && <p className="empty">Добавьте позиции, чтобы открыть sandbox.</p>}
      {positions.map((position, index) => {
        const current = currentWeights[index]; const scenario = effectiveScenario[index];
        const diff = current == null || scenario == null ? null : scenario - current;
        return <div className="whatif-weight-row" key={position.symbol}>
          <div className="whatif-weight-label"><b>{position.symbol}</b><span>Текущий {current == null ? 'Недостаточно данных' : pct(current)}</span></div>
          <input aria-label={`${position.symbol} scenario weight slider`} type="range" min="0" max="100" step="0.1" value={scenario == null || !Number.isFinite(scenario) ? 0 : scenario * 100} disabled={scenario == null || !Number.isFinite(scenario)} onChange={(event) => changeWeight(index, event.target.value)} />
          <label><span>Scenario %</span><input aria-label={`${position.symbol} scenario weight`} className="input" type="number" min="0" max="100" step="0.1" value={scenario == null || !Number.isFinite(scenario) ? '' : (scenario * 100).toFixed(1)} onChange={(event) => changeWeight(index, event.target.value)} /></label>
          <small>Δ {diff == null ? 'Недостаточно данных' : `${diff >= 0 ? '+' : ''}${(diff * 100).toFixed(1)}%`}</small>
        </div>;
      })}
      <div className="whatif-actions"><button className="btn btn-ghost" type="button" onClick={reset}>Reset to Current Portfolio</button><button className="btn btn-ghost" type="button" onClick={normalize} disabled={!completeWeights || scenarioSum === 0}>Normalize Weights</button><span className={validScenario ? 'tag' : 'tag whatif-invalid'}>Σ weights {scenarioSum == null ? 'Недостаточно данных' : pct(scenarioSum)}{!validScenario && scenarioSum !== null ? ' · сумма должна быть 100%' : ''}</span></div>
      {!validScenario && completeWeights && <p className="notice">Весы оставлены как введены. Нормализация произойдёт только по нажатию кнопки.</p>}
    </section>
    <section className="card">
      <h2>Current vs Scenario</h2><p className="caption">Показатели рассчитаны на общей исторической ковариации за выбранное окно. Более высокое или низкое значение само по себе не является оценкой «лучше».</p>
      <div className="table-scroll"><table className="whatif-metrics-table"><thead><tr><th>Metric</th><th>Current</th><th>Scenario</th><th>Δ</th></tr></thead><tbody>
        <ComparisonRow label="Volatility" current={currentAnalytics.volatility} scenario={scenarioAnalytics?.volatility ?? null} format={pct} />
        <ComparisonRow label="Sharpe" current={currentAnalytics.sharpe} scenario={scenarioAnalytics?.sharpe ?? null} format={numeric} />
        <ComparisonRow label={`Beta · ${c.benchmark}`} current={currentAnalytics.beta} scenario={scenarioAnalytics?.beta ?? null} format={numeric} />
        <ComparisonRow label="Diversification Ratio" current={currentAnalytics.diversificationRatio} scenario={scenarioAnalytics?.diversificationRatio ?? null} format={numeric} />
        <ComparisonRow label="Effective Holdings" current={currentAnalytics.effectiveHoldings} scenario={scenarioAnalytics?.effectiveHoldings ?? null} format={numeric} />
        <ComparisonRow label="Largest Position" current={currentAnalytics.largestPosition} scenario={scenarioAnalytics?.largestPosition ?? null} format={pct} />
        <LargestRiskContributorRow current={currentAnalytics.largestRiskContributor} scenario={scenarioAnalytics?.largestRiskContributor ?? null} />
      </tbody></table></div>
      {(!currentAnalytics.volatility || scenarioAnalytics?.reason) && <p className="notice">{scenarioAnalytics?.reason ?? currentAnalytics.reason ?? 'Для этих показателей требуется доступная общая covariance matrix.'}</p>}
      {scenarioInsights.map((item) => <p className="caption" key={item.id}>{item.title}: {item.message}</p>)}
    </section>
    <section className="card whatif-risk-budget">
      <div className="section-heading"><div><h2>Risk Contribution · Current vs Scenario</h2><p className="caption">Нормированный вклад в annualized portfolio volatility.</p></div><span className="tag">{c.riskHorizon}</span></div>
      {!validScenario ? <p className="notice">Сначала задайте конечные неотрицательные веса с суммой 100%.</p> : !scenarioAnalytics ? <p className="notice">{currentAnalytics.reason ?? 'Risk Contribution недоступен.'}</p> : <div className="table-scroll"><table><thead><tr><th>Symbol</th><th>Current RC %</th><th>Scenario RC %</th><th>Δ</th></tr></thead><tbody>{symbols.map((symbol) => <tr key={symbol}><th scope="row">{symbol}</th><td>{currentRc.has(symbol) ? pct(currentRc.get(symbol)!) : 'Недостаточно данных'}</td><td>{rc.has(symbol) ? pct(rc.get(symbol)!) : 'Недостаточно данных'}</td><td>{rc.has(symbol) && currentRc.has(symbol) ? pct(rc.get(symbol)! - currentRc.get(symbol)!) : 'Недостаточно данных'}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="card"><h2>Пределы модели</h2><p className="caption">Это historical what-if sandbox по тем же активам и covariance window. Средняя историческая доходность не трактуется как ожидаемая будущая доходность. Корреляции активов не меняются при редактировании весов; long-only и Σw=1.</p><p className="caption">Доступно общих наблюдений: {matrix?.observations ?? 0}; Risk Horizon: {c.riskHorizon}. Никакие реальные holdings или транзакции не затрагиваются.</p></section>
  </div>;
}

function ComparisonRow({ label, current, scenario, format }: { label: string; current: number | null; scenario: number | null; format: (value: number) => string }) {
  const valid = current !== null && scenario !== null && Number.isFinite(current) && Number.isFinite(scenario);
  return <tr><th scope="row">{label}</th><td>{current == null || !Number.isFinite(current) ? 'Недостаточно данных' : format(current)}</td><td>{scenario == null || !Number.isFinite(scenario) ? 'Недостаточно данных' : format(scenario)}</td><td>{valid ? format(scenario - current) : 'Недостаточно данных'}</td></tr>;
}

function LargestRiskContributorRow({ current, scenario }: { current: { symbol: string; contribution: number } | null; scenario: { symbol: string; contribution: number } | null }) {
  const delta = current && scenario ? scenario.contribution - current.contribution : null;
  return <tr><th scope="row">Largest Risk Contributor</th><td>{current ? `${current.symbol} · ${pct(current.contribution)}` : 'Недостаточно данных'}</td><td>{scenario ? `${scenario.symbol} · ${pct(scenario.contribution)}` : 'Недостаточно данных'}</td><td>{delta === null ? 'Недостаточно данных' : `${delta >= 0 ? '+' : ''}${pct(delta)} · ${current!.symbol === scenario!.symbol ? current!.symbol : `${current!.symbol} → ${scenario!.symbol}`}`}</td></tr>;
}
