import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiKeyInput } from './components/ApiKeyInput';
import { SampleCard, type SampleResult } from './components/SampleCard';
import { PREDEFINED_SAMPLES, type TextSample } from './data/samples';
import {
  MODELS,
  countTokens,
  createClient,
  toFriendlyError,
  validateKeyShape,
  type ModelId,
} from './lib/tokenCounter';

const CONCURRENCY = 3;
const MAX_CUSTOM_CHARS = 20_000;

type Results = Record<string, SampleResult>;

export default function App() {
  // The API key lives only in React state (memory). No storage, no logging.
  const [apiKey, setApiKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [model, setModel] = useState<ModelId>(MODELS[0].id);
  const [customSamples, setCustomSamples] = useState<TextSample[]>([]);
  const [draft, setDraft] = useState('');
  const [results, setResults] = useState<Results>({});
  const [running, setRunning] = useState(false);
  const [banner, setBanner] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const samples = useMemo(() => [...PREDEFINED_SAMPLES, ...customSamples], [customSamples]);

  // Cancel in-flight requests if the component unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const total = useMemo(
    () =>
      samples.reduce((sum, s) => {
        const r = results[s.id];
        return r?.status === 'success' ? sum + r.tokens : sum;
      }, 0),
    [samples, results],
  );
  const countedCount = samples.filter((s) => results[s.id]?.status === 'success').length;

  function handleKeyChange(value: string) {
    setApiKey(value);
    if (keyError) setKeyError(null);
    if (banner?.type === 'error') setBanner(null);
  }

  function handleModelChange(value: ModelId) {
    setModel(value);
    setResults({}); // counts are model-specific
    setBanner(null);
  }

  function addCustomSample(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setCustomSamples((prev) => [...prev, { id: `custom-${crypto.randomUUID()}`, kind: 'Custom', text }]);
    setDraft('');
  }

  function removeCustomSample(id: string) {
    setCustomSamples((prev) => prev.filter((s) => s.id !== id));
    setResults(({ [id]: _removed, ...rest }) => rest);
  }

  async function handleCount() {
    const shapeError = validateKeyShape(apiKey);
    if (shapeError) {
      setKeyError(shapeError);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const client = createClient(apiKey.trim());
    setRunning(true);
    setBanner(null);
    setResults(Object.fromEntries(samples.map((s) => [s.id, { status: 'loading' } as SampleResult])));

    let fatal: string | null = null;
    let failures = 0;
    const queue = [...samples];

    const worker = async () => {
      while (queue.length && !controller.signal.aborted) {
        const sample = queue.shift()!;
        try {
          const tokens = await countTokens(client, model, sample.text, controller.signal);
          setResults((prev) => ({ ...prev, [sample.id]: { status: 'success', tokens } }));
        } catch (err) {
          if (controller.signal.aborted) break; // cancelled or stopped by a fatal error
          const friendly = toFriendlyError(err);
          failures++;
          setResults((prev) => ({ ...prev, [sample.id]: { status: 'error', message: friendly.message } }));
          if (friendly.fatal && !fatal) {
            fatal = friendly.message;
            controller.abort(); // stop the rest — every request would fail the same way
          }
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, samples.length) }, worker));

    if (abortRef.current !== controller) return; // superseded by a newer run

    // Anything still "loading" was skipped because of a fatal error or a cancel.
    setResults((prev) => {
      const next = { ...prev };
      for (const s of samples) {
        if (next[s.id]?.status === 'loading') {
          next[s.id] = fatal ? { status: 'error', message: 'Skipped' } : { status: 'idle' };
        }
      }
      return next;
    });

    if (fatal) {
      setBanner({ type: 'error', text: fatal });
      if (/api key/i.test(fatal)) setKeyError(fatal);
    } else if (controller.signal.aborted) {
      setBanner({ type: 'error', text: 'Counting cancelled.' });
    } else if (failures > 0) {
      setBanner({ type: 'error', text: `${failures} of ${samples.length} samples failed. See details below.` });
    } else {
      setBanner({ type: 'success', text: `Counted ${samples.length} samples with ${labelFor(model)}.` });
    }
    setRunning(false);
    abortRef.current = null;
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Token Counter</h1>
        <p className="subtitle">
          Count tokens for sample text with Anthropic’s official{' '}
          <a href="https://docs.anthropic.com/en/docs/build-with-claude/token-counting" target="_blank" rel="noreferrer">
            Token Counting API
          </a>
          .
        </p>
      </header>

      <main className="layout">
        <section className="panel controls" aria-labelledby="settings-heading">
          <h2 id="settings-heading" className="panel-title">
            Settings
          </h2>

          <ApiKeyInput value={apiKey} onChange={handleKeyChange} error={keyError} disabled={running} />

          <div className="field">
            <label htmlFor="model" className="field-label">
              Model
            </label>
            <select
              id="model"
              className="input"
              value={model}
              onChange={(e) => handleModelChange(e.target.value as ModelId)}
              disabled={running}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="field-hint">Token counts are model-specific.</p>
          </div>

          <div className="actions">
            {running ? (
              <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={handleCount}>
                Count Tokens
              </button>
            )}
          </div>

          {banner && (
            <div className={`banner banner-${banner.type}`} role={banner.type === 'error' ? 'alert' : 'status'}>
              {banner.text}
            </div>
          )}

          <div className="summary" aria-live="polite">
            <div>
              <span className="summary-value">{total.toLocaleString()}</span>
              <span className="summary-label">total tokens</span>
            </div>
            <div>
              <span className="summary-value">
                {countedCount}/{samples.length}
              </span>
              <span className="summary-label">samples counted</span>
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="samples-heading">
          <h2 id="samples-heading" className="panel-title">
            Text samples
          </h2>

          <ul className="cards">
            {samples.map((s) => (
              <SampleCard
                key={s.id}
                sample={s}
                result={results[s.id] ?? { status: 'idle' }}
                onRemove={s.kind === 'Custom' && !running ? () => removeCustomSample(s.id) : undefined}
              />
            ))}
          </ul>

          <form className="custom-form" onSubmit={addCustomSample}>
            <label htmlFor="custom" className="field-label">
              Add your own sample (optional)
            </label>
            <textarea
              id="custom"
              className="input textarea"
              rows={3}
              maxLength={MAX_CUSTOM_CHARS}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type or paste any text…"
              disabled={running}
            />
            <button type="submit" className="btn btn-secondary" disabled={running || !draft.trim()}>
              Add sample
            </button>
          </form>
        </section>
      </main>

      <footer className="footer">
        Your key is sent directly from your browser to <code>api.anthropic.com</code> and nowhere else.
      </footer>
    </div>
  );
}

function labelFor(id: ModelId) {
  return MODELS.find((m) => m.id === id)?.label ?? id;
}
