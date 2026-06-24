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

/**
 * Recent USDC transfers INTO the treasury sent BY `wallet`.
 * USDC base units (6 decimals) == micro-USD, so amountBase is also the credit micros.
 * Returns [{ signature, amountBase }].
 */
export async function recentPaymentsFrom(wallet, limit = 30) {
  const ata = await treasuryUsdcAta();
  const ataStr = ata.toBase58();
  const sigs = await connection.getSignaturesForAddress(ata, { limit });
  const out = [];

  for (const s of sigs) {
    if (s.err) continue;
    let tx;
    try {
      tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    } catch {
      continue;
    }
    if (!tx) continue;

    const instrs = [...(tx.transaction.message.instructions || [])];
    for (const inner of tx.meta?.innerInstructions || []) instrs.push(...inner.instructions);

    for (const ix of instrs) {
      const pi = ix.parsed;
      if (!pi || (pi.type !== 'transfer' && pi.type !== 'transferChecked')) continue;
      const info = pi.info || {};
      if (info.destination !== ataStr) continue;          // must land in treasury USDC ATA
      const sender = info.authority || info.owner;          // token owner that signed
      if (sender && sender !== wallet) continue;            // must come from this wallet
      if (info.mint && info.mint !== config.usdcMint) continue;

      let amt = 0;
      if (info.tokenAmount && info.tokenAmount.amount) amt = Number(info.tokenAmount.amount);
      else if (info.amount != null) amt = Number(info.amount);
      if (!amt) continue;

      out.push({ signature: s.signature, amountBase: amt });
    }
  }
  return out;
}
