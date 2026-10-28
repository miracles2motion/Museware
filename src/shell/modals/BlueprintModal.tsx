import { Modal, Button, CopyButton } from '../../components/ui';
import { useProject } from '../../store/useProject';
import { useUi } from '../../store/useUi';

export function BlueprintModal({ onClose }: { onClose: () => void }) {
  const blueprint = useProject((s) => s.doc.blueprint);
  const startPrompt = useUi((s) => s.startPrompt);
  const text = blueprint?.text || 'No blueprint yet. Ask muse to plan the product first.';

  return (
    <Modal
      title={blueprint?.decided ? 'Approved blueprint' : 'Blueprint'}
      size="wide"
      onClose={onClose}
      footer={
        <>
          <CopyButton text={text} label="Copy" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              startPrompt('Adjust the blueprint: ');
              onClose();
            }}
          >
            Adjust it
          </Button>
        </>
      }
    >
      <p className="field-hint">
        The plan the agent and you share. Screen ids, LOOK numbers, state keys, wiring —
        approve it and the fill queue builds exactly this.
      </p>
      <pre className="blueprint-text" style={{ maxHeight: '52vh' }}>
        {text}
      </pre>
    </Modal>
  );
}
