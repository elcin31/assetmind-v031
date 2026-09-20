-- Phase 1 corporate-action foundation: make stock splits first-class ledger rows.
-- A SPLIT row stores an exact numerator/denominator ratio. It changes inventory
-- quantity but never creates cash, realized P&L, or cost basis by itself.

alter table public.transactions
  add column if not exists split_numerator numeric,
  add column if not exists split_denominator numeric;

alter table public.transactions
  drop constraint if exists transactions_split_payload_check;

alter table public.transactions
  add constraint transactions_split_payload_check
  check (
    type <> 'SPLIT'
    or (
      symbol is not null
      and symbol = upper(btrim(symbol))
      and symbol ~ '^[A-Z0-9.-]{1,20}$'
      and split_numerator is not null and split_numerator > 0
      and split_denominator is not null and split_denominator > 0
      and split_numerator <> split_denominator
      and quantity is null
      and price is null
      and amount is null
    )
  );

create or replace function public.enforce_transaction_history_integrity()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  affected_portfolios uuid[];
  portfolio_to_check uuid;
  symbol_to_check text;
  operation record;
  running_quantity numeric;
begin
  if tg_op = 'INSERT' then
    select coalesce(array_agg(distinct portfolio_id order by portfolio_id), '{}'::uuid[])
      into affected_portfolios from new_rows;
  elsif tg_op = 'DELETE' then
    select coalesce(array_agg(distinct portfolio_id order by portfolio_id), '{}'::uuid[])
      into affected_portfolios from old_rows;
  else
    select coalesce(array_agg(portfolio_id order by portfolio_id), '{}'::uuid[])
      into affected_portfolios
      from (
        select distinct portfolio_id from new_rows
        union
        select distinct portfolio_id from old_rows
      ) affected;
  end if;

  foreach portfolio_to_check in array affected_portfolios loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(portfolio_to_check::text, 0)
    );
  end loop;

  foreach portfolio_to_check in array affected_portfolios loop
    for symbol_to_check in
      select distinct upper(btrim(symbol))
      from public.transactions
      where portfolio_id = portfolio_to_check
        and type in ('BUY', 'SELL', 'SPLIT')
        and symbol is not null
      order by 1
    loop
      running_quantity := 0;
      for operation in
        select type, quantity, split_numerator, split_denominator
        from public.transactions
        where portfolio_id = portfolio_to_check
          and upper(btrim(symbol)) = symbol_to_check
          and type in ('BUY', 'SELL', 'SPLIT')
        order by executed_at, recorded_at, id
      loop
        if operation.type = 'BUY' then
          running_quantity := running_quantity + operation.quantity;
        elsif operation.type = 'SELL' then
          running_quantity := running_quantity - operation.quantity;
        else
          running_quantity := running_quantity * operation.split_numerator / operation.split_denominator;
        end if;

        if running_quantity < -0.0000000001 then
          raise exception using
            errcode = '23514',
            message = format(
              'SELL quantity exceeds available %s position at the requested execution time.',
              symbol_to_check
            ),
            constraint = 'transactions_no_oversell_history';
        end if;
      end loop;
    end loop;
  end loop;

  return null;
end
$$;

revoke execute on function public.enforce_transaction_history_integrity()
  from public, anon, authenticated;
