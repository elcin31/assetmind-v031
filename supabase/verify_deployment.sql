-- Read-only checks. Run after the schema or hardening migration.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('portfolios', 'invite_codes', 'transactions');
-- Expected: all three rows, all rls_enabled = true.

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'transactions'
  AND column_name IN ('client_request_id', 'timestamp');
-- Expected: both columns exist; client_request_id has is_nullable = NO and a UUID default.

SELECT p.oid::regprocedure AS function_signature, p.prosecdef AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS server_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'add_portfolio_transaction';
-- Expected: one eight-argument function; false, false, false, true.

SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('portfolios', 'invite_codes', 'transactions');
-- This server-only MVP expects no browser access policies on these tables.
-- If policies exist, review them before deployment; this script does not change them.

SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'transactions';
-- Expected: a UNIQUE index on (portfolio_id, client_request_id).
