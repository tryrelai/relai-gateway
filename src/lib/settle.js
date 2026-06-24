import { db } from '../supabase.js';
import { recentPaymentsFrom } from './chain.js';

/**
 * Try to settle a pending top-up intent against on-chain payments.
 * Returns { status: 'paid' | 'pending', creditedMicros?, balanceMicros?, error? }.
 * Safe to call repeatedly — a tx credits at most once (topups.tx_sig is unique).
 */
export async function settleIntent(intent) {
  if (intent.status === 'paid') {
    const { data: bal } = await db.from('balances').select('balance_micros').eq('wallet', intent.wallet).maybeSingle();
    return { status: 'paid', balanceMicros: bal?.balance_micros ?? 0 };
  }

  let payments;
  try {
    payments = await recentPaymentsFrom(intent.wallet);
  } catch {
    return { status: 'pending', error: 'rpc_error' };
  }

  for (const p of payments) {
    if (p.amountBase < intent.micros) continue;

    // claim the tx_sig first — unique constraint blocks double credit
    const { error: dupErr } = await db.from('topups').insert({
      wallet: intent.wallet,
      tx_sig: p.signature,
      usdc_amount: p.amountBase / 1e6,
      micros_added: p.amountBase,
    });
    if (dupErr) continue; // already credited by another intent

    const { data: newBal } = await db.rpc('credit_balance', { p_wallet: intent.wallet, p_micros: p.amountBase });
    await db.from('topup_intents').update({ status: 'paid', tx_sig: p.signature }).eq('id', intent.id);

    return { status: 'paid', creditedMicros: p.amountBase, balanceMicros: newBal ?? null };
  }

  return { status: 'pending' };
}
