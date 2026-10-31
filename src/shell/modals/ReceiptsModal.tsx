import { Modal, Button } from '../../components/ui';
import { useAgent } from '../../store/useAgent';
import { useUi } from '../../store/useUi';

function money(cents: number): string {
  return `$${(cents / 100).toFixed(3)}`;
}

export function ReceiptsModal({ onClose }: { onClose: () => void }) {
  const receipts = useAgent((s) => s.receipts);
  const sessionCents = useAgent((s) => s.sessionCents);
  const sessionRequests = useAgent((s) => s.sessionRequests);
  const setModal = useUi((s) => s.setModal);
  const recent = receipts.slice(-60).reverse();

  return (
    <Modal
      title="Receipts, not claims"
      size="wide"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => setModal('settingsOpen', true)}>
            Models & key
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">Lifetime on this device</span>
          <span className="chip chip-static">{money(sessionCents)}</span>
        </div>
        <p className="field-hint">
          {sessionRequests} request{sessionRequests === 1 ? '' : 's'} recorded on this
          device, priced at the §6.1 rate card. The Key column says whose money each call
          spent. Local-engine calls cost nothing; earlier paid calls remain in the lifetime
          totals.
        </p>
      </div>

      {recent.length === 0 ? (
        <div className="insp-section">
          <p className="field-hint">
            Nothing yet. Ask muse for something — the receipts fill in as calls return.
          </p>
        </div>
      ) : (
        <table className="receipt-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Role</th>
              <th>Key</th>
              <th>Model</th>
              <th>Tools</th>
              <th className="num">Chars</th>
              <th className="num">Latency</th>
              <th className="num">Tokens</th>
              <th className="num">Cost</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id}>
                <td className="mono">
                  {new Date(r.at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </td>
                <td>
                  {r.role}
                  {r.status === 'failed' ? ' · failed' : ''}
                </td>
                <td>{r.key === 'user' ? 'your key' : r.key === 'house' ? 'house' : '—'}</td>
                <td className="mono">{r.model}</td>
                <td className="mono">
                  {r.toolNames.length ? r.toolNames.join(', ') : '—'}
                </td>
                <td className="num">{r.promptChars}</td>
                <td className="num">{r.latencyMs} ms</td>
                <td className="num">
                  {r.inputTokens === undefined && r.outputTokens === undefined
                    ? '—'
                    : `${r.inputTokens ?? 0}→${r.outputTokens ?? 0}`}
                </td>
                <td className="num">{r.cents === undefined ? '—' : money(r.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
