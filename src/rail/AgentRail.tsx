import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Mic,
  Send,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { useAgent } from '../store/useAgent';
import { runAgentTurn, stopAgent } from '../muse/loop';
import { recreateFromScreenshot } from '../muse/screenshot';
import { generateHeroImage } from '../muse/cards';
import { transcribe } from '../muse/client';
import { RailCard } from './RailCard';
import type { RailEntry } from '../types/tree';

const CALL_CAP = 24;
const VISIBLE = 100;

function money(cents: number): string {
  if (!cents) return '$0.00';
  return `$${(cents / 100).toFixed(cents < 10 ? 3 : 2)}`;
}

function Ring({ value, cap }: { value: number; cap: number }) {
  const pct = Math.min(1, value / cap);
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      aria-label={`${value} of ${cap} calls this turn`}
      role="img"
    >
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="var(--mw-border)"
        strokeWidth="2.5"
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="var(--mw-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${circumference * pct} ${circumference}`}
        transform="rotate(-90 12 12)"
        style={{ transition: 'stroke-dasharray 200ms ease-out' }}
      />
    </svg>
  );
}

function RailMessage({ entry, fresh }: { entry: RailEntry; fresh: boolean }) {
  if (entry.role === 'card') return <RailCard entry={entry} />;
  if (entry.role === 'system') return <div className="sys-pill">{entry.text}</div>;
  if (entry.role === 'user')
    return (
      <div className="rail-msg user">
        <div className="bubble-user">{entry.text}</div>
      </div>
    );
  return (
    <div className="rail-msg">
      <div className="prose-agent" data-fresh={fresh || undefined}>
        {entry.text}
        {entry.reasoningReplayed && (
          <span className="chip" aria-label="Reasoning replayed">
            reasoning replayed
          </span>
        )}
      </div>
    </div>
  );
}

export function AgentRail() {
  const rail = useProject((s) => s.doc.rail);
  const doc = useProject((s) => s.doc);
  const setDraft = useUi((s) => s.setDraft);
  const draft = useUi((s) => s.draft);
  const railCollapsed = useUi((s) => s.railCollapsed);
  const toggleRail = useUi((s) => s.toggleRail);
  const selectedId = useUi((s) => s.selectedId);
  const toast = useUi((s) => s.toast);
  const mobileRailOpen = useUi((s) => s.mobileRailOpen);
  const setMobileRail = useUi((s) => s.setMobileRail);
  const setModal = useUi((s) => s.setModal);
  const busy = useAgent((s) => s.busy);
  const liveLine = useAgent((s) => s.liveLine);
  const liveText = useAgent((s) => s.liveText);
  const turnCalls = useAgent((s) => s.turnCalls);
  const sessionCents = useAgent((s) => s.sessionCents);
  const modelMatrix = useAgent((s) => s.models);
  const demoMode = useAgent((s) => s.demoMode);
  const configured = useAgent((s) => s.configured);
  const progress = useAgent((s) => s.progress);
  const wonder = useAgent((s) => s.wonder);
  const setWonder = useAgent((s) => s.setWonder);
  const receipts = useAgent((s) => s.receipts);
  const preview = useAgent((s) => s.screenshotPreview);
  const [filter, setFilter] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [showAll, setShowAll] = useState(false);
  const [recording, setRecording] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stickToBottom = useRef(true);

  const visible = showAll ? rail : rail.slice(-VISIBLE);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [rail.length, liveText, liveLine, busy]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const heroId = (() => {
    for (const screen of doc.screens) {
      const stack = [screen.root];
      while (stack.length) {
        const node = stack.pop()!;
        if (node.type === 'hero') return node.id;
        stack.push(...node.children);
      }
    }
    return '';
  })();

  const suggestions = (() => {
    const base = (() => {
      if (!doc.screens.length)
        return ['Design me a landing page website', 'Recreate a screenshot'];
      if (selectedId) return [`Restyle ${selectedId}`, 'Make it feel more premium'];
      if (!doc.blueprint) return ['Propose a blueprint', 'Add a settings screen'];
      if (!doc.blueprint.decided) return ['Approve the blueprint', 'Adjust the plan'];
      return ['Add a settings screen', 'Rerun the review'];
    })();
    // One tap to a real muse-image asset, only where a hero exists to fill.
    if (heroId && doc.screens.length) return [...base.slice(0, 1), 'Illustrate the hero'];
    return base;
  })();

  const send = async (text?: string) => {
    const value = (text ?? draft).trim();
    if (!value) return;
    if (useAgent.getState().busy) {
      toast('muse is already working — Stop first.', 'warn');
      return;
    }
    if (text === undefined) setDraft('');
    useProject.getState().addRail({ role: 'user', text: value });
    stickToBottom.current = true;
    await runAgentTurn(value);
  };

  const startRecording = async () => {
    if (recording) return;
    if (!configured) {
      toast('Voice input needs a muse key — add one in Settings.', 'warn');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (!blob.size) return;
        toast('Transcribing…');
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          const text = await transcribe(base64, blob.type || 'audio/webm');
          if (text.trim())
            setDraft(
              `${useUi.getState().draft}${useUi.getState().draft ? ' ' : ''}${text.trim()}`,
            );
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Transcription failed', 'danger');
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast('No microphone permission — voice stays off.', 'warn');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  };

  // Touch presses and holds; a mouse clicks to start and clicks again to stop.
  const coarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  if (railCollapsed) {
    return (
      <aside className="rail" data-collapsed="true">
        <div className="rail-collapsed">
          <button
            type="button"
            className="icon-btn"
            aria-label="Open muse rail"
            onClick={toggleRail}
          >
            <ChevronLeft size={16} />
          </button>
          <Sparkles size={16} style={{ color: 'var(--mw-accent)' }} />
          <span className="eyebrow" style={{ writingMode: 'vertical-rl' }}>
            muse
          </span>
          {busy && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Stop"
              onClick={() => stopAgent()}
            >
              <Square size={14} />
            </button>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className="rail" data-busy={busy || undefined} data-open={mobileRailOpen}>
      <button type="button" className="rail-peek" onClick={() => setMobileRail(true)}>
        <Sparkles size={14} style={{ color: 'var(--mw-accent)' }} />
        <span style={{ flex: 1, textAlign: 'left' }}>
          {busy ? liveLine || 'muse is working…' : 'Talk to muse — swipe up'}
        </span>
        {busy && (
          <span
            className="chip"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              stopAgent();
            }}
            onKeyDown={(e) => e.key === 'Enter' && stopAgent()}
          >
            Stop
          </span>
        )}
      </button>
      <div className="rail-header">
        <Sparkles size={15} style={{ color: 'var(--mw-accent)' }} />
        <div className="title-row">
          <strong>muse</strong>
          <span>
            <button
              type="button"
              className="link-btn"
              data-tip="One pinned model per role — tap for the matrix"
              onClick={() => setModal('settingsOpen', true)}
            >
              {demoMode
                ? 'local engine'
                : `${(modelMatrix?.builder.id || 'muse-spark-1.3').replace('muse-', '')} · ${
                    modelMatrix?.builder.effort || 'med'
                  }`}
            </button>
            {' · '}
            {money(sessionCents)}
          </span>
        </div>
        <Ring value={turnCalls} cap={CALL_CAP} />
        {busy ? (
          <button type="button" className="stop-btn" onClick={() => stopAgent()}>
            <Square size={12} /> Stop
          </button>
        ) : (
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            aria-label="Collapse rail"
            onClick={() => {
              if (mobileRailOpen) {
                setMobileRail(false);
                return;
              }
              toggleRail();
            }}
          >
            {mobileRailOpen ? <X size={15} /> : <ChevronRight size={15} />}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '4px 8px' }}>
        <button
          type="button"
          className="chip"
          aria-pressed={wonder}
          onClick={() => setWonder(!wonder)}
        >
          Wonder {wonder ? '· 4x cost' : '· off'}
        </button>
        {['Wonder', 'Spark', 'Image', 'SAM', 'Voice'].map((model) => (
          <button
            key={model}
            type="button"
            className="chip"
            aria-pressed={filter === model}
            data-selected={filter === model}
            onClick={() => setFilter(filter === model ? null : model)}
          >
            {model}
            {receipts.some(
              (r) =>
                r.model.toLowerCase().includes(model.toLowerCase()) ||
                r.role.toLowerCase() === model.toLowerCase(),
            )
              ? ' ●'
              : ''}
          </button>
        ))}
      </div>
      {filter && (
        <div style={{ padding: '4px 8px' }} aria-label={`${filter} calls`}>
          {receipts
            .filter(
              (r) =>
                r.model.toLowerCase().includes(filter.toLowerCase()) ||
                r.role.toLowerCase() === filter.toLowerCase(),
            )
            .map((r) => (
              <div className="sys-pill" key={r.id}>
                {r.model} · {r.status || 'success'} · {r.latencyMs}ms
              </div>
            ))}
        </div>
      )}
      {preview && (
        <div style={{ position: 'relative', margin: '8px', maxWidth: 260 }}>
          <img
            src={preview.image}
            alt="Screenshot segmented by SAM"
            style={{ width: '100%', display: 'block' }}
            onLoad={(e) =>
              setImageSize({
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
          />
          <svg
            viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
            preserveAspectRatio="none"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            {preview.boxes.map((item, i) => (
              <rect
                key={i}
                x={item.box[0]}
                y={item.box[1]}
                width={item.box[2]}
                height={item.box[3]}
                fill="none"
                stroke="var(--mw-accent)"
                strokeWidth={Math.max(1, imageSize.width / 400)}
              />
            ))}
          </svg>
        </div>
      )}
      <div className="rail-body" ref={bodyRef}>
        {rail.length > VISIBLE && !showAll && (
          <button
            type="button"
            className="chip"
            style={{ alignSelf: 'center', height: 24, fontSize: 11 }}
            onClick={() => setShowAll(true)}
          >
            Load earlier ({rail.length - VISIBLE})
          </button>
        )}
        {!filter &&
          visible.map((entry) => (
            <RailMessage
              key={entry.id}
              entry={entry}
              fresh={Date.now() - entry.at < 1200}
            />
          ))}
        {busy && (
          <div className="rail-msg">
            <div className="live-line">
              <span className="spin" />
              <span>{liveLine || 'Writing canvas changes…'}</span>
            </div>
            {liveText ? <div className="prose-agent">{liveText}</div> : null}
            <div className="typing" aria-label="muse is working">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>

      {busy && progress && (
        <div className="rail-status">
          <span className="spin" />
          <span style={{ flex: 1 }}>
            {progress.title} — {progress.parts.filter((p) => p.state === 'done').length} of{' '}
            {progress.parts.length}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => stopAgent()}
          >
            Stop
          </button>
        </div>
      )}

      <div className="composer">
        {!busy && (
          <div className="composer-suggestions">
            {suggestions.map((s) => (
              <button
                type="button"
                key={s}
                className="suggestion"
                onClick={() => {
                  if (s === 'Recreate a screenshot') fileRef.current?.click();
                  else if (s === 'Illustrate the hero') void generateHeroImage();
                  else void send(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="composer-box">
          <textarea
            value={draft}
            rows={1}
            placeholder={
              doc.screens.length
                ? 'Ask muse, or drag on the canvas — same tree, same undo.'
                : 'Describe the app you want. Blueprint first, always.'
            }
            aria-label="Message muse"
            onChange={(e) => {
              setDraft(e.target.value);
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              aria-label="Recreate from a screenshot"
              data-tip="Screenshot → canvas"
              onClick={() => fileRef.current?.click()}
            >
              <Camera size={15} />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn-sm mic-btn"
              data-recording={recording}
              aria-label={
                recording
                  ? 'Stop recording'
                  : coarsePointer
                    ? 'Hold to talk'
                    : 'Click to talk'
              }
              data-tip={coarsePointer ? 'Hold to talk' : 'Click to talk'}
              // §8.10: press-and-hold on touch, click-to-toggle on desktop.
              onPointerDown={() => {
                if (coarsePointer) void startRecording();
              }}
              onPointerUp={() => {
                if (coarsePointer) stopRecording();
              }}
              onPointerLeave={() => {
                if (coarsePointer && recording) stopRecording();
              }}
              onClick={() => {
                if (coarsePointer) return;
                if (recording) stopRecording();
                else void startRecording();
              }}
            >
              <Mic size={15} />
            </button>
            <button
              type="button"
              className="send-btn"
              aria-label="Send"
              disabled={!draft.trim() || busy}
              onClick={() => void send()}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
        <div className="rail-status" style={{ borderTop: 'none', padding: '4px 2px 0' }}>
          <span
            className={demoMode ? 'badge-dot' : 'badge-dot'}
            data-tone={demoMode ? 'accent' : 'ok'}
          />
          <span style={{ flex: 1 }}>
            {demoMode
              ? 'Local engine — real pipeline, no key needed. Add a key in Settings for the muse models.'
              : 'Pinned muse models · key stays on the server'}
          </span>
          <button
            type="button"
            className="chip"
            style={{ height: 20, fontSize: 10 }}
            onClick={() => setModal('receiptsOpen', true)}
          >
            receipts
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            await recreateFromScreenshot(file);
          }}
        />
      </div>
    </aside>
  );
}
