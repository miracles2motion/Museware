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
  const receipts = useAgent((s) => s.receipts);
  const [minimized, setMinimized] = useState(false);
  const [unread, setUnread] = useState(false);
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
      minimized &&
      (current.message !== last.current.message || current.receipt !== last.current.receipt)
    )
      setUnread(true);
    last.current = current;
  }, [rail, receipts, minimized]);
  const minimize = useCallback(() => {
    setMinimized(true);
    setExpanded(false);
  }, [setExpanded]);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        minimize();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [expanded, minimize]);
  if (expanded)
    return (
      <div className="chat-focus" role="dialog" aria-label="Muse focus">
        <button
          type="button"
          className="chat-minimize"
          aria-label="Minimize chat"
          onClick={minimize}
        >
          <X size={24} />
        </button>
        <div className="chat-focus-column">
          <AgentRail focused />
        </div>
      </div>
    );
  if (minimized)
    return (
      <button
        className="chat-launcher"
        type="button"
        aria-label="Open muse chat"
        onClick={() => {
          setUnread(false);
          setMinimized(false);
          setExpanded(true);
        }}
      >
        <Sparkles size={25} />
        {unread && <span className="chat-unread" aria-label="Unread messages" />}
      </button>
    );
  return <AgentRail />;
}
