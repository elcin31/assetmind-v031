export type Period = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";
export type RiskHorizon = "20D" | "60D" | "1Y";
export type BenchmarkSymbol = "SPY" | "QQQ" | "DIA" | "IWM";
export interface DatedReturn {
  date: string;
  startDate: string;
  value: number;
}
export interface PortfolioHistoryPoint {
  date: string;
  value: number;
  /** null means unknown, never infer external cash flows from trades. */
  externalFlow: number | null;
  /** True when one or more deposit/withdrawal flows occurred since the previous valid valuation. */
  externalFlowOccurred?: boolean;
  dailyReturn: number | null;
  traded: boolean;
}
export interface PortfolioHistory {
  points: PortfolioHistoryPoint[];
  missingDates: string[];
  missingSymbols: string[];
  reason: string | null;
}
export interface MonthlyReturn {
  year: number;
  month: number;
  value: number | null;
  observations: number;
  ytdEligible?: boolean;
}
export interface DrawdownEpisode {
  startDate: string;
  bottomDate: string;
  recoveryDate: string | null;
  duration: number;
  recoveryDuration: number | null;
  depth: number;
}
export interface DrawdownPoint {
  date: string;
  value: number;
}
export interface PerformanceMetrics {
  totalReturn: number | null;
  twr: number | null;
  cagr: number | null;
  bestDay: number | null;
  worstDay: number | null;
  positiveDays: number | null;
  negativeDays: number | null;
  /** Continuous return stream eligible for cumulative performance/TWR. */
  returns: DatedReturn[];
  /** Clean observed market-return intervals; contaminated trade/gap intervals are omitted. */
  riskReturns: DatedReturn[];
  monthly: MonthlyReturn[];
  reason: string | null;
}
export interface RiskMetrics {
  volatility: number | null;
  downside: number | null;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  var95: number | null;
  es95: number | null;
  drawdown: DrawdownPoint[];
  episodes: DrawdownEpisode[];
  maxDrawdown: number | null;
  currentDrawdown: number | null;
}
export interface CorrelationMatrix {
  symbols: string[];
  correlation: number[][];
  covariance: number[][];
  returns: DatedReturn[][];
  observations: number;
}
export interface RiskContribution {
  symbol: string;
  weight: number;
  /** Marginal contribution to portfolio volatility: (Σw)i / σp. */
  mcr: number;
  /** Absolute contribution to portfolio volatility: wi × MCRi. */
  rc: number;
  /** Normalized RC as a fraction of portfolio volatility; sums to 1. */
  normalizedRC: number;
  /** Normalized risk contribution divided by capital weight. */
  riskWeightRatio: number | null;
  assetVolatility: number;
  /** Marginal contribution to variance: (Σw)i. */
  marginal: number;
  /** Absolute contribution to variance: wi(Σw)i. */
  absolute: number;
  /** Fraction of portfolio variance. */
  fraction: number;
}
export interface BenchmarkMetrics {
  beta: number | null;
  alpha: number | null;
  trackingError: number | null;
  informationRatio: number | null;
  portfolioReturn: number | null;
  benchmarkReturn: number | null;
  activeReturn: number | null;
  correlation: number | null;
  upsideCapture: number | null;
  downsideCapture: number | null;
  observations: number;
  comparison: { date: string; portfolio: number; benchmark: number }[];
}

/** Future cash ledger boundary; deliberately separate from persisted BUY/SELL. */
export interface CashEvent {
  id: string;
  timestamp: string;
  kind: "DEPOSIT" | "WITHDRAWAL" | "DIVIDEND" | "FEE";
  amount: number;
  currency: string;
}
