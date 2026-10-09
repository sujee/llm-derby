import type { Provider } from './types';

// All presets passed a browser CORS check from a github.io origin (2026-10-08; GMI Cloud 2026-10-09).
export const PROVIDERS: Provider[] = [
  {
    id: 'nebius',
    name: 'Nebius Token Factory',
    baseUrl: 'https://api.tokenfactory.nebius.com/v1',
    keyUrl: 'https://tokenfactory.nebius.com/',
    // The verbose listing includes per-model prices.
    modelsQuery: '?verbose=true',
  },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys' },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    extraHeaders: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', keyUrl: 'https://api.together.ai/settings/api-keys' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys' },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    keyUrl: 'https://fireworks.ai/account/api-keys',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    extraHeaders: () => ({ 'X-Title': 'LLM Derby' }),
  },
  {
    id: 'deepinfra',
    name: 'DeepInfra',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    keyUrl: 'https://deepinfra.com/dash/api_keys',
  },
  { id: 'mistral', name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', keyUrl: 'https://cloud.cerebras.ai/' },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    baseUrl: 'https://router.huggingface.co/v1',
    keyUrl: 'https://huggingface.co/settings/tokens',
  },
  {
    id: 'gmi',
    name: 'GMI Cloud',
    baseUrl: 'https://api.gmi-serving.com/v1',
    keyUrl: 'https://console.gmicloud.ai/',
  },
  {
    id: 'baseten',
    name: 'Baseten',
    baseUrl: 'https://inference.baseten.co/v1',
    keyUrl: 'https://app.baseten.co/settings/api_keys',
    note: 'If the model list does not load, type the model ID.',
  },
  { id: 'custom', name: 'Custom (OpenAI-compatible)', baseUrl: '', editableUrl: true },
  { id: 'sim', name: 'Simulated (no API calls)', baseUrl: '', noKey: true, simulated: true },
];

/** Dropdown order: real providers A–Z, then the special Custom and Simulated entries. */
export const PROVIDER_MENU: Provider[] = [
  ...PROVIDERS.filter((p) => !p.editableUrl && !p.simulated).sort((a, b) => a.name.localeCompare(b.name)),
  ...PROVIDERS.filter((p) => p.editableUrl || p.simulated),
];

export function providerById(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}
