import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../supabase.js';
import { config } from '../config.js';
import { requireJwt } from '../middleware/auth.js';
import { getModel } from '../lib/pricing.js';
import { chainReady } from '../lib/chain.js';
import { settleIntent } from '../lib/settle.js';
import { assetUsd, payAssetMeta, SOL_MINT } from '../lib/assets.js';

const router = Router();
router.use(requireJwt);

const PRESETS_M = [1, 5, 10, 25, 50, 100];
const ASSETS = ['usdc', 'sol', 'relai'];

// POST /api/v1/topup/intent  { model_id, tokens_m, pay_with }
// Creates a pending order priced in the chosen asset and returns pay instructions.
router.post('/intent', async (req, res) => {
  if (!chainReady()) return res.status(503).json({ error: 'topups_not_configured' });

  const modelId = (req.body?.model_id || '').toString();
  const tokensM = Number(req.body?.tokens_m);
  const payWith = ASSETS.includes((req.body?.pay_with || 'usdc').toString()) ? req.body.pay_with.toString() : 'usdc';
  const model = getModel(modelId);
  if (!model) return res.status(400).json({ error: 'unknown_model' });
  if (!Number.isFinite(tokensM) || tokensM <= 0 || tokensM > 100000) {
    return res.status(400).json({ error: 'bad_amount' });
  }

  // USD owed = tokens(M) × locked rate. Credit target is always this USD value (micros).
  const usd = +(tokensM * model.rate).toFixed(6);
  const micros = Math.round(usd * 1e6);
  const reference = crypto.randomBytes(16).toString('hex');

  // resolve the asset to pay in + quote the amount at the live price
  const meta = payAssetMeta(payWith);
  if (payWith === 'relai' && !config.tokenMint) return res.status(503).json({ error: 'token_not_live' });
  const priceMint = payWith === 'sol' ? SOL_MINT : meta.mint;
  let unitUsd = 1;
  if (payWith !== 'usdc') {
    unitUsd = await assetUsd(priceMint);
    if (unitUsd == null || unitUsd <= 0) return res.status(503).json({ error: 'price_unavailable' });
  }
  const payAmount = +(usd / unitUsd).toFixed(meta.decimals === 9 ? 6 : Math.min(meta.decimals, 6));

  const { data, error } = await db
    .from('topup_intents')
    .insert({
      wallet: req.wallet,
      reference,
      model_id: modelId,
      tokens_m: tokensM,
      usdc_amount: usd,
      micros,
      status: 'pending',
      pay_asset: payWith,
      pay_amount: payAmount,
    })
    .select('id')
    .single();
  if (error) return res.status(500).json({ error: 'intent_create_failed', detail: error.message });

  // Solana Pay URL — native SOL omits spl-token; USDC/$RELAI include their mint.
  let url = `solana:${config.treasuryWallet}?amount=${payAmount}`;
  if (payWith !== 'sol') url += `&spl-token=${meta.mint}`;
  url += `&reference=${reference}&label=Relai&message=${encodeURIComponent('Relai compute credits')}`;

  res.json({
    intent_id: data.id,
    treasury: config.treasuryWallet,
    pay_asset: payWith,
    pay_label: meta.label,
    pay_amount: payAmount,
    pay_mint: payWith === 'sol' ? null : meta.mint,
    usd_value: usd,
    unit_usd: unitUsd,
    usdc_mint: config.usdcMint,
    solana_pay_url: url,
  });
});

// POST /api/v1/topup/verify  { intent_id }
// Checks the chain for a matching payment from the user's wallet and credits once.
router.post('/verify', async (req, res) => {
  if (!chainReady()) return res.status(503).json({ error: 'topups_not_configured' });

  const intentId = (req.body?.intent_id || '').toString();
  const { data: intent } = await db
    .from('topup_intents')
    .select('*')
    .eq('id', intentId)
    .eq('wallet', req.wallet)
    .maybeSingle();
  if (!intent) return res.status(404).json({ error: 'intent_not_found' });

  const r = await settleIntent(intent);
  if (r.error === 'rpc_error') return res.status(502).json({ error: 'rpc_error', status: 'pending' });
  return res.json({ status: r.status, credited_micros: r.creditedMicros ?? null, balance_micros: r.balanceMicros ?? null });
});

// GET /api/v1/topup/presets  -> amount presets for the UI
router.get('/presets', (_req, res) => res.json({ presets_m: PRESETS_M }));

export default router;
