import { supabase } from '../auth/supabase';
import type { BenchmarkSymbol, Period, RiskHorizon } from '../types/analytics';

export interface AnalyticsPreferences {
  period: Period;
  riskHorizon: RiskHorizon;
  benchmark: BenchmarkSymbol;
  rf: number;
  mar: number;
}

export const DEFAULT_ANALYTICS_PREFERENCES: AnalyticsPreferences = {
  period: '1Y',
  riskHorizon: '60D',
  benchmark: 'SPY',
  rf: 0,
  mar: 0,
};

const periods = new Set<Period>(['1M', '3M', '6M', 'YTD', '1Y', 'ALL']);
const riskHorizons = new Set<RiskHorizon>(['20D', '60D', '1Y']);
const benchmarks = new Set<BenchmarkSymbol>(['SPY', 'QQQ', 'DIA', 'IWM']);

export function normalizeAnalyticsPreferences(value: unknown): AnalyticsPreferences {
  if (!value || typeof value !== 'object') return DEFAULT_ANALYTICS_PREFERENCES;
  const raw = value as Partial<AnalyticsPreferences>;
  const rf = Number(raw.rf);
  const mar = Number(raw.mar);
  return {
    period: periods.has(raw.period as Period) ? raw.period as Period : '1Y',
    riskHorizon: riskHorizons.has(raw.riskHorizon as RiskHorizon) ? raw.riskHorizon as RiskHorizon : '60D',
    benchmark: benchmarks.has(raw.benchmark as BenchmarkSymbol) ? raw.benchmark as BenchmarkSymbol : 'SPY',
    rf: Number.isFinite(rf) ? Math.max(-10, Math.min(100, rf)) : 0,
    mar: Number.isFinite(mar) ? Math.max(-10, Math.min(100, mar)) : 0,
  };
}

function storageKey(userId: string) {
  return `assetmind:${userId}:analytics.v1`;
}

export function readLocalAnalyticsPreferences(userId: string): AnalyticsPreferences {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? normalizeAnalyticsPreferences(JSON.parse(raw)) : DEFAULT_ANALYTICS_PREFERENCES;
  } catch {
    return DEFAULT_ANALYTICS_PREFERENCES;
  }
}

function writeLocalAnalyticsPreferences(userId: string, value: AnalyticsPreferences) {
  try { localStorage.setItem(storageKey(userId), JSON.stringify(value)); }
  catch { /* Preferences are non-critical; cloud remains authoritative when available. */ }
}

export async function loadAnalyticsPreferences(userId: string): Promise<AnalyticsPreferences> {
  const local = readLocalAnalyticsPreferences(userId);
  if (!supabase) return local;
  const result = await supabase
    .from('user_settings')
    .select('analytics_preferences')
    .eq('user_id', userId)
    .maybeSingle();
  if (result.error) return local;
  if (!result.data?.analytics_preferences) return local;
  const preferences = normalizeAnalyticsPreferences(result.data.analytics_preferences);
  writeLocalAnalyticsPreferences(userId, preferences);
  return preferences;
}

export async function saveAnalyticsPreferences(userId: string, value: AnalyticsPreferences) {
  const preferences = normalizeAnalyticsPreferences(value);
  writeLocalAnalyticsPreferences(userId, preferences);
  if (!supabase) return;
  const result = await supabase.from('user_settings').upsert(
    { user_id: userId, analytics_preferences: preferences },
    { onConflict: 'user_id' },
  );
  if (result.error) console.warn('[AssetMind analytics preferences]', result.error.message);
}
