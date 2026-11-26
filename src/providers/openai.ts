import OpenAI from 'openai';
import type { FriendlyError, ModelOption, ProviderImpl } from './types';

const impl: ProviderImpl = {
  createClient(apiKey) {
    // dangerouslyAllowBrowser: each user brings their own key (see README → Security).
    const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 30_000 });
    return {
      // POST /v1/responses/input_tokens
      async countTokens(model, text, signal) {
        const res = await client.responses.inputTokens.count({ model, input: text }, { signal });
        return res.input_tokens;
      },
      async listModels(signal) {
        const out: ModelOption[] = [];
        for await (const m of client.models.list({ signal })) {
          if (!/^(gpt-|o\d|chatgpt-)/.test(m.id)) continue;
          if (/(audio|realtime|tts|transcribe|image|search|embedding)/.test(m.id)) continue;
          out.push({ id: m.id, label: m.id });
        }
        return out.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
      },
    };
  },
  toFriendlyError,
};

export default impl;

/** Maps SDK errors to user-facing messages. Most specific classes first. */
function toFriendlyError(err: unknown): FriendlyError {
  if (err instanceof OpenAI.APIUserAbortError) return { message: 'Request cancelled.', fatal: false };
  if (err instanceof OpenAI.AuthenticationError) {
    return { message: 'Invalid OpenAI API key. Check that you copied the full key from the OpenAI dashboard.', fatal: true };
  }
  if (err instanceof OpenAI.PermissionDeniedError) {
    return { message: 'This OpenAI key does not have permission for this endpoint or model (check project permissions).', fatal: true };
  }
  if (err instanceof OpenAI.NotFoundError) {
    return { message: 'Model not found for this key. Try another model or click “Load models”.', fatal: true };
  }
  if (err instanceof OpenAI.RateLimitError) {
    const body = err.error as { code?: string } | undefined;
    return (body?.code ?? err.code) === 'insufficient_quota'
      ? { message: 'This OpenAI account has no remaining quota. Add billing credits in the dashboard.', fatal: true }
      : { message: 'Rate limit reached. Wait a moment and try again.', fatal: false };
  }
  if (err instanceof OpenAI.BadRequestError) {
    return { message: `Request rejected: ${apiMessage(err)}`, fatal: false };
  }
  if (err instanceof OpenAI.InternalServerError) {
    return { message: 'The OpenAI API is having trouble right now. Please retry shortly.', fatal: false };
  }
  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return { message: 'The request timed out. Check your connection and retry.', fatal: false };
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return { message: 'Could not reach the OpenAI API. Check your connection or browser extensions.', fatal: true };
  }
  if (err instanceof OpenAI.APIError) {
    return { message: `API error (${err.status ?? 'unknown'}): ${apiMessage(err)}`, fatal: false };
  }
  return { message: 'Unexpected error. Please try again.', fatal: false };
}

function apiMessage(err: InstanceType<typeof OpenAI.APIError>): string {
  const body = err.error as { message?: string } | undefined;
  return body?.message ?? 'no details provided';
}
