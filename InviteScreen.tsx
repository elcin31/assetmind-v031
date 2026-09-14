import { useState } from 'react';
import type { FormEvent } from 'react';

interface Props {
  onSubmit: (code: string) => void;
  loading: boolean;
  error: string | null;
}

export function InviteScreen({ onSubmit, loading, error }: Props) {
  const [code, setCode] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length >= 8) {
      onSubmit(trimmed);
    }
  };

  return (
    <>
      <header className="header" style={{ marginTop: 48 }}>
        <div>
          <h1>AssetMind</h1>
          <p className="header-sub">Risk-first portfolio intelligence</p>
        </div>
      </header>

      <div className="card" style={{ marginTop: 24 }}>
        <h2>Enter invite code</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="code">Invite code</label>
            <input
              id="code"
              className="input"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              minLength={8}
              maxLength={128}
              placeholder="am_…"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={loading}
            />
          </div>
          {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || code.trim().length < 8}
          >
            {loading ? 'Loading…' : 'Open portfolio'}
          </button>
        </form>
      </div>

      <p className="empty" style={{ marginTop: 24 }}>
        Access is by invite code only. No accounts required for the MVP.
      </p>
    </>
  );
}
