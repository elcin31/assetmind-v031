import type { VercelResponse } from '@vercel/node';

// Only server configuration selects the shared portfolio; never accept a client ID.
export function requireDefaultPortfolio(res: VercelResponse): string | null {
  const id = process.env.DEFAULT_PORTFOLIO_ID?.trim();
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    res.status(503).json({ error: 'Set DEFAULT_PORTFOLIO_ID to a portfolio UUID in the server environment' });
    return null;
  }
  return id;
}
