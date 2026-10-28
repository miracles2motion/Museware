import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, RotateCcw, X } from 'lucide-react';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { CanvasStyle, NodeView } from '../canvas/NodeView';
import { screenSlugForLabel, type RuntimeApi } from './runtime';

/**
 * Run mode is the real tree executing: navigation switches screens, state
 * mutates a per-run store, toasts toast. Same generated CSS as the export.
 */
export function RunMode() {
  const doc = useProject((s) => s.doc);
  const runScreenId = useUi((s) => s.runScreenId);
  const activeScreenId = useUi((s) => s.activeScreenId);
  const setRunMode = useUi((s) => s.setRunMode);
  const initial =
    runScreenId ||
    activeScreenId ||
    doc.screens.find((s) => s.entry)?.id ||
    doc.screens[0]?.id ||
    '';
  const [screenId, setScreenId] = useState(initial);
  const [state, setState] = useState<Record<string, unknown>>({});
  const [toasts, setToasts] = useState<Array<{ id: number; text: string }>>([]);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const toastSeq = useRef(0);

  const screen = doc.screens.find((s) => s.id === screenId) || doc.screens[0];

  const toast = useCallback((text: string) => {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToasts((list) => [...list, { id, text }].slice(-3));
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3200);
  }, []);

  const navigate = useCallback(
    (to: string) => {
      const direct = doc.screens.find((s) => s.id === to);
      const slug = direct ? direct.id : screenSlugForLabel(doc.screens, to);
      if (slug) {
        setScreenId(slug);
        setState((prev) => ({ ...prev, __screen: slug }));
      } else {
        toast(`No screen called “${to}” yet.`);
      }
    },
    [doc.screens, toast],
  );

  const setKey = useCallback((key: string, value: unknown) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const openUrl = useCallback((url: string) => {
    setPendingUrl(url);
  }, []);

  const runtime = useMemo<RuntimeApi>(
    () => ({
      screenId: screen?.id || '',
      state,
      screens: doc.screens,
      setKey,
      toast,
      navigate,
      openUrl,
    }),
    [doc.screens, navigate, openUrl, screen?.id, setKey, state, toast],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRunMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setRunMode]);

  if (!screen) {
    return (
      <div className="scrim" role="dialog" aria-modal="true">
        <div className="modal">
          <div className="modal-head">
            <h2>Nothing to run yet</h2>
          </div>
          <div className="modal-body">
            <p>Add a screen first — run mode executes the tree, it does not invent one.</p>
          </div>
          <div className="modal-foot">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setRunMode(false)}
            >
              Back to the editor
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Run mode"
      style={{ padding: 0 }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--mw-bg)',
        }}
      >
        <div className="topbar" style={{ gap: 10 }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setRunMode(false)}
          >
            <ArrowLeft size={13} /> Editor
          </button>
          <span className="chip chip-static mono" style={{ fontSize: 10 }}>
            ▶ run · {doc.kind === 'web' ? 'web' : 'app'}
          </span>
          <span className="topbar-spacer" />
          <span className="eyebrow">screen</span>
          <select
            className="select"
            value={screen.id}
            aria-label="Screen"
            style={{ height: 30, fontSize: 11, width: 160 }}
            onChange={(e) => setScreenId(e.target.value)}
          >
            {doc.screens.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            aria-label="Reset run state"
            title="Reset state"
            onClick={() => {
              setState({});
              setScreenId(initial);
            }}
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            aria-label="Close run mode"
            onClick={() => setRunMode(false)}
          >
            <X size={15} />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            display: 'grid',
            placeItems: doc.kind === 'web' ? 'stretch' : 'center',
            padding: doc.kind === 'web' ? 0 : 20,
            background: 'var(--mw-bg)',
          }}
        >
          <CanvasStyle doc={doc} />
          <div className="run-frame" data-kind={doc.kind} data-run="true">
            <NodeView doc={doc} screen={screen} mode="run" runtime={runtime} />
            {pendingUrl && (
              <div className="url-confirm">
                <ExternalLink size={13} />
                <span style={{ flex: 1 }}>
                  This app wants to open <strong className="mono">{pendingUrl}</strong>
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    window.open(pendingUrl, '_blank', 'noopener,noreferrer');
                    setPendingUrl(null);
                  }}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setPendingUrl(null)}
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>

        {toasts.length > 0 && (
          <div className="toast-host" aria-live="polite">
            {toasts.map((t) => (
              <div className="toast" key={t.id} data-tone="neutral">
                {t.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
