-- Fix for existing databases with trg_create_default_portfolio.
-- Supabase Auth uses search_path=auth; an unqualified portfolios reference
-- aborts user creation with 42P01 (relation portfolios does not exist).
-- Applied to the assetmind31 project and verified with a rolled-back user insert.
-- Existing SECURITY DEFINER semantics are required for the internal auth trigger.
BEGIN;
CREATE OR REPLACE FUNCTION public.create_default_portfolio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.portfolios (user_id, name, base_currency)
  VALUES (NEW.id, 'My Portfolio', 'USD');
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_default_portfolio() FROM PUBLIC, anon, authenticated;
COMMIT;
