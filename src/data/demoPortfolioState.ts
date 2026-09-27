import type { PortfolioSnapshot } from '../types';

export function activePortfolioSnapshot(realSnapshot: PortfolioSnapshot, demoSnapshot: PortfolioSnapshot | null): PortfolioSnapshot {
  return demoSnapshot ?? realSnapshot;
}
