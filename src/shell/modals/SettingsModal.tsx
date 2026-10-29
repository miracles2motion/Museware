import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { Modal, Button } from '../../components/ui';
import { useProject, createProject } from '../../store/useProject';
import { useUi } from '../../store/useUi';
import { useAgent } from '../../store/useAgent';
import { fetchStatus, testKey, type KeyTest } from '../../muse/client';
import { houseKeyLabel, houseKeySentence } from '../../muse/connection';
import { probeTextRoles } from '../../muse/probe';
import { getSessionKey, setSessionKey, hasSessionKey } from '../../muse/sessionKey';
import { wipeProject, readThemeFile } from '../../persist/save';
import { PRESETS } from '../../design/presets';
import type { DesignTokens } from '../../types/tokens';

const ROLE_ORDER: Array<
  'builder' | 'architect' | 'chat' | 'contributor' | 'image' | 'sam' | 'voice'
> = ['builder', 'architect', 'chat', 'contributor', 'image', 'sam', 'voice'];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const applyBatch = useProject((s) => s.applyBatch);
  const replaceDoc = useProject((s) => s.replaceDoc);
  const setActivePreset = useUi((s) => s.setActivePreset);
  const activePreset = useUi((s) => s.activePreset);
  const toast = useUi((s) => s.toast);
  const configured = useAgent((s) => s.configured);
  const demoMode = useAgent((s) => s.demoMode);
  const keySource = useAgent((s) => s.keySource);
  const houseKey = useAgent((s) => s.houseKey);
  const budget = useAgent((s) => s.budget);
  const models = useAgent((s) => s.models);
  const probes = useAgent((s) => s.probes);
  const probing = useAgent((s) => s.probing);
  const statusError = useAgent((s) => s.statusError);
  const wonder = useAgent((s) => s.wonder);
  const contributorMode = useAgent((s) => s.contributorMode);
  const [key, setKey] = useState(getSessionKey());
  const [reveal, setReveal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verdict, setVerdict] = useState<KeyTest | null>(null);
  const houseKeyDetail = useAgent((s) => s.houseKeyDetail);
  const themeFile = useRef<HTMLInputElement>(null);

  const refreshStatus = async () => {
    const agent = useAgent.getState();
    try {
      const status = await fetchStatus();
      // Everything the status endpoint knows, not just the models: pressing
      // "Re-check" used to leave a stale "no shared key" on screen forever.
      const houseOk = status.houseKey === 'ok' || status.houseKey === 'unverified';
      agent.setStatus({
        configured: hasSessionKey() || (houseOk && status.configured),
        demoMode: !status.configured && !hasSessionKey(),
        houseKey: status.houseKey,
        houseKeyDetail: status.houseKeyDetail ?? null,
        budget: status.budget ?? null,
        live: Boolean(status.live),
        models: {
          builder: status.models.builder,
          architect: status.models.architect,
          chat: status.models.chat,
          contributor: status.models.contributor,
          image: status.models.image,
          sam: status.models.sam,
          voice: status.models.voice,
        },
        keySource: status.source,
        statusError: null,
      });
      return true;
    } catch (err) {
      agent.setStatus({
        configured: hasSessionKey(),
        demoMode: !hasSessionKey(),
        keySource: hasSessionKey() ? 'session' : 'none',
        statusError: err instanceof Error ? err.message : 'The proxy is not reachable.',
      });
      return false;
    }
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  const runProbes = async () => {
    if (!models) return;
    // Text roles only: image, SAM and voice bill per call, so pinging them here
    // would spend the visitor's money to learn something we do not need.
    await probeTextRoles(models);
    toast('Probes finished — red is honest, not scary.', 'ok');
  };

  const applyPreset = (tokens: DesignTokens, id: string) => {
    const res = applyBatch(
      [{ op: 'setTokens', patch: { ...tokens.openuiTheme, title: tokens.title } }],
      { source: 'user' },
    );
    if (res.errors.length) {
      toast(res.errors[0].message, 'warn');
      return;
    }
    setActivePreset(id);
    toast(`${tokens.title} applied to every screen`, 'ok');
  };

  return (
    <Modal
      title="Settings & models"
      size="wide"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={async () => {
              setSessionKey(key.trim());
              const ok = await refreshStatus();
              toast(
                ok
                  ? key.trim()
                    ? 'Key stored for this tab — the muse models are live.'
                    : 'Session key cleared.'
                  : 'Key saved, but the proxy did not answer.',
                ok ? 'ok' : 'warn',
              );
            }}
          >
            <KeyRound size={13} /> Save key
          </Button>
        </>
      }
    >
      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">Your key</span>
          <span className="chip chip-static" style={{ fontSize: 10 }}>
            {keySource === 'session'
              ? 'using your key'
              : demoMode
                ? 'local engine'
                : configured
                  ? 'using the house key'
                  : houseKeyLabel(houseKey)}
          </span>
        </div>
        <p className="field-hint" style={{ marginTop: -2 }}>
          {keySource === 'session'
            ? 'Using your key (this tab only). It rides as a header to this app’s proxy and is gone when the tab closes.'
            : demoMode
              ? 'The local engine is on: the real pipeline, no model calls, no cost. Turn it off to use the muse models.'
              : configured
                ? 'Using the house key — the owner’s shared key on this server. Nothing about it reaches your browser.'
                : houseKeySentence(houseKey, houseKeyDetail)}
          {budget?.capUsd
            ? ` House budget today: $${budget.spentUsd.toFixed(3)} of $${budget.capUsd}.`
            : ''}
        </p>
        <div className="token-row">
          <input
            className="input"
            type={reveal ? 'text' : 'password'}
            placeholder="muse_… (stored in sessionStorage, never in the bundle)"
            value={key}
            autoComplete="off"
            onChange={(e) => setKey(e.target.value)}
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
        <div className="token-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button
            size="sm"
            variant="ghost"
            disabled={testing}
            onClick={async () => {
              setTesting(true);
              try {
                const result = await testKey(key);
                setVerdict(result);
                if (result.ok) {
                  toast('That key works — Muse answered.', 'ok');
                }
              } finally {
                setTesting(false);
              }
            }}
          >
            <KeyRound size={12} /> {testing ? 'Asking Meta…' : 'Test this key'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={testing}
            onClick={async () => {
              setTesting(true);
              try {
                const result = await testKey();
                setVerdict(result);
                await refreshStatus();
              } finally {
                setTesting(false);
              }
            }}
          >
            <RefreshCw size={12} /> Test the server key
          </Button>
        </div>
        {verdict && (
          <div
            className="proxy-problem"
            role="status"
            data-tone={verdict.ok ? 'ok' : 'warn'}
          >
            <strong>
              {verdict.ok
                ? 'Meta accepted the key'
                : `Meta did not accept it${verdict.status ? ` (HTTP ${verdict.status})` : ''}`}
            </strong>
            <p className="field-hint">
              {verdict.ok
                ? `A real 1-token call through ${verdict.model || 'the pinned chat model'} answered in ${
                    verdict.ms ?? 0
                  } ms, using the ${verdict.source === 'user' ? 'key you pasted' : 'server key'}.`
                : verdict.detail || 'No detail came back.'}
            </p>
            {!verdict.ok && verdict.status === 401 && (
              <p className="field-hint">
                A 401 means the key itself was refused — wrong value, revoked, or a missing{' '}
                <span className="mono">Authorization</span> header upstream.
              </p>
            )}
            {!verdict.ok && verdict.status === 402 && (
              <p className="field-hint">
                A 402 means the key is valid but has no credit or budget left.
              </p>
            )}
            {!verdict.ok && verdict.status === 429 && (
              <p className="field-hint">
                A 429 means throttling, not a bad key — wait and try again.
              </p>
            )}
          </div>
        )}
        <p className="field-hint">
          Dev uses the Vite proxy at <span className="mono">/api/muse</span>; production
          ships one serverless file. The browser bundle never contains the key — CI greps
          the dist for it.
        </p>
        {statusError ? (
          <div className="proxy-problem" role="status">
            <strong>/api/muse is not answering.</strong>
            <p className="field-hint field-hint-warn">{statusError}</p>
            <p className="field-hint">
              On Vercel that means the <span className="mono">api/</span> folder did not
              deploy, <span className="mono">/api/*</span> is being rewritten to the app
              shell, or an env var was added without redeploying. Open{' '}
              <span className="mono">/api/muse/status</span> on this domain: JSON means the
              proxy is alive, HTML or 404 means it is not.
            </p>
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {keySource === 'session' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                setSessionKey('');
                setKey('');
                await refreshStatus();
                toast(
                  houseKey === 'ok'
                    ? 'Your key removed — back on the house key.'
                    : 'Your key removed. Paste another, or keep building by hand.',
                  'ok',
                );
              }}
            >
              Remove my key
            </Button>
          )}
          <Button
            size="sm"
            variant={demoMode ? 'secondary' : 'ghost'}
            onClick={() => {
              const next = !demoMode;
              useAgent.getState().setStatus({
                demoMode: next,
                configured: next ? false : configured,
              });
              toast(
                next
                  ? 'Local engine on — same pipeline, no model calls.'
                  : 'Local engine off — the muse models take over.',
                'ok',
              );
            }}
          >
            <Sparkles size={12} /> {demoMode ? 'Local engine: on' : 'Try the local engine'}
          </Button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" onClick={() => void refreshStatus()}>
            <RefreshCw size={12} /> Re-check status
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={probing || !configured}
            onClick={() => void runProbes()}
          >
            {probing ? 'Probing…' : 'Probe the text models'}
          </Button>
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">Wonder mode</span>
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={wonder}
            onChange={(e) => {
              useAgent.getState().setWonder(e.target.checked);
              toast(
                e.target.checked
                  ? 'Wonder mode on — planning rounds run on muse-wonder-1.0 (4x price).'
                  : 'Wonder mode off — planning rounds run on the builder model.',
                'ok',
              );
            }}
          />
          <span>
            Plan with the architect model (muse-wonder-1.0). Opt-in: one planning round and
            the final verify cost roughly 4x the builder. Routine edits never switch models.
          </span>
        </label>
        <p className="field-hint">
          Costs nothing while off. The role&apos;s pinned model never changes — Wonder mode
          only lets the architect role do the thinking it is pinned for.
        </p>
      </div>

      {import.meta.env.DEV && (
        <div className="insp-section">
          <div className="insp-section-head">
            <span className="eyebrow">Dev only · contributor tier</span>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={contributorMode}
              onChange={(e) => {
                useAgent.getState().setContributorMode(e.target.checked);
                toast(
                  e.target.checked
                    ? 'Contributor tier on — 20x cheaper. Any project it touches is marked and the demo refuses to export it.'
                    : 'Contributor tier off — back on the standard models.',
                  e.target.checked ? 'warn' : 'ok',
                );
              }}
            />
            <span>
              muse-spark-1.3-contributor ($0.10 / $1M). Testing and development only.
            </span>
          </label>
          <p className="field-hint">
            Legal, not just technical: contributor outputs carry a training-consent tradeoff
            and Meta&apos;s Geographic Use Policy. This switch does not exist in a
            production build, and a project it touched cannot be exported from one.
          </p>
        </div>
      )}

      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">One pinned model per role</span>
        </div>
        <table className="receipt-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Model</th>
              <th>Effort</th>
              <th>Probe</th>
            </tr>
          </thead>
          <tbody>
            {ROLE_ORDER.map((role) => {
              const model = models?.[role];
              const probe = model ? probes[model.id] : undefined;
              return (
                <tr key={role}>
                  <td>{role}</td>
                  <td className="num mono">{model?.id || '—'}</td>
                  <td>{model?.effort || '—'}</td>
                  <td>
                    {probe ? (
                      <span
                        className="chip chip-static"
                        data-tone={probe.ok ? 'ok' : 'danger'}
                        title={probe.detail || `${probe.ms} ms`}
                        style={{ fontSize: 10 }}
                      >
                        {probe.ok ? `ok · ${probe.ms}ms` : probe.detail || 'failed'}
                      </span>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="field-hint">
          No routing, no fallbacks — a pinned model is the contract. A red probe shows the
          verbatim reason instead of pretending.
        </p>
      </div>

      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">Design presets</span>
          <Button size="sm" variant="ghost" onClick={() => themeFile.current?.click()}>
            Import tokens…
          </Button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className="preset-card"
              data-selected={activePreset === preset.id}
              onClick={() => applyPreset(preset.tokens, preset.id)}
              style={{ width: 200 }}
            >
              <span className="preset-swatches">
                <i style={{ background: preset.tokens.openuiTheme.brand_color }} />
                <i style={{ background: preset.tokens.openuiTheme.secondary_color }} />
                <i
                  style={{ background: preset.tokens.openuiTheme.light_colors.openui_bg }}
                />
              </span>
              <strong>{preset.name}</strong>
              <span className="field-hint">{preset.blurb}</span>
            </button>
          ))}
        </div>
        <input
          ref={themeFile}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const incoming = await readThemeFile(file);
              const tokens = incoming as DesignTokens;
              if (!tokens?.openuiTheme)
                throw new Error('That file has no openuiTheme block.');
              applyPreset(tokens, 'imported');
            } catch (err) {
              toast(
                err instanceof Error ? err.message : 'Could not read that theme',
                'danger',
              );
            }
          }}
        />
      </div>

      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">Screen sizes</span>
        </div>
        <p className="field-hint">
          One responsive screen, previewed at three widths: compact 390, medium 768,
          expanded 1280. The canvas always lays the frame out at its true width and shrinks
          only what you see, so a 1280 layout on a phone is a real miniature rather than a
          different design — the chrome shows the scale.
        </p>
        <p className="field-hint">
          Phones go down to 320 px, and that is the floor. Watch screens are out of scope,
          not silently broken: a wrist UI is a different paradigm — glances, no scrolling —
          and Wear OS has no browser to run an exported PWA in.
        </p>
      </div>

      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">This browser</span>
        </div>
        <p className="field-hint">
          The project autosaves to IndexedDB after every op. Wiping is permanent — export
          first if you want a copy.
        </p>
        <Button
          size="sm"
          variant="danger"
          onClick={async () => {
            await wipeProject();
            replaceDoc(createProject());
            setActivePreset(null);
            toast('Local project wiped', 'ok');
            onClose();
          }}
        >
          <Trash2 size={12} /> Wipe the local project
        </Button>
      </div>
    </Modal>
  );
}
