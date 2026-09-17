-- Reconstructed from the applied production migration history and the
-- checked-in signup-trigger fix. Production already records this version.

create or replace function public.create_default_portfolio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.portfolios (user_id, name, base_currency)
  values (new.id, 'My Portfolio', 'USD');
  return new;
end;
$function$;
