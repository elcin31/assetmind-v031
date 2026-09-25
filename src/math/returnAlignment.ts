import type { DatedReturn } from '../types/analytics';
import { validDate } from './statistics';

export interface AlignedReturn {
  date: string;
  startDate: string;
  portfolio: number;
  benchmark: number;
}

/** Canonical strict interval alignment. No date shifting or filling is allowed. */
export function alignReturns(a: DatedReturn[], b: DatedReturn[]): AlignedReturn[] {
  const clean = (returns: DatedReturn[]) => returns.every((r, i) =>
    validDate(r.date) && validDate(r.startDate) && r.startDate < r.date &&
    Number.isFinite(r.value) && r.value >= -1 && (i === 0 || r.date > returns[i - 1].date));
  if (!clean(a) || !clean(b)) return [];
  const map = new Map(b.map(r => [`${r.startDate}/${r.date}`, r]));
  return a.flatMap(r => {
    const other = map.get(`${r.startDate}/${r.date}`);
    return other ? [{ date: r.date, startDate: r.startDate, portfolio: r.value, benchmark: other.value }] : [];
  });
}
