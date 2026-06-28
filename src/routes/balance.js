import { Router } from 'express';
import { db } from '../supabase.js';
import { isValidWallet } from '../lib/solana.js';
import { tierFor } from '../lib/tiers.js';

const router = Router();

// GET /api/v1/balance/:wallet — public read of a wallet's prepaid balance.
// Used as buying power on the trade terminal (connect-only, no JWT needed).
// On-chain balances are public anyway; this only exposes the user's own credits.
router.get('/:wallet', async (req, res) => {
  const wallet = (req.params.wallet || '').toString();
  if (!isValidWallet(wallet)) return res.status(400).json({ error: 'bad_wallet' });

  const { data } = await db.from('balances').select('balance_micros').eq('wallet', wallet).maybeSingle();
  const micros = data?.balance_micros ?? 0;

  let tier = null;
  try { const t = await tierFor(wallet); tier = { id: t.id, label: t.label, discount: t.discount }; } catch { /* optional */ }

  res.json({
    wallet,
    balance_micros: micros,
    balance_usd: +(micros / 1e6).toFixed(6),
    tier,
  });
});

export default router;
