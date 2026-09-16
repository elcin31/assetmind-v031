import { useState } from "react";
interface ChartPoint {
  date: string;
  value: number | null;
  secondary?: number | null;
  caption?: string;
}
export function AnalyticsChart({
  points,
  label,
  format,
  secondaryLabel,
  loading = false,
  reason,
  underwater = false,
}: {
  points: ChartPoint[];
  label: string;
  format: (value: number) => string;
  secondaryLabel?: string;
  loading?: boolean;
  reason?: string | null;
  underwater?: boolean;
}) {
  const [cursor, setCursor] = useState<number | null>(null);
  const visible = points
    .flatMap((p) => [p.value, p.secondary])
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (loading)
    return (
      <div className="chart-placeholder" role="status">
        Загружаем историю…
      </div>
    );
  if (visible.length < 2)
    return (
      <div className="chart-placeholder" role="status">
        {reason ?? "Недостаточно истории для графика."}
      </div>
    );
  const low = Math.min(...visible);
  const high = underwater ? 0 : Math.max(...visible);
  const span = high - low || Math.max(Math.abs(high) * 0.02, 0.01);
  const start = Date.parse(points[0].date);
  const duration = Date.parse(points.at(-1)!.date) - start;
  const x = (date: string) =>
    18 + (duration ? (Date.parse(date) - start) / duration : 0) * 564;
  const y = (value: number) => 22 + ((high - value) / span) * 175;
  const path = (secondary: boolean) => {
    let pen = false;
    return points
      .map((p) => {
        const v = secondary ? p.secondary : p.value;
        if (v == null || !Number.isFinite(v)) {
          pen = false;
          return "";
        }
        const command = pen ? "L" : "M";
        pen = true;
        return `${command}${x(p.date).toFixed(2)},${y(v).toFixed(2)}`;
      })
      .join(" ");
  };
  const index = Math.max(
    0,
    Math.min(cursor ?? points.length - 1, points.length - 1),
  );
  const focused = points[index];
  return (
    <div className="analytics-chart">
      <div className="chart-readout">
        <strong>{focused.value == null ? "—" : format(focused.value)}</strong>
        <span>{focused.date}</span>
        {focused.caption && <span>{focused.caption}</span>}
        {secondaryLabel && (
          <span className="benchmark-legend">
            {secondaryLabel}:{" "}
            {focused.secondary == null ? "—" : format(focused.secondary)}
          </span>
        )}
      </div>
      <svg
        className="price-plot"
        viewBox="0 0 600 220"
        role="img"
        aria-label={label}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pointer = ((e.clientX - rect.left) / rect.width) * 600;
          let nearest = 0;
          for (let i = 1; i < points.length; i++)
            if (
              Math.abs(x(points[i].date) - pointer) <
              Math.abs(x(points[nearest].date) - pointer)
            )
              nearest = i;
          setCursor(nearest);
        }}
        onPointerLeave={() => setCursor(null)}
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1="18"
              x2="582"
              y1={22 + t * 175}
              y2={22 + t * 175}
              stroke="var(--border)"
              strokeDasharray="4 5"
            />
            <text
              x="18"
              y={16 + t * 175}
              fontSize="10"
              fill="var(--text-muted)"
            >
              {format(high - t * span)}
            </text>
          </g>
        ))}
        <path
          d={path(false)}
          stroke={underwater ? "var(--negative)" : "var(--accent)"}
          strokeWidth="2.5"
          fill="none"
        />
        {secondaryLabel && (
          <path
            d={path(true)}
            stroke="var(--positive)"
            strokeWidth="2"
            strokeDasharray="6 4"
            fill="none"
          />
        )}
        <line
          x1={x(focused.date)}
          x2={x(focused.date)}
          y1="22"
          y2="197"
          stroke="var(--text-muted)"
          strokeDasharray="3 5"
        />
        {focused.value != null && (
          <circle
            cx={x(focused.date)}
            cy={y(focused.value)}
            r="4"
            fill="var(--accent)"
          />
        )}
      </svg>
      <div className="range-labels">
        <span>{points[0].date}</span>
        <span>{points.at(-1)!.date}</span>
      </div>
      <input
        type="range"
        min="0"
        max={points.length - 1}
        value={index}
        aria-label={`${label}: дата`}
        aria-valuetext={`${focused.date}: ${focused.value == null ? "нет данных" : format(focused.value)}`}
        onChange={(e) => setCursor(Number(e.target.value))}
      />
    </div>
  );
}
