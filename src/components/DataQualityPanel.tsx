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
  const lastProxyDate = proxyReturns.length ? proxyReturns[proxyReturns.length - 1].date : null;
  const cleanIntervals = a.performance.riskReturns.length;
  const commonIntervals = a.matrix?.observations ?? 0;
  const benchmarkIntervals = a.benchmark.observations;
  const historyNotStarted = Boolean(firstTransaction && lastProxyDate && firstTransaction > lastProxyDate && cleanIntervals === 0);
  const providerPartial = c.errors.length > 0;
  const valuationPartial = !snapshot.valuation.complete;
  const needsAttention = providerPartial || valuationPartial || historyNotStarted || (snapshot.transactions.length > 0 && cleanIntervals < 20);

  return (
    <section className="card data-quality-card">
      <div className="section-heading">
        <div>
          <h2>Качество данных</h2>
          <p className="caption">Что реально доступно для расчётов и почему отдельные метрики могут быть недоступны.</p>
        </div>
        <span className="tag">{c.loading ? 'Проверка…' : needsAttention ? 'Требует внимания' : 'Готово'}</span>
      </div>

      {historyNotStarted && (
        <p className="notice">
          Первая сделка датирована {day(firstTransaction)}, а последняя завершённая рыночная история заканчивается {day(lastProxyDate)}. Фактическая история портфеля ещё не имеет ни одного полного return-интервала. Proxy текущего состава при этом может рассчитываться по более ранним ценам.
        </p>
      )}
      {!historyNotStarted && snapshot.transactions.length > 0 && cleanIntervals < 20 && !c.loading && (
        <p className="notice">
          Для большинства risk-метрик нужно минимум 20 чистых однодневных интервалов. Сейчас доступно {cleanIntervals}/20. BUY/SELL и неизвестные ценовые разрывы не подменяются нулевой доходностью.
        </p>
      )}
      {providerPartial && (
        <p className="notice">История поставщика загружена частично: {c.errors.join('; ')}</p>
      )}

      <div className="data-quality-grid">
        <div><span>Рыночная оценка</span><b>{snapshot.valuation.pricedPositions}/{snapshot.valuation.totalPositions} позиций</b></div>
        <div><span>Первая сделка</span><b>{day(firstTransaction)}</b></div>
        <div><span>Чистые portfolio returns</span><b>{cleanIntervals}</b></div>
        <div><span>Общие интервалы активов</span><b>{commonIntervals}</b></div>
        <div><span>Benchmark aligned</span><b>{benchmarkIntervals}</b></div>
        <div><span>Current-holdings proxy</span><b>{proxyReturns.length}</b></div>
      </div>

      {(providerPartial || valuationPartial) && (
        <button className="btn btn-ghost" type="button" onClick={c.retry}>Повторить загрузку рынка</button>
      )}
    </section>
  );
}
