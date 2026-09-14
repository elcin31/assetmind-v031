import { useCallback, useState } from 'react';
import type { PortfolioSnapshot, SearchResult } from '../types';
import { HoldingsList } from '../components/HoldingsList';
import { OverviewCard } from '../components/OverviewCard';
import { RiskCard } from '../components/RiskCard';
import { AllocationCard } from '../components/AllocationCard';
import { TransactionForm } from '../components/TransactionForm';
import { SearchPanel } from '../components/SearchPanel';

type Tab = 'overview' | 'holdings' | 'trade' | 'risk';

interface Props {
  code: string;
  snapshot: PortfolioSnapshot;
  onRefresh: () => void;
  onLogout: () => void;
  loading: boolean;
  error: string | null;
  setError: (e: string | null) => void;
}

export function PortfolioScreen({
  code,
  snapshot,
  onRefresh,
  onLogout,
  loading,
  error,
  setError,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const handleSelectSymbol = useCallback((r: SearchResult) => {
    setSelectedSymbol(r.symbol);
    setTab('trade');
  }, []);

  return (
    <>
      <header className="header">
        <div>
          <h1>{snapshot.portfolio.name}</h1>
          <p className="header-sub">
            {snapshot.portfolio.base_currency} · {snapshot.positions.length} positions
          </p>
        </div>
        <button className="btn btn-ghost compact-button" onClick={onLogout}>
          Exit
        </button>
      </header>

      {error && (
        <div className="error-banner error-with-action">
          <span>{error}</span>
          <button onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      <nav className="tabs" aria-label="Portfolio sections">
        {(['overview', 'holdings', 'trade', 'risk'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
            aria-current={tab === t ? 'page' : undefined}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      <div className={loading ? 'loading' : ''} aria-busy={loading}>
        {tab === 'overview' && (
          <>
            <OverviewCard snapshot={snapshot} />
            <AllocationCard allocation={snapshot.allocation} />
          </>
        )}

        {tab === 'holdings' && (
          <HoldingsList
            positions={snapshot.positions}
            currency={snapshot.portfolio.base_currency}
          />
        )}

        {tab === 'trade' && (
          <>
            <SearchPanel code={code} onSelect={handleSelectSymbol} />
            <TransactionForm
              code={code}
              currency={snapshot.portfolio.base_currency}
              initialSymbol={selectedSymbol}
              onSuccess={() => {
                setSelectedSymbol(null);
                onRefresh();
              }}
              onError={(message) => setError(message || null)}
            />
          </>
        )}

        {tab === 'risk' && <RiskCard risk={snapshot.risk} snapshot={snapshot} />}
      </div>
    </>
  );
}
