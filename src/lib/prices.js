// Live model-inference prices.
//
// Source of truth: OpenRouter's PUBLIC models endpoint (no key needed for the
// listing). `pricing.prompt` / `pricing.completion` are USD *per token*; we
// convert to USD per 1,000,000 tokens and expose a blended headline "spot".
//
// These are REAL, verifiable inference prices — not synthetic. The futures
// "mark" on the terminal is pinned to this spot until an on-chain $RELAI perp
// market exists, at which point mark comes from the chain instead.
import { db } from '../supabase.js';

// The 7 model families Relai routes. Each has a list of candidate OpenRouter
// slugs (newest first) and a `match` regex used as a self-healing fallback if
// every explicit slug 404s after a provider rename.
export const TRACKED = [
  { key: 'DeepSeek', prov: 'DeepSeek', ids: ['deepseek/deepseek-chat-v3', 'deepseek/deepseek-chat'], match: /^deepseek\/deepseek-chat/ },
  { key: 'Llama',    prov: 'Meta',     ids: ['meta-llama/llama-3.3-70b-instruct'], match: /^meta-llama\/llama-3\.3-70b/ },
  { key: 'Qwen',     prov: 'Qwen',     ids: ['qwen/qwen-2.5-72b-instruct'], match: /^qwen\/qwen-?2\.5-72b/ },
  { key: 'Mistral',  prov: 'Mistral',  ids: ['mistralai/mistral-large'], match: /^mistralai\/mistral-large/ },
  { key: 'GPT',      prov: 'OpenAI',   ids: ['openai/gpt-4o'], match: /^openai\/gpt-4o(?!-mini)/ },
  { key: 'Gemini',   prov: 'Google',   ids: ['google/gemini-2.5-pro', 'google/gemini-pro-1.5'], match: /^google\/gemini-(2\.5-pro|pro-1\.5|pro)\b/ },
  { key: 'Claude',   prov: 'Anthropic', ids: ['anthropic/claude-sonnet-4.6', 'anthropic/claude-sonnet-4.5', 'anthropic/claude-3.5-sonnet'], match: /^anthropic\/claude-(sonnet-4|3\.5-sonnet)/ },
];

const OR_MODELS = 'https://openrouter.ai/api/v1/models';
const CACHE_MS = 60_000;

let _cache = { ts: 0, data: null };

// USD per 1M tokens, rounded to 4 dp.
const mtok = (perToken) => +(Number(perToken || 0) * 1_000_000).toFixed(4);

/**
 * Fetch live prices for the tracked models from OpenRouter (cached 60s).
 * Returns: [{ key, id, prov, in, out, spot, ctx }]
 * `spot` = blended (in+out)/2 per 1M tokens — the headline inference price.
 */
export async function livePrices() {
  const now = Date.now();
  if (_cache.data && now - _cache.ts < CACHE_MS) return _cache.data;

  const r = await fetch(OR_MODELS, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('openrouter_models_' + r.status);
  const j = await r.json();
  const list = j.data || [];
  const byId = new Map(list.map((m) => [m.id, m]));

  const priced = (m) => m && m.pricing && (Number(m.pricing.prompt) > 0 || Number(m.pricing.completion) > 0);

  const out = TRACKED.map((t) => {
    // 1) try explicit candidate slugs in order
    let m = null;
    for (const id of t.ids) { const c = byId.get(id); if (priced(c)) { m = c; break; } }
    // 2) self-healing fallback: pick a listed model matching the family regex
    if (!m) {
      const cands = list.filter((x) => t.match.test(x.id) && priced(x))
        .sort((a, b) => a.id.length - b.id.length); // prefer the most "base" slug
      m = cands[0] || null;
    }
    const inp = m ? mtok(m.pricing?.prompt) : null;
    const outp = m ? mtok(m.pricing?.completion) : null;
    const spot = inp != null && outp != null ? +(((inp + outp) / 2)).toFixed(4) : null;
    return {
      key: t.key,
      id: m ? m.id : t.ids[0],
      prov: t.prov,
      in: inp,
      out: outp,
      spot,
      ctx: m?.context_length || null,
    };
  });

  _cache = { ts: now, data: out };
  return out;
}

/**
 * Snapshot current real prices into Supabase (one row per model per call).
 * Drives the real OHLC history endpoint. Safe to call hourly.
 */
export async function snapshotPrices() {
  try {
    const prices = await livePrices();
    const ts = new Date().toISOString();
    const rows = prices
      .filter((p) => p.spot != null)
      .map((p) => ({
        model_id: p.id,
        model_key: p.key,
        ts,
        spot: p.spot,
        price_in: p.in,
        price_out: p.out,
      }));
    if (!rows.length) return { ok: false, reason: 'no_prices' };
    const { error } = await db.from('price_snapshots').insert(rows);
    if (error) return { ok: false, reason: error.message };
    return { ok: true, count: rows.length };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

/**
 * Real daily OHLC for one model, built from accumulated snapshots.
 * Returns ascending [{ time(sec), open, high, low, close }].
 * Sparse until snapshots accumulate — that's honest; it fills in over time.
 */
export async function priceHistory(modelId, days = 120, bucketSec = 86400) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await db
    .from('price_snapshots')
    .select('ts, spot')
    .eq('model_id', modelId)
    .gte('ts', since)
    .order('ts', { ascending: true });
  if (error) throw new Error(error.message);

  const bkt = Math.max(60, bucketSec);
  const buckets = new Map(); // bucketStart(sec) -> {o,h,l,c}
  for (const row of data || []) {
    const t = Math.floor(new Date(row.ts).getTime() / 1000);
    const slot = t - (t % bkt);
    const v = Number(row.spot);
    const b = buckets.get(slot);
    if (!b) buckets.set(slot, { time: slot, open: v, high: v, low: v, close: v });
    else {
      b.high = Math.max(b.high, v);
      b.low = Math.min(b.low, v);
      b.close = v;
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}
