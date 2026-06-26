-- Relai migration 04 — multi-asset top-ups (USDC / SOL / $RELAI).
-- Run after 02_topup.sql.

alter table topup_intents add column if not exists pay_asset  text not null default 'usdc'; -- usdc | sol | relai
alter table topup_intents add column if not exists pay_amount numeric; -- amount owed in the chosen asset (quoted at intent time)
