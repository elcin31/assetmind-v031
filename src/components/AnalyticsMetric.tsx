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
  value,
  sample,
  ratio = false,
  reason,
}: {
  metric: MetricKey;
  value: number | null | undefined;
  sample: string;
  ratio?: boolean;
  reason?: string | null;
}) {
  const [label, formula, explanation] = definitions[metric];
  return (
    <div className="analytics-metric">
      <span>{label}</span>
      <strong
        title={
          value == null
            ? (reason ?? "Недостаточно истории или коэффициент не определён.")
            : undefined
        }
      >
        {ratio ? numeric(value) : pct(value)}
      </strong>
      <Formula name="Расчёт" formula={formula}>
        {explanation} Данные: {sample}.
        {value == null &&
          ` ${reason ?? "Недостаточно истории или коэффициент не определён."}`}
      </Formula>
    </div>
  );
}
