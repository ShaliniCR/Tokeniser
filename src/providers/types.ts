export type ProviderId = 'anthropic' | 'gemini' | 'openai';

export interface ModelOption {
  id: string;
  label: string;
}

export interface FriendlyError {
  message: string;
  /** Fatal errors apply to every request for that provider (bad key, no access), so its run stops. */
  fatal: boolean;
}

/** A client bound to one API key for the duration of a run. */
export interface ProviderClient {
  countTokens(model: string, text: string, signal?: AbortSignal): Promise<number>;
  listModels(signal?: AbortSignal): Promise<ModelOption[]>;
}

/** The SDK-backed half of a provider. Loaded lazily so each SDK is only downloaded when used. */
export interface ProviderImpl {
  createClient(apiKey: string): ProviderClient;
  toFriendlyError(err: unknown): FriendlyError;
}

/** Static, SDK-free description of a provider. */
export interface ProviderMeta {
  id: ProviderId;
  name: string;
  apiHost: string;
  docsUrl: string;
  keyLabel: string;
  keyPlaceholder: string;
  keyConsoleUrl: string;
  keyConsoleName: string;
  defaultModels: ModelOption[];
  validateKeyShape(key: string): string | null;
  load(): Promise<ProviderImpl>;
}
