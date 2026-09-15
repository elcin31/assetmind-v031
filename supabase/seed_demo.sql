-- Run once to create an empty shared portfolio. Use the returned ID as DEFAULT_PORTFOLIO_ID.
INSERT INTO public.portfolios (name, base_currency)
VALUES ('AssetMind', 'USD')
RETURNING id AS default_portfolio_id;
