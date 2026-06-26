-- Real inference-price history. One row per model per snapshot (hourly).
-- Drives /api/v1/prices/history (real OHLC) on the futures terminal.
create table if not exists price_snapshots (
  id          bigint generated always as identity primary key,
  model_id    text        not null,
  model_key   text        not null,
  ts          timestamptz not null default now(),
  spot        numeric     not null,      -- blended $/1M tokens
  price_in    numeric,                   -- prompt $/1M tokens
  price_out   numeric,                   -- completion $/1M tokens
  created_at  timestamptz not null default now()
);

create index if not exists price_snapshots_model_ts
  on price_snapshots (model_id, ts);

-- service role bypasses RLS; this table is read via the service key only.
alter table price_snapshots enable row level security;
