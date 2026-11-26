import { useId, useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  disabled: boolean;
  label: string;
  placeholder: string;
  apiHost: string;
  consoleUrl: string;
  consoleName: string;
  remembered: boolean;
}

export function ApiKeyInput({ value, onChange, error, disabled, label, placeholder, apiHost, consoleUrl, consoleName, remembered }: Props) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="key-row">
        <input
          id={id}
          className={`input ${error ? 'input-invalid' : ''}`}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            onChange('');
            setVisible(false);
          }}
          disabled={disabled || !value}
        >
          Clear
        </button>
      </div>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
      <p id={hintId} className="field-hint">
        Get a key from{' '}
        <a href={consoleUrl} target="_blank" rel="noreferrer">
          {consoleName}
        </a>
        . {remembered ? 'Saved in this browser' : 'Kept in memory only'} and sent only to <code>{apiHost}</code>.
      </p>
    </div>
  );
}
