import { db } from '../supabase.js';
import { hashApiKey, looksLikeApiKey } from '../lib/apikeys.js';

/** Resolves a Bearer API key -> { wallet, keyId }. Used only on gateway routes. */
export async function requireApiKey(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token || !looksLikeApiKey(token)) {
    return res.status(401).json({ error: { message: 'Missing or malformed API key', type: 'auth_error' } });
  }
  const hash = hashApiKey(token);
  const { data, error } = await db
    .from('api_keys')
    .select('id, wallet, revoked')
    .eq('key_hash', hash)
    .maybeSingle();

  if (error) return res.status(500).json({ error: { message: 'auth lookup failed', type: 'server_error' } });
  if (!data || data.revoked) {
    return res.status(401).json({ error: { message: 'Invalid API key', type: 'auth_error' } });
  }

  req.wallet = data.wallet;
  req.apiKeyId = data.id;

  // fire-and-forget last_used touch
  db.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {});
  next();
}
