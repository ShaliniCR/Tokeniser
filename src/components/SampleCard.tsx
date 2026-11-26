import type { TextSample } from '../data/samples';
import type { ProviderId } from '../providers/types';

export type SampleResult =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; tokens: number }
  | { status: 'error'; message: string };

export interface ResultRow {
  providerId: ProviderId;
  providerName: string;
  modelLabel: string;
  result: SampleResult;
}

interface Props {
  sample: TextSample;
  rows: ResultRow[];
  onRemove?: () => void;
}

export function SampleCard({ sample, rows, onRemove }: Props) {
  const chars = [...sample.text].length;

  return (
    <li className="card">
      <div className="card-head">
        <span className={`tag tag-${sample.kind.toLowerCase()}`}>{sample.kind}</span>
        <span className="meta">{chars.toLocaleString()} chars</span>
        {onRemove && (
          <button type="button" className="link-btn" onClick={onRemove} aria-label="Remove custom sample">
            Remove
          </button>
        )}
      </div>
      <pre className="sample-text">{sample.text}</pre>
      <div className="card-foot" aria-live="polite">
        {rows.length === 0 ? (
          <span className="badge badge-idle">Add an API key to count</span>
        ) : (
          <ul className="result-rows">
            {rows.map((row) => (
              <li key={row.providerId} className="result-row">
                <span className="result-provider" title={row.modelLabel}>
                  <span className={`dot dot-${row.providerId}`} aria-hidden="true" />
                  {row.providerName}
                </span>
                <TokenBadge result={row.result} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function TokenBadge({ result }: { result: SampleResult }) {
  switch (result.status) {
    case 'idle':
      return <span className="badge badge-idle">Not counted yet</span>;
    case 'loading':
      return (
        <span className="badge badge-loading">
          <span className="spinner" aria-hidden="true" /> Counting…
        </span>
      );
    case 'success':
      return (
        <span className="badge badge-success">
          <strong>{result.tokens.toLocaleString()}</strong> {result.tokens === 1 ? 'token' : 'tokens'}
        </span>
      );
    case 'error':
      return (
        <span className="badge badge-error" role="status">
          {result.message}
        </span>
      );
  }
}
