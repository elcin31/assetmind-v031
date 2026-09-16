import type { PortfolioAnalytics } from '../math/analytics';
import { minimumVariancePortfolio } from '../math/portfolioOptimization';
import { historicalStressWindows } from '../math/historicalStress';
import { Formula } from './AnalyticsMetric';
import { pct } from '../utils/analyticsFormat';
import './core-p2.css';

function dateRange(start: string, end: string) {
  const format = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('ru-RU');
  return start === end ? format(end) : `${format(start)} — ${format(end)}`;
}

export function PortfolioIntelligencePanel({ analytics: a }: { analytics: PortfolioAnalytics }) {
  const optimizer = a.matrix && a.currentRisk
    ? minimumVariancePortfolio(
        a.matrix.symbols,
        a.currentRisk.contributions.map((item) => item.weight),
        a.matrix.covariance,
      )
    : null;
  const stress = historicalStressWindows(a.proxy.returns, [1, 5, 20, 63]);
  const optimizerReason = !a.matrix
    ? 'Optimizer требует минимум 20 строго общих return-интервалов для всех текущих активов.'
    : !a.currentRisk
      ? 'Optimizer требует полной текущей рыночной оценки и положительной portfolio variance.'
      : !optimizer
        ? 'Minimum-variance решение численно недоступно для текущей covariance matrix.'
        : null;

  return (
    <>
      <section className="card intelligence-card">
        <div className="section-heading">
          <div>
            <h2>Minimum-Variance Research</h2>
            <p className="caption">Long-only оптимизация по общей исторической covariance matrix. Никаких guessed expected returns.</p>
          </div>
          <span className="tag">{optimizer ? `${a.matrix?.observations ?? 0} intervals` : 'Unavailable'}</span>
        </div>
        {optimizerReason && <p className="notice">{optimizerReason}</p>}
        {optimizer && <>
          <div className="intelligence-metrics">
            <div><span>Current volatility</span><b>{pct(optimizer.currentVolatility)}</b></div>
            <div><span>Min-var volatility</span><b>{pct(optimizer.optimizedVolatility)}</b></div>
            <div><span>Volatility reduction</span><b>{pct(optimizer.volatilityReduction)}</b></div>
            <div><span>Required turnover</span><b>{pct(optimizer.turnover)}</b></div>
            <div><span>Risk bets now</span><b>{optimizer.currentEffectiveRiskBets?.toFixed(2) ?? '—'}</b></div>
            <div><span>Risk bets min-var</span><b>{optimizer.optimizedEffectiveRiskBets?.toFixed(2) ?? '—'}</b></div>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Актив</th><th>Сейчас</th><th>Min-var</th><th>Δ веса</th></tr></thead>
              <tbody>{optimizer.weights.map((row) => <tr key={row.symbol}>
                <td><b>{row.symbol}</b></td>
                <td>{pct(row.currentWeight)}</td>
                <td>{pct(row.optimizedWeight)}</td>
                <td className={row.delta > 0 ? 'positive' : row.delta < 0 ? 'negative' : ''}>{row.delta > 0 ? '+' : ''}{pct(row.delta)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="intelligence-comparison">
            <span>Diversification ratio: <b>{optimizer.currentDiversificationRatio?.toFixed(2) ?? '—'} → {optimizer.optimizedDiversificationRatio?.toFixed(2) ?? '—'}</b></span>
            <span>Solver iterations: <b>{optimizer.iterations.toLocaleString('ru-RU')}</b></span>
          </div>
        </>}
        <Formula name="Long-only minimum variance" formula="min w′Σw;  wᵢ ≥ 0;  Σwᵢ = 1">
          Σ — annualized covariance matrix на строго общих интервалах. Решение ищется projected-gradient методом на simplex. Это research benchmark, а не торговая рекомендация: модель не учитывает cash, налоги, комиссии, ограничения лотов и будущие expected returns. Если sample covariance изменится, решение тоже изменится.
        </Formula>
      </section>

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
          Окно допускается только если каждый следующий return-интервал начинается в точной конечной дате предыдущего. Provider gaps не соединяются и не заполняются нулями. Фиксируются сегодняшние количества активов, поэтому результат относится к current-holdings proxy.
        </Formula>
      </section>
    </>
  );
}
