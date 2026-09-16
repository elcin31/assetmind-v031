export const pct = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : `${(value * 100).toLocaleString("ru-RU", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`;
export const numeric = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
