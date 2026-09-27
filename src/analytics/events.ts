import { supabase } from '../auth/supabase';
import { getAnalyticsSessionId } from './session';

export const ANALYTICS_EVENT_NAMES = [
  'app_open', 'overview_view', 'xray_view', 'laboratory_view', 'demo_portfolio_started',
  'demo_portfolio_exited', 'portfolio_created', 'first_position_added', 'position_added',
  'transaction_created', 'share_xray_clicked', 'share_xray_completed', 'benchmark_changed',
] as const;
export type AnalyticsEventName = typeof ANALYTICS_EVENT_NAMES[number];
type Properties = Record<string, string | number | boolean | null>;

export function sanitizeAnalyticsProperties(properties: Properties): Properties {
  return Object.fromEntries(Object.entries(properties).filter(([key, value]) =>
    !/(email|name|token|jwt|user.?id|transaction|cost.?basis|amount|balance|symbol|ticker)/i.test(key)
    && (value === null || ['string', 'number', 'boolean'].includes(typeof value))
    && (typeof value !== 'number' || Number.isFinite(value)),
  ));
}

export function deliverBestEffort(send: () => PromiseLike<unknown>): void {
  try { void Promise.resolve(send()).catch(() => { /* analytics failures are intentionally ignored */ }); }
  catch { /* analytics failures are intentionally ignored */ }
}

/** Best-effort event delivery. Errors are deliberately isolated from the UI. */
export function trackEvent(name: AnalyticsEventName, properties: Properties = {}, userId?: string): void {
  if (!ANALYTICS_EVENT_NAMES.includes(name)) return;
  const clean = sanitizeAnalyticsProperties(properties);
  queueMicrotask(() => {
    try {
      if (!supabase || !userId) return;
      const client = supabase;
      if (!client) return;
      deliverBestEffort(() => client.from('analytics_events').insert({
        user_id: userId,
        session_id: getAnalyticsSessionId(),
        event_name: name,
        properties: clean,
      }).then(({ error }) => { if (error) console.debug('[AssetMind analytics] Event unavailable'); }));
    } catch { /* Product analytics must never interrupt an interaction. */ }
  });
}
