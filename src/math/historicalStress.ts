import type { DatedReturn } from '../types/analytics';

export interface HistoricalStressWindow {
  window: number;
  return: number;
  startDate: string;
  endDate: string;
}

function validReturn(item: DatedReturn) {
  return Number.isFinite(item.value) && item.value >= -1 && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && /^\d{4}-\d{2}-\d{2}$/.test(item.startDate) && item.startDate < item.date;
}

function compounded(items: DatedReturn[]) {
  return items.reduce((product, item) => product * (1 + item.value), 1) - 1;
}

/**
 * Worst rolling outcomes for an exact return chain. A window is accepted only
 * when every interval starts where the previous interval ended, so a provider
 * gap cannot silently become a multi-day bridge.
 */
export function historicalStressWindows(
  returns: DatedReturn[],
  windows: number[] = [1, 5, 20, 63],
): HistoricalStressWindow[] {
  if (!returns.length || returns.some((item, index) => !validReturn(item) || (index > 0 && item.date <= returns[index - 1].date))) return [];
  const result: HistoricalStressWindow[] = [];
  for (const window of [...new Set(windows)].filter((value) => Number.isInteger(value) && value > 0).sort((a, b) => a - b)) {
    let worst: HistoricalStressWindow | null = null;
    for (let end = window - 1; end < returns.length; end++) {
      const slice = returns.slice(end - window + 1, end + 1);
      const contiguous = slice.every((item, index) => index === 0 || item.startDate === slice[index - 1].date);
      if (!contiguous) continue;
      const value = compounded(slice);
      if (!Number.isFinite(value)) continue;
      const candidate: HistoricalStressWindow = {
        window,
        return: value,
        startDate: slice[0].startDate,
        endDate: slice.at(-1)!.date,
      };
      if (!worst || candidate.return < worst.return) worst = candidate;
    }
    if (worst) result.push(worst);
  }
  return result;
}
