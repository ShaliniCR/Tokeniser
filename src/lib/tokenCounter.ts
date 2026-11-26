import Anthropic from '@anthropic-ai/sdk';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
] as const;

export type ModelId = (typeof MODELS)[number]['id'];

/**
 * Builds a short-lived client for one counting run. The key lives only in this
 * closure and in React state; it is never persisted, logged, or put in a URL.
 *
 * `dangerouslyAllowBrowser` is required because this is a browser-only app where
 * each user brings their own key (see README → Security).
 */
export function createClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 2, // SDK retries 429 / 5xx / network errors with backoff
    timeout: 30_000,
  });
}

/** Calls POST /v1/messages/count_tokens for a single text sample. */
export async function countTokens(
  client: Anthropic,
  model: ModelId,
  text: string,
  signal?: AbortSignal,
): Promise<number> {
  const res = await client.messages.countTokens(
    { model, messages: [{ role: 'user', content: text }] },
    { signal },
  );
  return res.input_tokens;
}

export interface FriendlyError {
  message: string;
  /** Fatal errors apply to every request (bad key, no access) so the run should stop. */
  fatal: boolean;
}

/** Maps SDK errors to user-facing messages. Most specific classes first. */
export function toFriendlyError(err: unknown): FriendlyError {
  if (err instanceof Anthropic.APIUserAbortError) {
    return { message: 'Request cancelled.', fatal: false };
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return {
      message: 'Invalid API key. Check that you copied the full key from the Claude Console.',
      fatal: true,
    };
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return {
      message: 'This API key does not have permission to use the token counting API or this model.',
      fatal: true,
    };
  }
  if (err instanceof Anthropic.NotFoundError) {
    return { message: 'The selected model was not found for this key. Try another model.', fatal: true };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { message: 'Rate limit reached. Wait a moment and try again.', fatal: false };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { message: `Request rejected: ${apiMessage(err)}`, fatal: false };
  }
  if (err instanceof Anthropic.InternalServerError) {
    return { message: 'Anthropic API is having trouble right now. Please retry shortly.', fatal: false };
  }
  // Connection errors subclass APIError in the TS SDK, so check them first.
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return { message: 'The request timed out. Check your connection and retry.', fatal: false };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return {
      message: 'Could not reach the Anthropic API. Check your internet connection or browser extensions.',
      fatal: true,
    };
  }
  if (err instanceof Anthropic.APIError) {
    return { message: `API error (${err.status ?? 'unknown'}): ${apiMessage(err)}`, fatal: false };
  }
  return { message: 'Unexpected error. Please try again.', fatal: false };
}

function apiMessage(err: InstanceType<typeof Anthropic.APIError>): string {
  const body = err.error as { error?: { message?: string } } | undefined;
  return body?.error?.message ?? 'no details provided';
}

/** Light client-side sanity check before spending a request. */
export function validateKeyShape(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return 'Enter your Anthropic API key to continue.';
  if (/\s/.test(trimmed)) return 'API keys cannot contain spaces.';
  if (!trimmed.startsWith('sk-ant-')) return 'Anthropic API keys start with "sk-ant-".';
  if (trimmed.length < 20) return 'That key looks too short.';
  return null;
}
