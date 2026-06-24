import { Router } from 'express';
import { db } from '../supabase.js';
import { config } from '../config.js';
import { listCatalogue } from '../lib/pricing.js';
import { chainReady } from '../lib/chain.js';
import { publicTiers } from '../lib/tiers.js';

const router = Router();

// GET /api/v1/stats — public, aggregate only (no per-wallet data)
router.get('/', async (_req, res) => {
  const [topups, usage] = await Promise.all([
    db.from('topups').select('micros_added'),
    db.from('usage_logs').select('total_tokens, cost_micros'),
  ]);

  const creditedMicros = (topups.data || []).reduce((a, r) => a + Number(r.micros_added || 0), 0);
  const tokens = (usage.data || []).reduce((a, r) => a + Number(r.total_tokens || 0), 0);
  const requests = (usage.data || []).length;

  res.json({
    status: 'operational',
    topups_enabled: chainReady(),
    treasury: config.treasuryWallet || null,
    usdc_mint: config.usdcMint,
    token_mint: config.tokenMint || null,
    models: listCatalogue(),
    tiers: publicTiers(),
    totals: {
      credited_usd: +(creditedMicros / 1e6).toFixed(2),
      tokens_served: tokens,
      requests,
    },
  });
});

export default router;
