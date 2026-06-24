import crypto from 'node:crypto';

const PREFIX = 'relai_sk_';

/** Create a new API key: returns { plaintext, hash, last4 }. Plaintext shown once. */
export function newApiKey() {
  const raw = crypto.randomBytes(24).toString('base64url'); // ~32 chars, url-safe
  const plaintext = PREFIX + raw;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    last4: raw.slice(-4),
  };
}

export function hashApiKey(plaintext) {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

export function looksLikeApiKey(s) {
  return typeof s === 'string' && s.startsWith(PREFIX);
}
