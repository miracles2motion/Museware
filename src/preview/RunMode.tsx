import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Laptop,
  Monitor,
  RotateCcw,
  Smartphone,
  X,
} from 'lucide-react';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { useRunState } from '../store/useRunState';
import { Bindings } from '../inspector/Bindings';
import { useAgent } from '../store/useAgent';
import { CanvasStyle, NodeView } from '../canvas/NodeView';
import { screenSlugForLabel, type RuntimeApi } from './runtime';

export type RunDevice = 390 | 768 | 1280;
export function initialRunDevice(kind: 'web' | 'app'): RunDevice {
  try {
    const saved = localStorage.getItem('museware/runDevice');
    if (saved === '390' || saved === '768' || saved === '1280')
      return Number(saved) as RunDevice;
  } catch {
    /* storage unavailable */
  }
  return kind === 'web' ? 1280 : 390;
}

/**
 * Run mode is the real tree executing: navigation switches screens, state
 * mutates a per-run store, toasts toast. Same generated CSS as the export.
 */
export function RunMode() {
  const doc = useProject((s) => s.doc);
  const epoch = useProject((s) => s.documentEpoch);
  const assetsGenerating = useAgent(
    (s) =>
      s.assetDocumentEpoch === epoch &&
      s.assetJobs.some((job) => job.state === 'queued' || job.state === 'running'),
  );
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
  const [device, setDevice] = useState<RunDevice>(() => initialRunDevice(doc.kind));
  const [stageWidth, setStageWidth] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const scale = stageWidth > 0 ? Math.min(1, stageWidth / device) : 1;
  const chooseDevice = (width: RunDevice) => {
    setDevice(width);
    try {
      localStorage.setItem('museware/runDevice', String(width));
    } catch {
      /* storage unavailable */
    }
  };
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const measure = () => setStageWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [state, setState] = useState<Record<string, unknown>>({});
  useEffect(() => {
    useRunState.setState({ values: state });
  }, [state]);
  useEffect(() => () => useRunState.setState({ values: {} }), []);
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

  const scrollable =
    screen.root.props.scroll !== false && screen.root.props.scroll !== 'false';

  return (
    <div
      className="scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Run mode"
      style={scrollable ? { padding: 0, display: 'flex' } : { padding: 0 }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          ...(scrollable ? { minWidth: 0, minHeight: 0 } : {}),
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--mw-bg)',
        }}
      >
        <div className="run-toolbar" role="toolbar" aria-label="Presentation controls">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setRunMode(false)}
          >
            <ArrowLeft size={13} /> Editor
          </button>
          <div className="run-device-switcher" role="group" aria-label="Device width">
            {(
              [
                { width: 390, name: 'Mobile', Icon: Smartphone },
                { width: 768, name: 'Tablet', Icon: Laptop },
                { width: 1280, name: 'Desktop', Icon: Monitor },
              ] as const
            ).map(({ width, name, Icon }) => (
              <button
                type="button"
                key={width}
                className="run-device-button"
                aria-label={`${name} ${width}`}
                aria-pressed={device === width}
                onClick={() => chooseDevice(width)}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>
          <span className="run-device-size mono">
            {device}
            {scale < 1 ? ` · ${Math.round(scale * 100)}%` : ''}
          </span>
          {doc.screens.length > 1 && (
            <select
              className="select run-screen-picker"
              value={screen.id}
              aria-label="Screen"
              onChange={(e) => setScreenId(e.target.value)}
            >
              {doc.screens.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {assetsGenerating && (
            <span className="chip chip-static" role="status">
              Assets still generating
            </span>
          )}
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
        <details className="run-bindings">
          <summary>Screen state</summary>
          <Bindings screen={screen} running />
        </details>
        <div className="run-stage" ref={stageRef} data-scroll={scrollable}>
          <CanvasStyle doc={doc} />
          {scrollable ? (
            <div className="run-device-viewport" style={{ width: device * scale }}>
              <div
                className="run-device"
                style={{
                  width: device,
                  height: `${100 / scale}%`,
                  transform: `scale(${scale})`,
                }}
              >
                <div
                  className="run-frame"
                  data-kind={doc.kind}
                  data-run="true"
                  style={{ width: device }}
                >
                  <NodeView doc={doc} screen={screen} mode="run" runtime={runtime} />
                  {pendingUrl && (
                    <div className="url-confirm">
                      <ExternalLink size={13} />
                      <span style={{ flex: 1 }}>
                        This app wants to open{' '}
                        <strong className="mono">{pendingUrl}</strong>
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
            </div>
          ) : (
            <div
              className="run-locked-layout"
              style={{ padding: doc.kind === 'web' ? 0 : 20 }}
            >
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
          )}
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
