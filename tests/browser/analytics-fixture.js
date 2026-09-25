// Isolated analytics UI fixture. No authentication bypass, no production data.
import React from "react";
import { readPlanningState } from "../../src/storage/planning";
import { createRoot } from "react-dom/client";
import { PortfolioScreen } from "../../src/pages/PortfolioScreen";
import { enrichPositionsWithQuotes } from "../../src/math/pnl";
import "../../src/index.css";
import "../../src/auth/auth-integration.css";
const mode = new URLSearchParams(location.search).get("mode");
const allSymbols = ["AAPL", "MSFT", "NVDA", "AMD", "GOOG", "META", "TSLA"];
const symbols = mode === "single" ? ["AAPL"] : allSymbols;
const transactions =
  mode === "empty"
    ? []
    : symbols.map((symbol, i) => ({
        id: `buy-${i}`,
        portfolio_id: "fixture",
        symbol,
        type: "BUY",
        quantity: [20, 15, 30, 10, 8, 4, 3][allSymbols.indexOf(symbol)],
        price: [100, 150, 80, 90, 100, 180, 130][allSymbols.indexOf(symbol)],
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
  symbols.map((symbol) => [
    symbol,
    {
      symbol,
      price: [235, 480, 190, 70, 90, 150, 100][allSymbols.indexOf(symbol)],
      change: 0,
      changePercent: 0,
      timestamp: Date.now(),
    },
  ]),
);
if (mode === "incomplete") quotes.delete("MSFT");
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
if (mode === "large") snapshot.accountValue = 1234567890123.45;

if (mode === 'planning') {
  snapshot.cashLedger = {complete:true,balance:10000,minimumBalance:0,reason:null,deposits:30000,withdrawals:0,dividends:0,fees:0};
  snapshot.accountValue = snapshot.portfolioValue + 10000;
  snapshot.targetAllocation = [{symbol:'AAPL',weight:.25},{symbol:'MSFT',weight:.25},{symbol:'NVDA',weight:.25}];
}
function Fixture() {
  const [state,setState]=React.useState(snapshot);
  const [error,setError]=React.useState(null);
  const refresh=()=>void readPlanningState('fixture','fixture','USD').then(p=>setState(previous=>({...previous,targetAllocation:p.targetAllocation})));
  return React.createElement('div',{className:'app'},React.createElement(PortfolioScreen,{snapshot:state,userId:'fixture',onRefresh:refresh,async onSignOut(){},loading:false,error,setError}));
}
createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(Fixture)));
