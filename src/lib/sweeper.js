import { db } from '../supabase.js';
import { config } from '../config.js';
import { chainReady } from './chain.js';
import { settleIntent } from './settle.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function startSweeper() {
  if (!config.sweeperEnabled) { console.log('[sweeper] disabled'); return; }
  if (!chainReady()) { console.log('[sweeper] chain not configured — skipping'); return; }

  let running = false;
  const tick = async () => {
    if (running) return;        // never overlap ticks
    running = true;
    try {
      const { data: intents } = await db
        .from('topup_intents')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(config.sweeperBatch);

      for (const it of intents || []) {
        if (Date.now() - new Date(it.created_at).getTime() > DAY_MS) {
          await db.from('topup_intents').update({ status: 'expired' }).eq('id', it.id);
          continue;
        }
        const r = await settleIntent(it);
        if (r.status === 'paid' && r.creditedMicros) {
          console.log(`[sweeper] credited ${it.wallet.slice(0, 6)}… +${(r.creditedMicros / 1e6).toFixed(2)} USDC`);
        }
      }
    } catch (e) {
      console.error('[sweeper]', e.message);
    } finally {
      running = false;
    }
  };

  setInterval(tick, config.sweeperIntervalMs);
  console.log(`[sweeper] on · every ${config.sweeperIntervalMs}ms · batch ${config.sweeperBatch}`);
}
