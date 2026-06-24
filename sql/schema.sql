-- Relai gateway schema. Run in Supabase SQL editor.
-- All access is via the service-role key from the backend, so RLS stays off.

create table if not exists users (
  wallet      text primary key,
  created_at  timestamptz not null default now()
);

create table if not exists auth_nonces (
  wallet      text primary key,
  nonce       text not null,
  created_at  timestamptz not null default now()
);

create table if not exists balances (
  wallet         text primary key references users(wallet) on delete cascade,
  balance_micros bigint not null default 0,  -- micro-USD (1e-6 USD)
  updated_at     timestamptz not null default now()
);

create table if not exists api_keys (
  id           uuid primary key default gen_random_uuid(),
  wallet       text not null references users(wallet) on delete cascade,
  label        text not null default 'default',
  key_hash     text not null unique,          -- sha256 of plaintext
  last4        text not null,
  revoked      boolean not null default false,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists api_keys_wallet_idx on api_keys(wallet);

create table if not exists usage_logs (
  id           bigint generated always as identity primary key,
  wallet       text not null,
  api_key_id   uuid,
  model        text not null,
  total_tokens integer not null default 0,
  cost_micros  bigint not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists usage_logs_wallet_idx on usage_logs(wallet, created_at desc);

-- Credit top-ups (filled when a USDC payment to treasury is verified).
create table if not exists topups (
  id           bigint generated always as identity primary key,
  wallet       text not null,
  tx_sig       text not null unique,
  usdc_amount  numeric not null,
  micros_added bigint not null,
  created_at   timestamptz not null default now()
);

-- Atomic balance deduction. Returns the new balance.
create or replace function deduct_balance(p_wallet text, p_micros bigint)
returns bigint
language plpgsql
as $$
declare
  new_bal bigint;
begin
  update balances
     set balance_micros = balance_micros - p_micros,
         updated_at = now()
   where wallet = p_wallet
  returning balance_micros into new_bal;
  return new_bal;
end;
$$;

-- Atomic credit (used by the top-up verifier).
create or replace function credit_balance(p_wallet text, p_micros bigint)
returns bigint
language plpgsql
as $$
declare
  new_bal bigint;
begin
  insert into balances (wallet, balance_micros) values (p_wallet, p_micros)
  on conflict (wallet) do update
    set balance_micros = balances.balance_micros + p_micros,
        updated_at = now()
  returning balance_micros into new_bal;
  return new_bal;
end;
$$;
