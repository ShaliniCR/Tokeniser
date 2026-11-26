import type { ProviderMeta } from './types';

function basicKeyCheck(key: string, name: string, prefix?: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return `Enter your ${name} API key.`;
  if (/\s/.test(trimmed)) return 'API keys cannot contain spaces.';
  if (prefix && !trimmed.startsWith(prefix)) return `${name} API keys start with "${prefix}".`;
  if (trimmed.length < 20) return 'That key looks too short.';
  return null;
}

/**
 * All supported providers. Model lists are current at the time of writing;
 * "Load models" in the UI fetches the live list for the user's key.
 */
export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    apiHost: 'api.anthropic.com',
    docsUrl: 'https://docs.anthropic.com/en/docs/build-with-claude/token-counting',
    keyLabel: 'Anthropic API key',
    keyPlaceholder: 'sk-ant-...',
    keyConsoleUrl: 'https://console.anthropic.com/settings/keys',
    keyConsoleName: 'Claude Console',
    defaultModels: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    ],
    validateKeyShape: (k) => basicKeyCheck(k, 'Anthropic', 'sk-ant-'),
    load: () => import('./anthropic').then((m) => m.default),
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    apiHost: 'generativelanguage.googleapis.com',
    docsUrl: 'https://ai.google.dev/api/tokens',
    keyLabel: 'Gemini API key',
    keyPlaceholder: 'AIza...',
    keyConsoleUrl: 'https://aistudio.google.com/apikey',
    keyConsoleName: 'Google AI Studio',
    defaultModels: [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
      { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
    ],
    validateKeyShape: (k) => basicKeyCheck(k, 'Gemini'),
    load: () => import('./gemini').then((m) => m.default),
  },
  {
    id: 'openai',
    name: 'OpenAI',
    apiHost: 'api.openai.com',
    docsUrl: 'https://developers.openai.com/api/docs/guides/token-counting',
    keyLabel: 'OpenAI API key',
    keyPlaceholder: 'sk-...',
    keyConsoleUrl: 'https://platform.openai.com/api-keys',
    keyConsoleName: 'OpenAI dashboard',
    defaultModels: [
      { id: 'gpt-6.2-astra', label: 'GPT-6.2 Astra' },
      { id: 'gpt-6.2-sol', label: 'GPT-6.2 Sol' },
      { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra' },
      { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
    ],
    validateKeyShape: (k) => basicKeyCheck(k, 'OpenAI', 'sk-'),
    load: () => import('./openai').then((m) => m.default),
  },
];
