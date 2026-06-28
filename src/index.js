import express from 'express';
import cors from 'cors';
import { config } from './config.js';

import authRoutes from './routes/auth.js';
import configRoutes from './routes/config.js';
import dashboardRoutes from './routes/dashboard.js';
import gatewayRoutes from './routes/gateway.js';
import topupRoutes from './routes/topup.js';
import statsRoutes from './routes/stats.js';
import pricesRoutes from './routes/prices.js';
import curveRoutes from './routes/curve.js';
import balanceRoutes from './routes/balance.js';
import { startSweeper } from './lib/sweeper.js';
import { snapshotPrices } from './lib/prices.js';

const app = express();
app.disable('x-powered-by');

// CORS — gateway is open (clients send Bearer keys); dashboard/auth limited to known origins.
const corsAll = cors({ origin: config.corsOrigins.length ? config.corsOrigins : true });

app.use('/api/v1/gateway', cors(), express.json({ limit: '4mb' }), gatewayRoutes);

app.use(corsAll);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/config', configRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/topup', topupRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1/prices', cors(), pricesRoutes);
app.use('/api/v1/curve', cors(), curveRoutes);
app.use('/api/v1/balance', cors(), balanceRoutes);

app.use((req, res) => res.status(404).json({ error: 'not_found', path: req.path }));

app.listen(config.port, () => {
  console.log(`[relai] gateway listening on :${config.port}`);
  startSweeper();
  // Real price history: snapshot live OpenRouter prices on boot, then hourly.
  snapshotPrices().then((r) => console.log('[relai] price snapshot', JSON.stringify(r)));
  setInterval(() => {
    snapshotPrices().then((r) => console.log('[relai] price snapshot', JSON.stringify(r)));
  }, 60 * 60 * 1000);
});
