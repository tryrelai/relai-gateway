
<p align="center">
  <img src="assets/banner.png" alt="Relai Gateway" width="100%" />
</p>

<h1 align="center">Relai Gateway</h1>

<p align="center">
  <b>The rate desk for AI inference.</b><br/>
  Lock today's price per million tokens for any model, route through one OpenAI-compatible endpoint, and settle in USDC on Solana.<br/>
  Your rate is fixed; the volatile spot price stops being your problem.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Solana-mainnet-0A0A0A?style=flat-square&logo=solana" />
  <img src="https://img.shields.io/badge/settlement-USDC-0A0A0A?style=flat-square" />
  <img src="https://img.shields.io/badge/API-OpenAI--compatible-0A0A0A?style=flat-square&logo=openai" />
  <img src="https://img.shields.io/badge/runtime-Node.js-0A0A0A?style=flat-square&logo=node.js" />
  <img src="https://img.shields.io/badge/deploy-Railway-0A0A0A?style=flat-square&logo=railway" />
  <img src="https://img.shields.io/badge/license-proprietary-0A0A0A?style=flat-square" />
</p>

---

This is the backend: an OpenAI-compatible inference relay with prepaid, locked-rate compute credits — Express + Supabase + Solana wallet auth, proxying to OpenRouter with per-token metering.

```
Wallet  ──sign──►  JWT  ──►  prepaid balance (USDC-denominated, micro-USD)
                                   │
   API key ──►  /v1/chat/completions  ──meter──►  tokens × locked_rate  ──►  OpenRouter
```

---

## Why it exists

Inference is priced like a volatile commodity, and your provider can reprice or revoke access whenever it wants. Relai turns that into a market you control:

- **Lock the rate.** Pay once for compute at a fixed `$/M tokens`, below the live spot.
- **Route anything.** One endpoint, one key, one balance across seven model families.
- **Own the curve.** Every lock is a point on a forward curve — the first term structure for AI compute.

## What's inside

- **Locked-rate gateway** — OpenAI-compatible `/v1/chat/completions`, streaming and non-streaming, metered per token.
- **Wallet auth** — `nonce → sign (Phantom) → JWT`. No passwords, no email.
- **API keys** — `relai_sk_…`, SHA-256-hashed at rest, scoped to a wallet.
- **Multi-asset top-ups** — pay in **USDC, SOL, or $RELAI**, debited straight from the connected wallet. Credit is the real USD value received; SOL/$RELAI valued live via Jupiter.
- **Live spot feed** — real per-model inference prices pulled from OpenRouter, with a self-healing slug resolver and hourly snapshots for real OHLC history.
- **Rate curve** — per-model term structure (`/api/v1/curve`): offered locked rates across 1M / 3M / 6M tenors, anchored to live spot, enriched with real observed locks.
- **Holder tiers** — if `TOKEN_MINT` is set, the caller's on-chain $RELAI balance discounts their rate (Base / Bronze / Silver / Gold). Verifiable from real holdings.
- **Background sweeper** — auto-settles pending top-ups so a payment credits even if the tab is closed.

## Routes

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | — | liveness |
| GET | `/api/v1/config` | — | mints, treasury, model catalogue |
| GET | `/api/v1/prices` | — | live OpenRouter spot per model |
| GET | `/api/v1/prices/history` | — | real OHLC from snapshots (`?model=&bucket=hour\|day`) |
| GET | `/api/v1/curve` | — | per-model rate term structure |
| GET | `/api/v1/stats` | — | public aggregate stats |
| GET | `/api/v1/auth/nonce/:wallet` | — | sign-in message |
| POST | `/api/v1/auth/login` | — | `{wallet, signature}` → JWT |
| GET | `/api/v1/dashboard/` | JWT | balance, keys, usage, tier |
| POST | `/api/v1/dashboard/api-keys` | JWT | `{label}` → plaintext key (shown once) |
| POST | `/api/v1/dashboard/api-keys/:id/revoke` | JWT | revoke a key |
| POST | `/api/v1/topup/intent` | wallet | `{model_id, tokens_m, pay_with, tenor, wallet}` → pay instructions |
| POST | `/api/v1/topup/verify` | — | `{intent_id}` → scans chain, credits once |
| GET | `/api/v1/gateway/v1/models` | API key | catalogue |
| POST | `/api/v1/gateway/v1/chat/completions` | API key | metered inference |

## Payment flow (USDC / SOL / $RELAI → balance)

1. Client calls `POST /topup/intent` with a model, token amount, asset, and lock tenor. The gateway computes USD owed (`tokens_M × locked_rate(tenor)`), quotes the amount in the chosen asset at the live price, stores a pending `topup_intents` row, and returns the treasury address.
2. The connected wallet signs and sends the transfer directly (built client-side; no deep link).
3. Client polls `POST /topup/verify`. The gateway scans recent transfers into the treasury from that wallet, credits the real USD value via `credit_balance()`, and records the tx in `topups`. A unique `tx_sig` makes double-credit impossible.

USDC settles 1:1 (6 decimals = micro-USD). SOL and $RELAI credit the live USD value received, with a small tolerance for price drift between quote and payment.

## Setup

1. Create a Supabase project and run the migrations in order (or paste `sql/ALL_IN_ORDER.sql`):

   ```
   schema.sql → 02_topup.sql → 03_prices.sql → 04_pay_assets.sql → 05_tenor.sql
   ```

2. Get an OpenRouter API key and identify a **dedicated** treasury wallet (not a user wallet) for receiving payments.
3. Copy env and fill values. Generate a JWT secret with `openssl rand -hex 48`.
4. Install and run:

   ```
   npm install
   npm start
   ```

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `JWT_SECRET` | yes | signs auth tokens |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | yes | database (service role) |
| `OPENROUTER_API_KEY` | yes | upstream inference |
| `RPC_URL` | for payments | Solana RPC (use Helius/QuickNode; public mainnet is rate-limited) |
| `TREASURY_WALLET` | for payments | dedicated wallet receiving top-ups |
| `USDC_MINT` | for payments | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| `TOKEN_MINT` | when live | $RELAI mint — enables $RELAI payments + holder tiers |
| `CORS_ORIGINS` | recommended | comma-separated allowed origins |
| `SWEEPER` / `SWEEPER_INTERVAL_MS` / `SWEEPER_BATCH` | optional | background settlement loop |

## Deploy (Railway)

Commit and push; Railway auto-rebuilds. On Windows PowerShell, run commands on separate lines:

```
git add .
git commit -m "deploy"
git push
```

## Test

```bash
curl https://api.tryrelai.xyz/api/v1/gateway/v1/chat/completions \
  -H "Authorization: Bearer relai_sk_..." \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek/deepseek-chat","messages":[{"role":"user","content":"hi"}]}'
```

## Honesty notes

This README states what the gateway actually does, and the code is held to the same bar:

- Top-ups settle on-chain in USDC/SOL/$RELAI; usage metering and balances live in Postgres. It's "on-chain top-ups, metered off-chain" — not "fully on-chain settlement."
- Locked-rate **credits** are real and live. Directional futures positions in the trading UI are a paper simulation until the on-chain perpetual market ships — don't market them as live derivatives.
- Holder-tier discounts derive from real on-chain $RELAI balances and are verifiable.
- If $RELAI ever claims buyback-burn, the burn must execute on-chain and be verifiable.

## License

Proprietary © 2026 Relai.
