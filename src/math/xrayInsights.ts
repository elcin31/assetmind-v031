export type XRayObservationCategory = 'concentration' | 'risk' | 'diversification' | 'performance' | 'data';
export type XRaySeverity = 'info' | 'medium' | 'high';
export interface XRayObservation {
  id: string;
  category: XRayObservationCategory;
  severity: XRaySeverity;
  title: string;
  message: string;
  symbol?: string;
  metric?: number;
}
export interface XRayPositionInput { symbol: string; weight: number | null; riskContribution: number | null }
export interface XRayInsightInput {
  positions: XRayPositionInput[];
  averagePairwiseCorrelation: number | null;
  currentDrawdown: number | null;
  maxDrawdown: number | null;
  riskConcentration?: number | null;
  diversificationRatio?: number | null;
  portfolioBeta?: number | null;
  activeDrawdown?: number | null;
  commonObservations: number;
  requiredObservations: number;
}

export const HIGH_AVERAGE_PAIRWISE_CORRELATION = 0.7;
export const SIGNIFICANT_DRAWDOWN_FRACTION = 0.5;
export const LOW_EFFECTIVE_HOLDINGS_FRACTION = 0.5;
export const LIMITED_OBSERVATIONS_THRESHOLD = 60;
export const HIGH_RISK_CONCENTRATION_THRESHOLD = 0.35;
export const VERY_HIGH_RISK_CONCENTRATION_THRESHOLD = 0.5;
export const LOW_DIVERSIFICATION_RATIO_THRESHOLD = 1.15;
export const HIGH_BETA_THRESHOLD = 1.3;
export const VERY_HIGH_BETA_THRESHOLD = 1.75;
export const SIGNIFICANT_ACTIVE_DRAWDOWN_THRESHOLD = 0.05;
export const LARGE_CURRENT_DRAWDOWN_THRESHOLD = 0.1;
export const VERY_LARGE_CURRENT_DRAWDOWN_THRESHOLD = 0.2;

const valid = (n: number | null | undefined): n is number => n !== null && n !== undefined && Number.isFinite(n);
const percent = (value: number) => (value * 100).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Deterministic factual observations; no advice or forecast language. */
export function buildXRayInsights(input: XRayInsightInput): XRayObservation[] {
  const observations: XRayObservation[] = [];
  const positions = input.positions.filter(p => valid(p.weight) && p.weight >= 0);
  const sorted = [...positions].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const largest = sorted[0];
  if (largest && largest.weight !== null && largest.weight >= 0.3) observations.push({ id: `position-high-${largest.symbol}`, category: 'concentration', severity: 'high', title: 'Высокая концентрация', message: `${largest.symbol} занимает ${percent(largest.weight)}% текущей стоимости портфеля.`, symbol: largest.symbol, metric: largest.weight });
  else if (largest && largest.weight !== null && largest.weight >= 0.2) observations.push({ id: `position-medium-${largest.symbol}`, category: 'concentration', severity: 'medium', title: 'Концентрация позиции', message: `${largest.symbol} занимает ${percent(largest.weight)}% текущей стоимости портфеля.`, symbol: largest.symbol, metric: largest.weight });

  for (const position of positions) {
    if (!valid(position.riskContribution) || !valid(position.weight) || position.weight <= 0) continue;
    const ratio = position.riskContribution / position.weight;
    if (!Number.isFinite(ratio) || ratio < 1.5) continue;
    observations.push({ id: `risk-${position.symbol}`, category: 'risk', severity: ratio >= 2 ? 'high' : 'medium', title: 'Концентрация риска', message: `${position.symbol} составляет ${percent(position.weight)}% капитала, но формирует ${percent(position.riskContribution)}% рассчитанного риска.`, symbol: position.symbol, metric: ratio });
  }

  if (valid(input.riskConcentration) && input.riskConcentration >= HIGH_RISK_CONCENTRATION_THRESHOLD) observations.push({ id: 'risk-concentration-hhi', category: 'risk', severity: input.riskConcentration >= VERY_HIGH_RISK_CONCENTRATION_THRESHOLD ? 'high' : 'medium', title: 'Концентрация рассчитанного риска', message: `Индекс концентрации вкладов в риск составляет ${input.riskConcentration.toFixed(2)} (Σ normalized RCᵢ²).`, metric: input.riskConcentration });

  const positiveWeights = positions.map(p => p.weight!).filter(w => w > 0);
  const effective = concentration(positiveWeights)?.effectivePositions ?? null;
  if (positiveWeights.length >= 5 && effective !== null && effective < positiveWeights.length * LOW_EFFECTIVE_HOLDINGS_FRACTION) observations.push({ id: 'low-effective-diversification', category: 'diversification', severity: 'medium', title: 'Ограниченная диверсификация', message: `В портфеле ${positiveWeights.length} позиций, эффективное число позиций — ${effective.toFixed(1)}.`, metric: effective });

  if (valid(input.averagePairwiseCorrelation) && input.averagePairwiseCorrelation >= HIGH_AVERAGE_PAIRWISE_CORRELATION) observations.push({ id: 'high-correlation', category: 'diversification', severity: 'medium', title: 'Высокая средняя корреляция', message: `Средняя попарная корреляция активов — ${input.averagePairwiseCorrelation.toFixed(2)}.`, metric: input.averagePairwiseCorrelation });
  if (valid(input.diversificationRatio) && input.diversificationRatio < LOW_DIVERSIFICATION_RATIO_THRESHOLD) observations.push({ id: 'low-diversification-ratio', category: 'diversification', severity: 'medium', title: 'Низкий эффект диверсификации', message: `Diversification Ratio составляет ${input.diversificationRatio.toFixed(2)}.`, metric: input.diversificationRatio });
  if (valid(input.portfolioBeta) && input.portfolioBeta >= HIGH_BETA_THRESHOLD) observations.push({ id: 'high-benchmark-beta', category: 'risk', severity: input.portfolioBeta >= VERY_HIGH_BETA_THRESHOLD ? 'high' : 'medium', title: 'Повышенная чувствительность к benchmark', message: `Beta портфеля относительно выбранного benchmark составляет ${input.portfolioBeta.toFixed(2)}.`, metric: input.portfolioBeta });
  if (valid(input.currentDrawdown) && input.currentDrawdown <= -LARGE_CURRENT_DRAWDOWN_THRESHOLD) observations.push({ id: 'large-current-drawdown', category: 'performance', severity: Math.abs(input.currentDrawdown) >= VERY_LARGE_CURRENT_DRAWDOWN_THRESHOLD ? 'high' : 'medium', title: 'Значительная текущая просадка', message: `Текущая просадка от предыдущего максимума составляет ${percent(Math.abs(input.currentDrawdown))}%.`, metric: input.currentDrawdown });
  if (valid(input.activeDrawdown) && input.activeDrawdown <= -SIGNIFICANT_ACTIVE_DRAWDOWN_THRESHOLD) observations.push({ id: 'large-active-drawdown', category: 'performance', severity: 'medium', title: 'Просадка относительно benchmark', message: `Относительный индекс портфеля просел на ${percent(Math.abs(input.activeDrawdown))}% от своего максимума.`, metric: input.activeDrawdown });
  if (valid(input.currentDrawdown) && valid(input.maxDrawdown) && input.maxDrawdown > 0 && input.currentDrawdown < 0 && Math.abs(input.currentDrawdown) >= input.maxDrawdown * SIGNIFICANT_DRAWDOWN_FRACTION) observations.push({ id: 'significant-current-drawdown', category: 'performance', severity: 'medium', title: 'Текущая просадка', message: `Текущая просадка составляет ${percent(Math.abs(input.currentDrawdown) / input.maxDrawdown)}% исторического максимума глубины.`, metric: input.currentDrawdown });
  if (Number.isFinite(input.commonObservations) && Number.isFinite(input.requiredObservations) && input.commonObservations >= 0 && input.commonObservations < Math.max(input.requiredObservations, LIMITED_OBSERVATIONS_THRESHOLD)) observations.push({ id: 'limited-risk-sample', category: 'data', severity: 'info', title: 'Ограниченная выборка риска', message: `Расчёт риска основан на ${input.commonObservations} общих дневных наблюдениях (окно ${input.requiredObservations}).`, metric: input.commonObservations });

  const rank: Record<XRaySeverity, number> = { high: 0, medium: 1, info: 2 };
  return observations.sort((a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id)).slice(0, 5);
}
import { concentration } from './lab';
