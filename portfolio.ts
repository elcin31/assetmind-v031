import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseServer } from '../server/supabaseServer';
import { requireActiveInvite } from '../server/auth';
import { enrichPositionsWithQuotes } from '../src/math/pnl';
import { calculatePositions } from '../src/math/positions';
import { marketData } from '../server/marketData';
import { buildPortfolioValueSeries } from '../src/math/returns';
import { annualizedVolatility } from '../src/math/volatility';
import { calculateSharpe } from '../src/math/sharpe';
import type { Transaction, Quote, HistoryBar } from '../src/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const invite = await requireActiveInvite(req, res);
    if (!invite) return;

    const supabase = getSupabaseServer();

    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, name, base_currency, created_at')
      .eq('id', invite.portfolioId)
      .single();

    if (portfolioError || !portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const { data: txs, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('portfolio_id', portfolio.id)
      .order('timestamp', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (txError) {
      console.error('transactions error', txError);
      return res.status(502).json({ error: 'Database unavailable' });
    }

    const transactions = (txs ?? []) as Transaction[];
    const positionPreview = calculatePositions(transactions);

    if (positionPreview.hadInvalidSell) {
      console.error('portfolio contains invalid historical SELL ordering', {
        portfolioId: portfolio.id,
      });
      return res.status(409).json({
        error: 'Portfolio transaction history is inconsistent',
        code: 'INVALID_TRANSACTION_HISTORY',
      });
    }

    const symbols = positionPreview.positions.map((p) => p.symbol);

    const quoteMap = new Map<string, Quote>();
    await Promise.all(
      symbols.map(async (sym) => {
        const q = await marketData.quote(sym);
        if (q) quoteMap.set(sym, q);
      })
    );

    const enriched = enrichPositionsWithQuotes(transactions, quoteMap);

    let risk: {
      volatility: number | null;
      sharpe: number | null;
      available: boolean;
      reason?: string;
    } = { volatility: null, sharpe: null, available: false, reason: 'not_computed' };

    if (enriched.positions.length > 0) {
      try {
        const historyBySymbol = new Map<string, HistoryBar[]>();
        await Promise.all(
          enriched.positions.map(async (pos) => {
            const bars = await marketData.history(pos.symbol, '1y');
            if (bars.length > 0) historyBySymbol.set(pos.symbol, bars);
          })
        );

        const series = buildPortfolioValueSeries(enriched.positions, historyBySymbol);

        if (series.available) {
          const vol = annualizedVolatility(series.dailyReturns);
          const sharpe = calculateSharpe(series.dailyReturns, vol, 0);
          risk = {
            volatility: vol,
            sharpe,
            available: vol !== null,
            reason: vol === null ? 'insufficient_data' : undefined,
          };
        } else {
          risk = {
            volatility: null,
            sharpe: null,
            available: false,
            reason: series.reason ?? 'insufficient_history',
          };
        }
      } catch (error) {
        console.error('risk computation error', error);
        risk = {
          volatility: null,
          sharpe: null,
          available: false,
          reason: 'computation_error',
        };
      }
    } else {
      risk = {
        volatility: null,
        sharpe: null,
        available: false,
        reason: 'empty_portfolio',
      };
    }

    return res.status(200).json({
      portfolio,
      transactions,
      positions: enriched.positions,
      portfolioValue: enriched.portfolioValue,
      totalPnL: enriched.totalPnL,
      realizedPnL: enriched.realizedPnL,
      unrealizedPnL: enriched.unrealizedPnL,
      allocation: enriched.allocation,
      concentration: enriched.concentration,
      valuation: enriched.valuation,
      risk,
    });
  } catch (err) {
    console.error('portfolio GET error', err);
    const isConfigurationError =
      err instanceof Error &&
      (err.message.includes('SUPABASE') || err.message.includes('FINNHUB_API_KEY'));
    const message = isConfigurationError
      ? 'Server configuration error'
      : 'Internal server error';
    return res.status(500).json({ error: message });
  }
}
