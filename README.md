<div align="center">

<img src="https://tryrelai.xyz/assets/logo-mark.png" alt="Relai" width="84" />

# Relai

**The rate desk for AI inference.**
Lock today's per-token price in USDC, then route any model through one OpenAI-compatible gateway — settled on Solana.

[![Website](https://img.shields.io/badge/site-tryrelai.xyz-0A0A0A?style=flat-square)](https://tryrelai.xyz)
[![Docs](https://img.shields.io/badge/docs-read-0A0A0A?style=flat-square)](https://docs.tryrelai.xyz)
[![Trade](https://img.shields.io/badge/futures-terminal-11A66B?style=flat-square)](https://trade.tryrelai.xyz)
[![X](https://img.shields.io/badge/X-@tryrelai-0A0A0A?style=flat-square&logo=x)](https://x.com/tryrelai)
[![License](https://img.shields.io/badge/license-MIT-555?style=flat-square)](LICENSE)

![Node](https://img.shields.io/badge/Node-22.x-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Solana](https://img.shields.io/badge/Solana-USDC-9945FF?style=flat-square&logo=solana&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?style=flat-square&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-frontend-000?style=flat-square&logo=vercel&logoColor=white)
![Railway](https://img.shields.io/badge/Railway-gateway-0B0D0E?style=flat-square&logo=railway&logoColor=white)

</div>

---

## ⚡ What is Relai?

Spot inference prices move against you. Relai lets you **prepay compute at a fixed rate** and spend it whenever you want.

- 🔒 **Lock the rate** — buy a prepaid balance at a fixed `$/M-token` price.
- 💵 **Pay in USDC** — top-ups settle on-chain to the treasury and credit your balance.
- 🔁 **Route anything** — one OpenAI-compatible endpoint fronts seven model families.
- 🪪 **Own your access** — auth is a wallet signature. No card, no KYC, no key that vanishes.
- 🤖 **Built for agents** — programmatic keys, metered per token, drop-in for any OpenAI SDK.

> Relai is prepaid, locked-rate access to LLM inference, paid in USDC and metered per token. It is infrastructure, not a financial product.

## 🧭 Architecture

```
Wallet ──▶ Futures UI ──▶ Gateway ──▶ OpenRouter ──▶ Models
(Solana)    (Vercel)      (Railway)                 (DeepSeek · Llama · …)
                │
                ▼
          Supabase ledger  ◀──  USDC top-ups (Solana)
```

| Layer        | Stack                                   |
| ------------ | --------------------------------------- |
| Marketing    | Static site on **Vercel** — `tryrelai.xyz` |
| Futures terminal | TradingView Lightweight Charts — `trade.tryrelai.xyz` |
| Gateway      | Node 22 / Express on **Railway** — `api.tryrelai.xyz` |
| Database     | **Supabase** (Postgres) ledger + balances |
| Settlement   | **USDC on Solana** to the treasury wallet |
| Routing      | **OpenRouter** upstream                 |

## 🚀 Quickstart

Swap the base URL into any OpenAI-compatible client:

```bash
curl https://api.tryrelai.xyz/api/v1/gateway/v1/chat/completions \
  -H "Authorization: Bearer relai_sk_..." \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek/deepseek-chat","messages":[{"role":"user","content":"hello"}]}'
```

```python
from openai import OpenAI
client = OpenAI(base_url="https://api.tryrelai.xyz/api/v1/gateway/v1", api_key="relai_sk_...")
r = client.chat.completions.create(
    model="deepseek/deepseek-chat",
    messages=[{"role": "user", "content": "hello"}],
)
print(r.choices[0].message.content)
```

Full reference at **[docs.tryrelai.xyz](https://docs.tryrelai.xyz)**.

## 📦 Repositories

| Repo            | What it is                                              |
| --------------- | ------------------------------------------------------- |
| `relai-gateway` | OpenAI-compatible metered gateway (Express + Supabase)  |
| `relai-site`    | Marketing site, futures terminal, account dashboard     |
| `relai-docs`    | Documentation                                           |
| `relai-token`   | `$RELAI` SPL tooling — mint, holder tiers, buyback-burn  |

## 🗺️ Roadmap

- [x] OpenAI-compatible gateway, metered per token
- [x] Wallet-signature auth + prepaid USDC balances
- [x] Seven routable model families
- [x] Futures terminal (chart, order book, positions)
- [x] `$RELAI` holder tiers — discounted rates by holdings
- [ ] `$RELAI` token launch
- [ ] On-chain settlement of futures positions
- [ ] More lockable models as tiers expand

## 🔗 Links

- **Site** — https://tryrelai.xyz
- **Futures** — https://trade.tryrelai.xyz
- **Docs** — https://docs.tryrelai.xyz
- **X** — https://x.com/tryrelai

## 📄 License

MIT © Relai
