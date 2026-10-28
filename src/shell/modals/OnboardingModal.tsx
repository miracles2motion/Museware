import { Modal, Button } from '../../components/ui';
import { useUi } from '../../store/useUi';

const STEPS: Array<[string, string]> = [
  [
    'Blueprint',
    'Muse proposes screens, ids and the LOOK numbers. Nothing is built until you approve.',
  ],
  [
    'Build',
    'One screen at a time, one batched op per screen, a verify gate that can fail it.',
  ],
  [
    'Yours',
    'Every change — yours or the agent’s — is the same undoable op on the same tree.',
  ],
];

export function OnboardingModal({ onClose }: { onClose: () => void }) {
  const setRoute = useUi((s) => s.setRoute);
  return (
    <Modal
      title="Museware"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Stay here
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onClose();
              setRoute('editor');
            }}
          >
            Start building
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 15, lineHeight: 1.55, marginTop: 0 }}>
        Figma designs. Sketchware blocks. <strong>Museware builds.</strong> A canvas where
        the agent and you use the same tree, the same ops and the same undo — and where the
        app actually runs.
      </p>
      {STEPS.map(([title, body], i) => (
        <div className="how-card" key={title} style={{ marginBottom: 8 }}>
          <span className="step">{i + 1}</span>
          <div>
            <strong>{title}</strong>
            <p className="field-hint">{body}</p>
          </div>
        </div>
      ))}
      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">The rules we do not break</span>
        </div>
        <p className="field-hint">
          No typed UI — the model acts through six tools. Batched, all-or-nothing ops.
          Blueprint before pixels. A constrained vocabulary of 30 components. One pinned
          model per role. Stop is always visible. Receipts, not claims. No JSON in the chat.
        </p>
        <p className="field-hint">
          No key? The local engine runs the same pipeline offline so you can judge the
          product, not a marketing page.
        </p>
      </div>
    </Modal>
  );
}
