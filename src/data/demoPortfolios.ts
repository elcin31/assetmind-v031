import type { PortfolioSnapshot, Quote, Transaction } from '../types';
import { enrichPositionsWithQuotes } from '../math/pnl';

export interface DemoPreset {
  id: string;
  name: string;
  description: string;
  weights: Record<string, number>;
}

export const demoPresets: DemoPreset[] = [
  { id: 'balanced-tech', name: 'Tech + broad market', description: 'AAPL, MSFT, NVDA и SPY', weights: { AAPL: .25, MSFT: .2, NVDA: .25, SPY: .3 } },
  { id: 'tech-concentrated', name: 'Tech Concentrated', description: 'Крупные технологические компании', weights: { AAPL: .2, MSFT: .2, NVDA: .2, META: .2, GOOGL: .2 } },
  { id: 'core-etf', name: 'Core ETF', description: 'Широкий рынок, Nasdaq, small caps и облигации', weights: { SPY: .4, QQQ: .3, IWM: .15, TLT: .15 } },
  { id: 'classic-60-40', name: 'Classic 60/40', description: 'Условное распределение акций и облигаций', weights: { SPY: .6, BND: .4 } },
  { id: 'magnificent-seven', name: 'Magnificent 7', description: 'Семь крупных технологических компаний с равными весами', weights: { AAPL: 1/7, MSFT: 1/7, NVDA: 1/7, META: 1/7, GOOGL: 1/7, AMZN: 1/7, TSLA: 1/7 } },
];

/** All entries are synthetic, in-memory examples. Never pass these to storage APIs. */
export function buildDemoPortfolio(presetId = 'balanced-tech', quotes: Map<string, Quote> = new Map(), createdAt = new Date().toISOString()): PortfolioSnapshot {
  const preset = demoPresets.find(item => item.id === presetId) ?? demoPresets[0];
  const portfolioId = `demo-${preset.id}`;
  const timestamp = createdAt;
  const transactions: Transaction[] = Object.entries(preset.weights).flatMap(([symbol, weight]) => {
    const quote = quotes.get(symbol);
    if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) return [];
    return [{
    id: `demo-${preset.id}-${symbol}`,
    portfolio_id: portfolioId,
    symbol,
    currency: 'USD',
    timestamp,
    created_at: timestamp,
    type: 'BUY',
    quantity: Math.round((weight * 10000 / quote.price) * 1e6) / 1e6,
    price: quote.price,
  } satisfies Transaction];
  });
  const availableQuotes = new Map(transactions.map(transaction => [transaction.symbol, quotes.get(transaction.symbol)!]));
  const enriched = enrichPositionsWithQuotes(transactions, availableQuotes);
  return {
    portfolio: { id: portfolioId, name: preset.name, base_currency: 'USD', created_at: timestamp },
    transactions,
    ...enriched,
    history: undefined,
    cashEvents: [],
    targetAllocation: Object.entries(preset.weights).map(([symbol, weight]) => ({ symbol, weight })),
    cashLedger: { complete: true, balance: 0, minimumBalance: 0, reason: null, deposits: 0, withdrawals: 0, dividends: 0, fees: 0 },
    accountValue: null,
    moneyWeighted: { xirr: null, cashFlowCount: 0, reason: 'Демонстрационный портфель' },
  };
}
