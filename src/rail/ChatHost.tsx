import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { AgentRail } from './AgentRail';
import { useUi } from '../store/useUi';
import { useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';

/** Exactly one rail instance; minimization leaves a small unread-aware launcher. */
export function ChatHost() {
  const expanded = useUi((s) => s.chatExpanded);
  const setExpanded = useUi((s) => s.setChatExpanded);
  const rail = useProject((s) => s.doc.rail);
  const receipts = useAgent((s) => s.receipts);
  const [unread, setUnread] = useState(false);
  const [minimizing, setMinimizing] = useState(false);
  const [customPos, setCustomPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const shouldFocusLauncher = useRef(false);
  const justDraggedRef = useRef(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    initialRect: DOMRect;
    moved: boolean;
  } | null>(null);

  // Keep launcher within viewport if resized
  useEffect(() => {
    const onResize = () => {
      setCustomPos((prev) => {
        if (!prev) return null;
        const width = 56;
        const height = 56;
        const clampedX = Math.max(12, Math.min(window.innerWidth - width - 12, prev.x));
        const clampedY = Math.max(12, Math.min(window.innerHeight - height - 12, prev.y));
        return { x: clampedX, y: clampedY };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const rect = launcherRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialRect: rect,
      moved: false,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore if not supported in test environment */
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (!dragRef.current.moved && Math.hypot(dx, dy) > 5) {
      dragRef.current.moved = true;
      setIsDragging(true);
    }
    if (dragRef.current.moved) {
      const rect = dragRef.current.initialRect;
      const width = rect.width || 56;
      const height = rect.height || 56;
      const newX = rect.left + dx;
      const newY = rect.top + dy;
      const clampedX = Math.max(12, Math.min(window.innerWidth - width - 12, newX));
      const clampedY = Math.max(12, Math.min(window.innerHeight - height - 12, newY));
      setCustomPos({ x: clampedX, y: clampedY });
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current) return;
    if (dragRef.current.moved) {
      justDraggedRef.current = true;
      window.setTimeout(() => {
        justDraggedRef.current = false;
      }, 50);
    }
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    setUnread(false);
    setMinimizing(false);
    setExpanded(true);
  }, [setExpanded]);
  const last = useRef({
    message: `${rail.at(-1)?.id ?? ''}:${rail.at(-1)?.text ?? ''}`,
    receipt: receipts.at(-1)?.id,
  });
  useEffect(() => {
    const current = {
      message: `${rail.at(-1)?.id ?? ''}:${rail.at(-1)?.text ?? ''}`,
      receipt: receipts.at(-1)?.id,
    };
    if (
      !expanded &&
      (current.message !== last.current.message || current.receipt !== last.current.receipt)
    )
      setUnread(true);
    if (expanded) setUnread(false);
    last.current = current;
  }, [rail, receipts, expanded]);
  const minimize = useCallback(() => {
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    shouldFocusLauncher.current = true;
    setMinimizing(!reducedMotion);
    setExpanded(false);
  }, [setExpanded]);
  useEffect(() => {
    if (!expanded && shouldFocusLauncher.current) {
      launcherRef.current?.focus();
      shouldFocusLauncher.current = false;
    }
  }, [expanded]);
  // A fallback guarantees unmount even if the browser never dispatches animationend.
  useEffect(() => {
    if (expanded) {
      setMinimizing(false);
      return;
    }
    if (!minimizing) return;
    const timer = window.setTimeout(() => setMinimizing(false), 350);
    return () => window.clearTimeout(timer);
  }, [expanded, minimizing]);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const ui = useUi.getState();
        if (
          ui.runMode ||
          ui.onboardingOpen ||
          ui.settingsOpen ||
          ui.exportOpen ||
          ui.receiptsOpen ||
          ui.shortcutsOpen ||
          ui.blueprintOpen ||
          ui.colorCard
        )
          return;
        event.stopPropagation();
        minimize();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [expanded, minimize]);
  return (
    <>
      {(expanded || minimizing) && (
        <div
          className="chat-focus"
          role="dialog"
          aria-label="Muse focus"
          aria-hidden={minimizing || undefined}
          data-minimizing={minimizing || undefined}
          onAnimationEnd={(event) => {
            if (
              event.target === event.currentTarget &&
              event.animationName === 'chat-minimize-out'
            )
              setMinimizing(false);
          }}
        >
          <div className="chat-focus-column">
            <AgentRail focused onMinimize={minimize} minimizing={minimizing} />
          </div>
        </div>
      )}
      {!expanded && (
        <button
          className="chat-launcher"
          ref={launcherRef}
          type="button"
          aria-label="Open muse chat"
          data-dragging={isDragging || undefined}
          style={
            customPos
              ? {
                  left: `${customPos.x}px`,
                  top: `${customPos.y}px`,
                  right: 'auto',
                  bottom: 'auto',
                  transform: 'none',
                }
              : undefined
          }
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragRef.current = null;
            setIsDragging(false);
          }}
          onClick={handleClick}
        >
          <Sparkles size={25} />
          {unread && <span className="chat-unread" aria-label="Unread messages" />}
        </button>
      )}
    </>
  );
}
