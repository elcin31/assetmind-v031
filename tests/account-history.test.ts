import { expect, it } from 'vitest';
import type { CashEvent, HistoryBar, Transaction } from '../src/types';
import { reconstructAccountHistory } from '../src/math/accountHistory';
import { performanceMetrics } from '../src/math/performance';

function trade(
  id: string,
  day: string,
  type: 'BUY' | 'SELL',
  quantity: number,
  price: number,
): Transaction {
  return {
    id,
    portfolio_id: 'p',
    symbol: 'AAPL',
    type,
    quantity,
    price,
    currency: 'USD',
    timestamp: `${day}T14:00:00Z`,
    created_at: `${day}T14:00:01Z`,
  };
}

function cash(
  id: string,
  day: string,
  kind: 'DEPOSIT' | 'WITHDRAWAL' | 'DIVIDEND' | 'FEE',
  amount: number,
): CashEvent {
  return {
    id,
    portfolio_id: 'p',
    kind,
    amount,
    currency: 'USD',
    timestamp: `${day}T12:00:00Z`,
    created_at: `${day}T12:00:01Z`,
  };
}

const bars: HistoryBar[] = [
  { date: '2026-01-02', close: 100 },
  { date: '2026-01-05', close: 110 },
  { date: '2026-01-06', close: 121 },
  { date: '2026-01-07', close: 133.1 },
];
const histories = new Map([['AAPL', bars]]);

it('keeps an internal BUY inside actual account TWR instead of creating a fake break', () => {
  const history = reconstructAccountHistory(
    [
      trade('buy-1', '2026-01-02', 'BUY', 1, 100),
      trade('buy-2', '2026-01-05', 'BUY', 1, 110),
    ],
    [cash('funding', '2026-01-02', 'DEPOSIT', 300)],
    histories,
    '2026-01-07',
  );

  expect(history.reason).toBeNull();
  expect(history.points.map((point) => point.value)).toEqual([300, 310, 332, 356.2]);
  expect(history.points[1]).toMatchObject({ traded: true, externalFlow: 0 });
  expect(history.points[1].dailyReturn).toBeCloseTo(10 / 300, 12);

  const performance = performanceMetrics(history.points);
  expect(performance.reason).toBeNull();
  expect(performance.twr).toBeCloseTo(356.2 / 300 - 1, 12);
});

it('keeps internal SELL proceeds as cash and preserves the account return', () => {
  const history = reconstructAccountHistory(
    [
      trade('buy', '2026-01-02', 'BUY', 2, 100),
      trade('sell', '2026-01-05', 'SELL', 1, 110),
    ],
    [cash('funding', '2026-01-02', 'DEPOSIT', 300)],
    histories,
    '2026-01-06',
  );

  expect(history.points.map((point) => point.value)).toEqual([300, 320, 331]);
  expect(history.points[1].dailyReturn).toBeCloseTo(20 / 300, 12);
  expect(history.points[2].dailyReturn).toBeCloseTo(11 / 320, 12);
});

it('does not invent exact TWR across a deposit even when the cash amount is known', () => {
  const history = reconstructAccountHistory(
    [trade('buy', '2026-01-02', 'BUY', 1, 100)],
    [
      cash('funding', '2026-01-02', 'DEPOSIT', 200),
      cash('second-funding', '2026-01-05', 'DEPOSIT', 50),
    ],
    histories,
    '2026-01-06',
  );

  expect(history.points[1]).toMatchObject({
    externalFlow: 50,
    externalFlowOccurred: true,
    dailyReturn: null,
  });
  const performance = performanceMetrics(history.points);
  expect(performance.twr).toBeNull();
  expect(performance.reason).toContain('DEPOSIT/WITHDRAWAL');
  expect(performance.riskReturns).toHaveLength(1);
});

it('treats dividends and fees as account performance rather than external funding', () => {
  const history = reconstructAccountHistory(
    [trade('buy', '2026-01-02', 'BUY', 1, 100)],
    [
      cash('funding', '2026-01-02', 'DEPOSIT', 200),
      cash('dividend', '2026-01-05', 'DIVIDEND', 5),
      cash('fee', '2026-01-06', 'FEE', 2),
    ],
    histories,
    '2026-01-06',
  );

  expect(history.points.map((point) => point.value)).toEqual([200, 215, 224]);
  expect(history.points[1].dailyReturn).toBeCloseTo(0.075, 12);
  expect(history.points[2].dailyReturn).toBeCloseTo(9 / 215, 12);
});

it('refuses actual performance when explicit funding is incomplete', () => {
  const history = reconstructAccountHistory(
    [trade('buy', '2026-01-02', 'BUY', 1, 100)],
    [],
    histories,
    '2026-01-06',
  );

  expect(history.points).toEqual([]);
  expect(history.reason).toContain('Cash ledger');
  const performance = performanceMetrics(history.points);
  expect(performance.twr).toBeNull();
  expect(performance.totalReturn).toBeNull();
});
