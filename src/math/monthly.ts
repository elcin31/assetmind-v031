import type { MonthlyReturn } from "../types/analytics";
import { cumulativeReturn } from "./performance";
/** Require January and every elapsed month. Partial first/last months remain explicitly labelled in UI. */
export function monthlyRows(months: MonthlyReturn[]) {
  return [...new Set(months.map((m) => m.year))]
    .sort((a, b) => b - a)
    .map((year) => {
      const cells = Array.from({ length: 12 }, (_, i) =>
        months.find((m) => m.year === year && m.month === i + 1),
      );
      const last = Math.max(
        ...months.filter((m) => m.year === year).map((m) => m.month),
      );
      return {
        year,
        cells,
        ytd: cells[0]?.ytdEligible
          ? cumulativeReturn(cells.slice(0, last).map((m) => m?.value ?? null))
          : null,
      };
    });
}
