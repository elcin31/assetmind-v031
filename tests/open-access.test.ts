import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../api/portfolio/transaction';
import { requireDefaultPortfolio } from '../server/portfolio';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../server/supabaseServer', () => ({ getSupabaseServer: () => ({ rpc }) }));
const id = '00000000-0000-0000-0000-000000000001';
function response() {
  return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('open portfolio access', () => {
  it.each(['', 'invalid'])('fails closed for invalid server portfolio configuration: %s', (value) => {
    vi.stubEnv('DEFAULT_PORTFOLIO_ID', value);
    const res = response();
    expect(requireDefaultPortfolio(res as unknown as VercelResponse)).toBeNull();
    expect(res.status).toHaveBeenCalledWith(503);
  });
  it('writes without credentials and ignores client portfolio selection', async () => {
    vi.stubEnv('DEFAULT_PORTFOLIO_ID', id);
    rpc.mockReturnValue({ single: async () => ({ data: { id: 'saved' }, error: null }) });
    const res = response();
    await handler({ method: 'POST', headers: {}, query: { portfolioId: 'other' }, body: {
      portfolioId: 'other', idempotencyKey: '0f91ed0f-3f94-4ed5-a717-020c2d796887',
      transaction: { symbol: 'AAPL', type: 'BUY', quantity: 1, price: 100, currency: 'USD', timestamp: '2026-09-14T10:00:00Z' },
    } } as unknown as VercelRequest, res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(rpc).toHaveBeenCalledWith('add_portfolio_transaction', expect.objectContaining({ p_portfolio_id: id }));
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_code');
  });
  it('keeps request validation before database writes', async () => {
    vi.stubEnv('DEFAULT_PORTFOLIO_ID', id);
    const res = response();
    await handler({ method: 'POST', headers: {}, body: {} } as VercelRequest, res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
