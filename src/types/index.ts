export type TransactionType = 'BUY' | 'SELL';
export type CashEventKind = 'DEPOSIT' | 'WITHDRAWAL' | 'DIVIDEND' | 'FEE';

export interface Transaction {
  id: string;
  portfolio_id: string;
  symbol: string;
  type: TransactionType;
  quantity: number;
  price: number;
  currency: string;
  timestamp: string; // ISO
  created_at: string;
  client_request_id?: string;
}

export interface CashEvent {
  id: string;
  portfolio_id: string;
  kind: CashEventKind;
  amount: number;
  currency: string;
  timestamp: string;
  created_at: string;
  symbol?: string;
  client_request_id?: string;
}

export interface TargetAllocation {
  symbol: string;
  /** Target fraction of total account value, from 0 to 1. Unallocated weight is CASH. */
  weight: number;
}

export interface CashLedgerSummary {
  complete: boolean;
  balance: number;
  minimumBalance: number;
  reason: string | null;
  deposits: number;
  withdrawals: number;
  dividends: number;
  fees: number;
}

export interface MoneyWeightedMetrics {
  xirr: number | null;
  cashFlowCount: number;
  reason: string | null;
}

export interface Portfolio {
  id: string;
  name: string;
  base_currency: string;
  created_at: string;
}

/** Position derived purely from transactions (weighted average cost). */
export interface Position {
  symbol: string;
  quantity: number;
  averageCost: number;
  costBasis: number; // remaining cost basis = quantity * averageCost
  realizedPnL: number;
  // Enriched after market price:
  marketPrice?: number;
  marketValue?: number;
  unrealizedPnL?: number;
  totalPnL?: number;
  weight?: number; // allocation weight 0-1
}

export interface Quote {
  symbol: string;
  price: number;
  /** Null means the provider did not supply a reliable value. Zero is a real flat move. */
  change: number | null;
  changePercent: number | null;
  /** Provider timestamp in Unix seconds; null when unavailable. */
  timestamp: number | null;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  country: string;
}

export interface HistoryBar {
  date: string; // YYYY-MM-DD
  close: number;
}

/** Provider-reported split. It is detected for correctness, not silently applied to the transaction ledger. */
export interface StockSplit {
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO provider event time
  numerator: number;
  denominator: number;
  ratio: number;
}

export interface PortfolioSnapshot {
  history?: { dates: string[]; values: number[]; dailyReturns: number[] };
  portfolio: Portfolio;
  transactions: Transaction[];
  positions: Position[];
  portfolioValue: number;
  totalPnL: number;
  realizedPnL: number;
  unrealizedPnL: number;
  allocation: { symbol: string; weight: number; marketValue: number }[];
  concentration: {
    largestPositionSymbol: string | null;
    largestPositionWeight: number;
    topHoldings: { symbol: string; weight: number }[];
  };
  valuation: {
    complete: boolean;
    pricedPositions: number;
    totalPositions: number;
    unpricedSymbols: string[];
  };
  /** P1 capital layer. Optional for compatibility with older snapshots/tests. */
  cashEvents?: CashEvent[];
  targetAllocation?: TargetAllocation[];
  cashLedger?: CashLedgerSummary;
  /** Securities plus reconciled cash. Null when either valuation or cash ledger is incomplete. */
  accountValue?: number | null;
  moneyWeighted?: MoneyWeightedMetrics;
  risk?: {
    volatility: number | null;
    sharpe: number | null;
    available: boolean;
    reason?: string;
  };
}

export interface ApiError {
  error: string;
  code?: string;
}
