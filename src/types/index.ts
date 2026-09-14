export type TransactionType = 'BUY' | 'SELL';

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

export interface Portfolio {
  id: string;
  name: string;
  base_currency: string;
  created_at: string;
}

export interface InviteCode {
  id: string;
  code: string;
  portfolio_id: string;
  active: boolean;
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
  change: number;
  changePercent: number;
  timestamp: number;
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

export interface PortfolioSnapshot {
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
