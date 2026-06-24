import { Router } from 'express';
import { db } from '../supabase.js';
import { requireJwt } from '../middleware/auth.js';
import { newApiKey } from '../lib/apikeys.js';
import { tierFor } from '../lib/tiers.js';

const router = Router();
router.use(requireJwt);

// GET /api/v1/dashboard/  -> balance, keys (masked), recent usage, holder tier
router.get('/', async (req, res) => {
  const wallet = req.wallet;

  const [bal, keys, usage, tier] = await Promise.all([
    db.from('balances').select('balance_micros').eq('wallet', wallet).maybeSingle(),
    db
      .from('api_keys')
      .select('id, label, last4, revoked, created_at, last_used_at')
      .eq('wallet', wallet)
      .order('created_at', { ascending: false }),
    db
      .from('usage_logs')
      .select('model, total_tokens, cost_micros, created_at')
      .eq('wallet', wallet)
      .order('created_at', { ascending: false })
      .limit(50),
    tierFor(wallet),
  ]);

  res.json({
    wallet,
    balance_micros: bal.data?.balance_micros ?? 0,
    balance_usd: ((bal.data?.balance_micros ?? 0) / 1e6).toFixed(6),
    tier: { id: tier.id, label: tier.label, discount: tier.discount, relai_balance: tier.balance },
    api_keys: keys.data || [],
    usage: usage.data || [],
  });
});

// POST /api/v1/dashboard/api-keys  { label }  -> returns plaintext ONCE
router.post('/api-keys', async (req, res) => {
  const wallet = req.wallet;
  const label = (req.body?.label || 'default').toString().slice(0, 64);

  const key = newApiKey();
  const { error } = await db.from('api_keys').insert({
    wallet,
    label,
    key_hash: key.hash,
    last4: key.last4,
  });
  if (error) return res.status(500).json({ error: 'key_create_failed' });

  // plaintext is returned exactly once and never stored
  res.json({ api_key: key.plaintext, label, last4: key.last4 });
});

// POST /api/v1/dashboard/api-keys/:id/revoke
router.post('/api-keys/:id/revoke', async (req, res) => {
  const { error } = await db
    .from('api_keys')
    .update({ revoked: true })
    .eq('id', req.params.id)
    .eq('wallet', req.wallet);
  if (error) return res.status(500).json({ error: 'revoke_failed' });
  res.json({ ok: true });
});

export default router;
