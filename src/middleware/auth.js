import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signJwt(wallet) {
  return jwt.sign({ sub: wallet, wallet }, config.jwtSecret, { expiresIn: config.jwtTtl });
}

/** Requires a valid Bearer JWT. Attaches req.wallet. */
export function requireJwt(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.wallet = payload.wallet;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

/** Attaches req.wallet if a valid Bearer JWT is present; never blocks. */
export function optionalJwt(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token) {
    try { req.wallet = jwt.verify(token, config.jwtSecret).wallet; } catch { /* ignore */ }
  }
  next();
}
