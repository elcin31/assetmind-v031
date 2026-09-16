// Isolated analytics UI fixture. No authentication bypass, no production data.
import React from "react";
import { createRoot } from "react-dom/client";
import { PortfolioScreen } from "../../src/pages/PortfolioScreen";
import { enrichPositionsWithQuotes } from "../../src/math/pnl";
import "../../src/index.css";
import "../../src/auth/auth-integration.css";
const mode = new URLSearchParams(location.search).get("mode");
const symbols = ["AAPL", "MSFT", "NVDA"];
const transactions =
  mode === "empty"
    ? []
    : symbols.map((symbol, i) => ({
        id: `buy-${i}`,
        portfolio_id: "fixture",
        symbol,
        type: "BUY",
        quantity: [20, 15, 30][i],
        price: [100, 150, 80][i],
        currency: "USD",
        timestamp: "2024-01-02T15:00:00Z",
        created_at: "2024-01-02T16:00:00Z",
      }));
if (mode === "trades")
  transactions.push({
    ...transactions[0],
    id: "later",
    timestamp: "2026-08-10T15:00:00Z",
    created_at: "2026-08-10T16:00:00Z",
  });
const quotes = new Map(
  symbols.map((symbol, i) => [
    symbol,
    {
      symbol,
      price: [235, 480, 190][i],
      change: 0,
      changePercent: 0,
      timestamp: Date.now(),
    },
  ]),
);
const snapshot = {
  portfolio: {
    id: "fixture",
    name: "Аналитика · тестовый портфель",
    base_currency: "USD",
    created_at: "2024-01-02",
  },
  transactions,
  ...enrichPositionsWithQuotes(transactions, quotes),
};
createRoot(document.getElementById("root")).render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(
      "div",
      { className: "app" },
      React.createElement(PortfolioScreen, {
        snapshot,
        userId: "fixture",
        onRefresh() {},
        async onSignOut() {},
        loading: false,
        error: null,
        setError() {},
      }),
    ),
  ),
);
