import { Router } from 'express';
import { config } from '../config.js';
import { listCatalogue } from '../lib/pricing.js';

const router = Router();

// GET /api/v1/config  -> public chain + catalogue info for the frontend
router.get('/', (_req, res) => {
  res.json({
    chain: 'solana',
    token_mint: config.tokenMint || null,
    usdc_mint: config.usdcMint,
    treasury_wallet: config.treasuryWallet || null,
    token_decimals: config.tokenDecimals,
    models: listCatalogue(),
  });
});

export default router;
