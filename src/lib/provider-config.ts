// Public, browser-safe configuration. Never put credentials in this module.
export const PROVIDERS = ["openai", "gemini", "kimi", "openrouter", "mimo"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI",
  gemini: "Google Gemini",
  kimi: "Kimi · Moonshot AI",
  openrouter: "OpenRouter",
  mimo: "Xiaomi MiMo",
};
export type ModelConfiguration = {
  id: string;
  name: string;
  input: number;
  output: number;
  maxOutput: number;
  endpoint: string;
  reasoning?: "low" | "disabled";
  cachedInput?: number;
};
export const OPENROUTER_MODEL_IDS = [
  "openai/gpt-4.1-mini",
  "google/gemini-2.5-flash-lite",
  "moonshotai/kimi-k3.1-pro",
  "xiaomi/mimo-v2.6-pro",
] as const;
export type OpenRouterModel = (typeof OPENROUTER_MODEL_IDS)[number];
// USD / million tokens. Official catalog checked 2026-11-01; see docs/PROVIDERS.md.
export const OPENROUTER_MODELS: Record<OpenRouterModel, ModelConfiguration> = {
  "xiaomi/mimo-v2.6-pro": {
    id: "xiaomi/mimo-v2.6-pro",
    name: "Xiaomi MiMo V2.6 Pro",
    input: 0.435,
    output: 0.87,
    maxOutput: 1200,
    reasoning: "disabled",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
  },
  "openai/gpt-4.1-mini": {
    id: "openai/gpt-4.1-mini",
    name: "GPT-4.1 mini",
    input: 0.4,
    output: 1.6,
    maxOutput: 1200,
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
  },
  "google/gemini-2.5-flash-lite": {
    id: "google/gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
    input: 0.1,
    output: 0.4,
    maxOutput: 1200,
    reasoning: "disabled",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
  },
  "moonshotai/kimi-k3.1-pro": {
    id: "moonshotai/kimi-k3.1-pro",
    name: "Kimi K3.1 Pro",
    input: 2,
    output: 10,
    maxOutput: 8192,
    reasoning: "low",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
  },
};
export const MODELS: Record<Provider, ModelConfiguration> = {
  openai: {
    id: "gpt-4.1-mini-2025-04-14",
    name: "GPT-4.1 mini",
    input: 0.4,
    output: 1.6,
    maxOutput: 1200,
    endpoint: "https://api.openai.com/v1/responses",
  },
  gemini: {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
    input: 0.1,
    output: 0.4,
    maxOutput: 1200,
    endpoint:
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
  },
  kimi: {
    id: "kimi-k3.1-pro",
    name: "Kimi K3.1 Pro",
    input: 2,
    output: 10,
    cachedInput: 0.2,
    maxOutput: 8192,
    reasoning: "low",
    endpoint: "https://api.moonshot.ai/v1/chat/completions",
  },
  openrouter: OPENROUTER_MODELS[OPENROUTER_MODEL_IDS[0]],
  mimo: {
    id: "mimo-v2.6-pro",
    name: "MiMo V2.6 Pro",
    input: 0.435,
    output: 0.87,
    cachedInput: 0.0036,
    maxOutput: 1200,
    reasoning: "disabled",
    endpoint: "https://api.xiaomimimo.com/v1/chat/completions",
  },
};
export function modelConfiguration(provider: Provider, id = MODELS[provider].id) {
  if (provider === "openrouter")
    return Object.values(OPENROUTER_MODELS).find((model) => model.id === id);
  return MODELS[provider].id === id ? MODELS[provider] : undefined;
}
export function supportsWebSearch(provider: Provider) {
  return PROVIDERS.includes(provider);
}
export function requestEndpoint(
  provider: Provider,
  mode: "baseline" | "web",
  model = MODELS[provider],
) {
  return provider === "kimi" && mode === "web"
    ? "https://api.moonshot.ai/v1/responses"
    : model.endpoint;
}
export const PROVIDER_KEY_URLS: Record<Provider, string> = {
  openai: "https://platform.openai.com/api-keys",
  gemini: "https://aistudio.google.com/apikey",
  kimi: "https://platform.kimi.ai/docs/get-your-api-key",
  openrouter: "https://openrouter.ai/settings/keys",
  mimo: "https://mimo.mi.com/docs/en-US/quick-start/summary/welcome",
};
