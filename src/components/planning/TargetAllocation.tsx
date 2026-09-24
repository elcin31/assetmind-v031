import { useState } from "react";
import type { PortfolioSnapshot } from "../../types";
import {
  initialTargetDraft,
  parseTargetDraft,
  targetRows,
} from "../../math/planningDecisions";
import { updateTargetAllocation } from "../../storage/planning";
import { pct } from "../../utils/analyticsFormat";

export function TargetAllocation({
  snapshot: s,
  userId,
  onChanged,
  onError,
}: {
  snapshot: PortfolioSnapshot;
  userId: string;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [draft, setDraft] = useState(() => initialTargetDraft(s));
  const [symbol, setSymbol] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const parsed = parseTargetDraft(draft);
  const comparison = targetRows(
    s,
    parsed.reason
      ? Object.keys(draft).map((symbol) => ({ symbol, weight: 0 }))
      : parsed.targets,
  );
  const save = async () => {
    if (parsed.reason) return;
    setSaving(true);
    onError(null);
    try {
      await updateTargetAllocation(
        parsed.targets,
        userId,
        s.portfolio.id,
        s.portfolio.base_currency,
      );
      setSaved(true);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Не удалось сохранить цели.");
    } finally {
      setSaving(false);
    }
  };
  const add = () => {
    const normalized = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9.-]{1,20}$/.test(normalized) || normalized === "CASH") {
      onError("Введите корректный тикер. CASH рассчитывается как остаток.");
      return;
    }
    setDraft((d) => ({ ...d, [normalized]: d[normalized] ?? "0" }));
    setSymbol("");
    setSaved(false);
  };
  return (
    <section className="card" aria-label="Target Allocation">
      <div className="section-heading">
        <div>
          <h2>Целевая структура</h2>
          <p className="caption">
            Веса от стоимости счёта, включая CASH. Balanced: отклонение не более
            0,1 п.п.
          </p>
        </div>
        <button
          className="text-button"
          onClick={() => {
            setDraft(initialTargetDraft(s));
            setSaved(false);
          }}
        >
          Сбросить черновик
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Актив</th>
              <th>Сейчас</th>
              <th>Target</th>
              <th>Разница, п.п.</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.symbol}>
                <td>
                  <b>{row.symbol}</b>
                </td>
                <td>{pct(row.current)}</td>
                <td>
                  {row.symbol === "CASH" ? (
                    <b>{pct(parsed.cash)}</b>
                  ) : (
                    <label className="target-percent">
                      <input
                        aria-label={`Target ${row.symbol}, %`}
                        className="input"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={draft[row.symbol] ?? "0"}
                        onChange={(e) => {
                          setDraft({ ...draft, [row.symbol]: e.target.value });
                          setSaved(false);
                        }}
                      />
                      %
                    </label>
                  )}
                </td>
                <td>
                  {parsed.reason ? "—" : pct(row.difference).replace("%", "")}
                </td>
                <td>{parsed.reason ? "—" : (row.status ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="caption">
        Target CASH — остаток до 100%. Изменяйте цели активов, чтобы задать
        желаемый денежный резерв.
      </p>
      <div className="planning-actions">
        <label>
          Добавить тикер
          <input
            className="input"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="GOOGL"
          />
        </label>
        <button className="btn btn-ghost" onClick={add}>
          Добавить цель
        </button>
        <button
          className="btn btn-primary"
          disabled={saving || Boolean(parsed.reason)}
          onClick={() => void save()}
        >
          {saving ? "Сохранение…" : "Сохранить цели"}
        </button>
      </div>
      {parsed.reason && (
        <p className="notice" role="alert">
          {parsed.reason}
        </p>
      )}
      {saved && (
        <p role="status" className="caption">
          Цели сохранены.
        </p>
      )}
      {comparison.reason && <p className="caption">{comparison.reason}</p>}
    </section>
  );
}
