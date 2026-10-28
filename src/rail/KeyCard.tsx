import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Sparkles } from 'lucide-react';
import type { RailEntry } from '../types/tree';
import { useAgent } from '../store/useAgent';
import { useUi } from '../store/useUi';
import { dismissKey, submitKey } from '../muse/cards';

/**
 * The key card (§2b of the deploy plan). It exists for exactly one moment:
 * the shared key is gone or out of budget, and the visitor can either paste
 * their own key — which retries the parked turn automatically — or keep
 * working by hand. It never offers "pretend an AI did this".
 */
export function KeyCard({ entry }: { entry: RailEntry }) {
  const data = entry.card!.data as { reason?: string; houseKey?: string };
  const [value, setValue] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const houseKey = useAgent((s) => s.houseKey);
  const setModal = useUi((s) => s.setModal);

  const submit = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await submitKey(entry.id, value);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="railcard key-card">
      <div className="railcard-head">
        <span className="spread">
          <KeyRound size={14} /> <strong>Add your Meta API key</strong>
        </span>
        <span className="railcard-sub mono">
          {houseKey === 'absent' ? 'no house key' : 'house key spent'}
        </span>
      </div>
      <p className="prose-agent" style={{ fontSize: 12.5 }}>
        {houseKey === 'absent'
          ? 'This server has no shared key configured, so the muse models are switched off.'
          : 'The shared demo key is out of budget for today. Your own key keeps the muse models running for you.'}
      </p>
      {data.reason && data.reason !== '' && (
        <p className="field-hint" style={{ marginTop: -2 }}>
          {data.reason.slice(0, 200)}
        </p>
      )}
      <div className="token-row">
        <input
          className="input"
          type={reveal ? 'text' : 'password'}
          placeholder="muse_…"
          autoComplete="off"
          spellCheck={false}
          value={value}
          aria-label="Your Meta API key"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
          style={{ fontFamily: 'var(--mw-font-mono)', fontSize: 11 }}
        />
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          aria-label={reveal ? 'Hide key' : 'Show key'}
          onClick={() => setReveal(!reveal)}
        >
          {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
      <p className="field-hint">
        Stored in this tab only (sessionStorage) and sent as a header to this app’s own
        proxy. It never enters the bundle, the project file or the export.
      </p>
      <div className="card-actions">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={!value.trim() || busy}
          onClick={() => void submit()}
        >
          <KeyRound size={12} /> {busy ? 'Adding…' : 'Add key'}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setModal('settingsOpen', true)}
        >
          Settings
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => dismissKey(entry.id, false)}
        >
          Keep working by hand
        </button>
      </div>
      <button
        type="button"
        className="btn btn-sm btn-ghost btn-block"
        style={{ justifyContent: 'flex-start' }}
        onClick={() => dismissKey(entry.id, true)}
      >
        <Sparkles size={12} /> Use the local engine (offline demo, no key, no cost)
      </button>
    </div>
  );
}
