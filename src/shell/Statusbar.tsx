import { CircleDot, Command, Receipt as ReceiptIcon, Square } from 'lucide-react';
import { useProject } from '../store/useProject';
import { useUi, BREAKPOINT_WIDTHS } from '../store/useUi';
import { useAgent } from '../store/useAgent';
import { countNodes } from '../ops/treeUtils';
import { stopAgent } from '../muse/loop';

export function Statusbar() {
  const doc = useProject((s) => s.doc);
  const lastResult = useProject((s) => s.lastResult);
  const activeScreenId = useUi((s) => s.activeScreenId);
  const breakpoint = useUi((s) => s.breakpoint);
  const setModal = useUi((s) => s.setModal);
  const setRunMode = useUi((s) => s.setRunMode);
  const busy = useAgent((s) => s.busy);
  const sessionRequests = useAgent((s) => s.sessionRequests);
  const demoMode = useAgent((s) => s.demoMode);

  const screen = doc.screens.find((s) => s.id === activeScreenId) || doc.screens[0];
  const nodes = screen ? countNodes(screen.root) - 1 : 0;
  const last = doc.opLog[doc.opLog.length - 1];

  return (
    <footer className="statusbar">
      <span className="status-segment">
        <CircleDot size={10} color="var(--mw-ok)" />
        {screen ? `${screen.id} · ${nodes} nodes` : 'no screen'}
      </span>
      <span>
        {doc.screens.length} screen{doc.screens.length === 1 ? '' : 's'}
      </span>
      <span>
        {breakpoint} · <span className="mono">{BREAKPOINT_WIDTHS[breakpoint]}px</span>
      </span>
      <span>{last ? `${last.source}: ${last.summary}` : 'no ops yet'}</span>
      {lastResult?.errors.length ? (
        <span data-tone="danger">{lastResult.errors[0].message}</span>
      ) : null}
      <span className="status-spacer" />
      {busy && (
        <button type="button" onClick={() => stopAgent()} data-tone="danger">
          <Square size={9} /> Stop
        </button>
      )}
      <button type="button" onClick={() => setModal('receiptsOpen', true)}>
        <ReceiptIcon size={10} /> {sessionRequests} request
        {sessionRequests === 1 ? '' : 's'}
      </button>
      <button type="button" onClick={() => setModal('shortcutsOpen', true)}>
        <Command size={10} /> shortcuts
      </button>
      <span>{demoMode ? 'local engine' : 'muse live'}</span>
      <button type="button" onClick={() => setRunMode(true, screen?.id)}>
        ▶ run
      </button>
    </footer>
  );
}
