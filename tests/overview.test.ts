import { describe, expect, it } from "vitest";
import type { PortfolioSnapshot, Transaction } from "../src/types";
import { calculatePortfolioAnalytics } from "../src/math/analytics";
import { enrichPositionsWithQuotes } from "../src/math/pnl";
import {
  overviewInsights,
  overviewReadouts,
  topPnlRows,
} from "../src/analytics/overview";

const tx: Transaction = {
  id: "buy",
  portfolio_id: "p",
  symbol: "A",
  type: "BUY",
  quantity: 2,
  price: 100,
  currency: "USD",
  timestamp: "2025-01-01T00:00:00Z",
  created_at: "2025-01-01T00:00:00Z",
};
function fixture(quoted = true) {
  const s: PortfolioSnapshot = {
    portfolio: {
      id: "p",
      name: "p",
      base_currency: "USD",
      created_at: "2025-01-01",
    },
    transactions: [tx],
    ...enrichPositionsWithQuotes(
      [tx],
      quoted
        ? new Map([
            [
              "A",
              {
                symbol: "A",
                price: 150,
                change: 0,
                changePercent: 0,
                timestamp: 0,
              },
            ],
          ])
        : new Map(),
    ),
  };
  const bars = Array.from({ length: 80 }, (_, i) => ({
    date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
    close: 100 + i + Math.sin(i),
  }));
  const a = calculatePortfolioAnalytics(
    s,
    new Map([
      ["A", bars],
      ["SPY", bars],
    ]),
    "SPY",
    "ALL",
    "20D",
    "2025-03-21",
    0,
    0,
  );
  return { s, a };
}

describe("Overview factual readouts", () => {
  it("uses existing normalized comparison and lifetime valuation without mutating analytics", () => {
    const { s, a } = fixture();
    const before = JSON.stringify(a);
    const result = overviewReadouts(s, a);
    expect(result.value).toBe(300);
    expect(result.excessReturn).toBeCloseTo(0);
    expect(result.comparison).toEqual(a.benchmark.comparison);
    expect(result.valueChange).toBe(a.points.at(-1)!.value - a.points[0].value);
    expect(JSON.stringify(a)).toBe(before);
  });
  it("does not substitute cost basis for unavailable valuation", () => {
    const { s, a } = fixture(false);
    expect(overviewReadouts(s, a).value).toBeNull();
    expect(overviewInsights(s, a, false, []).map((x) => x.id)).toEqual([
      "market-data",
    ]);
  });
  it("rejects benchmark fragments even if the benchmark engine returns a clean suffix", () => {
    const { s, a } = fixture();
    a.benchmark.comparison = a.benchmark.comparison.slice(3);
    expect(overviewReadouts(s, a).comparison).toEqual([]);
    expect(overviewReadouts(s, a).excessReturn).toBeNull();
  });
  it("rejects comparison through unknown flows and never fills absent history with zeros", () => {
    const { s, a } = fixture();
    a.performance.totalReturn = null;
    expect(overviewReadouts(s, a).comparison).toEqual([]);
    a.points = [];
    expect(overviewReadouts(s, a).valueChange).toBeNull();
  });
});

describe("Overview attention and attribution", () => {
  it("ranks confirmed severity and limits the result to three", () => {
    const { s, a } = fixture();
    s.targetAllocation = [{ symbol: "A", weight: 0.5 }];
    s.cashLedger = {
      complete: true,
      balance: 0,
      minimumBalance: 0,
      reason: null,
      deposits: 200,
      withdrawals: 0,
      dividends: 0,
      fees: 0,
    };
    a.drawdown!.current = -0.3;
    const result = overviewInsights(s, a, false, []);
    expect(result).toHaveLength(3);
    expect(result.every((x) => x.severity === "HIGH")).toBe(true);
    expect(result.map((x) => x.id)).toContain("drift");
  });
  it("does not infer target drift without reconciled cash or current risk while loading", () => {
    const { s, a } = fixture();
    s.targetAllocation = [{ symbol: "A", weight: 0.1 }];
    expect(overviewInsights(s, a, true, []).map((x) => x.id)).toEqual([
      "concentration",
    ]);
  });
  it("emits no unconfirmed concentration or drawdown warning", () => {
    const { s, a } = fixture();
    s.allocation = [{ symbol: "A", marketValue: 60, weight: 0.2 }];
    a.currentRisk = null;
    a.drawdown = null;
    expect(overviewInsights(s, a, false, [])).toEqual([]);
  });
  it("keeps contributors positive and detractors negative; excludes null and zero", () => {
    const { a } = fixture();
    a.pnl = [5, -8, null, 0, 7, -2, 9, 10, -20, -3].map((n, i) => ({
      ...a.pnl[0],
      symbol: String(i),
      totalPnL: n,
    }));
    expect(topPnlRows(a, false).map((x) => x.totalPnL)).toEqual([10, 9, 7]);
    expect(topPnlRows(a, true).map((x) => x.totalPnL)).toEqual([-20, -8, -3]);
  });
});
