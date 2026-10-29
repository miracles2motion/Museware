import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { GripVertical, ImagePlus, Monitor, Plus, Smartphone, Sparkles } from 'lucide-react';
import { useProject } from '../store/useProject';
import { useUi, BREAKPOINT_WIDTHS } from '../store/useUi';
import { useDrag, buildDropOps, nodeIdFromElement, resolveTarget } from './drag';
import { fitScale, fitSize, toLocalBox } from './fit';
import { CanvasStyle, NodeView } from './NodeView';
import { findNode } from '../ops/treeUtils';
import { addScreenBatch } from '../ops/screenOps';
import { recreateFromScreenshot } from '../muse/screenshot';
import { Button } from '../components/ui';

const TEXTISH = new Set(['heading', 'text', 'label', 'badge', 'button', 'link']);

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function Canvas() {
  const doc = useProject((s) => s.doc);
  const applyBatch = useProject((s) => s.applyBatch);
  const selectedId = useUi((s) => s.selectedId);
  const select = useUi((s) => s.select);
  const activeScreenId = useUi((s) => s.activeScreenId);
  const setActiveScreen = useUi((s) => s.setActiveScreen);
  const breakpoint = useUi((s) => s.breakpoint);
  const setBreakpoint = useUi((s) => s.setBreakpoint);
  const setRunMode = useUi((s) => s.setRunMode);
  const startPrompt = useUi((s) => s.startPrompt);
  const toast = useUi((s) => s.toast);
  const drag = useDrag((s) => s.drag);
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // The frame always lays out at its true breakpoint width; `k` shrinks what
  // you SEE so a 1280 artboard still fits a phone. Layout stays honest.
  const scaleRef = useRef(1);
  const [fit, setFit] = useState({ k: 1, w: 0, h: 0 });
  const [selBox, setSelBox] = useState<Box | null>(null);
  const [hoverBox, setHoverBox] = useState<Box | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [dropBox, setDropBox] = useState<Box | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string; box: Box } | null>(
    null,
  );
  const [dropActive, setDropActive] = useState(false);

  const screen =
    doc.screens.find((s) => s.id === activeScreenId) ||
    doc.screens.find((s) => s.entry) ||
    doc.screens[0];

  useEffect(() => {
    if (screen && screen.id !== activeScreenId) setActiveScreen(screen.id);
  }, [screen, activeScreenId, setActiveScreen]);

  const toLocal = useCallback((rect: DOMRect): Box | null => {
    const vp = viewportRef.current;
    if (!vp) return null;
    // rect and base are both in rendered px; the overlays live inside the
    // scaled frame, so undo the scale to speak in frame coordinates.
    return toLocalBox(
      rect,
      vp.getBoundingClientRect(),
      scaleRef.current,
      vp.scrollLeft,
      vp.scrollTop,
    );
  }, []);

  /** Fit the whole artboard in the canvas instead of cropping it. */
  const fitFrame = useCallback(() => {
    const scroller = scrollRef.current;
    const frame = frameRef.current;
    if (!scroller || !frame) return;
    const w = frame.offsetWidth;
    const h = frame.offsetHeight;
    if (!w || !h) return;
    const cs = getComputedStyle(scroller);
    const availW =
      scroller.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const hint = scroller.querySelector('.canvas-hint') as HTMLElement | null;
    const availH =
      scroller.clientHeight -
      parseFloat(cs.paddingTop) -
      parseFloat(cs.paddingBottom) -
      (hint ? hint.offsetHeight + 10 : 0);
    if (availW <= 0 || availH <= 0) return;
    const k = fitScale(availW, availH, w, h);
    const size = fitSize(w, h, k);
    scaleRef.current = k;
    setFit((prev) =>
      prev.k === k && prev.w === size.w && prev.h === size.h ? prev : { k, ...size },
    );
  }, []);

  useLayoutEffect(() => {
    fitFrame();
    const scroller = scrollRef.current;
    const frame = frameRef.current;
    if (!scroller || !frame) return;
    // Both boxes matter: the canvas shrinks, and the frame changes width when
    // the breakpoint does.
    const observer = new ResizeObserver(() => fitFrame());
    observer.observe(scroller);
    observer.observe(frame);
    window.addEventListener('resize', fitFrame);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fitFrame);
    };
  }, [fitFrame]);

  useLayoutEffect(() => {
    fitFrame();
  }, [fitFrame, breakpoint]);

  const measure = useCallback(
    (id: string | null): Box | null => {
      if (!id || !viewportRef.current) return null;
      const el = viewportRef.current.querySelector(`.n-${id}`);
      if (!el) return null;
      return toLocal(el.getBoundingClientRect());
    },
    [toLocal],
  );

  // Selection and hover outlines must follow layout, scroll and resizes.
  useEffect(() => {
    let raf = 0;
    const refresh = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setSelBox(measure(selectedId));
        setHoverBox(measure(hoverId));
      });
    };
    refresh();
    const vp = viewportRef.current;
    vp?.addEventListener('scroll', refresh, { passive: true });
    window.addEventListener('resize', refresh);
    const observer = vp ? new ResizeObserver(refresh) : null;
    const app = vp?.querySelector('.mw-app');
    if (observer && app) observer.observe(app);
    return () => {
      cancelAnimationFrame(raf);
      vp?.removeEventListener('scroll', refresh);
      window.removeEventListener('resize', refresh);
      observer?.disconnect();
    };
  }, [measure, selectedId, hoverId, doc, breakpoint]);

  useEffect(() => {
    if (!drag.active) {
      setDropBox(null);
      return;
    }
    const onMove = (e: PointerEvent) => {
      if (!screen) return;
      const target = resolveTarget(doc, screen.root.id, e.clientX, e.clientY);
      useDrag.getState().move(e.clientX, e.clientY, target);
      setDropBox(target ? toLocal(target.rect as unknown as DOMRect) : null);
    };
    const onUp = () => {
      const state = useDrag.getState().drag;
      if (state.target && screen) {
        const result = buildDropOps(doc, state, state.target);
        if (result.error) toast(result.error, 'warn');
        else {
          const res = applyBatch(result.ops, { source: 'user' });
          if (res.errors.length) toast(res.errors[0].message, 'warn');
          else {
            const op = result.ops[0] as { node?: { id: string } };
            if (op.node) select(op.node.id);
            toast(`${result.label} — ⌘Z undoes it`, 'ok');
          }
        }
      }
      useDrag.getState().end();
      setDropBox(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag.active, doc, screen, applyBatch, toast, select, toLocal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (editing) return;
      if (e.key === 'Escape') {
        select(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && screen) {
        if (screen.root.id === selectedId) return;
        e.preventDefault();
        const res = applyBatch([{ op: 'remove', id: selectedId }], { source: 'user' });
        if (res.errors.length) toast(res.errors[0].message, 'warn');
        else {
          select(null);
          toast('Removed — ⌘Z undoes it');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyBatch, editing, screen, select, selectedId, toast]);

  const addScreen = () => {
    const batch = addScreenBatch(doc, `Screen ${doc.screens.length + 1}`);
    const res = applyBatch(batch, { source: 'user' });
    if (res.errors.length) {
      toast(res.errors[0].message, 'warn');
      return;
    }
    const created = useProject.getState().doc.screens.slice(-1)[0];
    if (created) setActiveScreen(created.id);
    toast('Screen added', 'ok');
  };

  const commitEdit = () => {
    if (!editing) return;
    const node = screen ? findNode(screen.root, editing.id) : null;
    const next = editing.value;
    setEditing(null);
    if (!node || String(node.props.text ?? '') === next) return;
    const res = applyBatch([{ op: 'setText', id: editing.id, text: next }], {
      source: 'user',
    });
    if (res.errors.length) toast(res.errors[0].message, 'warn');
    else toast('Text updated');
  };

  if (!screen) {
    return (
      <div className="canvas-area">
        <div className="canvas-empty">
          <Sparkles size={30} color="var(--mw-accent)" strokeWidth={1.5} />
          <h2>Describe the app, or start with a block.</h2>
          <p>Every change — yours or muse’s — is the same undoable op on the same tree.</p>
          <div className="empty-chips">
            <Button
              variant="primary"
              onClick={() =>
                startPrompt('Design me a landing page website for a small coffee roaster.')
              }
            >
              Start from a prompt
            </Button>
            <Button variant="secondary" onClick={addScreen}>
              <Plus size={13} /> Blank screen
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const file = document.getElementById(
                  'canvas-screenshot',
                ) as HTMLInputElement | null;
                file?.click();
              }}
            >
              <ImagePlus size={13} /> From a screenshot
            </Button>
            <input
              id="canvas-screenshot"
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) await recreateFromScreenshot(file);
              }}
            />
          </div>
        </div>
        <CanvasStyle doc={doc} />
      </div>
    );
  }

  const width = BREAKPOINT_WIDTHS[breakpoint];
  const frameHeight = fit.k ? Math.round(fit.h / fit.k) : 780;
  const BpIcon = breakpoint === 'compact' ? Smartphone : Monitor;

  return (
    <div className="canvas-area" data-dragging={drag.active || undefined}>
      <div className="canvas-toolbar">
        <span className="mono" style={{ fontSize: 11, color: 'var(--mw-ink-2)' }}>
          {screen.name}
        </span>
        <span className="faint mono" style={{ fontSize: 9 }}>
          {screen.id} · {width}px {screen.entry ? '· entry' : ''}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="chip"
          title={`Switch breakpoint (1 · 2 · 3) — ${width}px${
            fit.k < 0.999
              ? `, shown at ${Math.round(fit.k * 100)}% so the whole frame fits`
              : ''
          }. Watches are out of scope in v1.`}
          onClick={() =>
            setBreakpoint(
              breakpoint === 'compact'
                ? 'medium'
                : breakpoint === 'medium'
                  ? 'expanded'
                  : 'compact',
            )
          }
        >
          <BpIcon size={11} /> {breakpoint}
          {fit.k < 0.999 && (
            <span className="faint mono"> · {Math.round(fit.k * 100)}%</span>
          )}
        </button>
        {/* On a phone the tab bar already owns Run and the overflow menu owns
            Add screen, so these two would be the same action twice in 56px. */}
        <span className="topbar-desktop" style={{ display: 'contents' }}>
          <Button size="sm" variant="ghost" onClick={() => setRunMode(true, screen.id)}>
            ▶ Run
          </Button>
          <Button size="sm" variant="ghost" onClick={addScreen}>
            <Plus size={13} /> Screen
          </Button>
        </span>
      </div>

      <div
        className="canvas-scroll"
        ref={scrollRef}
        onClick={(e) => {
          if (e.target === e.currentTarget) select(null);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDropActive(false);
          const file = Array.from(e.dataTransfer.files).find((f) =>
            f.type.startsWith('image/'),
          );
          if (file) await recreateFromScreenshot(file);
        }}
      >
        <div
          className="frame-fit"
          style={fit.w ? { width: fit.w, height: fit.h } : undefined}
        >
          <div
            className="device-frame"
            data-bp={breakpoint}
            ref={frameRef}
            style={
              {
                // Chrome inside the frame reads this so 1px stays 1px on screen.
                '--mw-fit': String(fit.k),
                ...(fit.k < 0.999
                  ? { transform: `scale(${fit.k})`, transformOrigin: 'top left' }
                  : null),
              } as CSSProperties
            }
          >
            <div className="frame-chrome">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
              <span className="mono" style={{ marginLeft: 6, fontSize: 10 }}>
                {screen.id}
              </span>
              <span style={{ flex: 1 }} />
              <span className="mono" style={{ fontSize: 10 }}>
                {width} × {frameHeight}
                {fit.k < 0.999 ? ` · ${Math.round(fit.k * 100)}%` : ''}
              </span>
            </div>
            <div
              className="frame-viewport"
              ref={viewportRef}
              style={{ position: 'relative' }}
              onPointerMove={(e) => {
                if (drag.active) return;
                const id = nodeIdFromElement(e.target as Element);
                if (id === hoverId) return;
                setHoverId(id);
                setHoverBox(id ? measure(id) : null);
              }}
              onPointerLeave={() => {
                setHoverId(null);
                setHoverBox(null);
              }}
              onClick={(e) => {
                if (editing) return;
                const id = nodeIdFromElement(e.target as Element);
                if (!id) {
                  select(null);
                  return;
                }
                if (id === screen.root.id) {
                  select(null);
                  return;
                }
                select(id);
              }}
              onDoubleClick={(e) => {
                const id = nodeIdFromElement(e.target as Element);
                if (!id) return;
                const node = findNode(screen.root, id);
                if (!node || !TEXTISH.has(node.type)) return;
                const box = measure(id);
                if (!box) return;
                setEditing({ id, value: String(node.props.text ?? ''), box });
              }}
            >
              <CanvasStyle doc={doc} />
              <NodeView doc={doc} screen={screen} mode="edit" />

              {hoverBox && hoverId && hoverId !== selectedId && !drag.active && (
                <div
                  className="hover-outline"
                  style={{
                    left: hoverBox.left,
                    top: hoverBox.top,
                    width: hoverBox.width,
                    height: hoverBox.height,
                  }}
                />
              )}

              {selBox && (
                <>
                  <div
                    className="selection-outline"
                    style={{
                      left: selBox.left - 1,
                      top: selBox.top - 1,
                      width: selBox.width + 2,
                      height: selBox.height + 2,
                    }}
                  />
                  <span
                    className="id-chip"
                    style={{ left: selBox.left, top: Math.max(0, selBox.top - 20) }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedId) {
                        void navigator.clipboard
                          ?.writeText(selectedId)
                          .catch(() => undefined);
                        toast(`Copied ${selectedId}`);
                      }
                    }}
                    title="Click to copy the id"
                  >
                    {selectedId}
                  </span>
                </>
              )}

              {(hoverBox || selBox) && hoverId && hoverId !== screen.root.id && (
                <button
                  type="button"
                  aria-label="Drag to move"
                  style={{
                    position: 'absolute',
                    left: (hoverBox || selBox)!.left - 18,
                    top: (hoverBox || selBox)!.top,
                    width: 16,
                    height: 18,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 4,
                    border: '1px solid var(--mw-accent)',
                    background: 'var(--mw-surface)',
                    color: 'var(--mw-accent)',
                    cursor: 'grab',
                    zIndex: 4,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    useDrag.getState().begin({
                      kind: 'move',
                      nodeId: hoverId,
                      label: 'Move',
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                >
                  <GripVertical size={11} />
                </button>
              )}

              {drag.active && dropBox && drag.target && (
                <div
                  className={drag.target.mode === 'inside' ? 'drop-inside' : 'drop-line'}
                  style={
                    drag.target.mode === 'inside'
                      ? {
                          left: dropBox.left,
                          top: dropBox.top,
                          width: dropBox.width,
                          height: dropBox.height,
                        }
                      : {
                          left: dropBox.left,
                          top:
                            drag.target.mode === 'before'
                              ? dropBox.top - 1
                              : dropBox.top + dropBox.height - 1,
                          width: dropBox.width,
                        }
                  }
                />
              )}

              {editing && (
                <div
                  className="inline-edit"
                  style={{
                    left: Math.max(4, editing.box.left),
                    top: editing.box.top,
                    width: Math.max(140, editing.box.width),
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    className="input"
                    autoFocus
                    value={editing.value}
                    onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                  />
                </div>
              )}

              {dropActive && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'color-mix(in srgb, var(--mw-accent) 8%, transparent)',
                    border: '2px dashed var(--mw-accent)',
                    color: 'var(--mw-accent)',
                    font: 'var(--mw-type-label)',
                    pointerEvents: 'none',
                    zIndex: 5,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <ImagePlus size={14} /> Drop the screenshot to recreate it
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className="canvas-hint field-hint"
          style={{ marginTop: 10, textAlign: 'center' }}
        >
          Click to select · double-click text to edit · drag the grip or a palette block ·
          Delete removes
        </div>
      </div>

      {drag.active && (
        <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          <GripVertical size={12} /> {drag.label}
        </div>
      )}
    </div>
  );
}
