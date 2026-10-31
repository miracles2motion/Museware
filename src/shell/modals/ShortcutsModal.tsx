import { Modal, Button } from '../../components/ui';

const GROUPS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: 'Canvas',
    rows: [
      ['Drag from Insert', 'Add a component where the line lands'],
      ['Drag a node', 'Move it; containers accept drops inside'],
      ['Double-click text', 'Edit in place — Enter commits one setText op'],
      ['Delete / Backspace', 'Remove the selection (root protected)'],
      ['Escape', 'Clear selection, close run mode'],
    ],
  },
  {
    title: 'Editor',
    rows: [
      ['⌘/Ctrl + Z', 'Undo — the agent and you share one history'],
      ['⇧⌘/Ctrl + Z', 'Redo'],
      ['⌘/Ctrl + ⏎', 'Run the app'],
      ['⌘/Ctrl + \\', 'Collapse / show the panels'],
      ['⌘/Ctrl + I', 'Minimize / restore the inspector panel'],
      ['1 · 2 · 3', 'Compact · medium · expanded breakpoint'],
      ['?', 'This sheet'],
    ],
  },
  {
    title: 'Muse',
    rows: [
      ['Enter', 'Send — Shift+Enter is a newline'],
      ['Hold the mic', 'Talk; the draft fills with the transcript'],
      ['Paste an image', 'Screenshot → blueprint pipeline'],
      ['Stop', 'Always visible while muse works (topbar + rail)'],
    ],
  },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Keyboard & canvas"
      onClose={onClose}
      footer={
        <Button variant="primary" size="sm" onClick={onClose}>
          Got it
        </Button>
      }
    >
      {GROUPS.map((group) => (
        <div className="insp-section" key={group.title}>
          <div className="insp-section-head">
            <span className="eyebrow">{group.title}</span>
          </div>
          <table className="receipt-table">
            <tbody>
              {group.rows.map(([keys, what]) => (
                <tr key={keys}>
                  <td style={{ width: 'var(--mw-shortcut-column-w)' }}>
                    <span className="kbd">{keys}</span>
                  </td>
                  <td>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </Modal>
  );
}
