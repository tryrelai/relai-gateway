import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { config } from '../config.js';

export const connection = new Connection(
  config.rpcUrl || 'https://api.mainnet-beta.solana.com',
  'confirmed'
);

export function chainReady() {
  return Boolean(config.rpcUrl && config.treasuryWallet && config.usdcMint);
}

let _ata = null;
export async function treasuryUsdcAta() {
  if (_ata) return _ata;
  _ata = await getAssociatedTokenAddress(
    new PublicKey(config.usdcMint),
    new PublicKey(config.treasuryWallet)
  );
  return _ata;
}

const _ataCache = new Map();
export async function treasuryAtaFor(mint) {
  if (_ataCache.has(mint)) return _ataCache.get(mint);
  const ata = await getAssociatedTokenAddress(new PublicKey(mint), new PublicKey(config.treasuryWallet));
  _ataCache.set(mint, ata);
  return ata;
}

/**
 * Recent SPL transfers of `mint` INTO the treasury, sent BY `wallet`.
 * Returns [{ signature, rawAmount, uiAmount, decimals }].
 */
export async function recentSplPaymentsFrom(wallet, mint, limit = 30) {
  const ata = await treasuryAtaFor(mint);
  const ataStr = ata.toBase58();
  const sigs = await connection.getSignaturesForAddress(ata, { limit });
  const out = [];
  for (const s of sigs) {
    if (s.err) continue;
    let tx;
    try { tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 }); } catch { continue; }
    if (!tx) continue;
    const instrs = [...(tx.transaction.message.instructions || [])];
    for (const inner of tx.meta?.innerInstructions || []) instrs.push(...inner.instructions);
    for (const ix of instrs) {
      const pi = ix.parsed;
      if (!pi || (pi.type !== 'transfer' && pi.type !== 'transferChecked')) continue;
      const info = pi.info || {};
      if (info.destination !== ataStr) continue;
      const sender = info.authority || info.owner;
      if (sender && sender !== wallet) continue;
      if (info.mint && info.mint !== mint) continue;
      let raw = 0, dec = null;
      if (info.tokenAmount && info.tokenAmount.amount) { raw = Number(info.tokenAmount.amount); dec = info.tokenAmount.decimals; }
      else if (info.amount != null) raw = Number(info.amount);
      if (!raw) continue;
      out.push({ signature: s.signature, rawAmount: raw, decimals: dec, uiAmount: dec != null ? raw / 10 ** dec : null });
    }
  }
  return out;
}

/**
 * Recent native SOL transfers INTO the treasury wallet, sent BY `wallet`.
 * Returns [{ signature, lamports }].
 */
export async function recentSolPaymentsFrom(wallet, limit = 30) {
  const treasury = config.treasuryWallet;
  const sigs = await connection.getSignaturesForAddress(new PublicKey(treasury), { limit });
  const out = [];
  for (const s of sigs) {
    if (s.err) continue;
    let tx;
    try { tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 }); } catch { continue; }
    if (!tx) continue;
    const instrs = [...(tx.transaction.message.instructions || [])];
    for (const inner of tx.meta?.innerInstructions || []) instrs.push(...inner.instructions);
    for (const ix of instrs) {
      const pi = ix.parsed;
      if (!pi || pi.type !== 'transfer') continue;
      if (ix.program !== 'system') continue;
      const info = pi.info || {};
      if (info.destination !== treasury) continue;
      if (info.source && info.source !== wallet) continue;
      const lamports = Number(info.lamports || 0);
      if (!lamports) continue;
      out.push({ signature: s.signature, lamports });
    }
  }
  return out;
}

/**
 * Recent USDC transfers INTO the treasury sent BY `wallet`.
 * USDC base units (6 decimals) == micro-USD, so amountBase is also the credit micros.
 * Returns [{ signature, amountBase }].
 */
export async function recentPaymentsFrom(wallet, limit = 30) {
  const rows = await recentSplPaymentsFrom(wallet, config.usdcMint, limit);
  return rows.map((r) => ({ signature: r.signature, amountBase: r.rawAmount }));
}
