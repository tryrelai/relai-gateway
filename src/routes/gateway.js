import { Router } from 'express';
import { config } from '../config.js';
import { db } from '../supabase.js';
import { requireApiKey } from '../middleware/apikey.js';
import { getModel, costMicros, listCatalogue } from '../lib/pricing.js';
import { tierFor, discountedRate } from '../lib/tiers.js';

const router = Router();
router.use(requireApiKey);

function orHeaders() {
  const h = {
    Authorization: `Bearer ${config.openrouterKey}`,
    'Content-Type': 'application/json',
  };
  if (config.openrouterReferer) h['HTTP-Referer'] = config.openrouterReferer;
  if (config.openrouterTitle) h['X-Title'] = config.openrouterTitle;
  return h;
}

async function getBalance(wallet) {
  const { data } = await db.from('balances').select('balance_micros').eq('wallet', wallet).maybeSingle();
  return data?.balance_micros ?? 0;
}

// Atomic deduct via Postgres RPC (see sql/schema.sql). Returns new balance.
async function deduct(wallet, micros) {
  const { data, error } = await db.rpc('deduct_balance', { p_wallet: wallet, p_micros: micros });
  if (error) console.error('[deduct] rpc error', error.message);
  return data;
}

async function logUsage(wallet, keyId, model, totalTokens, micros) {
  await db.from('usage_logs').insert({
    wallet,
    api_key_id: keyId,
    model,
    total_tokens: totalTokens,
    cost_micros: micros,
  });
}

// Expose catalogue in OpenAI /models shape
router.get('/v1/models', (_req, res) => {
  res.json({
    object: 'list',
    data: listCatalogue().map((m) => ({ id: m.id, object: 'model', owned_by: 'relai' })),
  });
});

// Main metered endpoint
router.post('/v1/chat/completions', async (req, res) => {
  const wallet = req.wallet;
  const body = req.body || {};
  const modelId = body.model;

  const model = getModel(modelId);
  if (!model) {
    return res.status(400).json({
      error: { message: `Model '${modelId}' is not available on Relai`, type: 'invalid_request_error' },
    });
  }

  const balance = await getBalance(wallet);
  if (balance <= 0) {
    return res.status(402).json({
      error: {
        message: 'Compute balance exhausted. Top up on the marketplace to continue.',
        type: 'insufficient_balance',
      },
    });
  }

  // Holder discount: read on-chain $RELAI balance -> tier -> discounted rate.
  const tier = await tierFor(wallet);
  const rate = discountedRate(model.rate, tier);
  res.setHeader('X-Relai-Tier', tier.id);
  res.setHeader('X-Relai-Discount', String(tier.discount));

  const stream = body.stream === true;

  // Ensure we always receive usage on streamed responses
  const upstreamBody = stream
    ? { ...body, stream_options: { ...(body.stream_options || {}), include_usage: true } }
    : body;

  let upstream;
  try {
    upstream = await fetch(`${config.openrouterBase}/chat/completions`, {
      method: 'POST',
      headers: orHeaders(),
      body: JSON.stringify(upstreamBody),
    });
  } catch (e) {
    return res.status(502).json({ error: { message: 'Upstream unreachable', type: 'server_error' } });
  }

  // ---- Non-streaming ----
  if (!stream) {
    const json = await upstream.json().catch(() => null);
    if (!upstream.ok || !json) {
      return res.status(upstream.status || 502).json(json || { error: { message: 'upstream_error' } });
    }
    const total = json.usage?.total_tokens ?? 0;
    const micros = costMicros(total, rate);
    if (micros > 0) {
      await deduct(wallet, micros);
      await logUsage(wallet, req.apiKeyId, modelId, total, micros);
    }
    return res.status(200).json(json);
  }

  // ---- Streaming (SSE passthrough + metered settlement) ----
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => '');
    res.write(`data: ${JSON.stringify({ error: { message: errText || 'upstream_error' } })}\n\n`);
    return res.end();
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk); // pass through verbatim
      buf += chunk;

      // scan complete SSE lines for a usage object
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const obj = JSON.parse(data);
          if (obj.usage?.total_tokens) total = obj.usage.total_tokens;
        } catch {
          /* partial json across chunks — ignore */
        }
      }
    }
  } catch (e) {
    // client likely disconnected
  } finally {
    res.end();
    const micros = costMicros(total, rate);
    if (micros > 0) {
      await deduct(wallet, micros);
      await logUsage(wallet, req.apiKeyId, modelId, total, micros);
    }
  }
});

export default router;
