import 'dotenv/config';

function req(name) {
  const v = process.env[name];
  if (!v) {
    console.warn(`[config] WARNING: ${name} is not set`);
  }
  return v;
}

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  jwtSecret: req('JWT_SECRET'),
  jwtTtl: process.env.JWT_TTL || '7d',

  supabaseUrl: req('SUPABASE_URL'),
  supabaseServiceKey: req('SUPABASE_SERVICE_KEY'),

  openrouterKey: req('OPENROUTER_API_KEY'),
  openrouterBase: process.env.OPENROUTER_BASE || 'https://openrouter.ai/api/v1',
  openrouterReferer: process.env.OPENROUTER_REFERER || '',
  openrouterTitle: process.env.OPENROUTER_TITLE || 'Relai',

  rpcUrl: process.env.RPC_URL || '',
  tokenMint: process.env.TOKEN_MINT || '',
  usdcMint: process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  treasuryWallet: process.env.TREASURY_WALLET || '',
  tokenDecimals: parseInt(process.env.TOKEN_DECIMALS || '6', 10),

  sweeperEnabled: process.env.SWEEPER !== 'off',
  sweeperIntervalMs: parseInt(process.env.SWEEPER_INTERVAL_MS || '20000', 10),
  sweeperBatch: parseInt(process.env.SWEEPER_BATCH || '25', 10),
};
