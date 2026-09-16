import { useState } from "react";
import type { PortfolioSnapshot } from "../types";
import {
  scenarioPreset,
  scenarioValue,
  type ScenarioPreset,
} from "../math/scenarios";
import { Formula } from "./AnalyticsMetric";
import { pct } from "../utils/analyticsFormat";
import { formatCurrency } from "../utils/format";
export function ScenariosPanel({
  snapshot: s,
}: {
  snapshot: PortfolioSnapshot;
}) {
  const [shock, setShock] = useState(-20);
  const [target, setTarget] = useState("*");
  const [shocks, setShocks] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const symbols = s.positions.map((p) => p.symbol);
  const values = s.positions.map((p) => ({
    symbol: p.symbol,
    value: p.marketValue ?? NaN,
  }));
  const simple = s.valuation.complete
    ? scenarioValue(
        values,
        Object.fromEntries(
          symbols.map((symbol) => [
            symbol,
            target === "*" || symbol === target ? shock / 100 : 0,
          ]),
        ),
      )
    : null;
  const advanced = s.valuation.complete
    ? scenarioValue(
        values,
        Object.fromEntries(
          symbols.map((symbol) => [symbol, shocks[symbol] ?? 0]),
        ),
      )
    : null;
  const money = (v: number | null | undefined) =>
    formatCurrency(v ?? undefined, s.portfolio.base_currency);
  return (
    <div className="lab-grid">
      <section className="card scenario-card">
        <h2>Общий стресс-сценарий</h2>
        <label className="field-label" htmlFor="scenario-target">
          Применить к
        </label>
        <select
          id="scenario-target"
          className="input"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="*">Весь портфель</option>
          {symbols.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <label className="field-label" htmlFor="scenario-shock">
          Шок: {shock}%
        </label>
        <input
          id="scenario-shock"
          type="range"
          min="-100"
          max="100"
          value={shock}
          onChange={(e) => setShock(Number(e.target.value))}
        />
        <div className="stat-pair">
          <div>
            <small>После шока</small>
            <strong>{money(simple?.after)}</strong>
          </div>
          <div>
            <small>Изменение</small>
            <strong>{money(simple?.impact)}</strong>
          </div>
        </div>
        <p className="caption">Гипотетический сценарий, не прогноз.</p>
      </section>
      <section className="card">
        <h2>Шоки по активам</h2>
        <p className="caption">
          Отметьте активы технологической / высоковолатильной группы сами:
          сектор не определяется автоматически.
        </p>
        {symbols.map((symbol) => (
          <div className="shock-row" key={symbol}>
            <label>
              <input
                type="checkbox"
                checked={selected.includes(symbol)}
                onChange={(e) =>
                  setSelected((v) =>
                    e.target.checked
                      ? [...v, symbol]
                      : v.filter((s) => s !== symbol),
                  )
                }
              />{" "}
              {symbol}
            </label>
            <label>
              <span className="sr-only">Шок {symbol}, %</span>
              <input
                className="input"
                type="number"
                min="-100"
                max="100"
                step="1"
                value={(shocks[symbol] ?? 0) * 100}
                onChange={(e) =>
                  setShocks((v) => ({
                    ...v,
                    [symbol]:
                      e.target.value === ""
                        ? 0
                        : Math.max(
                            -100,
                            Math.min(100, Number(e.target.value)),
                          ) / 100,
                  }))
                }
              />
            </label>
            <span>%</span>
          </div>
        ))}
        <label className="field-label" htmlFor="scenario-preset">
          Заполнить шоки сценарием
        </label>
        <select
          id="scenario-preset"
          className="input"
          defaultValue="custom"
          onChange={(e) =>
            setShocks(
              scenarioPreset(
                symbols,
                e.target.value as ScenarioPreset,
                selected,
              ),
            )
          }
        >
          <option value="custom">Свой сценарий / сброс</option>
          <option value="broad">Общее падение рынка: −15%</option>
          <option value="tech">Технологическая коррекция: −25% / −8%</option>
          <option value="volatility">Шок волатильности: −35% / −12%</option>
        </select>
        <div className="metric-row">
          <span>Текущая стоимость</span>
          <b>{money(advanced?.current)}</b>
        </div>
        <div className="metric-row">
          <span>Стоимость сценария</span>
          <b>{money(advanced?.after)}</b>
        </div>
        <div className="metric-row">
          <span>Денежный эффект</span>
          <b>{money(advanced?.impact)}</b>
        </div>
        <div className="metric-row">
          <span>Эффект, %</span>
          <b>{pct(advanced?.percentage)}</b>
        </div>
        <p className="caption">
          Гипотетический сценарий, не прогноз. Preset только заполняет шоки. Для
          расчёта нужны котировки всех открытых позиций.
        </p>
        <Formula name="Переоценка" formula="V′ = ΣVᵢ(1 + shockᵢ); ΔV = V′ − V">
          База — текущая рыночная стоимость. Не учитывает ликвидность, FX,
          комиссии и изменение корреляций. Сделки не изменяются.
        </Formula>
      </section>
    </div>
  );
}
