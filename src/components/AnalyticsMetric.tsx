import type { ReactNode } from "react";
import { definitions, type MetricKey } from "../analytics/metricDefinitions";
import { pct, numeric } from "../utils/analyticsFormat";
export function Formula({
  name,
  formula,
  children,
}: {
  name: string;
  formula: string;
  children: ReactNode;
}) {
  return (
    <details className="formula">
      <summary>
        {name}
        <span>Формула ↗</span>
      </summary>
      <code>{formula}</code>
      <p>{children}</p>
    </details>
  );
}
export function AnalyticsMetric({
  metric,
  label: labelOverride,
  value,
  sample,
  ratio = false,
  reason,
}: {
  metric: MetricKey;
  label?: string;
  value: number | null | undefined;
  sample: string;
  ratio?: boolean;
  reason?: string | null;
}) {
  const [definitionLabel, formula, explanation] = definitions[metric];
  const label = labelOverride ?? definitionLabel;
  const unavailableReason = reason ?? "Недостаточно данных для расчёта.";
  return (
    <div className="analytics-metric">
      <span className="metric-label">{label}</span>
      <strong
        title={
          value == null
            ? unavailableReason
            : undefined
        }
      >
        {value == null ? "Недоступно" : ratio ? numeric(value) : pct(value)}
      </strong>
      <small className="metric-sample">{value == null ? unavailableReason : sample}</small>
      <details className="metric-details">
        <summary>Подробнее</summary>
        <code>{formula}</code>
        <p>{explanation} Данные: {sample}.{value == null ? ` ${unavailableReason}` : ""}</p>
      </details>
    </div>
  );
}
