-- AssetMind v2 Database Schema
-- Execute this in the Supabase SQL editor for a fresh project.
-- Server-only access model: the browser never talks to Supabase directly.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.portfolios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (base_currency ~ '^[A-Z]{3}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invite_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_portfolio_id
  ON public.invite_codes(portfolio_id);

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  client_request_id UUID NOT NULL DEFAULT uuid_generate_v4(),
  symbol TEXT NOT NULL
    CHECK (symbol = UPPER(symbol) AND symbol ~ '^[A-Z0-9.-]{1,20}$'),
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  quantity NUMERIC(20, 8) NOT NULL CHECK (quantity > 0),
  price NUMERIC(20, 8) NOT NULL CHECK (price > 0),
  currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (currency ~ '^[A-Z]{3}$'),
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portfolio_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_portfolio_id
  ON public.transactions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_transactions_symbol
  ON public.transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp
  ON public.transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_portfolio_symbol_time
  ON public.transactions(portfolio_id, symbol, timestamp, created_at, id);

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portfolios TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invite_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transactions TO service_role;

-- Remove an older 7-argument version if this schema is re-applied.
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

  -- Serialize retries that use the same idempotency key, even if their payloads differ.
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

  -- Serialize writes for a symbol so concurrent SELLs cannot validate the same balance.
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

-- Optional seed:
-- INSERT INTO public.portfolios (id, name, base_currency)
-- VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Portfolio', 'USD');
--
-- INSERT INTO public.invite_codes (code, portfolio_id, active)
-- VALUES ('am_demo_test_code_replace_me', '00000000-0000-0000-0000-000000000001', true);
