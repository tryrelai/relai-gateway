# Relai Gateway

Locked-rate inference relay on Solana. OpenAI-compatible gateway with prepaid compute credits.
Express + Supabase + Solana wallet-auth, proxying to OpenRouter with per-token metering.

## What it does

1. **Wallet auth** — `nonce → sign (Phantom) → JWT`. No passwords.
2. **API keys** — `relai_sk_...`, sha256-hashed at rest, tied to a wallet.
3. **Gateway** — OpenAI-compatible `/v1/chat/completions`. Point any OpenAI SDK at it.
4. **Metering** — every request deducts `tokens × locked_rate` from a prepaid USDC-denominated balance. Balance ≤ 0 → `402`.

## Routes

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | — | liveness |
| GET | `/api/v1/config` | — | mint, treasury, model catalogue |
| GET | `/api/v1/auth/nonce/:wallet` | — | sign-in message |
| POST | `/api/v1/auth/login` | — | `{wallet, signature}` → JWT |
| GET | `/api/v1/dashboard/` | JWT | balance, keys, usage |
| POST | `/api/v1/dashboard/api-keys` | JWT | `{label}` → plaintext key (once) |
| POST | `/api/v1/dashboard/api-keys/:id/revoke` | JWT | |
| POST | `/api/v1/topup/intent` | JWT | `{model_id, tokens_m}` → payment instructions |
| POST | `/api/v1/topup/verify` | JWT | `{intent_id}` → checks chain, credits once |
| GET | `/api/v1/stats` | — | Public aggregate stats (treasury, totals, models, tiers) |
| GET | `/api/v1/gateway/v1/models` | API key | catalogue |
| POST | `/api/v1/gateway/v1/chat/completions` | API key | metered, stream + non-stream |

## Top-ups (USDC → balance)

1. Frontend calls `POST /topup/intent` with model + token amount. Backend computes USDC owed (`tokens_M × locked_rate`), stores a pending `topup_intents` row, and returns the treasury address + a Solana Pay URL.
2. User sends USDC from their connected wallet to the treasury.
3. Frontend polls `POST /topup/verify`. Backend scans recent USDC transfers into the treasury's USDC ATA from that wallet, validates amount, credits via `credit_balance()`, and records the tx in `topups` (unique `tx_sig` blocks double-credit).

USDC has 6 decimals, so its base units equal micro-USD — the transferred amount is the credited balance 1:1. Requires `RPC_URL`, `TREASURY_WALLET`, and `USDC_MINT` set. Run `sql/02_topup.sql` after `schema.sql`.

## Setup

1. Create a Supabase project. Run `sql/schema.sql` then `sql/02_topup.sql`.
2. Get an OpenRouter API key. Fund/identify a treasury wallet for USDC.
3. `cp .env.example .env` and fill values. Generate a JWT secret: `openssl rand -hex 48`.
4. `npm install && npm start`

## Not built yet (next slices)

- **Solana Pay reference matching** — verify/sweeper match by sender wallet (robust for manual sends); reference-key matching can be added for stricter order binding.
- **Stats at scale** — `/stats` sums rows in JS; swap to a SQL aggregate or cached counter as volume grows.
- **Token / staking / treasury** — $RELAI mint, Streamflow staking, buyback-burn.

## Background sweeper

A loop auto-settles pending top-ups so a payment credits even if the user closes the tab. It scans pending `topup_intents`, matches on-chain payments, credits via `settleIntent`, and expires intents older than 24h. Controlled by `SWEEPER` (`on`/`off`), `SWEEPER_INTERVAL_MS`, `SWEEPER_BATCH`. Requires `RPC_URL` + `TREASURY_WALLET`.

## Deploy (Railway)

```
git init && git add . && git commit -m "relai gateway"
git push        # → Railway auto-rebuilds
```

Railway env vars to set: `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`OPENROUTER_API_KEY`, `CORS_ORIGINS`, `RPC_URL`, `TREASURY_WALLET`, `TOKEN_MINT` (when live).

## Test the gateway

```bash
curl https://YOUR_API/api/v1/gateway/v1/chat/completions \
  -H "Authorization: Bearer relai_sk_..." \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek/deepseek-chat","messages":[{"role":"user","content":"hi"}]}'
```

## Honesty notes

- Top-ups settle on-chain in USDC; usage metering and balances live in Postgres. Describe it as "USDC top-ups, metered off-chain" — accurate, not "fully on-chain settlement".
- These are prepaid locked-rate credits, not financial derivatives. Avoid "futures/derivatives" framing in public copy unless real contracts exist.
- If $RELAI claims buyback-burn, the burn must actually execute on-chain and be verifiable.

## Holder tiers (live)

If `TOKEN_MINT` is set, the gateway reads each caller's on-chain $RELAI balance and discounts the locked rate (Base 0% / Bronze 5% / Silver 10% / Gold 20%). Responses carry `X-Relai-Tier` and `X-Relai-Discount` headers; the dashboard shows the holder's tier. Thresholds live in `src/lib/tiers.js`. Balances are cached 5 min. Fully verifiable — the discount derives from real holdings.
