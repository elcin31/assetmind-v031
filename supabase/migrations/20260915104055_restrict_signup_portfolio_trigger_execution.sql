-- Reconstructed from the applied production migration history and the
-- checked-in signup-trigger fix. Production already records this version.

revoke execute on function public.create_default_portfolio()
  from public, anon, authenticated;
