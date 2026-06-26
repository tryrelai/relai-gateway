// Locked-rate model catalogue.
// rate = USD per 1,000,000 tokens (blended prompt+completion for MVP simplicity).
// Balances are stored in micro-USD (1 micro = $0.000001).
//
// Model IDs are OpenRouter slugs — verify/adjust against https://openrouter.ai/models
// (provider renames checkpoints periodically). To add a model: map an id -> { tier, rate, label }.
export const MODELS = {
  'deepseek/deepseek-chat': { tier: 'futures', rate: 0.14, label: 'DeepSeek Forward' },
  'meta-llama/llama-3.3-70b-instruct': { tier: 'futures', rate: 0.18, label: 'Llama Forward' },
  'qwen/qwen-2.5-72b-instruct': { tier: 'futures', rate: 0.16, label: 'Qwen Forward' },
  'mistralai/mistral-large': { tier: 'futures', rate: 0.22, label: 'Mistral Forward' },
  'openai/gpt-4o': { tier: 'capacity', rate: 3.50, label: 'GPT Capacity' },
  'google/gemini-2.5-pro': { tier: 'capacity', rate: 2.50, label: 'Gemini Capacity' },
  'anthropic/claude-sonnet-4.6': { tier: 'capacity', rate: 1.80, label: 'Claude Capacity' },
};

export function getModel(id) {
  return MODELS[id] || null;
}

/**
 * Cost in micro-USD for a request.
 * cost_usd = totalTokens / 1e6 * rate  ->  micros = totalTokens * rate
 */
export function costMicros(totalTokens, ratePerMtok) {
  return Math.ceil(totalTokens * ratePerMtok);
}

export function listCatalogue() {
  return Object.entries(MODELS).map(([id, m]) => ({
    id,
    tier: m.tier,
    label: m.label,
    locked_rate_per_mtok: m.rate,
  }));
}
