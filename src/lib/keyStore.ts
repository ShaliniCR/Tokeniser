import { PROVIDERS } from '../providers/registry';
import type { ProviderId } from '../providers/types';

/**
 * Opt-in persistence for API keys and model choices in this browser's localStorage.
 *
 * Keys are only written when the user ticks "Remember keys in this browser".
 * Unticking it (or "Forget saved keys") deletes them. Every access is wrapped
 * in try/catch because storage can be unavailable (private mode, blocked site
 * data), in which case the app silently falls back to in-memory only.
 */
const REMEMBER = 'tokeniser.remember.v1';
const KEYS = 'tokeniser.keys.v1';
const MODELS = 'tokeniser.models.v1';

const ids = new Set<string>(PROVIDERS.map((p) => p.id));

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: keep working in memory only */
  }
}

/** Parses a stored { providerId: string } map, ignoring anything malformed. */
function readMap(key: string): Partial<Record<ProviderId, string>> {
  try {
    const parsed: unknown = JSON.parse(read(key) ?? '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([k, v]) => ids.has(k) && typeof v === 'string'),
    ) as Partial<Record<ProviderId, string>>;
  } catch {
    return {};
  }
}

export const keyStore = {
  isRemembering: () => read(REMEMBER) === '1',
  setRemembering: (on: boolean) => write(REMEMBER, on ? '1' : null),
  loadKeys: () => readMap(KEYS),
  saveKeys: (keys: Record<ProviderId, string>) => {
    const nonEmpty = Object.fromEntries(Object.entries(keys).filter(([, v]) => v.trim()));
    write(KEYS, Object.keys(nonEmpty).length ? JSON.stringify(nonEmpty) : null);
  },
  clearKeys: () => write(KEYS, null),
  /** Model choices aren't secret, so they are always remembered. */
  loadModels: () => readMap(MODELS),
  saveModels: (models: Record<ProviderId, string>) => write(MODELS, JSON.stringify(models)),
};
