import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiKeyInput } from './components/ApiKeyInput';
import { SampleCard, type ResultRow, type SampleResult } from './components/SampleCard';
import { PREDEFINED_SAMPLES, type TextSample } from './data/samples';
import { keyStore } from './lib/keyStore';
import { PROVIDERS } from './providers/registry';
import type { ModelOption, ProviderId, ProviderMeta } from './providers/types';

const CONCURRENCY_PER_PROVIDER = 3;
const MAX_CUSTOM_CHARS = 20_000;

type PerProvider<T> = Record<ProviderId, T>;
type Banner = { type: 'error' | 'success'; text: string } | null;
/** results[sampleId][providerId] */
type Results = Record<string, Partial<PerProvider<SampleResult>>>;

function perProvider<T>(make: (p: ProviderMeta) => T): PerProvider<T> {
  return Object.fromEntries(PROVIDERS.map((p) => [p.id, make(p)])) as PerProvider<T>;
}

export default function App() {
  // API keys live in React state (memory). They are written to localStorage only
  // if the user opts in with "Remember keys in this browser". Never logged.
  const [remember, setRemember] = useState(keyStore.isRemembering);
  const [keys, setKeys] = useState(() => {
    const saved = keyStore.isRemembering() ? keyStore.loadKeys() : {};
    return perProvider((p) => saved[p.id] ?? '');
  });
  const [keyErrors, setKeyErrors] = useState(() => perProvider<string | null>(() => null));
  const [models, setModels] = useState(() => {
    const saved = keyStore.loadModels();
    // A previously loaded model that isn't in the defaults is kept selectable.
    return perProvider<ModelOption[]>((p) => {
      const id = saved[p.id];
      return id && !p.defaultModels.some((m) => m.id === id) ? [{ id, label: id }, ...p.defaultModels] : p.defaultModels;
    });
  });
  const [selected, setSelected] = useState(() => {
    const saved = keyStore.loadModels();
    return perProvider((p) => saved[p.id] ?? p.defaultModels[0].id);
  });
  const [loadingModels, setLoadingModels] = useState(() => perProvider(() => false));
  const [banners, setBanners] = useState(() => perProvider<Banner>(() => null));
  const [globalBanner, setGlobalBanner] = useState<Banner>(null);
  const [customSamples, setCustomSamples] = useState<TextSample[]>([]);
  const [draft, setDraft] = useState('');
  const [results, setResults] = useState<Results>({});
  const [running, setRunning] = useState(false);
  const runRef = useRef<AbortController | null>(null);

  const samples = useMemo(() => [...PREDEFINED_SAMPLES, ...customSamples], [customSamples]);

  // Cancel in-flight requests if the component unmounts.
  useEffect(() => () => runRef.current?.abort(), []);

  // Persist keys only while "Remember" is on; turning it off deletes them from storage.
  useEffect(() => {
    if (remember) keyStore.saveKeys(keys);
    else keyStore.clearKeys();
  }, [remember, keys]);

  useEffect(() => keyStore.saveModels(selected), [selected]);

  function handleRememberChange(on: boolean) {
    setRemember(on);
    keyStore.setRemembering(on);
  }

  function handleForgetKeys() {
    keyStore.clearKeys();
    handleRememberChange(false);
    setKeys(perProvider(() => ''));
    setKeyErrors(perProvider(() => null));
  }

  const hasAnyKey = PROVIDERS.some((p) => keys[p.id].trim());

  /** Providers shown in results: those with a key entered, or with results already on screen. */
  const shownProviders = PROVIDERS.filter(
    (p) => keys[p.id].trim() || samples.some((s) => results[s.id]?.[p.id]),
  );

  const totals = useMemo(
    () =>
      perProvider((p) => {
        let tokens = 0;
        let counted = 0;
        for (const s of samples) {
          const r = results[s.id]?.[p.id];
          if (r?.status === 'success') {
            tokens += r.tokens;
            counted++;
          }
        }
        return { tokens, counted };
      }),
    [samples, results],
  );

  const modelLabel = (id: ProviderId) => models[id].find((m) => m.id === selected[id])?.label ?? selected[id];

  function patch<T>(setter: React.Dispatch<React.SetStateAction<PerProvider<T>>>, id: ProviderId, value: NoInfer<T>) {
    setter((prev) => ({ ...prev, [id]: value }));
  }

  function setResult(sampleId: string, id: ProviderId, r: SampleResult) {
    setResults((prev) => ({ ...prev, [sampleId]: { ...prev[sampleId], [id]: r } }));
  }

  function clearProviderResults(id: ProviderId) {
    setResults((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([sid, byProvider]) => {
          const { [id]: _removed, ...rest } = byProvider;
          return [sid, rest];
        }),
      ),
    );
  }

  function handleKeyChange(id: ProviderId, value: string) {
    patch(setKeys, id, value);
    if (keyErrors[id]) patch(setKeyErrors, id, null);
    if (banners[id]?.type === 'error') patch(setBanners, id, null);
    if (globalBanner?.type === 'error') setGlobalBanner(null);
  }

  function handleModelChange(id: ProviderId, value: string) {
    patch(setSelected, id, value);
    clearProviderResults(id); // counts are model-specific
    patch(setBanners, id, null);
  }

  function reportFatal(id: ProviderId, message: string) {
    patch(setBanners, id, { type: 'error', text: message });
    if (/api key/i.test(message)) patch(setKeyErrors, id, message);
  }

  async function handleLoadModels(p: ProviderMeta) {
    const shapeError = p.validateKeyShape(keys[p.id]);
    if (shapeError) {
      patch(setKeyErrors, p.id, shapeError);
      return;
    }
    patch(setLoadingModels, p.id, true);
    patch(setBanners, p.id, null);
    let impl;
    try {
      impl = await p.load();
      const live = await impl.createClient(keys[p.id].trim()).listModels();
      if (live.length === 0) {
        patch(setBanners, p.id, { type: 'error', text: 'No compatible models were returned for this key.' });
      } else {
        patch(setModels, p.id, live);
        if (!live.some((m) => m.id === selected[p.id])) handleModelChange(p.id, live[0].id);
        patch(setBanners, p.id, { type: 'success', text: `Loaded ${live.length} models available to your key.` });
      }
    } catch (err) {
      const friendly = impl ? impl.toFriendlyError(err) : { message: 'Could not load this provider. Check your connection.', fatal: true };
      if (friendly.fatal) reportFatal(p.id, friendly.message);
      else patch(setBanners, p.id, { type: 'error', text: friendly.message });
    } finally {
      patch(setLoadingModels, p.id, false);
    }
  }

  /** Counts every sample with one provider. Errors here never affect the other providers. */
  async function runProvider(p: ProviderMeta, list: TextSample[], run: AbortController): Promise<void> {
    const markRemaining = (r: SampleResult) =>
      setResults((prev) => {
        const next = { ...prev };
        for (const s of list) {
          if (next[s.id]?.[p.id]?.status === 'loading') next[s.id] = { ...next[s.id], [p.id]: r };
        }
        return next;
      });

    let impl;
    try {
      impl = await p.load();
    } catch {
      markRemaining({ status: 'error', message: 'Skipped' });
      reportFatal(p.id, `Could not load the ${p.name} SDK. Check your connection and retry.`);
      return;
    }

    const client = impl.createClient(keys[p.id].trim());
    const model = selected[p.id];
    const ctrl = new AbortController(); // aborted on a fatal error for this provider, or on Cancel
    const onCancel = () => ctrl.abort();
    run.signal.addEventListener('abort', onCancel);

    let fatal: string | null = null;
    let failures = 0;
    const queue = [...list];

    const worker = async () => {
      while (queue.length && !ctrl.signal.aborted) {
        const sample = queue.shift()!;
        try {
          const tokens = await client.countTokens(model, sample.text, ctrl.signal);
          setResult(sample.id, p.id, { status: 'success', tokens });
        } catch (err) {
          if (ctrl.signal.aborted) break;
          const friendly = impl.toFriendlyError(err);
          failures++;
          setResult(sample.id, p.id, { status: 'error', message: friendly.message });
          if (friendly.fatal && !fatal) {
            fatal = friendly.message;
            ctrl.abort(); // every remaining request for this provider would fail the same way
          }
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY_PER_PROVIDER, list.length) }, worker));
    run.signal.removeEventListener('abort', onCancel);
    if (runRef.current !== run) return; // superseded by a newer run

    markRemaining(fatal ? { status: 'error', message: 'Skipped' } : { status: 'idle' });
    if (fatal) reportFatal(p.id, fatal);
    else if (run.signal.aborted) return;
    else if (failures > 0) {
      patch(setBanners, p.id, { type: 'error', text: `${failures} of ${list.length} samples failed. See details below.` });
    } else {
      patch(setBanners, p.id, { type: 'success', text: `Counted ${list.length} samples with ${modelLabel(p.id)}.` });
    }
  }

  async function handleCount() {
    const active = PROVIDERS.filter((p) => keys[p.id].trim());
    if (active.length === 0) {
      setGlobalBanner({ type: 'error', text: 'Enter at least one API key (Anthropic, Gemini or OpenAI) to count tokens.' });
      return;
    }
    const shapeErrors = perProvider((p) => (keys[p.id].trim() ? p.validateKeyShape(keys[p.id]) : null));
    setKeyErrors(shapeErrors);
    if (active.some((p) => shapeErrors[p.id])) return;

    runRef.current?.abort();
    const run = new AbortController();
    runRef.current = run;

    const list = samples;
    setRunning(true);
    setGlobalBanner(null);
    setBanners(perProvider(() => null));
    setResults(
      Object.fromEntries(
        list.map((s) => [s.id, Object.fromEntries(active.map((p) => [p.id, { status: 'loading' } as SampleResult]))]),
      ),
    );

    await Promise.all(active.map((p) => runProvider(p, list, run)));

    if (runRef.current !== run) return;
    if (run.signal.aborted) setGlobalBanner({ type: 'error', text: 'Counting cancelled.' });
    setRunning(false);
    runRef.current = null;
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

  return (
    <div className="page">
      <header className="header">
        <h1>Token Counter</h1>
        <p className="subtitle">
          Compare token counts across Anthropic Claude, Google Gemini and OpenAI using each provider’s official
          token counting API. Add a key for any or all of them.
        </p>
      </header>

      <main className="layout">
        <section className="panel controls" aria-labelledby="settings-heading">
          <h2 id="settings-heading" className="panel-title">
            Providers
          </h2>

          <div className="remember">
            <label className="remember-label">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => handleRememberChange(e.target.checked)}
                disabled={running}
              />
              Remember keys in this browser
            </label>
            {(remember || hasAnyKey) && (
              <button type="button" className="link-btn" onClick={handleForgetKeys} disabled={running}>
                Forget saved keys
              </button>
            )}
            <p className="field-hint">
              {remember
                ? 'Keys are saved in this browser’s local storage so they survive reloads. Untick or click “Forget” to delete them. Avoid on shared computers.'
                : 'Off: keys are kept in memory only and cleared when you reload.'}
            </p>
          </div>

          {PROVIDERS.map((p) => {
            const busy = running || loadingModels[p.id];
            const banner = banners[p.id];
            return (
              <details key={p.id} className="provider" open>
                <summary className="provider-summary">
                  <span className={`dot dot-${p.id}`} aria-hidden="true" />
                  <span className="provider-name">{p.name}</span>
                  {keys[p.id].trim() ? (
                    <span className="pill pill-on">Key added</span>
                  ) : (
                    <span className="pill">No key</span>
                  )}
                </summary>

                <div className="provider-body">
                  <ApiKeyInput
                    value={keys[p.id]}
                    onChange={(v) => handleKeyChange(p.id, v)}
                    error={keyErrors[p.id]}
                    disabled={busy}
                    label={p.keyLabel}
                    placeholder={p.keyPlaceholder}
                    apiHost={p.apiHost}
                    consoleUrl={p.keyConsoleUrl}
                    consoleName={p.keyConsoleName}
                    remembered={remember}
                  />

                  <div className="field">
                    <label htmlFor={`model-${p.id}`} className="field-label">
                      Model
                    </label>
                    <div className="key-row">
                      <select
                        id={`model-${p.id}`}
                        className="input"
                        value={selected[p.id]}
                        onChange={(e) => handleModelChange(p.id, e.target.value)}
                        disabled={busy}
                      >
                        {models[p.id].map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleLoadModels(p)}
                        disabled={busy}
                      >
                        {loadingModels[p.id] ? 'Loading…' : 'Load models'}
                      </button>
                    </div>
                  </div>

                  {banner && (
                    <div className={`banner banner-${banner.type}`} role={banner.type === 'error' ? 'alert' : 'status'}>
                      {banner.text}
                    </div>
                  )}
                </div>
              </details>
            );
          })}

          <div className="actions">
            {running ? (
              <button type="button" className="btn btn-secondary" onClick={() => runRef.current?.abort()}>
                Cancel
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={handleCount}>
                Count Tokens
              </button>
            )}
          </div>

          {globalBanner && (
            <div className={`banner banner-${globalBanner.type}`} role="alert">
              {globalBanner.text}
            </div>
          )}

          {shownProviders.length > 0 && (
            <table className="summary-table" aria-live="polite">
              <caption className="field-label">Totals</caption>
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">Tokens</th>
                  <th scope="col">Counted</th>
                </tr>
              </thead>
              <tbody>
                {shownProviders.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">
                      <span className={`dot dot-${p.id}`} aria-hidden="true" />
                      <span>
                        {p.name}
                        <span className="summary-model">{modelLabel(p.id)}</span>
                      </span>
                    </th>
                    <td className="num">{totals[p.id].tokens.toLocaleString()}</td>
                    <td className="num">
                      {totals[p.id].counted}/{samples.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel" aria-labelledby="samples-heading">
          <h2 id="samples-heading" className="panel-title">
            Text samples
          </h2>

          <ul className="cards">
            {samples.map((s) => {
              const rows: ResultRow[] = shownProviders.map((p) => ({
                providerId: p.id,
                providerName: p.name,
                modelLabel: modelLabel(p.id),
                result: results[s.id]?.[p.id] ?? { status: 'idle' },
              }));
              return (
                <SampleCard
                  key={s.id}
                  sample={s}
                  rows={rows}
                  onRemove={s.kind === 'Custom' && !running ? () => removeCustomSample(s.id) : undefined}
                />
              );
            })}
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
        Each key is sent directly from your browser to its own provider (<code>api.anthropic.com</code>,{' '}
        <code>generativelanguage.googleapis.com</code>, <code>api.openai.com</code>) and nowhere else.
      </footer>
    </div>
  );
}
