// Isolated portfolio screen: no authentication or real market requests.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PortfolioScreen } from '../../src/pages/PortfolioScreen';
import { enrichPositionsWithQuotes } from '../../src/math/pnl';
import '../../src/index.css';
import '../../src/auth/auth-integration.css';
const snapshot = {
  portfolio: { id: 'fixture', name: 'Test Portfolio', base_currency: 'USD', created_at: '2026-01-01' },
  transactions: [], ...enrichPositionsWithQuotes([], new Map()),
  risk: { available: false, volatility: null, sharpe: null },
};
createRoot(document.getElementById('root')).render(
  React.createElement(React.StrictMode, null,
    React.createElement('div', { className: 'app' },
      React.createElement(PortfolioScreen, {
        snapshot, userId: 'fixture', onRefresh() {}, async onSignOut() {},
        loading: false, error: null, setError() {},
      }))),
);
