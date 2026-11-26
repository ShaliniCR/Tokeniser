import { ApiError, GoogleGenAI } from '@google/genai';
import type { FriendlyError, ModelOption, ProviderImpl } from './types';

const impl: ProviderImpl = {
  createClient(apiKey) {
    const ai = new GoogleGenAI({ apiKey });
    return {
      // POST /v1beta/models/{model}:countTokens
      async countTokens(model, text, signal) {
        const res = await withRetry(
          () => ai.models.countTokens({ model, contents: text, config: { abortSignal: signal } }),
          signal,
        );
        return res.totalTokens ?? 0;
      },
      async listModels(signal) {
        const pager = await ai.models.list({ config: { pageSize: 100, abortSignal: signal } });
        const out: ModelOption[] = [];
        for await (const m of pager) {
          const id = m.name?.replace(/^models\//, '');
          if (!id?.startsWith('gemini') || !m.supportedActions?.includes('countTokens')) continue;
          out.push({ id, label: m.displayName ? `${m.displayName} (${id})` : id });
        }
        return out.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
      },
    };
  },
  toFriendlyError,
};

export default impl;

/** The Gemini SDK does not retry, so retry rate-limit / server errors here with backoff. */
async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal, retries = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof ApiError && (err.status === 429 || err.status >= 500);
      if (!retryable || attempt >= retries || signal?.aborted) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

function toFriendlyError(err: unknown): FriendlyError {
  if (err instanceof DOMException && err.name === 'AbortError') return { message: 'Request cancelled.', fatal: false };
  if (err instanceof ApiError) {
    const detail = err.message ?? '';
    // Gemini reports a bad key as 400 INVALID_ARGUMENT (reason API_KEY_INVALID), not 401.
    if (err.status === 401 || /API[_ ]KEY[_ ]INVALID|API key not valid|API key expired/i.test(detail)) {
      return { message: 'Invalid Gemini API key. Check that you copied the full key from Google AI Studio.', fatal: true };
    }
    switch (err.status) {
      case 403:
        return { message: 'This key cannot call the Gemini API (API disabled, key restricted, or region unavailable).', fatal: true };
      case 404:
        return { message: 'Model not found for this key. Try another model or click “Load models”.', fatal: true };
      case 429:
        return { message: 'Rate limit or quota reached. Wait a moment and try again.', fatal: false };
      case 400:
        return { message: `Request rejected: ${shorten(detail)}`, fatal: false };
    }
    if (err.status >= 500) {
      return { message: 'The Gemini API is having trouble right now. Please retry shortly.', fatal: false };
    }
    return { message: `API error (${err.status}): ${shorten(detail)}`, fatal: false };
  }
  if (err instanceof TypeError) {
    // fetch() rejects with TypeError on network / CORS failure.
    return { message: 'Could not reach the Gemini API. Check your connection or browser extensions.', fatal: true };
  }
  return { message: 'Unexpected error. Please try again.', fatal: false };
}

/** SDK messages embed the raw JSON body; pull out the human-readable part. */
function shorten(detail: string): string {
  const m = detail.match(/"message"\s*:\s*"([^"]+)"/);
  return (m?.[1] ?? detail).slice(0, 200) || 'no details provided';
}
