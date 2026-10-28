import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { Modal, Button } from '../../components/ui';
import { useProject, createProject } from '../../store/useProject';
import { useUi } from '../../store/useUi';
import { useAgent } from '../../store/useAgent';
import { fetchStatus } from '../../muse/client';
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
  const themeFile = useRef<HTMLInputElement>(null);

  const refreshStatus = async () => {
    const agent = useAgent.getState();
    try {
      const status = await fetchStatus();
      agent.setStatus({
        configured: status.configured,
        demoMode: !status.configured && !hasSessionKey(),
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
                  : 'no key'}
          </span>
        </div>
        <p className="field-hint" style={{ marginTop: -2 }}>
          {keySource === 'session'
            ? 'Using your key (this tab only). It rides as a header to this app’s proxy and is gone when the tab closes.'
            : demoMode
              ? 'The local engine is on: the real pipeline, no model calls, no cost. Turn it off to use the muse models.'
              : configured
                ? 'Using the house key — the owner’s shared key on this server. Nothing about it reaches your browser.'
                : houseKey === 'exhausted'
                  ? 'The house key is out of budget today. Paste your own key below to keep the muse models running.'
                  : houseKey === 'absent'
                    ? 'This server has no shared key. Paste your own to switch the muse models on.'
                    : 'No key yet.'}
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
