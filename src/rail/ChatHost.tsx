import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { AgentRail } from './AgentRail';
import { useUi } from '../store/useUi';
import { useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';

/** Exactly one rail instance; minimization leaves a small unread-aware launcher. */
export function ChatHost() {
  const expanded = useUi((s) => s.chatExpanded);
  const setExpanded = useUi((s) => s.setChatExpanded);
  const rail = useProject((s) => s.doc.rail);
  const screens = useProject((s) => s.doc.screens);
  const ready = useProject((s) => s.ready);
  const documentEpoch = useProject((s) => s.documentEpoch);
  const activeScreenId = useUi((s) => s.activeScreenId);
  const activeScreen =
    screens.find((screen) => screen.id === activeScreenId) ??
    screens.find((screen) => screen.entry) ??
    screens[0];
  const empty = !activeScreen || activeScreen.root.children.length === 0;
  const currentScreen = activeScreen?.id ?? null;
  const previousCanvas = useRef<{
    ready: boolean;
    empty: boolean;
    epoch: number;
    screen: string | null;
  } | null>(null);
  const receipts = useAgent((s) => s.receipts);
  const [unread, setUnread] = useState(false);
  const [minimizing, setMinimizing] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const shouldFocusLauncher = useRef(false);
  const last = useRef({
    message: `${rail.at(-1)?.id ?? ''}:${rail.at(-1)?.text ?? ''}`,
    receipt: receipts.at(-1)?.id,
  });
  // Wait for restoration before deciding whether the canvas is empty. A deliberate
  // minimize stays respected until entering a different empty canvas or project.
  useEffect(() => {
    const previous = previousCanvas.current;
    if (
      ready &&
      empty &&
      (!previous?.ready ||
        !previous.empty ||
        previous.epoch !== documentEpoch ||
        previous.screen !== currentScreen)
    ) {
      setExpanded(true);
    }
    previousCanvas.current = { ready, empty, epoch: documentEpoch, screen: currentScreen };
  }, [ready, empty, documentEpoch, currentScreen, setExpanded]);
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
          <button
            type="button"
            className="chat-minimize"
            aria-label="Minimize chat"
            onClick={minimize}
            tabIndex={minimizing ? -1 : undefined}
          >
            <X size={24} />
          </button>
          <div className="chat-focus-column">
            <AgentRail focused />
          </div>
        </div>
      )}
      {!expanded && (
        <button
          className="chat-launcher"
          ref={launcherRef}
          type="button"
          aria-label="Open muse chat"
          onClick={() => {
            setUnread(false);
            setMinimizing(false);
            setExpanded(true);
          }}
        >
          <Sparkles size={25} />
          {unread && <span className="chat-unread" aria-label="Unread messages" />}
        </button>
      )}
    </>
  );
}
