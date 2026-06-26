// Live USD prices for payment assets (Jupiter price API, cached ~30s).
// Used to quote SOL / $RELAI amounts and to credit the real USD value received.
import { config } from '../config.js';

export const SOL_MINT = 'So11111111111111111111111111111111111111112';

const cache = new Map(); // mint -> { ts, usd }
const TTL = 30_000;

/** USD price for a mint. USDC is pinned to 1. Returns null if unavailable. */
export async function assetUsd(mint) {
  if (!mint) return null;
  if (mint === config.usdcMint) return 1;
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.ts < TTL) return hit.usd;
  try {
    const j = await fetch('https://price.jup.ag/v6/price?ids=' + mint).then((r) => r.json());
    const usd = j?.data?.[mint]?.price ?? null;
    if (usd != null) cache.set(mint, { ts: Date.now(), usd });
    return usd;
  } catch {
    return null;
  }
}

/** Resolve the mint + decimals for a pay asset id. */
export function payAssetMeta(asset) {
  if (asset === 'sol') return { mint: SOL_MINT, decimals: 9, native: true, label: 'SOL' };
  if (asset === 'relai') return { mint: config.tokenMint || null, decimals: config.tokenDecimals, native: false, label: '$RELAI' };
  return { mint: config.usdcMint, decimals: 6, native: false, label: 'USDC' };
}
