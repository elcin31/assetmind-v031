import type { PortfolioAnalytics } from '../math/analytics';
import { historicalStressWindows } from '../math/historicalStress';
import { Formula } from './AnalyticsMetric';
import { pct } from '../utils/analyticsFormat';
import './core-p2.css';

function dateRange(start: string, end: string) {
  const format = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('ru-RU');
  return start === end ? format(end) : `${format(start)} — ${format(end)}`;
}

export function PortfolioIntelligencePanel({ analytics: a }: { analytics: PortfolioAnalytics }) {
  const stress = historicalStressWindows(a.proxy.returns, [1, 5, 20, 63]);

  return (
    <>
      <section className="card intelligence-card">
        <div className="section-heading">
          <div>
            <h2>Historical Stress · Current Holdings Proxy</h2>
            <p className="caption">Худшие непрерывные окна для сегодняшнего состава на прошлых adjusted close. Это не фактическая история портфеля и не прогноз.</p>
          </div>
          <span className="tag">{a.proxy.returns.length} proxy intervals</span>
        </div>
        {!stress.length && <p className="notice">Недостаточно непрерывной общей истории текущих активов для stress windows.</p>}
        {!!stress.length && <div className="stress-grid">{stress.map((item) => <div key={item.window}>
          <span>Worst {item.window}D</span>
          <b className={item.return < 0 ? 'negative' : 'positive'}>{pct(item.return)}</b>
          <small>{dateRange(item.startDate, item.endDate)}</small>
        </div>)}</div>}
        <Formula name="Worst rolling stress" formula="R₍t,w₎ = Πₖ₌₁ʷ(1+rₖ) − 1;  stress_w = minₜ R₍t,w₎">
          Окно допускается только если каждый следующий return-интервал начинается в точной конечной дате предыдущего. Provider gaps не соединяются и не заполняются нулями. Фиксируются сегодняшние количества активов, поэтому результат относится к current-holdings proxy. Risk Horizon selector этот блок не обрезает.
        </Formula>
      </section>
    </>
  );
}
