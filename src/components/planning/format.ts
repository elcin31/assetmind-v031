import { formatCurrency } from "../../utils/format";

export const money = (value: number | null | undefined, currency: string) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : formatCurrency(value, currency);
