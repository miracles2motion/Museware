import { useEffect, useState } from 'react';
import { Check, KeyRound, Loader2, X } from 'lucide-react';
import { Modal, Button } from '../../components/ui';
import { useUi } from '../../store/useUi';
import { useProject } from '../../store/useProject';
import { addScreenBatch } from '../../ops/screenOps';
import { useAgent } from '../../store/useAgent';
import { houseKeyLabel } from '../../muse/connection';
import { resolveStaleKeyCards } from '../../muse/cards';
import { fetchStatus } from '../../muse/client';
import { getSessionKey, setSessionKey } from '../../muse/sessionKey';
import { MEDIA_ROLES, TEXT_ROLES, probeTextRoles } from '../../muse/probe';

/**
 * First run (§9.1): one screen, no carousel. Paste a key, watch the real model
 * matrix answer for itself, then pick how you want to start. A red chip carries
 * the upstream's own words — that is the whole point of the probe.
 */

const ROLE_LABEL: Record<string, string> = {
  builder: 'Builder',
  architect: 'Architect',
  chat: 'Chat',
  image: 'Image',
  sam: 'SAM',
  voice: 'Voice',
};

export function OnboardingModal({ onClose }: { onClose: () => void }) {
  const setRoute = useUi((s) => s.setRoute);
  const setDraft = useUi((s) => s.setDraft);
  const toast = useUi((s) => s.toast);
  const models = useAgent((s) => s.models);
  const probes = useAgent((s) => s.probes);
  const probing = useAgent((s) => s.probing);
  const houseKey = useAgent((s) => s.houseKey);
  const statusError = useAgent((s) => s.statusError);
  const keySource = useAgent((s) => s.keySource);
  const [key, setKey] = useState(getSessionKey());
  const [note, setNote] = useState<string | null>(null);

  // No probe storm on open: App's boot already asked the proxy who it is. The
  // chips read that status, and pressing "Use this key" re-checks it.
  useEffect(() => {
    if (!note && statusError) setNote(statusError);
  }, [statusError, note]);

  const saveKey = async () => {
    const trimmed = key.trim();
    if (!trimmed) {
      setNote('Paste a key first — or start on the local engine below.');
      return;
    }
    setSessionKey(trimmed);
    setNote(null);
    try {
      const status = await fetchStatus();
      useAgent.getState().setStatus({
        configured: true,
        demoMode: false,
        models: status.models,
        keySource: status.source,
        houseKey: status.houseKey,
        houseKeyDetail: status.houseKeyDetail,
        statusError: null,
      });
      await probeTextRoles(status.models);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'The proxy did not answer.');
      return;
    }
  };

  const start = (prompt: string | null) => {
    onClose();
    setRoute('editor');
    if (prompt) {
      setDraft(prompt);
      toast('Type it, or send it as-is — blueprint first, always.', 'ok');
    }
  };

  return (
    <Modal
      title="Welcome to Museware"
      size="wide"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onClose();
              useAgent.getState().setStatus({
                configured: false,
                demoMode: true,
                keySource: 'none',
              });
              resolveStaleKeyCards('Local engine enabled — no API key needed.');
              setRoute('editor');
              toast('Local engine on — the real pipeline, no key, no credit.', 'ok');
            }}
          >
            Use the local engine
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (key.trim() && key.trim() !== getSessionKey()) {
                setSessionKey(key.trim());
                useAgent
                  .getState()
                  .setStatus({ configured: true, demoMode: false, keySource: 'session' });
                resolveStaleKeyCards('Session key added.');
                void saveKey();
              }
              start(null);
            }}
          >
            Start building
          </Button>
        </>
      }
    >
      {/* The modal already says "Welcome to Museware" in its header; naming the
          product twice before the first sentence is what pushed the key field
          below the fold on a phone. */}
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 'var(--mw-fs-22)', lineHeight: 1.25 }}>
          The canvas where Muse builds with you
        </h2>
        <p className="field-hint" style={{ margin: 0 }}>
          Your Meta API key is your account — no signup, no email. It stays in this tab,
          never in the bundle.{' '}
          {keySource === 'env' ? 'This server also has a house key you can use.' : ''}
        </p>
      </div>

      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">Your key</span>
        </div>
        <div className="key-row">
          <input
            className="input"
            type="password"
            value={key}
            placeholder="ms-… your Meta API key"
            aria-label="Meta API key"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveKey();
            }}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => void saveKey()}
            disabled={probing}
          >
            {probing ? 'Probing…' : 'Use this key'}
          </Button>
        </div>
        <p className="field-hint">
          One 1-token ping per text model, right now. Green means it answered; red shows the
          upstream's exact error.
        </p>
        {note && <p className="field-hint field-hint-warn">{note}</p>}

        <div className="probe-grid">
          {TEXT_ROLES.map((role) => {
            const model = models?.[role];
            const probe = model ? probes[model.id] : undefined;
            const source = keySource === 'session' || keySource === 'env';
            const tone = probe ? (probe.ok ? 'ok' : 'danger') : probing ? 'busy' : 'idle';
            return (
              <div className="probe-chip" data-tone={tone} key={role}>
                <span className="probe-head">
                  {tone === 'ok' && <Check size={13} />}
                  {tone === 'danger' && <X size={13} />}
                  {tone === 'busy' && <Loader2 size={13} className="spin" />}
                  {tone === 'idle' && <KeyRound size={13} />}
                  {ROLE_LABEL[role]}
                </span>
                <span className="probe-model mono">
                  {model?.id || (source ? '—' : 'no key yet')}
                </span>
                <span className="probe-detail">
                  {probe
                    ? probe.ok
                      ? `${probe.ms} ms`
                      : probe.detail || `failed${probe.status ? ` (${probe.status})` : ''}`
                    : probing
                      ? 'pinging…'
                      : houseKey !== 'ok' && houseKey !== 'unverified'
                        ? houseKeyLabel(houseKey)
                        : 'not probed yet'}
                </span>
              </div>
            );
          })}
        </div>
        <p className="field-hint">
          {MEDIA_ROLES.map((role) => ROLE_LABEL[role]).join(' · ')} bill per call, so they
          are never pinged behind your back — they prove themselves on first use.
        </p>
      </div>

      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">How you want to start</span>
        </div>
        <div className="steps-inline">
          <button
            type="button"
            className="how-card"
            onClick={() => start('Design me a landing page website for a small product.')}
          >
            <div>
              <strong>Start from blueprint</strong>
              <p className="field-hint">
                Muse proposes screens and the LOOK numbers. Nothing builds until you
                approve.
              </p>
            </div>
          </button>
          <button
            type="button"
            className="how-card"
            onClick={() => {
              onClose();
              setRoute('editor');
              toast(
                'Drop a screenshot into the composer — Muse rebuilds it as editable nodes.',
                'ok',
              );
            }}
          >
            <div>
              <strong>Recreate a screenshot</strong>
              <p className="field-hint">
                SAM finds the boxes, one batched pass writes the nodes, you fix anything by
                hand.
              </p>
            </div>
          </button>
          <button
            type="button"
            className="how-card"
            onClick={() => {
              const project = useProject.getState();
              if (!project.doc.screens.length) {
                const result = project.applyBatch(addScreenBatch(project.doc, 'Screen 1'), {
                  source: 'user',
                });
                if (result.errors.length) {
                  toast(result.errors[0].message, 'warn');
                  return;
                }
              }
              const screen = useProject.getState().doc.screens[0];
              if (screen) useUi.getState().setActiveScreen(screen.id);
              useUi.getState().setPropertiesOpen(true);
              onClose();
              setRoute('editor');
              toast('Choose a design preset in the screen inspector.', 'ok');
            }}
          >
            <div>
              <strong>Import a preset</strong>
              <p className="field-hint">
                iPhone 17 Pro Max or a Windows 11 Pro frame, in one tap.
              </p>
            </div>
          </button>
        </div>
      </div>
    </Modal>
  );
}
