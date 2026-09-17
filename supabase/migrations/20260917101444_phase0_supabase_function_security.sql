-- Phase 0 Supabase security hardening.
-- Applied to production project AssetMind 31 (qxajgfbacdoxwnssmjth).
-- Trigger functions remain callable by their triggers; direct Data API/RPC execution is revoked.

alter function public.handle_new_user() set search_path = '';
revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter function public.set_updated_at() set search_path = '';
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- Prevent new functions created by postgres in public from becoming client-executable by default.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
