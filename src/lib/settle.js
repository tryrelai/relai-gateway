import { db } from '../supabase.js';
import { recentPaymentsFrom, recentSolPaymentsFrom, recentSplPaymentsFrom } from './chain.js';
import { assetUsd, SOL_MINT } from './assets.js';
import { config } from '../config.js';

const SLIPPAGE = 0.98; // accept payments worth >= 98% of the quoted USD (price drift between quote and pay)

/**
 * Gather candidate payments for an intent's asset, each annotated with the
 * USD micro-value actually received.
 * Returns [{ signature, micros, usd }].
 */
async function candidatesFor(intent) {
  const asset = intent.pay_asset || 'usdc';

  if (asset === 'usdc') {
    const pays = await recentPaymentsFrom(intent.wallet);
    return pays.map((p) => ({ signature: p.signature, micros: p.amountBase, usd: p.amountBase / 1e6 }));
  }

  if (asset === 'sol') {
    const usd1 = await assetUsd(SOL_MINT);
    if (usd1 == null) throw new Error('price_unavailable');
    const pays = await recentSolPaymentsFrom(intent.wallet);
    return pays.map((p) => { const usd = (p.lamports / 1e9) * usd1; return { signature: p.signature, micros: Math.floor(usd * 1e6), usd }; });
  }

  if (asset === 'relai') {
    if (!config.tokenMint) throw new Error('token_not_live');
    const usd1 = await assetUsd(config.tokenMint);
    if (usd1 == null) throw new Error('price_unavailable');
    const pays = await recentSplPaymentsFrom(intent.wallet, config.tokenMint);
    return pays.map((p) => { const ui = p.uiAmount != null ? p.uiAmount : p.rawAmount / 10 ** config.tokenDecimals; const usd = ui * usd1; return { signature: p.signature, micros: Math.floor(usd * 1e6), usd }; });
  }

  return [];
}

/**
 * Try to settle a pending top-up intent against on-chain payments.
 * Credits the REAL USD value received (USDC 1:1; SOL/$RELAI valued live via Jupiter).
 * A payment must be worth >= 98% of the quoted USD. Safe to call repeatedly —
 * a tx credits at most once (topups.tx_sig is unique).
 */
export async function settleIntent(intent) {
  if (intent.status === 'paid') {
    const { data: bal } = await db.from('balances').select('balance_micros').eq('wallet', intent.wallet).maybeSingle();
    return { status: 'paid', balanceMicros: bal?.balance_micros ?? 0 };
  }

  let cands;
  try {
    cands = await candidatesFor(intent);
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg === 'price_unavailable' || msg === 'token_not_live') return { status: 'pending', error: msg };
    return { status: 'pending', error: 'rpc_error' };
  }

  const need = Number(intent.micros) * SLIPPAGE;

  for (const p of cands) {
    if (p.micros < need) continue;

    // claim the tx_sig first — unique constraint blocks double credit
    const { error: dupErr } = await db.from('topups').insert({
      wallet: intent.wallet,
      tx_sig: p.signature,
      usdc_amount: +p.usd.toFixed(6),
      micros_added: p.micros,
    });
    if (dupErr) continue; // already credited by another intent

    const { data: newBal } = await db.rpc('credit_balance', { p_wallet: intent.wallet, p_micros: p.micros });
    await db.from('topup_intents').update({ status: 'paid', tx_sig: p.signature }).eq('id', intent.id);

    return { status: 'paid', creditedMicros: p.micros, balanceMicros: newBal ?? null };
  }

  return { status: 'pending' };
}
