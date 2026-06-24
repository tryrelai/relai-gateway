import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../supabase.js';
import { config } from '../config.js';
import { requireJwt } from '../middleware/auth.js';
import { getModel } from '../lib/pricing.js';
import { chainReady } from '../lib/chain.js';
import { settleIntent } from '../lib/settle.js';

const router = Router();
router.use(requireJwt);

const PRESETS_M = [1, 5, 10, 25, 50, 100];

// POST /api/v1/topup/intent  { model_id, tokens_m }
// Creates a pending order and returns payment instructions.
router.post('/intent', async (req, res) => {
  if (!chainReady()) return res.status(503).json({ error: 'topups_not_configured' });

  const modelId = (req.body?.model_id || '').toString();
  const tokensM = Number(req.body?.tokens_m);
  const model = getModel(modelId);
  if (!model) return res.status(400).json({ error: 'unknown_model' });
  if (!Number.isFinite(tokensM) || tokensM <= 0 || tokensM > 100000) {
    return res.status(400).json({ error: 'bad_amount' });
  }

  // USDC owed = tokens(M) × locked rate. USDC base units (6dp) == micro-USD credit.
  const usdc = +(tokensM * model.rate).toFixed(6);
  const micros = Math.round(usdc * 1e6);
  const reference = crypto.randomBytes(16).toString('hex');

  const { data, error } = await db
    .from('topup_intents')
    .insert({
      wallet: req.wallet,
      reference,
      model_id: modelId,
      tokens_m: tokensM,
      usdc_amount: usdc,
      micros,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) return res.status(500).json({ error: 'intent_create_failed' });

  const url =
    `solana:${config.treasuryWallet}` +
    `?amount=${usdc}&spl-token=${config.usdcMint}` +
    `&reference=${reference}&label=Relai&message=${encodeURIComponent('Relai compute credits')}`;

  res.json({
    intent_id: data.id,
    treasury: config.treasuryWallet,
    usdc_mint: config.usdcMint,
    usdc_amount: usdc,
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
