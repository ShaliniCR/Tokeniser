import Anthropic from '@anthropic-ai/sdk';
import type { FriendlyError, ProviderImpl } from './types';

const impl: ProviderImpl = {
  createClient(apiKey) {
    // dangerouslyAllowBrowser: each user brings their own key (see README → Security).
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 30_000 });
    return {
      // POST /v1/messages/count_tokens
      async countTokens(model, text, signal) {
        const res = await client.messages.countTokens(
          { model, messages: [{ role: 'user', content: text }] },
          { signal },
        );
        return res.input_tokens;
      },
      async listModels(signal) {
        const out = [];
        for await (const m of client.models.list({ limit: 100 }, { signal })) {
          if (m.id.startsWith('claude-')) out.push({ id: m.id, label: m.display_name || m.id });
        }
        return out;
      },
    };
  },
  toFriendlyError,
};

export default impl;

/** Maps SDK errors to user-facing messages. Most specific classes first. */
function toFriendlyError(err: unknown): FriendlyError {
  if (err instanceof Anthropic.APIUserAbortError) return { message: 'Request cancelled.', fatal: false };
  if (err instanceof Anthropic.AuthenticationError) {
    return { message: 'Invalid Anthropic API key. Check that you copied the full key from the Claude Console.', fatal: true };
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return { message: 'This Anthropic key does not have permission for this endpoint or model.', fatal: true };
  }
  if (err instanceof Anthropic.NotFoundError) {
    return { message: 'Model not found for this key. Try another model or click “Load models”.', fatal: true };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { message: 'Rate limit reached. Wait a moment and try again.', fatal: false };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { message: `Request rejected: ${apiMessage(err)}`, fatal: false };
  }
  if (err instanceof Anthropic.InternalServerError) {
    return { message: 'The Anthropic API is having trouble right now. Please retry shortly.', fatal: false };
  }
  // Connection errors subclass APIError in the TS SDK, so check them first.
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return { message: 'The request timed out. Check your connection and retry.', fatal: false };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { message: 'Could not reach the Anthropic API. Check your connection or browser extensions.', fatal: true };
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
