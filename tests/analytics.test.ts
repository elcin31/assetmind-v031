import { describe, expect, it } from "vitest";
import type { Transaction, HistoryBar } from "../src/types";
import { reconstructPortfolioHistory } from "../src/math/portfolioHistory";
import {
  flowAdjustedReturn,
  cumulativeReturn,
  timeWeightedReturn,
  cagr,
  datedReturns,
  performanceMetrics,
  monthlyReturns,
  selectPeriod,
} from "../src/math/performance";
import { drawdowns } from "../src/math/drawdown";
import { downsideDeviation } from "../src/math/downside";
import {
  calmarRatio,
  historicalTailRisk,
  sharpeRatio,
  sortinoRatio,
} from "../src/math/ratios";
import {
  correlation,
  correlationMatrix,
  averageCorrelation,
} from "../src/math/correlation";
import { covariance, volatility } from "../src/math/statistics";
import { portfolioVariance } from "../src/math/covariance";
import { riskContributions } from "../src/math/riskContribution";
import { benchmarkMetrics } from "../src/math/benchmark";
import {
  pnlAttribution,
  positionReturn,
  returnAttribution,
} from "../src/math/attribution";
import { scenarioValue, scenarioPreset } from "../src/math/scenarios";
import { rollingMetric } from "../src/math/rolling";
const tx = (
  id: string,
  date: string,
  quantity: number,
  type: "BUY" | "SELL" = "BUY",
  symbol = "A",
): Transaction => ({
  id,
  portfolio_id: "p",
  symbol,
  type,
  quantity,
  price: 100,
  currency: "USD",
  timestamp: `${date}T12:00:00Z`,
  created_at: `${date}T13:00:00Z`,
});
const bars: HistoryBar[] = [
  { date: "2026-01-01", close: 100 },
  { date: "2026-01-02", close: 110 },
  { date: "2026-01-03", close: 120 },
  { date: "2026-01-04", close: 125 },
];
const history = (transactions: Transaction[]) =>
  reconstructPortfolioHistory(
    transactions,
    new Map([
      ["A", bars],
      ["B", bars],
    ]),
    "2026-01-04",
  );
const rs = Array.from({ length: 60 }, (_, i) => ((i % 5) - 2) / 100 + 0.001);
const dated = (values: number[]) =>
  values.map((value, i) => ({
    value,
    startDate: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10),
    date: new Date(Date.UTC(2025, 0, i + 2)).toISOString().slice(0, 10),
  }));
describe("transaction-aware inventory", () => {
  it("uses buys before each date, multiple buys and partial sells, independent of input order", () => {
    const h = history([
      tx("3", "2026-01-03", 3, "SELL"),
      tx("2", "2026-01-02", 2),
      tx("1", "2025-12-31", 10),
    ]);
    expect(h.points.map((p) => p.value)).toEqual([1000, 1320, 1080, 1125]);
    expect(h.points[1].externalFlow).toBeNull();
    expect(h.points[1].dailyReturn).toBeNull();
    expect(h.points[3].dailyReturn).toBeCloseTo(125 / 120 - 1);
  });
  it("excludes future transactions and reconstructs sold positions", () => {
    const h = history([
      tx("1", "2026-01-02", 10),
      tx("2", "2026-01-03", 10, "SELL"),
      tx("3", "2026-02-01", 40),
    ]);
    expect(h.points.map((p) => p.value)).toEqual([1100, 0, 0]);
    expect(h.points.at(-1)?.dailyReturn).toBeNull();
  });
  it("supports multiple symbols and backdated transactions", () => {
    expect(
      history([
        tx("2", "2026-01-02", 5, "BUY", "B"),
        tx("1", "2026-01-01", 10),
      ]).points.map((p) => p.value),
    ).toEqual([1000, 1650, 1800, 1875]);
  });
  it("uses timestamp, created_at and id ties like the position engine", () => {
    const buy = tx("a", "2026-01-01", 2);
    const sell = {
      ...tx("b", "2026-01-01", 1, "SELL"),
      created_at: buy.created_at,
    };
    expect(history([sell, buy]).points[0].value).toBe(100);
    expect(history([{ ...sell, id: "0" }, buy]).reason).toContain("продажа");
    expect(
      history([{ ...sell, created_at: "2026-01-01T14:00:00Z", id: "0" }, buy])
        .points[0].value,
    ).toBe(100);
  });
  it("never future-fills, does not require B prices before B is owned, and leaves gaps unavailable", () => {
    const h = reconstructPortfolioHistory(
      [tx("a", "2026-01-01", 1), tx("b", "2026-01-03", 1, "BUY", "B")],
      new Map([
        ["A", bars],
        ["B", [bars[3]]],
      ]),
      "2026-01-04",
    );
    expect(h.points.map((p) => p.date)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-04",
    ]);
    expect(h.missingSymbols).toEqual(["B"]);
    expect(h.points.at(-1)?.dailyReturn).toBeNull();
  });
  it("rejects corrupted inputs and invalid sells", () => {
    expect(history([tx("a", "2026-01-01", 1, "SELL")]).points).toEqual([]);
    expect(
      history([{ ...tx("a", "2026-01-01", 1), quantity: Infinity }]).points,
    ).toEqual([]);
    expect(
      history([tx("a", "2026-01-01", 1), tx("a", "2026-01-02", 1)]).points,
    ).toEqual([]);
  });
});
describe("performance and returns", () => {
  it("removes known end-period flows and preserves unknown flows", () => {
    expect(flowAdjustedReturn(100, 110, 0)).toBeCloseTo(0.1);
    expect(flowAdjustedReturn(100, 150, 50)).toBe(0);
    expect(flowAdjustedReturn(100, 60, -50)).toBeCloseTo(0.1);
    expect(flowAdjustedReturn(100, 150, null)).toBeNull();
    expect(flowAdjustedReturn(0, 100, 100)).toBeNull();
  });
  it("compounds returns, computes TWR and conservative CAGR", () => {
    expect(cumulativeReturn([0.1, -0.1])).toBeCloseTo(-0.01);
    expect(timeWeightedReturn([0.1, 0.2])).toBeCloseTo(0.32);
    expect(timeWeightedReturn([0.1, null])).toBeNull();
    expect(cagr(0.1, "2025-01-01", "2025-01-04")).toBeNull();
    expect(cagr(0.1, "2025-01-01", "2026-01-01")).toBeCloseTo(0.1, 3);
    expect(cumulativeReturn([Infinity])).toBeNull();
    expect(cumulativeReturn([-1.1])).toBeNull();
  });
  it("does not combine returns across trades; supports safe no-trade subperiod", () => {
    const h = history([tx("1", "2026-01-01", 1), tx("2", "2026-01-03", 1)]);
    expect(performanceMetrics(h.points).totalReturn).toBeNull();
    expect(performanceMetrics(h.points.slice(2)).totalReturn).toBeCloseTo(
      125 / 120 - 1,
    );
    expect(monthlyReturns(h.points)[0].value).toBeNull();
    const p = performanceMetrics(history([tx("1", "2026-01-01", 1)]).points);
    expect(p.totalReturn).toBeCloseTo(0.25);
    expect(p.bestDay).toBeCloseTo(0.1);
    expect(p.positiveDays).toBe(1);
  });
  it("rejects invalid price series and includes period baseline", () => {
    expect(datedReturns([...bars].reverse())).toEqual([]);
    expect(selectPeriod(bars, "YTD", "2026-01-04")).toEqual(bars);
  });
});
describe("drawdown episodes", () => {
  const series = (values: number[]) =>
    values.map((value, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      value,
    }));
  it("handles no drawdown", () =>
    expect(drawdowns(series([100, 110, 110]))?.episodes).toEqual([]));
  it("identifies bottoms, recovery at equal high, and open episodes", () => {
    const d = drawdowns(series([100, 90, 80, 100, 95, 98]));
    expect(d?.max).toBeCloseTo(-0.2);
    expect(d?.episodes).toHaveLength(2);
    expect(d?.episodes[0]).toEqual({
      startDate: "2026-01-02",
      bottomDate: "2026-01-03",
      recoveryDate: "2026-01-04",
      duration: 2,
      recoveryDuration: 1,
      depth: -0.19999999999999996,
    });
    expect(d?.episodes[1].recoveryDate).toBeNull();
    expect(d?.current).toBeCloseTo(-0.02);
  });
  it("validates dates, order, zero starting value and nonfinite values", () => {
    expect(drawdowns(series([0, 10]))).toBeNull();
    expect(drawdowns(series([100, Infinity]))).toBeNull();
  });
});
describe("risk, correlation and covariance", () => {
  it("enforces minimums", () => {
    expect(volatility([0.1, -0.1])).toBeNull();
    expect(downsideDeviation([-0.1])).toBeNull();
    expect(sharpeRatio([0.1])).toBeNull();
    expect(correlation([1, 2], [1, 2])).toBeNull();
  });
  it("has known downside, Sharpe, Sortino, Calmar and tail values", () => {
    const returns = Array.from({ length: 20 }, (_, i) =>
      i % 2 ? -0.01 : 0.03,
    );
    expect(downsideDeviation(returns)).toBeCloseTo(Math.sqrt(0.00005 * 252));
    expect(sharpeRatio(returns)).toBeCloseTo(2.52 / volatility(returns)!);
    expect(sortinoRatio(returns)).toBeCloseTo(2.52 / Math.sqrt(0.00005 * 252));
    expect(sortinoRatio(Array(20).fill(0.01))).toBeNull();
    expect(calmarRatio(0.12, -0.2)).toBeCloseTo(0.6);
    expect(calmarRatio(0.12, 0)).toBeNull();
    expect(historicalTailRisk(returns)).toEqual({ var: 0.01, es: 0.01 });
  });
  it("handles perfect positive/negative and orthogonal series", () => {
    expect(correlation(rs, rs)).toBeCloseTo(1);
    expect(
      correlation(
        rs,
        rs.map((r) => -r),
      ),
    ).toBeCloseTo(-1);
    expect(correlation(Array(20).fill(1), Array(20).fill(1))).toBeNull();
    const a = Array.from({ length: 20 }, (_, i) => [1, 1, -1, -1][i % 4]);
    const b = Array.from({ length: 20 }, (_, i) => [1, -1, 1, -1][i % 4]);
    expect(correlation(a, b)).toBeCloseTo(0);
    expect(
      averageCorrelation([
        [1, 0.5],
        [0.5, 1],
      ]),
    ).toBe(0.5);
  });
  it("matches a manually evaluated two asset covariance portfolio", () => {
    expect(covariance([1, 2, 3], [2, 4, 6], 2)).toBe(2);
    const matrix = [
      [0.04, 0.006],
      [0.006, 0.09],
    ];
    expect(portfolioVariance([0.6, 0.4], matrix)).toBeCloseTo(0.03168);
    const result = riskContributions(["A", "B"], [0.6, 0.4], matrix)!;
    expect(
      result.contributions.reduce((s, c) => s + c.absolute, 0),
    ).toBeCloseTo(0.03168);
    expect(
      result.contributions.reduce((s, c) => s + c.fraction, 0),
    ).toBeCloseTo(1);
    expect(result.diversificationRatio).toBeCloseTo(0.24 / Math.sqrt(0.03168));
    expect(
      portfolioVariance(
        [1 / 3, 1 / 3, 1 / 3],
        [
          [1, 0.9, 0.9],
          [0.9, 1, -0.9],
          [0.9, -0.9, 1],
        ],
      ),
    ).toBeNull();
    expect(
      portfolioVariance(
        [0.5, 0.5],
        [
          [0.04, 0.04],
          [0.04, 0.04],
        ],
      ),
    ).toBeCloseTo(0.04);
    expect(portfolioVariance([1, 1], matrix)).toBeNull();
    expect(
      portfolioVariance(
        [0.5, 0.5],
        [
          [1, 2],
          [0, 1],
        ],
      ),
    ).toBeNull();
  });
  it("aligns matching return intervals and requires history for every holding", () => {
    let price = 100;
    const prices = [
      { date: "2025-01-01", close: price },
      ...dated(rs).map((r) => ({
        date: r.date,
        close: (price *= 1 + r.value),
      })),
    ];
    const matrix = correlationMatrix(
      ["A", "B"],
      new Map([
        ["A", prices],
        ["B", prices.filter((_, i) => i !== 10)],
      ]),
    );
    expect(matrix?.observations).toBe(58);
    expect(matrix?.correlation[0][1]).toBeCloseTo(1);
    expect(correlationMatrix(["A", "C"], new Map([["A", prices]]))).toBeNull();
  });
  it("leaves rolling warm-up empty", () => {
    const roll = rollingMetric(dated(rs), 20, "volatility");
    expect(roll[18].value).toBeNull();
    expect(roll[19].value).toBeCloseTo(volatility(rs.slice(0, 20))!);
    expect(
      rollingMetric(dated(rs), 252, "sharpe").every((p) => p.value === null),
    ).toBe(true);
  });
});
describe("benchmark, attribution and scenarios", () => {
  it("identical portfolio has beta 1, alpha 0, TE 0 and undefined IR", () => {
    const result = benchmarkMetrics(dated(rs), dated(rs), 0.04);
    expect(result.beta).toBeCloseTo(1);
    expect(result.alpha).toBeCloseTo(0);
    expect(result.trackingError).toBe(0);
    expect(result.informationRatio).toBeNull();
    expect(result.comparison[0].portfolio).toBe(100);
    expect(result.portfolioReturn).toBeCloseTo(result.benchmarkReturn!);
  });
  it("does not compound an incomplete comparison", () =>
    expect(benchmarkMetrics(dated(rs), dated(rs).slice(1)).comparison).toEqual(
      [],
    ));
  it("links contribution to total compound return", () => {
    const contributions = returnAttribution([
      { weights: [0.5, 0.5], returns: [0.1, -0.02] },
      { weights: [0.6, 0.4], returns: [0.02, 0.03] },
    ])!;
    expect(contributions.reduce((a, b) => a + b, 0)).toBeCloseTo(
      1.04 * 1.024 - 1,
    );
    expect(returnAttribution([{ weights: [0], returns: [0.1] }])).toBeNull();
    expect(positionReturn(120, 100)).toBeCloseTo(0.2);
    expect(positionReturn(100, 0)).toBeNull();
  });
  it("includes closed-symbol realized P&L without changing WAC", () => {
    const rows = pnlAttribution(
      [
        tx("1", "2026-01-01", 2),
        { ...tx("2", "2026-01-02", 2, "SELL"), price: 120 },
      ],
      [],
    );
    expect(rows[0].totalPnL).toBe(40);
    expect(rows[0].unrealizedPnL).toBe(0);
  });
  it("uses explicit shocks, selected preset membership and guards missing values", () => {
    const result = scenarioValue(
      [
        { symbol: "A", value: 100 },
        { symbol: "B", value: 200 },
      ],
      { A: -0.1, B: -0.25 },
    );
    expect(result?.after).toBe(240);
    expect(result?.impact).toBe(-60);
    expect(result?.percentage).toBeCloseTo(-0.2);
    expect(scenarioValue([{ symbol: "A", value: 100 }], {})).toBeNull();
    expect(scenarioPreset(["A", "B"], "tech", ["B"])).toEqual({
      A: -0.08,
      B: -0.25,
    });
  });
});
