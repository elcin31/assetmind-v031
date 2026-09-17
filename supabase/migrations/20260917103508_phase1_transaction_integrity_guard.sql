-- Phase 1 transaction integrity guard.
-- Applied to production Supabase project first and retained here with the exact
-- remote migration version so database history remains reproducible.

create unique index if not exists portfolios_id_user_uidx
  on public.portfolios(id, user_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_portfolio_owner_fkey'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_portfolio_owner_fkey
      foreign key (portfolio_id, user_id)
      references public.portfolios(id, user_id)
      on delete cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_trade_payload_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_trade_payload_check
      check (
        type not in ('BUY', 'SELL')
        or (
          symbol is not null
          and symbol = upper(btrim(symbol))
          and symbol ~ '^[A-Z0-9.-]{1,20}$'
          and quantity is not null and quantity > 0
          and price is not null and price > 0
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_cash_payload_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_cash_payload_check
      check (
        type not in ('DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'FEE')
        or (amount is not null and amount > 0)
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_identity_payload_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_identity_payload_check
      check (
        char_length(btrim(transaction_id)) between 1 and 200
        and currency ~ '^[A-Z]{3}$'
        and date = ((executed_at at time zone 'UTC')::date)
        and (
          client_request_id is null
          or char_length(btrim(client_request_id)) between 1 and 200
        )
      );
  end if;
end
$$;

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
  invalid_symbol text;
begin
  if tg_op = 'INSERT' then
    select coalesce(
      array_agg(distinct portfolio_id order by portfolio_id),
      '{}'::uuid[]
    )
      into affected_portfolios
      from new_rows;
  elsif tg_op = 'DELETE' then
    select coalesce(
      array_agg(distinct portfolio_id order by portfolio_id),
      '{}'::uuid[]
    )
      into affected_portfolios
      from old_rows;
  else
    select coalesce(
      array_agg(portfolio_id order by portfolio_id),
      '{}'::uuid[]
    )
      into affected_portfolios
      from (
        select distinct portfolio_id from new_rows
        union
        select distinct portfolio_id from old_rows
      ) affected;
  end if;

  -- Serialize writes within one portfolio. Because this VOLATILE trigger
  -- function takes a fresh snapshot for each SQL statement, a waiter sees the
  -- previous writer after the advisory lock is released and committed.
  foreach portfolio_to_check in array affected_portfolios loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(portfolio_to_check::text, 0)
    );
  end loop;

  foreach portfolio_to_check in array affected_portfolios loop
    select symbol
      into invalid_symbol
      from (
        select symbol, min(running_quantity) as minimum_quantity
        from (
          select
            upper(btrim(symbol)) as symbol,
            sum(case when type = 'BUY' then quantity else -quantity end)
              over (
                partition by upper(btrim(symbol))
                order by executed_at, recorded_at, id
                rows between unbounded preceding and current row
              ) as running_quantity
          from public.transactions
          where portfolio_id = portfolio_to_check
            and type in ('BUY', 'SELL')
        ) ordered_history
        group by symbol
      ) inventory
      where minimum_quantity < -0.0000000001
      order by symbol
      limit 1;

    if invalid_symbol is not null then
      raise exception using
        errcode = '23514',
        message = format(
          'SELL quantity exceeds available %s position at the requested execution time.',
          invalid_symbol
        ),
        constraint = 'transactions_no_oversell_history';
    end if;
  end loop;

  return null;
end
$$;

drop trigger if exists transactions_history_integrity_insert on public.transactions;
create trigger transactions_history_integrity_insert
after insert on public.transactions
referencing new table as new_rows
for each statement
execute function public.enforce_transaction_history_integrity();

drop trigger if exists transactions_history_integrity_update on public.transactions;
create trigger transactions_history_integrity_update
after update on public.transactions
referencing old table as old_rows new table as new_rows
for each statement
execute function public.enforce_transaction_history_integrity();

drop trigger if exists transactions_history_integrity_delete on public.transactions;
create trigger transactions_history_integrity_delete
after delete on public.transactions
referencing old table as old_rows
for each statement
execute function public.enforce_transaction_history_integrity();

revoke execute on function public.enforce_transaction_history_integrity()
  from public, anon, authenticated;
