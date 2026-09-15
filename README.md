# AssetMind

Personal portfolio tracker with browser-local storage. No login or Supabase configuration is required.

## Use

Open the app and add a BUY or SELL in the Trade tab. Enter the ticker and price manually when live market data is unavailable. Transactions persist in localStorage under `assetmind.portfolio.v1`. Each browser and site origin has its own portfolio; data does not sync between devices or between preview and production URLs.

Export backup downloads a versioned JSON file. Import backup validates and merges transactions, skips identical IDs, and rejects conflicts or invalid historical sells without changing existing data. Clearing site data removes the portfolio. Export regularly. Private browsing may discard data when the session closes.

Existing Supabase data is not automatically transferred or deleted. SQL files and the old handoff are retained only as historical references and are not needed for this version.

## Development

Use Node 22.22.2+ or 24.15.0+, then `npm ci` and `npm run dev`. The portfolio and manual trades work with the Vite dev server alone. Use `vercel dev` for optional market-data API routes.

`npm run verify` runs TypeScript, tests, lint, and the production build.

## Optional market data

Only `FINNHUB_API_KEY` is used, server-side in Vercel. No `SUPABASE_*` or `DEFAULT_PORTFOLIO_ID` variables are required. Quotes, search and history use the existing market-data endpoints. Missing quotes are shown as incomplete valuation rather than substituting trade prices for current market prices. Risk uses historical prices for current holdings, not actual historical portfolio NAV. Local trades work when those endpoints are unavailable, but loading the app itself offline is not guaranteed.

## Storage and calculations

Transactions are the source of truth. Positions use weighted average cost. Same-origin Web Locks serialize saves across tabs, and storage events refresh other tabs. Storage failures are visible and are never reported as successful saves. Use a current browser on HTTPS or localhost.

The financial model has no FX conversion or cash ledger. Portfolios default to USD. Existing development-tool dependency audit warnings remain separate from this storage change.

## Project folders

- `src/storage/`: versioned browser persistence and validated backup import/export.
- `src/math/`: positions, P&L and risk calculations.
- `src/components/`, `src/pages/`: interface.
- `api/`, `server/`: optional market data only.
- `tests/`: persistence and calculation tests.
- `supabase/`: legacy SQL; not used by the app.

Deployment: [Russian instructions](docs/DEPLOYMENT_RU.md).
