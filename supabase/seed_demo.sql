-- Run once in the selected test database after applying the schema/migration.
-- Creates a separate empty USD portfolio. Keep the returned invite_code private.
WITH portfolio AS (
  INSERT INTO public.portfolios (name, base_currency)
  VALUES ('AssetMind deployment test', 'USD')
  RETURNING id
)
INSERT INTO public.invite_codes (code, portfolio_id, active)
SELECT 'am_' || replace(gen_random_uuid()::text, '-', '') ||
       replace(gen_random_uuid()::text, '-', ''), id, true
FROM portfolio
RETURNING portfolio_id, code AS invite_code;
