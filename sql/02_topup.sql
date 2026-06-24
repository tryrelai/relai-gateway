-- Relai migration 02 — top-up intents. Run after schema.sql.

create table if not exists topup_intents (
  id          uuid primary key default gen_random_uuid(),
  wallet      text not null,
  reference   text not null,
  model_id    text not null,
  tokens_m    numeric not null,
  usdc_amount numeric not null,
  micros      bigint not null,
  status      text not null default 'pending',  -- pending | paid
  tx_sig      text,
  created_at  timestamptz not null default now()
);
create index if not exists topup_intents_wallet_idx on topup_intents(wallet, created_at desc);
create index if not exists topup_intents_status_idx on topup_intents(status);
