-- Apply this to an existing AssetMind database before deploying the hardened API.
-- Review production data and take a verified backup before applying this migration.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portfolios TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invite_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transactions TO service_role;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

UPDATE public.transactions
SET client_request_id = uuid_generate_v4()
WHERE client_request_id IS NULL;

ALTER TABLE public.transactions
  ALTER COLUMN client_request_id SET DEFAULT uuid_generate_v4(),
  ALTER COLUMN client_request_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_portfolio_client_request
  ON public.transactions(portfolio_id, client_request_id);

CREATE INDEX IF NOT EXISTS idx_transactions_portfolio_symbol_time
  ON public.transactions(portfolio_id, symbol, timestamp, created_at, id);

DROP FUNCTION IF EXISTS public.add_portfolio_transaction(
  TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION public.add_portfolio_transaction(
  p_code TEXT,
  p_client_request_id UUID,
  p_symbol TEXT,
  p_type TEXT,
  p_quantity NUMERIC,
  p_price NUMERIC,
  p_currency TEXT,
  p_timestamp TIMESTAMPTZ
)
RETURNS SETOF public.transactions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_portfolio_id UUID;
  v_base_currency TEXT;
  v_inserted public.transactions;
  v_existing public.transactions;
  v_min_running_quantity NUMERIC;
  v_symbol TEXT := UPPER(TRIM(p_symbol));
  v_type TEXT := UPPER(TRIM(p_type));
  v_currency TEXT := UPPER(TRIM(p_currency));
BEGIN
  IF p_code IS NULL OR LENGTH(TRIM(p_code)) < 8 OR LENGTH(TRIM(p_code)) > 128 THEN
    RAISE EXCEPTION 'INVALID_INVITE_CODE' USING ERRCODE = 'P0001';
  END IF;

  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING ERRCODE = 'P0001';
  END IF;

  IF v_symbol !~ '^[A-Z0-9.-]{1,20}$' THEN
    RAISE EXCEPTION 'INVALID_SYMBOL' USING ERRCODE = 'P0001';
  END IF;

  IF v_type NOT IN ('BUY', 'SELL') THEN
    RAISE EXCEPTION 'INVALID_TRANSACTION_TYPE' USING ERRCODE = 'P0001';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 OR p_price IS NULL OR p_price <= 0 THEN
    RAISE EXCEPTION 'INVALID_TRANSACTION_NUMBERS' USING ERRCODE = 'P0001';
  END IF;

  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'INVALID_CURRENCY' USING ERRCODE = 'P0001';
  END IF;

  SELECT i.portfolio_id, UPPER(p.base_currency)
    INTO v_portfolio_id, v_base_currency
  FROM public.invite_codes AS i
  JOIN public.portfolios AS p ON p.id = i.portfolio_id
  WHERE i.code = TRIM(p_code)
    AND i.active = true
  LIMIT 1;

  IF v_portfolio_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INVITE_CODE' USING ERRCODE = 'P0001';
  END IF;

  IF v_currency <> v_base_currency THEN
    RAISE EXCEPTION 'CURRENCY_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_portfolio_id::TEXT || ':request:' || p_client_request_id::TEXT, 0)
  );

  SELECT *
    INTO v_existing
  FROM public.transactions
  WHERE portfolio_id = v_portfolio_id
    AND client_request_id = p_client_request_id
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.symbol <> v_symbol
      OR v_existing.type <> v_type
      OR v_existing.quantity <> p_quantity
      OR v_existing.price <> p_price
      OR v_existing.currency <> v_currency
      OR v_existing.timestamp <> p_timestamp THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEXT v_existing;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_portfolio_id::TEXT || ':symbol:' || v_symbol, 0)
  );

  INSERT INTO public.transactions (
    portfolio_id,
    client_request_id,
    symbol,
    type,
    quantity,
    price,
    currency,
    timestamp
  ) VALUES (
    v_portfolio_id,
    p_client_request_id,
    v_symbol,
    v_type,
    p_quantity,
    p_price,
    v_currency,
    p_timestamp
  )
  RETURNING * INTO v_inserted;

  SELECT MIN(running_quantity)
    INTO v_min_running_quantity
  FROM (
    SELECT SUM(
      CASE WHEN type = 'BUY' THEN quantity ELSE -quantity END
    ) OVER (
      ORDER BY timestamp, created_at, id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_quantity
    FROM public.transactions
    WHERE portfolio_id = v_portfolio_id
      AND symbol = v_symbol
  ) AS history;

  IF v_min_running_quantity < 0 THEN
    RAISE EXCEPTION 'SELL_QUANTITY_EXCEEDS_AVAILABLE_POSITION' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEXT v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_portfolio_transaction(
  TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_portfolio_transaction(
  TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TIMESTAMPTZ
) TO service_role;
