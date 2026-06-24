import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../supabase.js';
import { verifyWalletSignature, isValidWallet } from '../lib/solana.js';
import { signJwt } from '../middleware/auth.js';

const router = Router();

function buildMessage(wallet, nonce) {
  return [
    'Sign in to Relai',
    '',
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    '',
    'Signing this message proves you own this wallet. It costs no gas and sends no transaction.',
  ].join('\n');
}

// GET /api/v1/auth/nonce/:wallet  -> returns the message to sign
router.get('/nonce/:wallet', async (req, res) => {
  const wallet = req.params.wallet;
  if (!isValidWallet(wallet)) return res.status(400).json({ error: 'invalid_wallet' });

  const nonce = crypto.randomBytes(16).toString('hex');
  const message = buildMessage(wallet, nonce);

  const { error } = await db.from('auth_nonces').upsert(
    { wallet, nonce, created_at: new Date().toISOString() },
    { onConflict: 'wallet' }
  );
  if (error) return res.status(500).json({ error: 'nonce_store_failed' });

  res.json({ wallet, nonce, message });
});

// POST /api/v1/auth/login  { wallet, signature }  -> verifies, issues JWT
router.post('/login', async (req, res) => {
  const { wallet, signature } = req.body || {};
  if (!isValidWallet(wallet) || !signature) {
    return res.status(400).json({ error: 'bad_request' });
  }

  const { data: row, error } = await db
    .from('auth_nonces')
    .select('nonce, created_at')
    .eq('wallet', wallet)
    .maybeSingle();
  if (error || !row) return res.status(401).json({ error: 'no_nonce' });

  // nonce expires after 5 minutes
  if (Date.now() - new Date(row.created_at).getTime() > 5 * 60 * 1000) {
    return res.status(401).json({ error: 'nonce_expired' });
  }

  const message = buildMessage(wallet, row.nonce);
  if (!verifyWalletSignature(wallet, message, signature)) {
    return res.status(401).json({ error: 'bad_signature' });
  }

  // single-use: drop the nonce
  await db.from('auth_nonces').delete().eq('wallet', wallet);

  // upsert user + ensure a balance row exists
  await db.from('users').upsert({ wallet }, { onConflict: 'wallet' });
  await db.from('balances').upsert(
    { wallet, balance_micros: 0 },
    { onConflict: 'wallet', ignoreDuplicates: true }
  );

  res.json({ token: signJwt(wallet), wallet });
});

export default router;
