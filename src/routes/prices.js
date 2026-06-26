import { Router } from 'express';
import { livePrices, priceHistory, TRACKED } from '../lib/prices.js';

const router = Router();

// GET /api/v1/prices — live real inference prices for the 7 tracked models.
router.get('/', async (_req, res) => {
  try {
    const models = await livePrices();
    res.json({ ok: true, source: 'openrouter', updated: Date.now(), models });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
});

// GET /api/v1/prices/history?model=<openrouter-id|key>&days=120&bucket=day|hour
// Real OHLC built from accumulated snapshots.
router.get('/history', async (req, res) => {
  try {
    let model = String(req.query.model || '');
    if (!model) return res.status(400).json({ ok: false, error: 'model_required' });
    // accept a ticker key (e.g. "GPT") -> resolve to the live id snapshots are stored under
    if (TRACKED.some((t) => t.key.toLowerCase() === model.toLowerCase())) {
      const live = await livePrices();
      const hit = live.find((p) => p.key.toLowerCase() === model.toLowerCase());
      if (hit) model = hit.id;
    }
    const days = Math.min(365, Math.max(1, parseInt(req.query.days || '120', 10)));
    const bucket = String(req.query.bucket || 'day') === 'hour' ? 3600 : 86400;
    const bars = await priceHistory(model, days, bucket);
    res.json({ ok: true, model, days, bucket: bucket === 3600 ? 'hour' : 'day', bars });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
