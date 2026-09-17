-- Reconstructed from the applied production migration history and verified
-- against the live AssetMind 31 schema. This file restores Git/local history;
-- production already records version 20260909113417 as applied.

create unique index if not exists uq_portfolios_user_id
  on public.portfolios(user_id);
