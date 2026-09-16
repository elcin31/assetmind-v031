export type Period = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';
export type BenchmarkSymbol = 'SPY' | 'QQQ' | 'DIA' | 'IWM';
export interface DatedReturn { date: string; startDate: string; value: number }
export interface PortfolioHistoryPoint {
  date: string;
  value: number;
  /** null means unknown, never infer external cash flows from trades. */
  externalFlow: number | null;
  dailyReturn: number | null;
  traded: boolean;
}
export interface PortfolioHistory {
  points: PortfolioHistoryPoint[];
  missingDates: string[];
  missingSymbols: string[];
  reason: string | null;
}
export interface MonthlyReturn { year: number; month: number; value: number | null; observations: number }
export interface DrawdownEpisode {
  startDate: string; bottomDate: string; recoveryDate: string | null;
  duration: number; recoveryDuration: number | null; depth: number;
}
export interface DrawdownPoint { date: string; value: number }
export interface PerformanceMetrics {
  totalReturn: number | null; twr: number | null; cagr: number | null;
  bestDay: number | null; worstDay: number | null; positiveDays: number | null; negativeDays: number | null;
  returns: DatedReturn[]; monthly: MonthlyReturn[]; reason: string | null;
}
export interface RiskMetrics {
  volatility: number | null; downside: number | null; sharpe: number | null; sortino: number | null;
  calmar: number | null; var95: number | null; es95: number | null;
  drawdown: DrawdownPoint[]; episodes: DrawdownEpisode[];
  maxDrawdown: number | null; currentDrawdown: number | null;
}
export interface CorrelationMatrix {
  symbols: string[]; correlation: number[][]; covariance: number[][];
  returns: DatedReturn[][]; observations: number;
}
export interface RiskContribution {
  symbol: string; weight: number; marginal: number; absolute: number; fraction: number;
}
export interface BenchmarkMetrics {
  beta: number | null; alpha: number | null; trackingError: number | null; informationRatio: number | null;
  portfolioReturn: number | null; benchmarkReturn: number | null; observations: number;
  comparison: { date: string; portfolio: number; benchmark: number }[];
}
