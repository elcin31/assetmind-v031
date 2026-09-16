import { describe, expect, it, vi, afterEach } from "vitest";
import type { Transaction, HistoryBar, PortfolioSnapshot } from "../src/types";
import { enrichPositionsWithQuotes } from "../src/math/pnl";
import { calculatePortfolioAnalytics } from "../src/math/analytics";
import { monthlyRows } from "../src/math/monthly";
import {
  historyReadouts,
  monthlyReturns,
  performanceMetrics,
} from "../src/math/performance";
import { loadHistory } from "../src/analytics/historyCache";
import { downsideDeviation } from "../src/math/downside";
import { benchmarkMetrics } from "../src/math/benchmark";
import { scenarioValue } from "../src/math/scenarios";
import { portfolioVariance } from "../src/math/covariance";

const transaction: Transaction = {
  id: "buy",
  portfolio_id: "p",
  symbol: "A",
  type: "BUY",
  quantity: 2,
  price: 100,
  currency: "USD",
  timestamp: "2024-12-01T00:00:00Z",
  created_at: "2024-12-01T00:00:00Z",
};
const series: HistoryBar[] = Array.from({ length: 120 }, (_, i) => ({
  date: new Date(Date.UTC(2024, 11, 1 + i)).toISOString().slice(0, 10),
  close: 100 * 1.001 ** i * (1 + Math.sin(i) * 0.01),
}));
const histories = new Map([
  ["A", series],
  ["SPY", series],
]);

function snapshot(
  transactions = [transaction],
  quoted = true,
): PortfolioSnapshot {
  return {
    portfolio: {
      id: "p",
      name: "p",
      base_currency: "USD",
      created_at: "2024-12-01",
    },
    transactions,
    ...enrichPositionsWithQuotes(
      transactions,
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
}

describe("analytics data model", () => {
  it("connects inventory, performance, attribution and benchmark without future observations", () => {
    const a = calculatePortfolioAnalytics(
      snapshot(),
      histories,
      "SPY",
      "ALL",
      "2025-02-28",
      0.03,
      0,
    );
    expect(a.points.at(-1)?.date).toBe("2025-02-28");
    expect(a.performance.totalReturn).not.toBeNull();
    expect(a.benchmark.beta).toBeCloseTo(1);
    expect(a.benchmark.alpha).toBeCloseTo(0);
    expect(a.contributions.reduce((s, c) => s + c.value, 0)).toBeCloseTo(
      a.performance.totalReturn!,
    );
    expect(a.currentRisk?.contributions[0].fraction).toBeCloseTo(1);
    expect(a.pnl.reduce((sum, r) => sum + r.totalPnL!, 0)).toBe(
      snapshot().totalPnL,
    );
    expect(a.readouts.at(-1)?.periodReturn).toBeCloseTo(
      a.performance.totalReturn!,
    );
    expect(a.proxy.volatility).not.toBeNull();
  });

  it("trades block cumulative performance while clean risk returns remain available", () => {
    const a = calculatePortfolioAnalytics(
      snapshot([
        transaction,
        { ...transaction, id: "second", timestamp: "2025-02-01T00:00:00Z" },
      ]),
      histories,
      "SPY",
      "ALL",
      "2025-02-28",
      0,
      0,
    );
    expect(a.performance.totalReturn).toBeNull();
    expect(a.performance.twr).toBeNull();
    expect(a.performance.cagr).toBeNull();
    expect(a.performance.riskReturns.length).toBeGreaterThan(20);
    expect(a.risk.volatility).not.toBeNull();
    expect(a.risk.sharpe).not.toBeNull();
    expect(a.drawdown).toBeNull();
    expect(a.contributions).toEqual([]);
    expect(a.benchmark.observations).toBeGreaterThan(20);
    expect(a.benchmark.comparison).toEqual([]);
    expect(a.proxy.volatility).not.toBeNull();
    expect(a.valueDrawdown).not.toBeNull();
  });

  it("does not turn incomplete current quotes into fake weights or scenario values", () => {
    const a = calculatePortfolioAnalytics(
      snapshot([transaction], false),
      histories,
      "SPY",
      "ALL",
      "2025-02-28",
      0,
      0,
    );
    expect(a.currentRisk).toBeNull();
    expect(a.details.A.weight).toBeNull();
    expect(a.pnl[0].totalPnL).toBeNull();
    expect(a.performance.totalReturn).not.toBeNull();
  });

  it("requires a pre-January baseline for YTD and preserves unavailable months", () => {
    const a = calculatePortfolioAnalytics(
      snapshot(),
      histories,
      "SPY",
      "ALL",
      "2025-02-28",
      0,
      0,
    );
    expect(monthlyRows(a.performance.monthly)[0].ytd).not.toBeNull();
    const lateStart = monthlyReturns(
      a.points.filter((p) => p.date >= "2025-01-05"),
    );
    expect(monthlyRows(lateStart)[0].ytd).toBeNull();
    expect(
      monthlyRows([
        {
          year: 2025,
          month: 1,
          value: 0.1,
          observations: 20,
          ytdEligible: true,
        },
        { year: 2025, month: 2, value: null, observations: 20 },
      ])[0].ytd,
    ).toBeNull();
  });

  it("rejects nonfinite history inputs and propagates cursor unavailability", () => {
    const p = {
      date: "2025-01-01",
      value: 100,
      externalFlow: 0,
      dailyReturn: null,
      traded: false,
    };
    expect(
      performanceMetrics([
        p,
        { ...p, date: "2025-01-02", dailyReturn: Infinity },
      ]).bestDay,
    ).toBeNull();
    expect(
      historyReadouts([p, { ...p, date: "2025-01-02", traded: true }]).at(-1)
        ?.periodReturn,
    ).toBeNull();
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(downsideDeviation(Array(20).fill(invalid))).toBeNull();
      expect(portfolioVariance([1], [[invalid]])).toBeNull();
      expect(
        scenarioValue([{ symbol: "A", value: invalid }], { A: -0.2 }),
      ).toBeNull();
      expect(
        benchmarkMetrics(
          [{ date: "2025-01-02", startDate: "2025-01-01", value: invalid }],
          [],
        ).beta,
      ).toBeNull();
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public history cache", () => {
  it("deduplicates concurrent consumers and caches the normalized response", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        symbol: "CACHE",
        period: "5y",
        bars: [...series].reverse(),
      }),
    });
    vi.stubGlobal("fetch", fetch);
    const [a, b] = await Promise.all([
      loadHistory("CACHE"),
      loadHistory("CACHE"),
    ]);
    expect(a).toBe(b);
    expect(a[0].date).toBe(series[0].date);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("evicts errors for retry and rejects symbol mismatches", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ symbol: "WRONG", period: "5y", bars: series }),
      });
    vi.stubGlobal("fetch", fetch);
    await expect(loadHistory("RETRY")).rejects.toThrow();
    await expect(loadHistory("RETRY")).rejects.toThrow("другого актива");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

it('never converts an overflowing denominator or annual covariance into a UI number', async () => {
  const { safeRatio } = await import('../src/math/statistics');
  const { correlationMatrix } = await import('../src/math/correlation');
  expect(safeRatio(1, Infinity)).toBeNull();
  expect(safeRatio(NaN, 1)).toBeNull();
  const extreme = Array.from({ length: 45 }, (_, i) => ({
    date: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10),
    close: i % 2 ? 1e155 : 1,
  }));
  expect(correlationMatrix(['A'], new Map([['A', extreme]]))).toBeNull();
});
