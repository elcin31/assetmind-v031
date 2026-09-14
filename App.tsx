import { useCallback, useEffect, useRef, useState } from 'react';
import './index.css';
import type { PortfolioSnapshot } from './types';
import { InviteScreen } from './pages/InviteScreen';
import { PortfolioScreen } from './pages/PortfolioScreen';

export default function App() {
  const [code, setCode] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const restoredCode = useRef<string | null>(null);
  const restoreAttempted = useRef(false);

  if (restoredCode.current === null && !restoreAttempted.current) {
    restoredCode.current = sessionStorage.getItem('am_invite_code');
  }

  const loadPortfolio = useCallback(async (inviteCode: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/portfolio', {
        headers: { Authorization: `Bearer ${inviteCode}` },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'Failed to load portfolio');
        setSnapshot(null);
        if (res.status === 401) {
          sessionStorage.removeItem('am_invite_code');
          setCode(null);
        }
        return;
      }

      setSnapshot(data as PortfolioSnapshot);
      setCode(inviteCode);
      sessionStorage.setItem('am_invite_code', inviteCode);
    } catch {
      setError('Network error. Please try again.');
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (restoreAttempted.current) return;
    restoreAttempted.current = true;

    const savedCode = restoredCode.current;
    restoredCode.current = null;
    if (savedCode) void loadPortfolio(savedCode);
  }, [loadPortfolio]);

  const handleLogout = () => {
    sessionStorage.removeItem('am_invite_code');
    setCode(null);
    setSnapshot(null);
    setError(null);
  };

  if (!code || !snapshot) {
    return (
      <div className="app">
        <InviteScreen onSubmit={loadPortfolio} loading={loading} error={error} />
      </div>
    );
  }

  return (
    <div className="app">
      <PortfolioScreen
        code={code}
        snapshot={snapshot}
        onRefresh={() => loadPortfolio(code)}
        onLogout={handleLogout}
        loading={loading}
        setError={setError}
        error={error}
      />
    </div>
  );
}
