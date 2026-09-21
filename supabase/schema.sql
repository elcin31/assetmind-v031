BEGIN;

-- AssetMind current Supabase bootstrap schema.
-- This snapshot matches the browser-authenticated production data model as of
-- 2026-09-21. Incremental production changes remain canonical in migrations/.
-- For an existing database: apply migrations only. For a fresh project: this
-- file can bootstrap the current schema before normal migration tracking.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro')),
  subscription_status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (subscription_status IN ('inactive', 'active', 'trialing', 'past_due', 'canceled', 'expired')),
  subscription_expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'dark',
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  analytics_preferences JSONB NOT NULL
    DEFAULT '{"rf":0,"mar":0,"period":"1Y","benchmark":"SPY"}'::jsonb,
  portfolio_migrated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Portfolio',
  schema_version INTEGER NOT NULL DEFAULT 3,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  target_allocation JSONB NOT NULL DEFAULT '[]'::jsonb,
  cash_balances JSONB NOT NULL DEFAULT '{}'::jsonb,
  valuation_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_portfolios_user_id UNIQUE (user_id)
);

-- Retained legacy table. Current positions are derived from the transaction
-- ledger and this table is intentionally not exposed to authenticated clients.
CREATE TABLE IF NOT EXISTS public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT,
  asset_type TEXT DEFAULT 'equity',
  quantity NUMERIC NOT NULL DEFAULT 0,
  average_price NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Required before creating the composite ownership FK below.
CREATE UNIQUE INDEX IF NOT EXISTS portfolios_id_user_uidx
  ON public.portfolios(id, user_id);

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL
    CHECK (type IN ('BUY', 'SELL', 'DIVIDEND', 'FEE', 'DEPOSIT', 'WITHDRAWAL', 'SPLIT')),
  symbol TEXT,
  quantity NUMERIC,
  price NUMERIC,
  fees NUMERIC,
  amount NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_request_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  split_numerator NUMERIC,
  split_denominator NUMERIC,
  CONSTRAINT uq_portfolio_txid UNIQUE (portfolio_id, transaction_id),
  CONSTRAINT transactions_portfolio_owner_fkey
    FOREIGN KEY (portfolio_id, user_id)
    REFERENCES public.portfolios(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT transactions_trade_payload_check CHECK (
    type NOT IN ('BUY', 'SELL')
    OR (
      symbol IS NOT NULL
      AND symbol = UPPER(BTRIM(symbol))
      AND symbol ~ '^[A-Z0-9.-]{1,20}$'
      AND quantity IS NOT NULL AND quantity > 0
      AND price IS NOT NULL AND price > 0
    )
  ),
  CONSTRAINT transactions_cash_payload_check CHECK (
    type NOT IN ('DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'FEE')
    OR (amount IS NOT NULL AND amount > 0)
  ),
  CONSTRAINT transactions_identity_payload_check CHECK (
    CHAR_LENGTH(BTRIM(transaction_id)) BETWEEN 1 AND 200
    AND currency ~ '^[A-Z]{3}$'
    AND date = ((executed_at AT TIME ZONE 'UTC')::date)
    AND (
      client_request_id IS NULL
      OR CHAR_LENGTH(BTRIM(client_request_id)) BETWEEN 1 AND 200
    )
  ),
  CONSTRAINT transactions_split_payload_check CHECK (
    type <> 'SPLIT'
    OR (
      symbol IS NOT NULL
      AND symbol = UPPER(BTRIM(symbol))
      AND symbol ~ '^[A-Z0-9.-]{1,20}$'
      AND split_numerator IS NOT NULL AND split_numerator > 0
      AND split_denominator IS NOT NULL AND split_denominator > 0
      AND split_numerator <> split_denominator
      AND quantity IS NULL
      AND price IS NULL
      AND amount IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_portfolios_user_id
  ON public.portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_portfolio
  ON public.positions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_positions_symbol
  ON public.positions(symbol);
CREATE INDEX IF NOT EXISTS idx_transactions_date
  ON public.transactions(portfolio_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_portfolio_id
  ON public.transactions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id
  ON public.transactions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_portfolio_client_request_uidx
  ON public.transactions(portfolio_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_user_portfolio_executed_idx
  ON public.transactions(user_id, portfolio_id, executed_at, id);
CREATE INDEX IF NOT EXISTS transactions_portfolio_owner_idx
  ON public.transactions(portfolio_id, user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, plan, subscription_status)
  VALUES (NEW.id, NEW.email, 'free', 'inactive')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_settings (user_id, theme, currency)
  VALUES (NEW.id, 'dark', 'USD')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_transaction_history_integrity()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  affected_portfolios UUID[];
  portfolio_to_check UUID;
  symbol_to_check TEXT;
  operation RECORD;
  running_quantity NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(ARRAY_AGG(DISTINCT portfolio_id ORDER BY portfolio_id), '{}'::UUID[])
      INTO affected_portfolios FROM new_rows;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT COALESCE(ARRAY_AGG(DISTINCT portfolio_id ORDER BY portfolio_id), '{}'::UUID[])
      INTO affected_portfolios FROM old_rows;
  ELSE
    SELECT COALESCE(ARRAY_AGG(portfolio_id ORDER BY portfolio_id), '{}'::UUID[])
      INTO affected_portfolios
      FROM (
        SELECT DISTINCT portfolio_id FROM new_rows
        UNION
        SELECT DISTINCT portfolio_id FROM old_rows
      ) affected;
  END IF;

  FOREACH portfolio_to_check IN ARRAY affected_portfolios LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(portfolio_to_check::TEXT, 0)
    );
  END LOOP;

  FOREACH portfolio_to_check IN ARRAY affected_portfolios LOOP
    FOR symbol_to_check IN
      SELECT DISTINCT UPPER(BTRIM(symbol))
      FROM public.transactions
      WHERE portfolio_id = portfolio_to_check
        AND type IN ('BUY', 'SELL', 'SPLIT')
        AND symbol IS NOT NULL
      ORDER BY 1
    LOOP
      running_quantity := 0;
      FOR operation IN
        SELECT type, quantity, split_numerator, split_denominator
        FROM public.transactions
        WHERE portfolio_id = portfolio_to_check
          AND UPPER(BTRIM(symbol)) = symbol_to_check
          AND type IN ('BUY', 'SELL', 'SPLIT')
        ORDER BY executed_at, recorded_at, id
      LOOP
        IF operation.type = 'BUY' THEN
          running_quantity := running_quantity + operation.quantity;
        ELSIF operation.type = 'SELL' THEN
          running_quantity := running_quantity - operation.quantity;
        ELSE
          running_quantity := running_quantity * operation.split_numerator / operation.split_denominator;
        END IF;

        IF running_quantity < -0.0000000001 THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = FORMAT(
              'SELL quantity exceeds available %s position at the requested execution time.',
              symbol_to_check
            ),
            CONSTRAINT = 'transactions_no_oversell_history';
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_portfolios_updated_at ON public.portfolios;
CREATE TRIGGER trg_portfolios_updated_at
BEFORE UPDATE ON public.portfolios
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS transactions_history_integrity_insert ON public.transactions;
CREATE TRIGGER transactions_history_integrity_insert
AFTER INSERT ON public.transactions
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.enforce_transaction_history_integrity();

DROP TRIGGER IF EXISTS transactions_history_integrity_update ON public.transactions;
CREATE TRIGGER transactions_history_integrity_update
AFTER UPDATE ON public.transactions
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.enforce_transaction_history_integrity();

DROP TRIGGER IF EXISTS transactions_history_integrity_delete ON public.transactions;
CREATE TRIGGER transactions_history_integrity_delete
AFTER DELETE ON public.transactions
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.enforce_transaction_history_integrity();

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_transaction_history_integrity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_transaction_history_integrity() TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.profiles,
  public.portfolios,
  public.positions,
  public.transactions,
  public.user_settings
FROM anon;

REVOKE ALL ON TABLE public.positions FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.portfolios,
  public.transactions,
  public.user_settings
TO authenticated;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS portfolios_select_own ON public.portfolios;
CREATE POLICY portfolios_select_own ON public.portfolios
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS portfolios_insert_own ON public.portfolios;
CREATE POLICY portfolios_insert_own ON public.portfolios
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS portfolios_update_own ON public.portfolios;
CREATE POLICY portfolios_update_own ON public.portfolios
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS portfolios_delete_own ON public.portfolios;
CREATE POLICY portfolios_delete_own ON public.portfolios
FOR DELETE TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS transactions_select_own ON public.transactions;
CREATE POLICY transactions_select_own ON public.transactions
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS transactions_insert_own ON public.transactions;
CREATE POLICY transactions_insert_own ON public.transactions
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS transactions_update_own ON public.transactions;
CREATE POLICY transactions_update_own ON public.transactions
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS transactions_delete_own ON public.transactions;
CREATE POLICY transactions_delete_own ON public.transactions
FOR DELETE TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS settings_select_own ON public.user_settings;
CREATE POLICY settings_select_own ON public.user_settings
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS settings_insert_own ON public.user_settings;
CREATE POLICY settings_insert_own ON public.user_settings
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS settings_update_own ON public.user_settings;
CREATE POLICY settings_update_own ON public.user_settings
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS settings_delete_own ON public.user_settings;
CREATE POLICY settings_delete_own ON public.user_settings
FOR DELETE TO authenticated
USING ((SELECT auth.uid()) = user_id);

COMMIT;
