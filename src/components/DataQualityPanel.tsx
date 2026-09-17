import type { PortfolioSnapshot } from '../types';
import type { AnalyticsController } from '../analytics/usePortfolioAnalytics';

function day(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
}

export function DataQualityPanel({
  snapshot,
  controller: c,
}: {
  snapshot: PortfolioSnapshot;
  controller: AnalyticsController;
}) {
  const a = c.analytics;
  const firstTransaction = snapshot.transactions.length
    ? [...snapshot.transactions].sort((x, y) => Date.parse(x.timestamp) - Date.parse(y.timestamp))[0].timestamp.slice(0, 10)
    : null;
  const proxyReturns = a.proxy.dailyReturns;
  const datedProxyReturns = a.proxy.returns;
  const lastProxyDate = datedProxyReturns.length ? datedProxyReturns[datedProxyReturns.length - 1].date : null;
  const cleanIntervals = a.performance.riskReturns.length;
  const commonIntervals = a.riskMatrix.commonObservations;
  const requiredRiskIntervals = a.riskMatrix.required;
  const benchmarkIntervals = a.benchmark.observations;
  const historyNotStarted = Boolean(firstTransaction && lastProxyDate && firstTransaction > lastProxyDate && cleanIntervals === 0);
  const providerPartial = c.errors.length > 0;
  const valuationPartial = !snapshot.valuation.complete;
  const cashIncomplete = Boolean(snapshot.cashLedger && !snapshot.cashLedger.complete && (snapshot.transactions.length || snapshot.cashEvents?.length));
  const actualHistoryUnavailable = Boolean(a.history.reason && snapshot.transactions.length > 0 && !c.loading);
  const riskUnavailable = !a.riskMatrix.matrix || !a.actualRiskWindow.available;
  const needsAttention = providerPartial || valuationPartial || cashIncomplete || actualHistoryUnavailable || historyNotStarted || riskUnavailable;

  return (
    <section className="card data-quality-card">
      <div className="section-heading">
        <div>
          <h2>Качество данных</h2>
          <p className="caption">Что реально доступно для расчётов и почему отдельные метрики могут быть недоступны.</p>
        </div>
        <span className="tag">{c.loading ? 'Проверка…' : needsAttention ? 'Требует внимания' : 'Готово'}</span>
      </div>

      {actualHistoryUnavailable && <p className="notice">{a.history.reason}</p>}
      {historyNotStarted && (
        <p className="notice">
          Первая сделка датирована {day(firstTransaction)}, а последняя завершённая рыночная история заканчивается {day(lastProxyDate)}. Фактическая история портфеля ещё не имеет ни одного полного return-интервала. Proxy текущего состава при этом может рассчитываться по более ранним ценам.
        </p>
      )}
      {!actualHistoryUnavailable && !historyNotStarted && !a.actualRiskWindow.available && snapshot.transactions.length > 0 && !c.loading && (
        <p className="notice">{a.actualRiskWindow.reason}</p>
      )}
      {!a.riskMatrix.matrix && snapshot.positions.length > 0 && !c.loading && (
        <p className="notice">{a.riskMatrix.reason}</p>
      )}
      {cashIncomplete && <p className="notice">{snapshot.cashLedger?.reason}</p>}
      {providerPartial && <p className="notice">История поставщика загружена частично: {c.errors.join('; ')}</p>}

      <div className="data-quality-grid">
        <div><span>Рыночная оценка</span><b>{snapshot.valuation.pricedPositions}/{snapshot.valuation.totalPositions} позиций</b></div>
        <div><span>Cash ledger</span><b>{snapshot.cashLedger?.complete ? 'reconciled' : 'incomplete'}</b></div>
        <div><span>Первая сделка</span><b>{day(firstTransaction)}</b></div>
        <div><span>Фактический {c.riskHorizon} Risk</span><b>{a.actualRiskWindow.availableObservations}/{a.actualRiskWindow.required}</b></div>
        <div><span>{c.riskHorizon} Risk Matrix</span><b>{commonIntervals}/{requiredRiskIntervals} · {a.riskMatrix.matrix ? 'Ready' : 'Unavailable'}</b></div>
        <div><span>Benchmark aligned</span><b>{benchmarkIntervals}</b></div>
        <div><span>Current-holdings proxy</span><b>{proxyReturns.length}</b></div>
      </div>

      {a.riskMatrix.limitingSymbols.length > 0 && !a.riskMatrix.matrix && (
        <p className="caption">Ограничивающая история: {a.riskMatrix.limitingSymbols.join(', ')}.</p>
      )}

      {(providerPartial || valuationPartial) && (
        <button className="btn btn-ghost" type="button" onClick={c.retry}>Повторить загрузку рынка</button>
      )}
    </section>
  );
}
