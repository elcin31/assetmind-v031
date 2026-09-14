import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseServer } from './supabaseServer';

export interface ActiveInvite {
  code: string;
  portfolioId: string;
}

export function getInviteCode(req: VercelRequest): string {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string') return '';

  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match?.[1]?.trim() ?? '';
}

export function isInviteCodeShapeValid(code: string): boolean {
  return code.length >= 8 && code.length <= 128;
}

export async function requireActiveInvite(
  req: VercelRequest,
  res: VercelResponse
): Promise<ActiveInvite | null> {
  res.setHeader('Vary', 'Authorization');
  const code = getInviteCode(req);
  if (!isInviteCodeShapeValid(code)) {
    res.status(401).json({ error: 'Invalid or missing invite code' });
    return null;
  }

  try {
    const supabase = getSupabaseServer();
    const { data: invite, error } = await supabase
      .from('invite_codes')
      .select('portfolio_id, active')
      .eq('code', code)
      .maybeSingle();

    if (error) {
      console.error('invite lookup error', error);
      res.status(502).json({ error: 'Database unavailable' });
      return null;
    }

    if (!invite || !invite.active) {
      res.status(401).json({ error: 'Invalid or inactive invite code' });
      return null;
    }

    return { code, portfolioId: invite.portfolio_id as string };
  } catch (error) {
    console.error('invite auth configuration error', error);
    res.status(500).json({ error: 'Server configuration error' });
    return null;
  }
}
