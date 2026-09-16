import type { HistoryBar, Transaction } from "../types";
import type {
  PortfolioHistory,
  PortfolioHistoryPoint,
} from "../types/analytics";
import { compareTransactions } from "./positions";
import { EPSILON, validDate } from "./statistics";
import { flowAdjustedReturn } from "./performance";

/** End of UTC day inventory and provider closes; assumes prices and quantities use compatible units. No cash account or future fills. */
export function reconstructPortfolioHistory(
  transactions: Transaction[],
  histories: Map<string, HistoryBar[]>,
  asOf: string,
): PortfolioHistory {
  const empty = (reason: string): PortfolioHistory => ({
    points: [],
    missingDates: [],
    missingSymbols: [],
    reason,
  });
  if (!validDate(asOf)) return empty("Некорректная дата оценки.");
  if (!transactions.length) return empty("Добавьте первую сделку.");
  if (
    transactions.some(
      (t) =>
        !Number.isFinite(Date.parse(t.timestamp)) ||
        !Number.isFinite(Date.parse(t.created_at)) ||
        !t.symbol.trim() ||
        !t.id ||
        !["BUY", "SELL"].includes(t.type) ||
        !Number.isFinite(t.quantity) ||
        t.quantity <= 0 ||
        !Number.isFinite(t.price) ||
        t.price <= 0,
    ) ||
    new Set(transactions.map((t) => t.id)).size !== transactions.length ||
    new Set(transactions.map((t) => t.currency)).size > 1
  )
    return empty("Некорректные операции или смешанные валюты без FX-истории.");
  const sorted = [...transactions]
    .sort(compareTransactions)
    .map((t) => ({
      ...t,
      symbol: t.symbol.trim().toUpperCase(),
      day: new Date(t.timestamp).toISOString().slice(0, 10),
    }))
    .filter((t) => t.day <= asOf);
  if (!sorted.length) return empty("До даты оценки нет операций.");
  const prices = new Map<string, Map<string, number>>();
  const calendar = new Set<string>();
  for (const symbol of new Set(sorted.map((t) => t.symbol))) {
    const map = new Map<string, number>();
    for (const bar of histories.get(symbol) ?? [])
      if (
        validDate(bar.date) &&
        bar.date <= asOf &&
        Number.isFinite(bar.close) &&
        bar.close > 0
      ) {
        map.set(bar.date, bar.close);
        calendar.add(bar.date);
      }
    prices.set(symbol, map);
  }
  const dates = [...calendar].filter((d) => d >= sorted[0].day).sort();
  const quantities = new Map<string, number>();
  const points: PortfolioHistoryPoint[] = [];
  const missingDates: string[] = [];
  const missingSymbols = new Set<string>();
  let index = 0;
  let gap = false;
  for (const date of dates) {
    let traded = false;
    while (index < sorted.length && sorted[index].day <= date) {
      const tx = sorted[index++];
      const q = quantities.get(tx.symbol) ?? 0;
      const next = q + (tx.type === "BUY" ? tx.quantity : -tx.quantity);
      if (next < -EPSILON || !Number.isFinite(next))
        return empty(
          "Некорректная история: продажа превышает доступную позицию.",
        );
      quantities.set(tx.symbol, Math.max(0, next));
      traded = true;
    }
    let value = 0;
    let missing = false;
    for (const [symbol, q] of quantities)
      if (q > EPSILON) {
        const price = prices.get(symbol)?.get(date);
        if (price === undefined) {
          missing = true;
          missingSymbols.add(symbol);
        } else value += q * price;
      }
    if (missing || !Number.isFinite(value)) {
      missingDates.push(date);
      gap = true;
      continue;
    }
    const previous = points.at(-1);
    const externalFlow = traded || gap ? null : 0;
    const dailyReturn =
      previous && !gap && !traded
        ? flowAdjustedReturn(previous.value, value, 0)
        : null;
    points.push({ date, value, traded, externalFlow, dailyReturn });
    gap = false;
  }
  // Even an entirely absent provider series must be reported by symbol.
  for (const [symbol, map] of prices) if (!map.size) missingSymbols.add(symbol);
  return {
    points,
    missingDates,
    missingSymbols: [...missingSymbols],
    reason: points.length
      ? null
      : "Недостаточно истории цен для восстановления стоимости.",
  };
}
