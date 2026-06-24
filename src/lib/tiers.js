import { PublicKey } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync, getAccount,
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { config } from '../config.js';
import { connection } from './chain.js';

/**
 * Holder tiers — discount on the locked rate based on on-chain $RELAI balance.
 * Thresholds are in whole tokens; edit to taste. Highest matching tier wins.
 * This is fully verifiable: the discount derives from real on-chain holdings,
 * read live from the wallet. No off-chain trust, no promises.
 */
export const TIERS = [
  { id: 'gold',   min: 10_000_000, discount: 0.20, label: 'Gold' },
  { id: 'silver', min: 1_000_000,  discount: 0.10, label: 'Silver' },
  { id: 'bronze', min: 100_000,    discount: 0.05, label: 'Bronze' },
  { id: 'base',   min: 0,          discount: 0.00, label: 'Base' },
];

export function tiersEnabled() {
  return Boolean(config.tokenMint && config.rpcUrl);
}

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map(); // wallet -> { val, exp }

function resolve(balance) {
  return TIERS.find((t) => balance >= t.min) || TIERS[TIERS.length - 1];
}

async function readBalance(wallet) {
  const mint = new PublicKey(config.tokenMint);
  const owner = new PublicKey(wallet);
  // $RELAI is minted as Token-2022; fall back to classic SPL just in case.
  for (const pid of [TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID]) {
    try {
      const ata = getAssociatedTokenAddressSync(mint, owner, false, pid);
      const acct = await getAccount(connection, ata, 'confirmed', pid);
      return Number(acct.amount) / 10 ** config.tokenDecimals;
    } catch {
      /* no account under this program — try next */
    }
  }
  return 0;
}

export async function tierFor(wallet) {
  const baseTier = TIERS[TIERS.length - 1];
  if (!tiersEnabled() || !wallet) return { id: baseTier.id, label: baseTier.label, discount: 0, balance: 0 };

  const now = Date.now();
  const hit = cache.get(wallet);
  if (hit && hit.exp > now) return hit.val;

  let balance = 0;
  try { balance = await readBalance(wallet); } catch { balance = 0; }
  const t = resolve(balance);
  const val = { id: t.id, label: t.label, discount: t.discount, balance };
  cache.set(wallet, { val, exp: now + CACHE_MS });
  return val;
}

export function discountedRate(rate, tier) {
  return rate * (1 - (tier?.discount || 0));
}

export function publicTiers() {
  return TIERS.map((t) => ({ id: t.id, label: t.label, min_tokens: t.min, discount: t.discount }));
}
